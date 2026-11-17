use crate::error::{friendly_git_error, push_log, Error, Result};
use crate::model::*;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

const TIMEOUT_SECS: u64 = 300;

fn display_cmd(args: &[&str]) -> String {
    let mut s = String::from("git");
    for a in args {
        s.push(' ');
        if a.contains(' ') || a.is_empty() {
            s.push('"');
            s.push_str(a);
            s.push('"');
        } else {
            s.push_str(a);
        }
    }
    s
}

/// Run git, allowing a non-zero exit code. Returns (code, stdout, stderr).
pub async fn run_allow_fail(
    dir: &Path,
    args: &[&str],
    stdin: Option<&str>,
) -> Result<(i32, String, String)> {
    run_allow_fail_env(dir, args, stdin, &[]).await
}

pub async fn run_allow_fail_env(
    dir: &Path,
    args: &[&str],
    stdin: Option<&str>,
    envs: &[(&str, &str)],
) -> Result<(i32, String, String)> {
    let started = Instant::now();
    let mut cmd = Command::new("git");
    cmd.arg("-C")
        .arg(dir)
        .args(["-c", "core.quotepath=false", "-c", "color.ui=false"])
        .args(args)
        .env("LC_ALL", "C")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_OPTIONAL_LOCKS", "0")
        .stdin(if stdin.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    for (k, v) in envs {
        cmd.env(k, v);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| Error::Message(format!("无法执行 git：{e}")))?;

    if let Some(input) = stdin {
        if let Some(mut pipe) = child.stdin.take() {
            pipe.write_all(input.as_bytes()).await?;
            pipe.shutdown().await?;
        }
    }

    let out = match tokio::time::timeout(Duration::from_secs(TIMEOUT_SECS), child.wait_with_output())
        .await
    {
        Ok(res) => res?,
        Err(_) => {
            let msg = format!("命令超时（>{TIMEOUT_SECS}s）");
            push_log(display_cmd(args), started.elapsed().as_millis() as u64, false, msg.clone());
            return Err(Error::Message(msg));
        }
    };

    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    let code = out.status.code().unwrap_or(-1);

    let log_output = if stderr.trim().is_empty() {
        stdout.chars().take(1500).collect::<String>()
    } else {
        stderr.chars().take(3000).collect::<String>()
    };
    push_log(
        display_cmd(args),
        started.elapsed().as_millis() as u64,
        code == 0,
        log_output,
    );

    Ok((code, stdout, stderr))
}

/// Run git and fail on non-zero exit.
pub async fn run(dir: &Path, args: &[&str]) -> Result<String> {
    let (code, stdout, stderr) = run_allow_fail(dir, args, None).await?;
    if code != 0 {
        return Err(Error::Git(friendly_git_error(&stderr)));
    }
    Ok(stdout)
}

pub async fn run_with_stdin(dir: &Path, args: &[&str], stdin: &str) -> Result<String> {
    let (code, stdout, stderr) = run_allow_fail(dir, args, Some(stdin)).await?;
    if code != 0 {
        return Err(Error::Git(friendly_git_error(&stderr)));
    }
    Ok(stdout)
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

pub async fn open_repo(path: &Path) -> Result<RepoInfo> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|_| Error::Message(format!("路径不存在：{}", path.display())))?;
    let (code, stdout, _stderr) = run_allow_fail(
        &canonical,
        &["rev-parse", "--show-toplevel"],
        None,
    )
    .await?;
    if code != 0 {
        return Err(Error::Message("这里不是 Git 仓库".into()));
    }
    let root = PathBuf::from(stdout.trim());
    repo_info(&root).await
}

pub async fn git_dir(root: &Path) -> Result<PathBuf> {
    let out = run(root, &["rev-parse", "--absolute-git-dir"]).await?;
    Ok(PathBuf::from(out.trim()))
}

pub fn detect_state(git_dir: &Path) -> RepoState {
    if git_dir.join("rebase-merge").exists() || git_dir.join("rebase-apply").exists() {
        return RepoState::Rebasing;
    }
    if git_dir.join("MERGE_HEAD").exists() {
        return RepoState::Merging;
    }
    if git_dir.join("CHERRY_PICK_HEAD").exists() {
        return RepoState::CherryPicking;
    }
    if git_dir.join("REVERT_HEAD").exists() {
        return RepoState::Reverting;
    }
    if git_dir.join("BISECT_LOG").exists() {
        return RepoState::Bisecting;
    }
    RepoState::Clean
}

pub async fn repo_info(root: &Path) -> Result<RepoInfo> {
    let gd = git_dir(root).await?;
    let state = detect_state(&gd);

    let (c_head, head_out, _) = run_allow_fail(root, &["rev-parse", "HEAD"], None).await?;
    let head = if c_head == 0 {
        head_out.trim().to_string()
    } else {
        String::new()
    };

    let (c_br, br_out, _) =
        run_allow_fail(root, &["symbolic-ref", "--short", "-q", "HEAD"], None).await?;
    let detached = c_br != 0;
    let branch = if detached {
        if head.is_empty() {
            "（空仓库）".to_string()
        } else {
            format!("HEAD @ {}", &head[..7.min(head.len())])
        }
    } else {
        br_out.trim().to_string()
    };

    let (c_up, up_out, _) = run_allow_fail(
        root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        None,
    )
    .await?;
    let upstream = if c_up == 0 {
        Some(up_out.trim().to_string())
    } else {
        None
    };

    let (mut ahead, mut behind) = (0, 0);
    if upstream.is_some() {
        if let Ok((c, out, _)) = run_allow_fail(
            root,
            &["rev-list", "--left-right", "--count", "HEAD...@{u}"],
            None,
        )
        .await
        {
            if c == 0 {
                let mut it = out.split_whitespace();
                ahead = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
                behind = it.next().and_then(|v| v.parse().ok()).unwrap_or(0);
            }
        }
    }

    let name = root
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| root.display().to_string());

    Ok(RepoInfo {
        path: root.display().to_string(),
        name,
        branch,
        detached,
        head,
        upstream,
        ahead,
        behind,
        state,
    })
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

pub async fn status(root: &Path) -> Result<Status> {
    let out = run(
        root,
        &[
            "status",
            "--porcelain=v2",
            "-z",
            "--branch",
            "--untracked-files=normal",
        ],
    )
    .await?;
    let mut st = parse_status(&out);
    if let Ok(gd) = git_dir(root).await {
        st.state = detect_state(&gd);
    }
    Ok(st)
}

fn mk_file(path: String, x: char, y: char, conflicted: bool) -> FileChange {
    let untracked = !conflicted && x == '?' && y == '?';
    let staged = !conflicted && !untracked && x != '.' && x != ' ';
    let unstaged = !conflicted && (untracked || (y != '.' && y != ' '));
    FileChange {
        path,
        orig_path: None,
        index: x.to_string(),
        worktree: y.to_string(),
        staged,
        unstaged,
        untracked,
        conflicted,
    }
}

pub fn parse_status(out: &str) -> Status {
    let parts: Vec<&str> = out.split('\0').collect();
    let mut status = Status::default();
    let mut i = 0;

    while i < parts.len() {
        let rec = parts[i];
        if rec.is_empty() {
            i += 1;
            continue;
        }
        let kind = rec.as_bytes()[0];
        match kind {
            b'1' => {
                let f: Vec<&str> = rec.splitn(9, ' ').collect();
                if f.len() >= 9 {
                    let mut xy = f[1].chars();
                    let x = xy.next().unwrap_or('.');
                    let y = xy.next().unwrap_or('.');
                    let file = mk_file(f[8].to_string(), x, y, false);
                    if file.staged {
                        status.staged.push(file.clone());
                    }
                    if file.unstaged {
                        status.unstaged.push(file);
                    }
                }
            }
            b'2' => {
                let f: Vec<&str> = rec.splitn(10, ' ').collect();
                if f.len() >= 10 {
                    let mut xy = f[1].chars();
                    let x = xy.next().unwrap_or('.');
                    let y = xy.next().unwrap_or('.');
                    let orig = parts.get(i + 1).map(|s| s.to_string());
                    i += 1;
                    let mut file = mk_file(f[9].to_string(), x, y, false);
                    file.orig_path = orig;
                    if file.staged {
                        status.staged.push(file.clone());
                    }
                    if file.unstaged {
                        status.unstaged.push(file);
                    }
                }
            }
            b'u' => {
                let f: Vec<&str> = rec.splitn(11, ' ').collect();
                if f.len() >= 11 {
                    let mut xy = f[1].chars();
                    let x = xy.next().unwrap_or('U');
                    let y = xy.next().unwrap_or('U');
                    let file = mk_file(f[10].to_string(), x, y, true);
                    status.conflicts.push(file);
                }
            }
            b'?' => {
                if let Some(path) = rec.strip_prefix("? ") {
                    let file = mk_file(path.to_string(), '?', '?', false);
                    status.unstaged.push(file);
                }
            }
            _ => {}
        }
        i += 1;
    }

    status.staged.sort_by(|a, b| a.path.cmp(&b.path));
    status.unstaged.sort_by(|a, b| a.path.cmp(&b.path));
    status.conflicts.sort_by(|a, b| a.path.cmp(&b.path));
    status
}

// ---------------------------------------------------------------------------
// Log / branches / stash
// ---------------------------------------------------------------------------

const LOG_FORMAT: &str = "--format=%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%D%x1e";

pub async fn log(root: &Path, limit: usize, skip: usize) -> Result<(Vec<Commit>, bool)> {
    let n = limit.to_string();
    let s = skip.to_string();
    let out = run(
        root,
        &["log", "--topo-order", "-n", &n, "--skip", &s, LOG_FORMAT],
    )
    .await?;
    let commits = parse_log(&out);
    let has_more = commits.len() == limit;
    Ok((commits, has_more))
}

pub fn parse_log(out: &str) -> Vec<Commit> {
    let mut commits = Vec::new();
    for rec in out.split('\u{1e}') {
        let rec = rec.trim_matches('\n');
        if rec.trim().is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.splitn(7, '\u{1f}').collect();
        if f.len() < 7 {
            continue;
        }
        let parents: Vec<String> = f[1]
            .split_whitespace()
            .map(|s| s.to_string())
            .collect();
        let refs: Vec<String> = f[6]
            .split(", ")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .collect();
        commits.push(Commit {
            sha: f[0].to_string(),
            parents,
            author: f[2].to_string(),
            email: f[3].to_string(),
            time: f[4].parse().unwrap_or(0),
            subject: f[5].to_string(),
            refs,
        });
    }
    commits
}

pub async fn branches(root: &Path) -> Result<Vec<Branch>> {
    let out = run(
        root,
        &[
            "for-each-ref",
            "--sort=-committerdate",
            "--format=%(refname)\t%(refname:short)\t%(objectname)\t%(HEAD)\t%(upstream:short)\t%(upstream:track)\t%(committerdate:unix)",
            "refs/heads",
            "refs/remotes",
        ],
    )
    .await?;

    let mut list = Vec::new();
    for line in out.lines() {
        let f: Vec<&str> = line.splitn(7, '\t').collect();
        if f.len() < 7 {
            continue;
        }
        let full = f[0];
        if full.ends_with("/HEAD") {
            continue;
        }
        let track = f[5];
        let ahead = parse_track(track, "ahead");
        let behind = parse_track(track, "behind");
        let gone = track.contains("gone");
        list.push(Branch {
            name: f[1].to_string(),
            sha: f[2].to_string(),
            current: f[3] == "*",
            upstream: if f[4].is_empty() {
                None
            } else {
                Some(f[4].to_string())
            },
            time: f[6].parse().unwrap_or(0),
            remote: full.starts_with("refs/remotes/"),
            ahead,
            behind,
            gone,
        });
    }
    Ok(list)
}

fn parse_track(track: &str, key: &str) -> i32 {
    if !track.contains(key) {
        return 0;
    }
    let after = track.split(key).nth(1).unwrap_or("");
    after
        .trim_start_matches(|c: char| !c.is_ascii_digit())
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .parse()
        .unwrap_or(0)
}

pub async fn stashes(root: &Path) -> Result<Vec<Stash>> {
    let out = run(
        root,
        &["stash", "list", "--format=%gd%x1f%gs%x1f%ct"],
    )
    .await?;
    let mut list = Vec::new();
    for (i, line) in out.lines().enumerate() {
        let f: Vec<&str> = line.splitn(3, '\u{1f}').collect();
        if f.len() < 3 {
            continue;
        }
        let message = f[1]
            .strip_prefix("WIP on ")
            .or_else(|| f[1].strip_prefix("On "))
            .unwrap_or(f[1])
            .to_string();
        list.push(Stash {
            index: i,
            selector: f[0].to_string(),
            message,
            time: f[2].parse().unwrap_or(0),
        });
    }
    Ok(list)
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

pub async fn diff(
    root: &Path,
    scope: &str,
    path: Option<&str>,
    commit: Option<&str>,
) -> Result<FileDiff> {
    let p = path.ok_or_else(|| Error::Message("缺少文件路径".into()))?;

    let (code, out, err) = match scope {
        "index" => {
            run_allow_fail(
                root,
                &["diff", "--cached", "--no-color", "--no-ext-diff", "-U3", "--", p],
                None,
            )
            .await?
        }
        "commit" => {
            let c = commit.ok_or_else(|| Error::Message("缺少提交".into()))?;
            run_allow_fail(
                root,
                &["show", "--no-color", "--no-ext-diff", "-U3", "--format=", c, "--", p],
                None,
            )
            .await?
        }
        "untracked" => {
            run_allow_fail(
                root,
                &[
                    "diff",
                    "--no-index",
                    "--no-color",
                    "-U3",
                    "/dev/null",
                    p,
                ],
                None,
            )
            .await?
        }
        _ => {
            run_allow_fail(
                root,
                &["diff", "--no-color", "--no-ext-diff", "-U3", "--", p],
                None,
            )
            .await?
        }
    };

    // `--no-index` exits 1 when files differ; that is success for us.
    let ok = code == 0 || (scope == "untracked" && code == 1);
    if !ok {
        return Err(Error::Git(friendly_git_error(&err)));
    }

    let mut d = parse_diff(&out);
    d.path = p.to_string();
    Ok(d)
}

pub fn parse_diff(text: &str) -> FileDiff {
    let mut d = FileDiff::default();
    let mut current: Option<Hunk> = None;
    let mut old_no = 0u32;
    let mut new_no = 0u32;
    let mut total_lines = 0usize;

    for line in text.lines() {
        total_lines += 1;
        if total_lines > 40_000 {
            d.truncated = true;
            break;
        }

        if line.starts_with("diff --git ") {
            if let Some(h) = current.take() {
                d.hunks.push(h);
            }
            if let Some(rest) = line.strip_prefix("diff --git a/") {
                if let Some((a, b)) = rest.split_once(" b/") {
                    if a != b {
                        d.old_path = Some(a.to_string());
                    }
                    d.path = b.to_string();
                }
            }
            continue;
        }
        if line.starts_with("new file mode") {
            continue;
        }
        if line.starts_with("Binary files") || line.starts_with("GIT binary patch") {
            d.binary = true;
            continue;
        }
        if line.starts_with("@@") {
            if let Some(h) = current.take() {
                d.hunks.push(h);
            }
            let (os, oc, ns, nc) = parse_hunk_range(line);
            old_no = os;
            new_no = ns;
            current = Some(Hunk {
                header: line.to_string(),
                lines: Vec::new(),
                old_start: os,
                old_lines: oc,
                new_start: ns,
                new_lines: nc,
            });
            continue;
        }

        let Some(h) = current.as_mut() else { continue };

        if let Some(rest) = line.strip_prefix('+') {
            h.lines.push(DiffLine {
                kind: "+".into(),
                old_no: None,
                new_no: Some(new_no),
                content: rest.to_string(),
            });
            new_no += 1;
            d.additions += 1;
        } else if let Some(rest) = line.strip_prefix('-') {
            h.lines.push(DiffLine {
                kind: "-".into(),
                old_no: Some(old_no),
                new_no: None,
                content: rest.to_string(),
            });
            old_no += 1;
            d.deletions += 1;
        } else if line.starts_with(' ') {
            h.lines.push(DiffLine {
                kind: " ".into(),
                old_no: Some(old_no),
                new_no: Some(new_no),
                content: line[1..].to_string(),
            });
            old_no += 1;
            new_no += 1;
        } else if line.starts_with('\\') {
            h.lines.push(DiffLine {
                kind: "\\".into(),
                old_no: None,
                new_no: None,
                content: line.to_string(),
            });
        }
    }
    if let Some(h) = current {
        d.hunks.push(h);
    }
    d
}

fn parse_hunk_range(header: &str) -> (u32, u32, u32, u32) {
    // @@ -42,7 +42,9 @@ context
    let body = header
        .trim_start_matches("@@")
        .split("@@")
        .next()
        .unwrap_or("")
        .trim();
    let mut it = body.split_whitespace();
    let a = it.next().unwrap_or("-1,1");
    let b = it.next().unwrap_or("+1,1");
    fn parse(s: &str) -> (u32, u32) {
        let s = s.trim_start_matches(['-', '+']);
        let mut p = s.split(',');
        let start = p.next().and_then(|v| v.parse().ok()).unwrap_or(1);
        let len = p.next().and_then(|v| v.parse().ok()).unwrap_or(1);
        (start, len)
    }
    let (os, oc) = parse(a);
    let (ns, nc) = parse(b);
    (os, oc, ns, nc)
}

pub async fn commit_detail(root: &Path, sha: &str) -> Result<CommitDetail> {
    let out = run(
        root,
        &["show", "-s", LOG_FORMAT, sha],
    )
    .await?;
    let commit = parse_log(&out).into_iter().next().unwrap_or_default();

    let numstat = run_allow_fail(
        root,
        &["show", "--numstat", "-z", "--format=", sha],
        None,
    )
    .await?;
    let name_status = run_allow_fail(
        root,
        &["diff-tree", "--no-commit-id", "--name-status", "-r", "-M", sha],
        None,
    )
    .await?;

    let mut statuses = std::collections::HashMap::new();
    if numstat.0 == 0 {
        for line in name_status.1.lines() {
            let mut it = line.split('\t');
            let st = it.next().unwrap_or("M");
            let path = if st.starts_with('R') {
                let _old = it.next();
                it.next().unwrap_or("")
            } else {
                it.next().unwrap_or("")
            };
            statuses.insert(path.to_string(), st.chars().next().unwrap_or('M').to_string());
        }
    }

    let mut files = Vec::new();
    let mut additions = 0;
    let mut deletions = 0;
    if numstat.0 == 0 {
        for rec in numstat.1.split('\0') {
            let rec = rec.trim_start_matches('\n');
            if rec.is_empty() {
                continue;
            }
            let f: Vec<&str> = rec.splitn(3, '\t').collect();
            if f.len() < 3 {
                continue;
            }
            let a: i32 = f[0].parse().unwrap_or(0);
            let dl: i32 = f[1].parse().unwrap_or(0);
            additions += a;
            deletions += dl;
            let status = statuses
                .get(f[2])
                .cloned()
                .unwrap_or_else(|| "M".into());
            files.push(CommitFile {
                path: f[2].to_string(),
                status,
                additions: a,
                deletions: dl,
            });
        }
    }

    Ok(CommitDetail {
        commit,
        files,
        additions,
        deletions,
    })
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

pub async fn stage(root: &Path, paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["add".to_string(), "-A".into(), "--".into()];
    args.extend(paths.iter().cloned());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run(root, &refs).await?;
    Ok(())
}

pub async fn unstage(root: &Path, paths: &[String]) -> Result<()> {
    if paths.is_empty() {
        return Ok(());
    }
    let mut args = vec!["restore".to_string(), "--staged".into(), "--".into()];
    args.extend(paths.iter().cloned());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (code, _out, err) = run_allow_fail(root, &refs, None).await?;
    if code == 0 {
        return Ok(());
    }
    // Unborn branch: `restore --staged` cannot resolve HEAD, fall back to rm --cached.
    if err.contains("HEAD") {
        let mut args = vec!["rm".to_string(), "--cached".into(), "-r".into(), "--force".into(), "--".into()];
        args.extend(paths.iter().cloned());
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run(root, &refs).await?;
        return Ok(());
    }
    Err(Error::Git(friendly_git_error(&err)))
}

/// Discard worktree changes for tracked files, move untracked files to Trash.
pub async fn discard(root: &Path, tracked: &[String], untracked: &[String]) -> Result<()> {
    if !tracked.is_empty() {
        let mut args = vec!["restore".to_string(), "--worktree".into(), "--".into()];
        args.extend(tracked.iter().cloned());
        let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        run(root, &refs).await?;
    }
    for p in untracked {
        let path = root.join(p);
        move_to_trash(&path).await?;
    }
    Ok(())
}

async fn move_to_trash(path: &Path) -> Result<()> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let trash = PathBuf::from(home).join(".Trash");
    let _ = std::fs::create_dir_all(&trash);
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let stamp = crate::error::now_secs();
    let target = trash.join(format!("{name}.{stamp}"));
    let src = path.to_path_buf();
    tokio::task::spawn_blocking(move || -> Result<()> {
        std::fs::rename(&src, &target)
            .map_err(|e| Error::Message(format!("无法移到废纸篓：{e}")))?;
        Ok(())
    })
    .await
    .map_err(|e| Error::Message(e.to_string()))??;
    Ok(())
}

pub async fn commit(
    root: &Path,
    message: &str,
    amend: bool,
    sign: bool,
) -> Result<OpResult> {
    check_local_only_staged(root).await?;
    let head_before = run_allow_fail(root, &["rev-parse", "HEAD"], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());
    let mut args = vec!["commit".to_string(), "-F".into(), "-".into()];
    if amend {
        args.push("--amend".into());
    }
    if sign {
        args.push("-S".into());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (code, out, err) = run_allow_fail(root, &refs, Some(message)).await?;
    if code != 0 {
        return Err(Error::Git(friendly_git_error(&err)));
    }
    if !amend {
        if let Some(prev) = &head_before {
            let _ = journal_append(
                root,
                "commit",
                "撤销提交",
                serde_json::json!({ "headBefore": prev }),
            )
            .await;
        }
    }
    Ok(OpResult {
        ok: true,
        message: out.lines().next().unwrap_or("已提交").to_string(),
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn checkout(root: &Path, target: &str) -> Result<()> {
    let (code, _out, err) = run_allow_fail(root, &["switch", target], None).await?;
    if code == 0 {
        return Ok(());
    }
    let (code2, _o2, e2) = run_allow_fail(root, &["checkout", target], None).await?;
    if code2 == 0 {
        Ok(())
    } else {
        Err(Error::Git(friendly_git_error(if e2.trim().is_empty() { &err } else { &e2 })))
    }
}

pub async fn create_branch(root: &Path, name: &str, from: Option<&str>) -> Result<()> {
    let mut args = vec!["switch".to_string(), "-c".into(), name.to_string()];
    if let Some(f) = from {
        args.push(f.to_string());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    run(root, &refs).await?;
    Ok(())
}

pub async fn delete_branch(root: &Path, name: &str, force: bool) -> Result<()> {
    let sha = run_allow_fail(root, &["rev-parse", &format!("refs/heads/{name}")], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());
    run(root, &["branch", if force { "-D" } else { "-d" }, name]).await?;
    if let Some(sha) = sha {
        let _ = journal_append(
            root,
            "branchDelete",
            "恢复分支",
            serde_json::json!({ "name": name, "sha": sha }),
        )
        .await;
    }
    Ok(())
}

pub async fn merge(root: &Path, branch: &str) -> Result<OpResult> {
    let head_before = run_allow_fail(root, &["rev-parse", "HEAD"], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());
    let (code, out, err) = run_allow_fail(root, &["merge", "--no-edit", branch], None).await?;
    let conflicted = has_conflicts(root).await.unwrap_or(false);
    if code == 0 {
        if let Some(prev) = &head_before {
            let _ = journal_append(
                root,
                "merge",
                "回滚合并",
                serde_json::json!({ "headBefore": prev, "branch": branch }),
            )
            .await;
        }
    }
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            "合并完成".into()
        } else {
            friendly_git_error(&err)
        },
        conflicted,
        output: format!("{out}{err}"),
    })
}

/// `no_commit` implements "只遴选到工作区、不自动提交".
pub async fn cherry_pick(
    root: &Path,
    shas: &[String],
    no_commit: bool,
    record_source: bool,
) -> Result<OpResult> {
    let head_before = run_allow_fail(root, &["rev-parse", "HEAD"], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());
    let mut args = vec!["cherry-pick".to_string()];
    if no_commit {
        args.push("-n".into());
    }
    if record_source {
        args.push("-x".into());
    }
    args.extend(shas.iter().cloned());

    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (code, out, err) = run_allow_fail(root, &refs, None).await?;
    if code != 0 {
        let conflicted = has_conflicts(root).await.unwrap_or(false);
        return Ok(OpResult {
            ok: false,
            message: friendly_git_error(&err),
            conflicted,
            output: format!("{out}{err}"),
        });
    }
    if !no_commit {
        if let Some(prev) = &head_before {
            let _ = journal_append(
                root,
                "cherryPick",
                "回滚遴选",
                serde_json::json!({ "headBefore": prev }),
            )
            .await;
        }
    }
    Ok(OpResult {
        ok: true,
        message: if no_commit {
            "已遴选到工作区（未提交）".into()
        } else {
            format!("已遴选 {} 个提交", shas.len())
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

/// Revert a commit by creating an inverse commit (history stays linear).
pub async fn revert_commit(root: &Path, sha: &str) -> Result<OpResult> {
    let (code, out, err) = run_allow_fail(root, &["revert", "--no-edit", sha], None).await?;
    let conflicted = has_conflicts(root).await.unwrap_or(false);
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            "已回滚该提交（生成反向提交）".into()
        } else {
            friendly_git_error(&err)
        },
        conflicted,
        output: format!("{out}{err}"),
    })
}

pub async fn sequencer_control(root: &Path, action: &str) -> Result<OpResult> {
    let gd = git_dir(root).await?;
    let state = detect_state(&gd);
    let (args, label): (Vec<&str>, &str) = match state {
        RepoState::Rebasing => match action {
            "continue" => (vec!["rebase", "--continue"], "已继续变基"),
            "skip" => (vec!["rebase", "--skip"], "已跳过该提交"),
            "abort" => (vec!["rebase", "--abort"], "已中止并回滚变基"),
            _ => return Err(Error::Message("未知操作".into())),
        },
        RepoState::Merging => match action {
            "continue" => (vec!["commit", "--no-edit"], "已提交合并"),
            "abort" => (vec!["merge", "--abort"], "已中止合并"),
            _ => return Err(Error::Message("合并冲突不能用跳过，请中止后重新处理".into())),
        },
        RepoState::CherryPicking => match action {
            "continue" => (vec!["cherry-pick", "--continue"], "已继续遴选"),
            "skip" => (vec!["cherry-pick", "--skip"], "已跳过该提交"),
            "abort" => (vec!["cherry-pick", "--abort"], "已中止遴选"),
            _ => return Err(Error::Message("未知操作".into())),
        },
        RepoState::Reverting => match action {
            "continue" => (vec!["revert", "--continue"], "已继续回滚"),
            "skip" => (vec!["revert", "--skip"], "已跳过"),
            "abort" => (vec!["revert", "--abort"], "已中止回滚"),
            _ => return Err(Error::Message("未知操作".into())),
        },
        _ => return Err(Error::Message("当前没有进行中的 Git 操作".into())),
    };

    let (code, out, err) =
        run_allow_fail_env(root, &args, None, &[("GIT_EDITOR", "true"), ("GIT_SEQUENCE_EDITOR", "true")])
            .await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 { label.into() } else { friendly_git_error(&err) },
        conflicted: has_conflicts(root).await.unwrap_or(false),
        output: format!("{out}{err}"),
    })
}

/// Soft-undo the last commit: keep changes staged.
pub async fn undo_last_commit(root: &Path) -> Result<OpResult> {
    let (code, out, _err) = run_allow_fail(root, &["rev-list", "--count", "HEAD"], None).await?;
    let count: i64 = out.trim().parse().unwrap_or(0);
    if code != 0 || count == 0 {
        return Err(Error::Message("没有可撤销的提交".into()));
    }
    let (code2, _o, e2) = if count <= 1 {
        run_allow_fail(root, &["update-ref", "-d", "HEAD"], None).await?
    } else {
        run_allow_fail(root, &["reset", "--soft", "HEAD~1"], None).await?
    };
    Ok(OpResult {
        ok: code2 == 0,
        message: if code2 == 0 {
            "已撤销上次提交，改动仍在暂存区".into()
        } else {
            friendly_git_error(&e2)
        },
        conflicted: false,
        output: String::new(),
    })
}

pub async fn stash_push(
    root: &Path,
    message: &str,
    keep_index: bool,
    include_untracked: bool,
    paths: &[String],
) -> Result<OpResult> {
    let mut args = vec!["stash".to_string(), "push".into()];
    if !message.is_empty() {
        args.push("-m".into());
        args.push(message.to_string());
    }
    if keep_index {
        args.push("--keep-index".into());
    }
    if include_untracked {
        args.push("-u".into());
    }
    if !paths.is_empty() {
        args.push("--".into());
        args.extend(paths.iter().cloned());
    }
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (code, out, err) = run_allow_fail(root, &refs, None).await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            "已贮藏".into()
        } else {
            friendly_git_error(&err)
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn stash_apply(root: &Path, selector: &str, pop: bool) -> Result<OpResult> {
    let cmd = if pop { "pop" } else { "apply" };
    let (code, out, err) =
        run_allow_fail(root, &["stash", cmd, "--index", selector], None).await?;
    if code == 0 {
        return Ok(OpResult {
            ok: true,
            message: if pop { "已弹出贮藏" } else { "已应用贮藏" }.into(),
            conflicted: false,
            output: format!("{out}{err}"),
        });
    }
    // --index can fail when the index changed; retry without restoring the index.
    let (code2, out2, err2) =
        run_allow_fail(root, &["stash", cmd, selector], None).await?;
    Ok(OpResult {
        ok: code2 == 0,
        message: if code2 == 0 {
            if pop { "已弹出贮藏（未能恢复暂存状态）" } else { "已应用贮藏（未能恢复暂存状态）" }.into()
        } else {
            friendly_git_error(&err2)
        },
        conflicted: has_conflicts(root).await.unwrap_or(false),
        output: format!("{out}{err}{out2}{err2}"),
    })
}

pub async fn stash_drop(root: &Path, selector: &str) -> Result<()> {
    let sha = run_allow_fail(root, &["rev-parse", selector], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());
    let msg = run_allow_fail(root, &["log", "-1", "--format=%gs", selector], None)
        .await
        .ok()
        .map(|(_, out, _)| out.trim().to_string())
        .unwrap_or_default();
    run(root, &["stash", "drop", selector]).await?;
    if let Some(sha) = sha {
        let _ = journal_append(
            root,
            "stashDrop",
            "恢复贮藏",
            serde_json::json!({ "sha": sha, "message": msg }),
        )
        .await;
    }
    Ok(())
}

pub async fn stash_store(root: &Path, sha: &str, message: &str) -> Result<()> {
    run(root, &["stash", "store", "-m", message, sha]).await?;
    Ok(())
}

pub async fn fetch_all(root: &Path) -> Result<OpResult> {
    let (code, out, err) = run_allow_fail(root, &["fetch", "--all", "--prune"], None).await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 { "已抓取全部远端".into() } else { friendly_git_error(&err) },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn pull(root: &Path) -> Result<OpResult> {
    let (code, out, err) = run_allow_fail(root, &["pull"], None).await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 { "已拉取".into() } else { friendly_git_error(&err) },
        conflicted: has_conflicts(root).await.unwrap_or(false),
        output: format!("{out}{err}"),
    })
}

pub async fn push(root: &Path) -> Result<OpResult> {
    let (code, out, err) = run_allow_fail(root, &["push"], None).await?;
    if code == 0 {
        return Ok(OpResult {
            ok: true,
            message: "已推送".into(),
            conflicted: false,
            output: format!("{out}{err}"),
        });
    }
    if err.contains("no upstream branch") || err.contains("has no upstream branch") {
        let (code2, out2, err2) =
            run_allow_fail(root, &["push", "-u", "origin", "HEAD"], None).await?;
        return Ok(OpResult {
            ok: code2 == 0,
            message: if code2 == 0 { "已推送并设置上游".into() } else { friendly_git_error(&err2) },
            conflicted: false,
            output: format!("{out}{err}{out2}{err2}"),
        });
    }
    Ok(OpResult {
        ok: false,
        message: friendly_git_error(&err),
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn has_conflicts(root: &Path) -> Result<bool> {
    let out = run(
        root,
        &["diff", "--name-only", "--diff-filter=U"],
    )
    .await?;
    Ok(!out.trim().is_empty())
}

// ---------------------------------------------------------------------------
// Hunk-level staging
// ---------------------------------------------------------------------------

/// Split a raw unified diff into (file header, [hunk text]).
fn split_raw_patch(text: &str) -> (String, Vec<String>) {
    let mut header = String::new();
    let mut hunks: Vec<String> = Vec::new();
    let mut current: Option<String> = None;

    for line in text.lines() {
        if line.starts_with("@@") {
            if let Some(c) = current.take() {
                hunks.push(c);
            }
            let mut c = String::new();
            c.push_str(line);
            c.push('\n');
            current = Some(c);
        } else if let Some(c) = current.as_mut() {
            c.push_str(line);
            c.push('\n');
        } else {
            header.push_str(line);
            header.push('\n');
        }
    }
    if let Some(c) = current {
        hunks.push(c);
    }
    (header, hunks)
}

/// Stage (scope = worktree) or unstage (scope = index) a single hunk.
pub async fn stage_hunk(root: &Path, file: &str, scope: &str, index: usize) -> Result<()> {
    let raw = if scope == "index" {
        run(
            root,
            &["diff", "--cached", "--no-color", "--no-ext-diff", "-U3", "--", file],
        )
        .await?
    } else {
        run(
            root,
            &["diff", "--no-color", "--no-ext-diff", "-U3", "--", file],
        )
        .await?
    };

    let (header, hunks) = split_raw_patch(&raw);
    if header.trim().is_empty() {
        return Err(Error::Message("该文件没有可用的补丁头，无法按 hunk 操作".into()));
    }
    let hunk = hunks
        .get(index)
        .ok_or_else(|| Error::Message("hunk 不存在，请刷新后重试".into()))?;
    let patch = format!("{header}{hunk}");

    let args: Vec<&str> = if scope == "index" {
        vec!["apply", "--cached", "-R", "--whitespace=nowarn", "-"]
    } else {
        vec!["apply", "--cached", "--whitespace=nowarn", "-"]
    };
    run_with_stdin(root, &args, &patch).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

enum Seg {
    Text(String),
    Block(ConflictBlock),
}

fn parse_conflict_segments(content: &str) -> Vec<Seg> {
    let mut segs: Vec<Seg> = Vec::new();
    let mut text = String::new();
    let mut mode = 0u8; // 0 text, 1 ours, 2 base, 3 theirs
    let mut block = ConflictBlock::default();

    for line in content.split_inclusive('\n') {
        let t = line.trim_end_matches(['\n', '\r']);
        match mode {
            0 => {
                if t.starts_with("<<<<<<<") {
                    if !text.is_empty() {
                        segs.push(Seg::Text(std::mem::take(&mut text)));
                    }
                    block = ConflictBlock::default();
                    mode = 1;
                } else {
                    text.push_str(line);
                }
            }
            1 => {
                if t.starts_with("|||||||") {
                    mode = 2;
                } else if t.starts_with("=======") {
                    mode = 3;
                } else {
                    block.ours.push_str(line);
                }
            }
            2 => {
                if t.starts_with("=======") {
                    mode = 3;
                } else {
                    block.base.push_str(line);
                }
            }
            _ => {
                if t.starts_with(">>>>>>>") {
                    segs.push(Seg::Block(std::mem::take(&mut block)));
                    mode = 0;
                } else {
                    block.theirs.push_str(line);
                }
            }
        }
    }
    if !text.is_empty() {
        segs.push(Seg::Text(text));
    }
    segs
}

pub async fn conflict_doc(root: &Path, file: &str) -> Result<ConflictDoc> {
    let p = root.join(file);
    let content = std::fs::read_to_string(&p)
        .map_err(|e| Error::Message(format!("无法读取冲突文件：{e}")))?;
    let segs = parse_conflict_segments(&content);
    let mut blocks = Vec::new();
    let mut has_base = false;
    for s in &segs {
        if let Seg::Block(b) = s {
            if !b.base.is_empty() {
                has_base = true;
            }
            blocks.push(b.clone());
        }
    }
    Ok(ConflictDoc {
        path: file.to_string(),
        blocks,
        has_base,
    })
}

/// `choices` is one of "ours" | "theirs" | "both" per conflict block, in order.
pub async fn resolve_conflict(root: &Path, file: &str, choices: &[String]) -> Result<()> {
    let p = root.join(file);
    let content = std::fs::read_to_string(&p)
        .map_err(|e| Error::Message(format!("无法读取冲突文件：{e}")))?;
    let segs = parse_conflict_segments(&content);

    let mut out = String::new();
    let mut i = 0;
    for s in segs {
        match s {
            Seg::Text(t) => out.push_str(&t),
            Seg::Block(b) => {
                match choices.get(i).map(|s| s.as_str()).unwrap_or("ours") {
                    "theirs" => out.push_str(&b.theirs),
                    "both" => {
                        out.push_str(&b.ours);
                        out.push_str(&b.theirs);
                    }
                    _ => out.push_str(&b.ours),
                }
                i += 1;
            }
        }
    }

    std::fs::write(&p, out)
        .map_err(|e| Error::Message(format!("无法写入冲突文件：{e}")))?;
    run(root, &["add", "--", file]).await?;
    Ok(())
}

/// Take one side for the whole file and mark it resolved.
pub async fn checkout_side(root: &Path, file: &str, side: &str) -> Result<()> {
    let flag = if side == "theirs" { "--theirs" } else { "--ours" };
    run(root, &["checkout", flag, "--", file]).await?;
    run(root, &["add", "--", file]).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Push preview
// ---------------------------------------------------------------------------

const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

pub async fn outgoing(root: &Path) -> Result<Outgoing> {
    let branch = run_allow_fail(root, &["symbolic-ref", "--short", "-q", "HEAD"], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string())
        .unwrap_or_else(|| "HEAD".into());

    let upstream = run_allow_fail(
        root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        None,
    )
    .await
    .ok()
    .filter(|(c, _, _)| *c == 0)
    .map(|(_, out, _)| out.trim().to_string());

    let (log_extra, diff_range): (Vec<String>, String) = match &upstream {
        Some(u) => (vec![format!("{u}..HEAD")], format!("{u}..HEAD")),
        None => (
            vec!["HEAD".into(), "--not".into(), "--remotes".into()],
            format!("{EMPTY_TREE}..HEAD"),
        ),
    };

    let mut args: Vec<String> = vec![
        "log".into(),
        "--topo-order".into(),
        "-n".into(),
        "200".into(),
        LOG_FORMAT.into(),
    ];
    args.extend(log_extra);
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let (code, out, _err) = run_allow_fail(root, &refs, None).await?;
    let commits = if code == 0 { parse_log(&out) } else { Vec::new() };

    let (fc, fstat, _) = run_allow_fail(
        root,
        &["diff", "--shortstat", &diff_range],
        None,
    )
    .await?;
    let (mut files, mut additions, mut deletions) = (0usize, 0i32, 0i32);
    if fc == 0 {
        for part in fstat.trim().split(',') {
            let n: i32 = part
                .trim()
                .split_whitespace()
                .next()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            if part.contains("file") {
                files = n.max(0) as usize;
            } else if part.contains("insertion") {
                additions = n;
            } else if part.contains("deletion") {
                deletions = n;
            }
        }
    }

    let patterns = protected_patterns(root).await.unwrap_or_default();
    let protected = branch_is_protected(&patterns, &branch);

    Ok(Outgoing {
        branch,
        upstream,
        commits,
        file_count: files,
        additions,
        deletions,
        protected,
    })
}

// ---------------------------------------------------------------------------
// Local-only files
// ---------------------------------------------------------------------------

fn wildcard_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.chars().collect();
    let t: Vec<char> = text.chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let (mut star, mut mark) = (usize::MAX, 0usize);

    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = pi;
            mark = ti;
            pi += 1;
        } else if star != usize::MAX {
            pi = star + 1;
            mark += 1;
            ti = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

async fn local_only_path(root: &Path) -> Result<PathBuf> {
    Ok(git_dir(root).await?.join("grove").join("local-only.json"))
}

pub async fn local_only_patterns(root: &Path) -> Result<Vec<String>> {
    let path = local_only_path(root).await?;
    if !path.exists() {
        return Ok(vec!["*_test.php".into()]);
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
    Ok(v.get("patterns")
        .and_then(|p| p.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default())
}

pub async fn set_local_only_patterns(root: &Path, patterns: &[String]) -> Result<()> {
    let path = local_only_path(root).await?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let body = serde_json::json!({ "version": 1, "patterns": patterns });
    std::fs::write(&path, serde_json::to_string_pretty(&body).unwrap())?;
    Ok(())
}

pub fn is_local_only(patterns: &[String], path: &str) -> bool {
    patterns.iter().any(|p| wildcard_match(p, path))
}

async fn check_local_only_staged(root: &Path) -> Result<()> {
    let patterns = local_only_patterns(root).await?;
    if patterns.is_empty() {
        return Ok(());
    }
    let out = run(root, &["diff", "--cached", "--name-only", "-z"]).await?;
    let hits: Vec<&str> = out
        .split('\0')
        .filter(|p| !p.is_empty() && is_local_only(&patterns, p))
        .collect();
    if hits.is_empty() {
        return Ok(());
    }
    Err(Error::Message(format!(
        "这些文件被标记为「本地私有」，不能提交：{}",
        hits.join("、")
    )))
}

// ---------------------------------------------------------------------------
// Journal (undo)
// ---------------------------------------------------------------------------

async fn journal_path(root: &Path) -> Result<PathBuf> {
    let dir = git_dir(root).await?.join("grove");
    std::fs::create_dir_all(&dir)?;
    Ok(dir.join("journal.jsonl"))
}

pub async fn journal_append(
    root: &Path,
    kind: &str,
    label: &str,
    extra: serde_json::Value,
) -> Result<()> {
    let path = journal_path(root).await?;
    let seq = read_journal(&path).last().map(|e| e.0 + 1).unwrap_or(1);
    let entry = serde_json::json!({
        "seq": seq,
        "at": crate::error::now_secs(),
        "kind": kind,
        "label": label,
        "extra": extra,
    });
    if let Some(sha) = extra
        .get("sha")
        .or_else(|| extra.get("headBefore"))
        .and_then(|v| v.as_str())
    {
        let _ = run(
            root,
            &["update-ref", &format!("refs/grove/undo/{seq}"), sha],
        )
        .await;
    }

    use std::io::Write;
    let mut f = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)?;
    writeln!(f, "{}", serde_json::to_string(&entry).unwrap())?;
    Ok(())
}

fn read_journal(path: &Path) -> Vec<(u64, serde_json::Value)> {
    let raw = std::fs::read_to_string(path).unwrap_or_default();
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<serde_json::Value>(l).ok())
        .filter_map(|v| {
            let seq = v.get("seq")?.as_u64()?;
            Some((seq, v))
        })
        .collect()
}

pub async fn journal_entries(root: &Path) -> Result<Vec<JournalEntry>> {
    let path = journal_path(root).await?;
    Ok(read_journal(&path)
        .into_iter()
        .filter_map(|(seq, v)| {
            Some(JournalEntry {
                seq,
                at: v.get("at")?.as_i64()?,
                kind: v.get("kind")?.as_str()?.to_string(),
                label: v.get("label")?.as_str()?.to_string(),
            })
        })
        .collect())
}

pub async fn undo_last(root: &Path) -> Result<OpResult> {
    let path = journal_path(root).await?;
    let mut entries = read_journal(&path);
    let Some((_, entry)) = entries.pop() else {
        return Err(Error::Message("没有可撤销的操作".into()));
    };

    let kind = entry.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    let extra = entry.get("extra").cloned().unwrap_or(serde_json::json!({}));
    let label = entry.get("label").and_then(|v| v.as_str()).unwrap_or("操作");

    match kind {
        "commit" => {
            let head = extra.get("headBefore").and_then(|v| v.as_str()).unwrap_or("");
            if head.is_empty() {
                return Err(Error::Message("缺少恢复信息".into()));
            }
            run(root, &["reset", "--soft", head]).await?;
        }
        "branchDelete" => {
            let name = extra.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let sha = extra.get("sha").and_then(|v| v.as_str()).unwrap_or("");
            run(root, &["update-ref", &format!("refs/heads/{name}"), sha]).await?;
        }
        "stashDrop" => {
            let sha = extra.get("sha").and_then(|v| v.as_str()).unwrap_or("");
            let msg = extra.get("message").and_then(|v| v.as_str()).unwrap_or("restored");
            run(root, &["stash", "store", "-m", msg, sha]).await?;
        }
        "merge" | "rebase" | "cherryPick" => {
            let head = extra.get("headBefore").and_then(|v| v.as_str()).unwrap_or("");
            if head.is_empty() {
                return Err(Error::Message("缺少恢复点".into()));
            }
            let dirty = run(root, &["status", "--porcelain=v2", "--untracked-files=no"]).await?;
            if !dirty.trim().is_empty() {
                return Err(Error::Message(
                    "工作区有未提交改动，先提交或贮藏后再回滚".into(),
                ));
            }
            run(root, &["reset", "--hard", head]).await?;
        }
        _ => return Err(Error::Message("这类操作暂不支持撤销".into())),
    }

    let keep: String = entries
        .iter()
        .map(|(_, v)| format!("{v}\n"))
        .collect::<String>();
    std::fs::write(&path, keep)?;

    Ok(OpResult {
        ok: true,
        message: format!("已{label}"),
        conflicted: false,
        output: String::new(),
    })
}

// ---------------------------------------------------------------------------
// Branch operations
// ---------------------------------------------------------------------------

pub async fn primary_remote(root: &Path) -> String {
    run_allow_fail(root, &["remote"], None)
        .await
        .ok()
        .map(|(_, out, _)| {
            out.lines()
                .map(|s| s.trim())
                .find(|s| !s.is_empty())
                .unwrap_or("origin")
                .to_string()
        })
        .unwrap_or_else(|| "origin".into())
}

pub async fn push_branch(root: &Path, branch: &str) -> Result<OpResult> {
    let remote = primary_remote(root).await;
    let (code, out, err) =
        run_allow_fail(root, &["push", "-u", &remote, branch], None).await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            format!("已推送 {branch} 到 {remote}")
        } else {
            friendly_git_error(&err)
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn set_upstream(root: &Path, branch: &str, upstream: &str) -> Result<()> {
    run(
        root,
        &["branch", &format!("--set-upstream-to={upstream}"), branch],
    )
    .await?;
    Ok(())
}

pub async fn track_remote(root: &Path, remote_ref: &str) -> Result<OpResult> {
    let short = remote_ref.split('/').skip(1).collect::<Vec<_>>().join("/");
    if short.is_empty() {
        return Err(Error::Message("无法解析远程分支名".into()));
    }
    let exists = run_allow_fail(
        root,
        &["show-ref", "--verify", "--quiet", &format!("refs/heads/{short}")],
        None,
    )
    .await?
    .0
        == 0;

    let (code, out, err) = if exists {
        run_allow_fail(
            root,
            &["branch", &format!("--set-upstream-to={remote_ref}"), &short],
            None,
        )
        .await?
    } else {
        run_allow_fail(root, &["switch", "-c", &short, "--track", remote_ref], None).await?
    };

    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            format!("{} {}", if exists { "已设置上游：" } else { "已检出并跟踪：" }, remote_ref)
        } else {
            friendly_git_error(&err)
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn rename_branch(root: &Path, old: &str, new: &str) -> Result<()> {
    run(root, &["branch", "-m", old, new]).await?;
    Ok(())
}

pub async fn compare_branches(root: &Path, other: &str) -> Result<BranchCompare> {
    let ahead_out = run(
        root,
        &["log", "--topo-order", "-n", "200", LOG_FORMAT, &format!("HEAD..{other}")],
    )
    .await
    .unwrap_or_default();
    let behind_out = run(
        root,
        &["log", "--topo-order", "-n", "200", LOG_FORMAT, &format!("{other}..HEAD")],
    )
    .await
    .unwrap_or_default();

    let (c, stat, _) = run_allow_fail(
        root,
        &["diff", "--shortstat", &format!("HEAD...{other}")],
        None,
    )
    .await?;
    let (mut files, mut additions, mut deletions) = (0usize, 0i32, 0i32);
    if c == 0 {
        for part in stat.trim().split(',') {
            let n: i32 = part
                .trim()
                .split_whitespace()
                .next()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0);
            if part.contains("file") {
                files = n.max(0) as usize;
            } else if part.contains("insertion") {
                additions = n;
            } else if part.contains("deletion") {
                deletions = n;
            }
        }
    }

    Ok(BranchCompare {
        other: other.to_string(),
        ahead: parse_log(&ahead_out),
        behind: parse_log(&behind_out),
        file_count: files,
        additions,
        deletions,
    })
}

pub async fn pr_url(root: &Path, branch: &str) -> Result<String> {
    let remote = primary_remote(root).await;
    let (code, url, _) =
        run_allow_fail(root, &["remote", "get-url", &remote], None).await?;
    if code != 0 || url.trim().is_empty() {
        return Err(Error::Message("没有配置远程仓库".into()));
    }
    let raw = url.trim();

    // git@host:owner/repo.git | ssh://git@host/owner/repo.git | https://host/owner/repo.git
    let mut s = raw.to_string();
    if let Some(rest) = s.strip_prefix("git@") {
        s = format!("https://{}", rest.replacen(':', "/", 1));
    } else if let Some(rest) = s.strip_prefix("ssh://git@") {
        s = format!("https://{rest}");
    }
    if let Some(rest) = s.strip_prefix("http://") {
        s = format!("https://{rest}");
    }
    let s = s.trim_end_matches('/').trim_end_matches(".git").to_string();

    let target = run_allow_fail(
        root,
        &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
        None,
    )
    .await
    .ok()
    .filter(|(c, _, _)| *c == 0)
    .map(|(_, out, _)| {
        out.trim()
            .split('/')
            .skip(1)
            .collect::<Vec<_>>()
            .join("/")
    })
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| "main".into());

    if s.contains("github.com") {
        Ok(format!("{s}/compare/{target}...{branch}?expand=1"))
    } else if s.contains("gitlab") {
        Ok(format!(
            "{s}/-/merge_requests/new?merge_request%5Bsource_branch%5D={branch}&merge_request%5Btarget_branch%5D={target}"
        ))
    } else if s.contains("gitee.com") {
        Ok(format!("{s}/compare/{target}...{branch}"))
    } else {
        Ok(s)
    }
}

// ---------------------------------------------------------------------------
// Interactive rebase
// ---------------------------------------------------------------------------

pub async fn rebase_plan(root: &Path, base: Option<&str>) -> Result<Vec<Commit>> {
    let out = match base {
        Some(b) => {
            run(
                root,
                &["log", "--topo-order", "--reverse", LOG_FORMAT, &format!("{b}..HEAD")],
            )
            .await?
        }
        None => {
            run(root, &["log", "--topo-order", "-n", "10", LOG_FORMAT]).await?
        }
    };
    let mut commits = parse_log(&out);
    if base.is_none() {
        commits.reverse();
    }
    Ok(commits)
}

pub async fn rebase_start(
    root: &Path,
    base: &str,
    actions: &[RebaseAction],
) -> Result<OpResult> {
    if actions.is_empty() {
        return Err(Error::Message("没有需要整理的提交".into()));
    }
    let rewords: Vec<&RebaseAction> = actions.iter().filter(|a| a.action == "reword").collect();
    if !rewords.is_empty()
        && actions
            .iter()
            .any(|a| a.action == "squash" || a.action == "fixup")
    {
        return Err(Error::Message("改写提交信息与 squash/fixup 不能同时使用".into()));
    }

    let head_before = run_allow_fail(root, &["rev-parse", "HEAD"], None)
        .await
        .ok()
        .filter(|(c, _, _)| *c == 0)
        .map(|(_, out, _)| out.trim().to_string());

    let gd = git_dir(root).await?;
    let dir = gd.join("grove");
    std::fs::create_dir_all(&dir)?;

    let mut todo = String::new();
    for a in actions {
        let action = match a.action.as_str() {
            "squash" | "fixup" | "drop" | "reword" | "edit" => a.action.as_str(),
            _ => "pick",
        };
        let subject = run_allow_fail(root, &["log", "-1", "--format=%s", &a.sha], None)
            .await
            .ok()
            .map(|(_, out, _)| out.trim().to_string())
            .unwrap_or_default();
        todo.push_str(&format!("{action} {} {subject}\n", a.sha));
    }

    let todo_path = dir.join("rebase-todo");
    std::fs::write(&todo_path, todo)?;
    let seq = dir.join("seq-editor.sh");
    std::fs::write(&seq, "#!/bin/sh\ncp \"$GROVE_TODO\" \"$1\"\n")?;
    make_exec(&seq)?;

    let mut envs: Vec<(&str, &str)> = vec![
        ("GROVE_TODO", todo_path.to_str().unwrap_or("")),
        ("GIT_SEQUENCE_EDITOR", seq.to_str().unwrap_or("")),
        ("GIT_EDITOR", "true"),
    ];

    let msg_path = dir.join("reword-message");
    let editor = dir.join("editor.sh");
    let msg_dir = dir.join("reword");
    let counter = dir.join("reword-counter");
    if rewords.len() > 1 {
        let _ = std::fs::remove_dir_all(&msg_dir);
        std::fs::create_dir_all(&msg_dir)?;
        for (i, r) in rewords.iter().enumerate() {
            std::fs::write(
                msg_dir.join((i + 1).to_string()),
                r.message.clone().unwrap_or_default(),
            )?;
        }
        let _ = std::fs::remove_file(&counter);
        std::fs::write(
            &editor,
            "#!/bin/sh\nn=$(cat \"$GROVE_COUNTER\" 2>/dev/null || echo 0)\nn=$((n+1))\necho \"$n\" > \"$GROVE_COUNTER\"\nf=\"$GROVE_MSG_DIR/$n\"\nif [ -f \"$f\" ]; then cat \"$f\" > \"$1\"; fi\n",
        )?;
        make_exec(&editor)?;
        envs.push(("GROVE_MSG_DIR", msg_dir.to_str().unwrap_or("")));
        envs.push(("GROVE_COUNTER", counter.to_str().unwrap_or("")));
        envs.push(("GIT_EDITOR", editor.to_str().unwrap_or("")));
    } else if let Some(r) = rewords.first() {
        std::fs::write(&msg_path, r.message.clone().unwrap_or_default())?;
        std::fs::write(&editor, "#!/bin/sh\ncat \"$GROVE_MSG\" > \"$1\"\n")?;
        make_exec(&editor)?;
        envs.push(("GROVE_MSG", msg_path.to_str().unwrap_or("")));
        envs.push(("GIT_EDITOR", editor.to_str().unwrap_or("")));
    }

    let (code, out, err) = run_allow_fail_env(
        root,
        &["rebase", "--no-autosquash", "-i", base],
        None,
        &envs,
    )
    .await?;
    let conflicted = has_conflicts(root).await.unwrap_or(false);
    if code == 0 {
        if let Some(prev) = &head_before {
            let _ = journal_append(
                root,
                "rebase",
                "回滚变基",
                serde_json::json!({ "headBefore": prev }),
            )
            .await;
        }
    }

    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            format!("已整理 {} 个提交", actions.len())
        } else {
            friendly_git_error(&err)
        },
        conflicted,
        output: format!("{out}{err}"),
    })
}

fn make_exec(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = std::fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(path, perms)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Line-level staging
// ---------------------------------------------------------------------------

pub async fn stage_lines(
    root: &Path,
    file: &str,
    scope: &str,
    hunk_index: usize,
    selected: &[usize],
) -> Result<()> {
    if selected.is_empty() {
        return Err(Error::Message("没有选中任何行".into()));
    }
    let unstaging = scope == "index";
    let raw = if unstaging {
        run(root, &["diff", "--cached", "--no-color", "--no-ext-diff", "-U3", "--", file]).await?
    } else {
        run(root, &["diff", "--no-color", "--no-ext-diff", "-U3", "--", file]).await?
    };

    let (header, _) = split_raw_patch(&raw);
    if header.trim().is_empty() {
        return Err(Error::Message("该文件没有可用的补丁头".into()));
    }
    let parsed = parse_diff(&raw);
    let hunk = parsed
        .hunks
        .get(hunk_index)
        .ok_or_else(|| Error::Message("hunk 不存在，请刷新后重试".into()))?;

    let sel: std::collections::HashSet<usize> = selected.iter().copied().collect();
    let mut old_no = hunk.old_start as i64;
    let mut new_no = hunk.new_start as i64;
    let (mut old_start, mut new_start) = (0i64, 0i64);
    let mut started = false;
    let (mut old_count, mut new_count) = (0i64, 0i64);
    let mut body = String::new();

    for (i, line) in hunk.lines.iter().enumerate() {
        let kind = line.kind.as_str();
        let out: Option<char> = match kind {
            " " => Some(' '),
            "+" => {
                if sel.contains(&i) {
                    Some('+')
                } else if unstaging {
                    Some(' ')
                } else {
                    None
                }
            }
            "-" => {
                if sel.contains(&i) {
                    Some('-')
                } else if unstaging {
                    None
                } else {
                    Some(' ')
                }
            }
            _ => None,
        };

        match out {
            Some(c) => {
                if !started {
                    old_start = old_no;
                    new_start = new_no;
                    started = true;
                }
                body.push(c);
                body.push_str(&line.content);
                body.push('\n');
                match c {
                    '+' => new_count += 1,
                    '-' => old_count += 1,
                    _ => {
                        old_count += 1;
                        new_count += 1;
                    }
                }
                match c {
                    '+' => new_no += 1,
                    '-' => old_no += 1,
                    _ => {
                        old_no += 1;
                        new_no += 1;
                    }
                }
            }
            None => {
                // skipped line still exists on one side
                if kind == "+" {
                    new_no += 1;
                } else if kind == "-" {
                    old_no += 1;
                }
            }
        }
    }

    if !started {
        return Err(Error::Message("选中的行没有可应用的改动".into()));
    }

    let patch = format!(
        "{header}@@ -{old_start},{old_count} +{new_start},{new_count} @@\n{body}"
    );
    let args: Vec<&str> = if unstaging {
        vec!["apply", "--cached", "-R", "--whitespace=nowarn", "-"]
    } else {
        vec!["apply", "--cached", "--whitespace=nowarn", "-"]
    };
    run_with_stdin(root, &args, &patch).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Protected branches
// ---------------------------------------------------------------------------

pub async fn protected_patterns(root: &Path) -> Result<Vec<String>> {
    let path = git_dir(root).await?.join("grove").join("protected.json");
    if !path.exists() {
        return Ok(vec!["main".into(), "master".into()]);
    }
    let raw = std::fs::read_to_string(&path).unwrap_or_default();
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap_or(serde_json::json!({}));
    Ok(v.get("patterns")
        .and_then(|p| p.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_else(|| vec!["main".into(), "master".into()]))
}

pub fn branch_is_protected(patterns: &[String], branch: &str) -> bool {
    patterns.iter().any(|p| wildcard_match(p, branch))
}

// ---------------------------------------------------------------------------
// Blame
// ---------------------------------------------------------------------------

pub async fn blame(root: &Path, file: &str, rev: Option<&str>) -> Result<BlameFile> {
    let mut args: Vec<String> = vec!["blame".into(), "--line-porcelain".into()];
    if let Some(r) = rev {
        args.push(r.to_string());
    }
    args.push("--".into());
    args.push(file.to_string());
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    let out = run(root, &refs).await?;

    let mut lines: Vec<BlameLine> = Vec::new();
    let mut it = out.lines();
    while let Some(header) = it.next() {
        let is_sha = header.len() >= 40 && header[..40].chars().all(|c| c.is_ascii_hexdigit());
        if !is_sha {
            continue;
        }
        let parts: Vec<&str> = header.split_whitespace().collect();
        let sha = parts.first().unwrap_or(&"").to_string();
        let final_line: u32 = parts.get(2).and_then(|v| v.parse().ok()).unwrap_or(0);
        let (mut author, mut time, mut summary) = (String::new(), 0i64, String::new());
        let mut content = String::new();
        for meta in it.by_ref() {
            if let Some(rest) = meta.strip_prefix('\t') {
                content = rest.to_string();
                break;
            }
            if let Some(v) = meta.strip_prefix("author ") {
                author = v.to_string();
            } else if let Some(v) = meta.strip_prefix("author-time ") {
                time = v.parse().unwrap_or(0);
            } else if let Some(v) = meta.strip_prefix("summary ") {
                summary = v.to_string();
            }
        }
        lines.push(BlameLine {
            line: final_line,
            sha,
            author,
            time,
            content,
            summary,
        });
        if lines.len() >= 20_000 {
            break;
        }
    }

    Ok(BlameFile {
        path: file.to_string(),
        lines,
    })
}

pub async fn set_protected_patterns(root: &Path, patterns: &[String]) -> Result<()> {
    let path = git_dir(root).await?.join("grove").join("protected.json");
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let body = serde_json::json!({ "version": 1, "patterns": patterns });
    std::fs::write(&path, serde_json::to_string_pretty(&body).unwrap())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Worktrees
// ---------------------------------------------------------------------------

pub async fn worktrees(root: &Path) -> Result<Vec<Worktree>> {
    let out = run(root, &["worktree", "list", "--porcelain"]).await?;
    let mut list: Vec<Worktree> = Vec::new();
    let mut cur: Option<Worktree> = None;

    for line in out.lines() {
        if line.trim().is_empty() {
            if let Some(w) = cur.take() {
                list.push(w);
            }
            continue;
        }
        if let Some(p) = line.strip_prefix("worktree ") {
            if let Some(w) = cur.take() {
                list.push(w);
            }
            cur = Some(Worktree {
                path: p.to_string(),
                ..Default::default()
            });
        } else if let Some(h) = line.strip_prefix("HEAD ") {
            if let Some(w) = cur.as_mut() {
                w.head = h.to_string();
            }
        } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
            if let Some(w) = cur.as_mut() {
                w.branch = Some(b.to_string());
            }
        } else if line == "detached" {
            // leave branch as None
        } else if line == "bare" {
            if let Some(w) = cur.as_mut() {
                w.bare = true;
            }
        } else if line.starts_with("prunable") {
            if let Some(w) = cur.as_mut() {
                w.prunable = true;
            }
        }
    }
    if let Some(w) = cur {
        list.push(w);
    }
    for (i, w) in list.iter_mut().enumerate() {
        w.main = i == 0;
    }
    Ok(list)
}

pub async fn worktree_add(
    root: &Path,
    target: &str,
    branch: &str,
    create: bool,
) -> Result<OpResult> {
    let (code, out, err) = if create {
        run_allow_fail(
            root,
            &["worktree", "add", "-b", branch, target],
            None,
        )
        .await?
    } else {
        run_allow_fail(root, &["worktree", "add", target, branch], None).await?
    };
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            format!("已创建工作树 {}", target)
        } else {
            friendly_git_error(&err)
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn worktree_remove(root: &Path, target: &str, force: bool) -> Result<OpResult> {
    let args: Vec<&str> = if force {
        vec!["worktree", "remove", "--force", target]
    } else {
        vec!["worktree", "remove", target]
    };
    let (code, out, err) = run_allow_fail(root, &args, None).await?;
    Ok(OpResult {
        ok: code == 0,
        message: if code == 0 {
            "已移除工作树".into()
        } else {
            friendly_git_error(&err)
        },
        conflicted: false,
        output: format!("{out}{err}"),
    })
}

pub async fn worktree_prune(root: &Path) -> Result<()> {
    run(root, &["worktree", "prune"]).await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Stash preview
// ---------------------------------------------------------------------------

pub async fn stash_files(root: &Path, selector: &str) -> Result<Vec<CommitFile>> {
    let (code, out, err) = run_allow_fail(
        root,
        &["stash", "show", "--numstat", "-z", selector],
        None,
    )
    .await?;
    if code != 0 {
        return Err(Error::Git(friendly_git_error(&err)));
    }
    let mut files = Vec::new();
    for rec in out.split('\0') {
        let rec = rec.trim_start_matches('\n');
        if rec.is_empty() {
            continue;
        }
        let f: Vec<&str> = rec.splitn(3, '\t').collect();
        if f.len() < 3 {
            continue;
        }
        files.push(CommitFile {
            path: f[2].to_string(),
            status: if f[0] == "-" { "B".into() } else { "M".into() },
            additions: f[0].parse().unwrap_or(0),
            deletions: f[1].parse().unwrap_or(0),
        });
    }
    Ok(files)
}

pub async fn stash_diff(root: &Path, selector: &str, path: &str) -> Result<FileDiff> {
    let parent = format!("{selector}^1");
    let (code, out, err) = run_allow_fail(
        root,
        &["diff", "--no-color", "--no-ext-diff", &parent, selector, "--", path],
        None,
    )
    .await?;
    if code != 0 {
        return Err(Error::Git(friendly_git_error(&err)));
    }
    let mut d = parse_diff(&out);
    d.path = path.to_string();
    Ok(d)
}

// ---------------------------------------------------------------------------
// Filtered history
// ---------------------------------------------------------------------------

pub async fn log_filtered(
    root: &Path,
    limit: usize,
    skip: usize,
    branch: Option<&str>,
    author: Option<&str>,
    first_parent: bool,
) -> Result<(Vec<Commit>, bool)> {
    let n = limit.to_string();
    let s = skip.to_string();
    let mut args: Vec<String> = vec![
        "log".into(),
        "--topo-order".into(),
        "-n".into(),
        n,
        "--skip".into(),
        s,
        LOG_FORMAT.into(),
    ];
    if first_parent {
        args.push("--first-parent".into());
    }
    if let Some(b) = branch {
        if b == "all" {
            args.push("--all".into());
        } else if b != "current" && !b.is_empty() {
            args.push(b.to_string());
        }
    }
    if let Some(a) = author {
        if !a.is_empty() {
            args.push("--author".into());
            args.push(a.to_string());
        }
    }
    let refs: Vec<&str> = args.iter().map(|x| x.as_str()).collect();
    let out = run(root, &refs).await?;
    let commits = parse_log(&out);
    let has_more = commits.len() == limit;
    Ok((commits, has_more))
}

pub async fn authors(root: &Path) -> Result<Vec<String>> {
    let out = run(
        root,
        &["shortlog", "-sne", "--all", "--no-merges"],
    )
    .await
    .unwrap_or_default();
    let mut names: Vec<String> = Vec::new();
    for line in out.lines() {
        let trimmed = line.trim_start();
        let name = trimmed
            .split('\t')
            .nth(1)
            .unwrap_or("")
            .split('<')
            .next()
            .unwrap_or("")
            .trim();
        if !name.is_empty() && !names.contains(&name.to_string()) {
            names.push(name.to_string());
        }
    }
    Ok(names)
}
