use grove_core::{git, graph};
use std::path::{Path, PathBuf};
use std::process::Command;

fn sh(dir: &Path, args: &[&str]) {
    let out = Command::new("git")
        .arg("-C")
        .arg(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_AUTHOR_EMAIL", "t@example.com")
        .env("GIT_COMMITTER_NAME", "Test")
        .env("GIT_COMMITTER_EMAIL", "t@example.com")
        .output()
        .expect("git");
    assert!(
        out.status.success(),
        "git {:?} failed: {}",
        args,
        String::from_utf8_lossy(&out.stderr)
    );
}

fn tmp_repo(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(format!("grove-test-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    sh(&dir, &["init", "-q", "-b", "main"]);
    dir
}

fn write(dir: &Path, file: &str, content: &str) {
    let p = dir.join(file);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).unwrap();
    }
    std::fs::write(p, content).unwrap();
}

#[tokio::test]
async fn stage_commit_and_log() {
    let dir = tmp_repo("commit");
    write(&dir, "a.txt", "hello\n");
    write(&dir, "src/b.php", "<?php echo 1;\n");

    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.unstaged.len(), 2);
    assert!(st.unstaged.iter().all(|f| f.untracked));

    git::stage(&dir, &["a.txt".into(), "src/b.php".into()]).await.unwrap();
    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.staged.len(), 2);
    assert_eq!(st.unstaged.len(), 0);

    let r = git::commit(&dir, "init: first", false, false).await.unwrap();
    assert!(r.ok);

    let (commits, _) = git::log(&dir, 50, 0).await.unwrap();
    assert_eq!(commits.len(), 1);
    assert_eq!(commits[0].subject, "init: first");

    let branches = git::branches(&dir).await.unwrap();
    assert_eq!(branches.len(), 1, "main branch is listed");
    assert!(branches[0].current);

    // modify unstaged only
    write(&dir, "a.txt", "hello world\n");
    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.unstaged.len(), 1);
    assert_eq!(st.staged.len(), 0);

    // diff of worktree contains the new line
    let d = git::diff(&dir, "worktree", Some("a.txt"), None).await.unwrap();
    assert!(d.hunks.iter().flat_map(|h| h.lines.iter()).any(|l| l.kind == "+"));
}

#[tokio::test]
async fn cherry_pick_no_commit_only_touches_worktree() {
    let dir = tmp_repo("pick");
    write(&dir, "a.txt", "base\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();

    sh(&dir, &["switch", "-q", "-c", "feature"]);
    write(&dir, "a.txt", "base\nfeature\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "feat: feature line", false, false).await.unwrap();
    let (feat, _) = git::log(&dir, 10, 0).await.unwrap();
    let feat_sha = feat[0].sha.clone();

    sh(&dir, &["switch", "-q", "main"]);
    let (before, _) = git::log(&dir, 10, 0).await.unwrap();
    assert_eq!(before.len(), 1);

    let r = git::cherry_pick(&dir, &[feat_sha], true, false).await.unwrap();
    assert!(r.ok, "{}", r.message);

    let (after, _) = git::log(&dir, 10, 0).await.unwrap();
    assert_eq!(after.len(), 1, "no commit should be created");

    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.staged.len(), 1, "picked change is staged");
    assert!(std::fs::read_to_string(dir.join("a.txt")).unwrap().contains("feature"));
}

#[tokio::test]
async fn stash_keep_index_leaves_staged_files() {
    let dir = tmp_repo("stash");
    write(&dir, "a.txt", "one\n");
    write(&dir, "b.txt", "two\n");
    git::stage(&dir, &["a.txt".into(), "b.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();

    write(&dir, "a.txt", "one staged\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    write(&dir, "b.txt", "two unstaged\n");

    let r = git::stash_push(&dir, "wip", true, false, &[]).await.unwrap();
    assert!(r.ok, "{}", r.message);

    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.staged.len(), 1, "staged change is preserved");
    assert_eq!(st.unstaged.len(), 0, "unstaged change was stashed");
    assert!(std::fs::read_to_string(dir.join("a.txt")).unwrap().contains("staged"));

    let list = git::stashes(&dir).await.unwrap();
    assert_eq!(list.len(), 1);

    let r = git::stash_apply(&dir, &list[0].selector, true).await.unwrap();
    assert!(r.ok, "{}", r.message);
    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.unstaged.len(), 1);
}

#[tokio::test]
async fn graph_layout_matches_parents() {
    let dir = tmp_repo("graph");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "c1", false, false).await.unwrap();
    sh(&dir, &["switch", "-q", "-c", "f"]);
    write(&dir, "f.txt", "f\n");
    git::stage(&dir, &["f.txt".into()]).await.unwrap();
    git::commit(&dir, "c2", false, false).await.unwrap();
    sh(&dir, &["switch", "-q", "main"]);
    write(&dir, "b.txt", "b\n");
    git::stage(&dir, &["b.txt".into()]).await.unwrap();
    git::commit(&dir, "c3", false, false).await.unwrap();
    sh(&dir, &["merge", "--no-ff", "-m", "merge f", "f"]);

    let (commits, _) = git::log(&dir, 50, 0).await.unwrap();
    let rows = graph::layout(&commits);
    assert_eq!(rows.len(), commits.len());
    let merge = rows.iter().find(|r| r.merge).expect("merge row");
    assert_eq!(merge.parent_lanes.len(), 2);
    assert!(rows.iter().all(|r| r.lane < r.lanes.max(1)));
}

#[tokio::test]
async fn stage_single_hunk_only_stages_that_hunk() {
    let dir = tmp_repo("hunk");
    let base: String = (1..=30).map(|i| format!("line {i}\n")).collect();
    write(&dir, "f.txt", &base);
    git::stage(&dir, &["f.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();

    let mut changed = base.clone();
    changed = changed.replace("line 2\n", "line 2 changed\n");
    changed = changed.replace("line 25\n", "line 25 changed\n");
    write(&dir, "f.txt", &changed);

    let d = git::diff(&dir, "worktree", Some("f.txt"), None).await.unwrap();
    assert_eq!(d.hunks.len(), 2, "two separate hunks");

    git::stage_hunk(&dir, "f.txt", "worktree", 0).await.unwrap();

    let staged = git::diff(&dir, "index", Some("f.txt"), None).await.unwrap();
    assert_eq!(staged.hunks.len(), 1, "only first hunk staged");
    let rest = git::diff(&dir, "worktree", Some("f.txt"), None).await.unwrap();
    assert_eq!(rest.hunks.len(), 1, "second hunk still unstaged");

    // unstage the same hunk again
    git::stage_hunk(&dir, "f.txt", "index", 0).await.unwrap();
    let staged = git::diff(&dir, "index", Some("f.txt"), None).await.unwrap();
    assert!(staged.hunks.is_empty());
    let rest = git::diff(&dir, "worktree", Some("f.txt"), None).await.unwrap();
    assert_eq!(rest.hunks.len(), 2);
}

#[tokio::test]
async fn conflicts_can_be_inspected_and_resolved() {
    let dir = tmp_repo("conflict");
    write(&dir, "a.txt", "one\ntwo\nthree\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();

    sh(&dir, &["switch", "-q", "-c", "other"]);
    write(&dir, "a.txt", "one\ntwo theirs\nthree\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "theirs", false, false).await.unwrap();

    sh(&dir, &["switch", "-q", "main"]);
    write(&dir, "a.txt", "one\ntwo ours\nthree\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "ours", false, false).await.unwrap();

    let out = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["merge", "other"])
        .env("GIT_AUTHOR_NAME", "Test")
        .env("GIT_COMMITTER_NAME", "Test")
        .output()
        .unwrap();
    assert!(!out.status.success(), "merge conflicts");

    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.conflicts.len(), 1);

    let doc = git::conflict_doc(&dir, "a.txt").await.unwrap();
    assert_eq!(doc.blocks.len(), 1);
    assert!(doc.blocks[0].ours.contains("two ours"));
    assert!(doc.blocks[0].theirs.contains("two theirs"));

    git::resolve_conflict(&dir, "a.txt", &["theirs".to_string()]).await.unwrap();
    let content = std::fs::read_to_string(dir.join("a.txt")).unwrap();
    assert!(content.contains("two theirs"));
    assert!(!content.contains("<<<<<<<"));

    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.conflicts.len(), 0);
    assert_eq!(st.staged.len(), 1);
}

#[tokio::test]
async fn outgoing_lists_unpushed_commits() {
    let dir = tmp_repo("outgoing");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();
    write(&dir, "b.txt", "2\n");
    git::stage(&dir, &["b.txt".into()]).await.unwrap();
    git::commit(&dir, "second", false, false).await.unwrap();

    let o = git::outgoing(&dir).await.unwrap();
    assert!(o.upstream.is_none());
    assert_eq!(o.commits.len(), 2);
    assert_eq!(o.file_count, 2);
    assert!(o.additions >= 2);
}

#[tokio::test]
async fn undo_last_commit_keeps_changes_staged() {
    let dir = tmp_repo("undo");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();
    write(&dir, "a.txt", "2\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "second", false, false).await.unwrap();

    let r = git::undo_last_commit(&dir).await.unwrap();
    assert!(r.ok, "{}", r.message);

    let (commits, _) = git::log(&dir, 10, 0).await.unwrap();
    assert_eq!(commits.len(), 1);
    let st = git::status(&dir).await.unwrap();
    assert_eq!(st.staged.len(), 1, "changes stay in the index");
    assert_eq!(st.staged[0].path, "a.txt");
}

#[tokio::test]
async fn branch_tracking_counts_ahead_and_behind() {
    let dir = tmp_repo("track");
    let remote = std::env::temp_dir().join(format!("grove-remote-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&remote);
    std::fs::create_dir_all(&remote).unwrap();
    sh(&remote, &["init", "--bare", "-q"]);
    sh(&dir, &["remote", "add", "origin", remote.to_str().unwrap()]);

    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();
    sh(&dir, &["push", "-q", "-u", "origin", "main"]);

    let branches = git::branches(&dir).await.unwrap();
    let main = branches.iter().find(|b| b.name == "main").unwrap();
    assert_eq!(main.ahead, 0);
    assert_eq!(main.behind, 0);

    write(&dir, "a.txt", "2\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "second", false, false).await.unwrap();

    let branches = git::branches(&dir).await.unwrap();
    let main = branches.iter().find(|b| b.name == "main").unwrap();
    assert_eq!(main.ahead, 1, "one commit to push");
    assert_eq!(main.behind, 0);
}

#[tokio::test]
async fn interactive_rebase_squashes_commits() {
    let dir = tmp_repo("rebase");
    write(&dir, "init.txt", "init\n");
    git::stage(&dir, &["init.txt".into()]).await.unwrap();
    git::commit(&dir, "init", false, false).await.unwrap();
    let init_sha = git::log(&dir, 1, 0).await.unwrap().0[0].sha.clone();

    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "c1", false, false).await.unwrap();
    write(&dir, "b.txt", "2\n");
    git::stage(&dir, &["b.txt".into()]).await.unwrap();
    git::commit(&dir, "c2", false, false).await.unwrap();
    write(&dir, "c.txt", "3\n");
    git::stage(&dir, &["c.txt".into()]).await.unwrap();
    git::commit(&dir, "c3", false, false).await.unwrap();

    let plan = git::rebase_plan(&dir, Some(&init_sha)).await.unwrap();
    assert_eq!(plan.len(), 3);
    let base = init_sha.clone();

    let actions = vec![
        grove_core::model::RebaseAction { sha: plan[0].sha.clone(), action: "pick".into(), message: None },
        grove_core::model::RebaseAction { sha: plan[1].sha.clone(), action: "squash".into(), message: None },
        grove_core::model::RebaseAction { sha: plan[2].sha.clone(), action: "pick".into(), message: None },
    ];
    let r = git::rebase_start(&dir, &base, &actions).await.unwrap();
    assert!(r.ok, "{} | {}", r.message, r.output);

    let (commits, _) = git::log(&dir, 10, 0).await.unwrap();
    assert_eq!(commits.len(), 3, "init + squashed + c3");
    assert!(std::fs::read_to_string(dir.join("b.txt")).unwrap().contains('2'));
}

#[tokio::test]
async fn local_only_files_are_blocked_from_commit() {
    let dir = tmp_repo("localonly");
    git::set_local_only_patterns(&dir, &["*_test.php".to_string()]).await.unwrap();
    write(&dir, "a.txt", "1\n");
    write(&dir, "debug_test.php", "<?php\n");
    git::stage(&dir, &["a.txt".into(), "debug_test.php".into()]).await.unwrap();

    let err = git::commit(&dir, "should fail", false, false).await;
    assert!(err.is_err());
    assert!(err.unwrap_err().to_string().contains("本地私有"));

    git::unstage(&dir, &["debug_test.php".into()]).await.unwrap();
    assert!(git::commit(&dir, "ok", false, false).await.is_ok());
}

#[tokio::test]
async fn undo_restores_deleted_branch_and_dropped_stash() {
    let dir = tmp_repo("undo2");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();
    sh(&dir, &["branch", "keep-me"]);

    git::delete_branch(&dir, "keep-me", true).await.unwrap();
    assert!(!git::branches(&dir).await.unwrap().iter().any(|b| b.name == "keep-me"));
    let r = git::undo_last(&dir).await.unwrap();
    assert!(r.ok);
    assert!(git::branches(&dir).await.unwrap().iter().any(|b| b.name == "keep-me"));

    write(&dir, "a.txt", "dirty\n");
    sh(&dir, &["stash", "push", "-q", "-m", "wip"]);
    let list = git::stashes(&dir).await.unwrap();
    assert_eq!(list.len(), 1);
    git::stash_drop(&dir, &list[0].selector).await.unwrap();
    assert!(git::stashes(&dir).await.unwrap().is_empty());
    git::undo_last(&dir).await.unwrap();
    assert_eq!(git::stashes(&dir).await.unwrap().len(), 1);
}

#[tokio::test]
async fn compare_branches_lists_diverging_commits() {
    let dir = tmp_repo("compare");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();
    sh(&dir, &["switch", "-q", "-c", "feature"]);
    write(&dir, "f.txt", "f\n");
    git::stage(&dir, &["f.txt".into()]).await.unwrap();
    git::commit(&dir, "feat", false, false).await.unwrap();
    sh(&dir, &["switch", "-q", "main"]);

    let c = git::compare_branches(&dir, "feature").await.unwrap();
    assert_eq!(c.ahead.len(), 1);
    assert!(c.behind.is_empty());
    assert_eq!(c.file_count, 1);
}

#[tokio::test]
async fn stage_selected_lines_inside_one_hunk() {
    let dir = tmp_repo("lines");
    let base = "line1\nline2\nline3\nline4\nline5\n";
    write(&dir, "f.txt", base);
    git::stage(&dir, &["f.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();

    write(&dir, "f.txt", "line1\nline2x\nline3x\nline4\nline5\n");
    let d = git::diff(&dir, "worktree", Some("f.txt"), None).await.unwrap();
    assert_eq!(d.hunks.len(), 1);

    // pick the first deletion and first addition
    let mut selected = Vec::new();
    let mut del_seen = false;
    for (i, l) in d.hunks[0].lines.iter().enumerate() {
        if l.kind == "-" && !del_seen {
            selected.push(i);
            del_seen = true;
        } else if l.kind == "+" && !selected.iter().any(|x| d.hunks[0].lines[*x].kind == "+") {
            selected.push(i);
        }
    }
    git::stage_lines(&dir, "f.txt", "worktree", 0, &selected).await.unwrap();

    let staged = git::diff(&dir, "index", Some("f.txt"), None).await.unwrap();
    assert_eq!(staged.additions, 1);
    assert_eq!(staged.deletions, 1);

    let shown = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["show", ":f.txt"])
        .output()
        .unwrap();
    let indexed = String::from_utf8_lossy(&shown.stdout);
    assert!(indexed.contains("line2x"));
    assert!(indexed.contains("line3\n"), "second change not staged");
    assert!(!indexed.contains("line3x"));
}

#[tokio::test]
async fn main_is_protected_by_default() {
    let dir = tmp_repo("protect");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();

    let patterns = git::protected_patterns(&dir).await.unwrap();
    assert!(git::branch_is_protected(&patterns, "main"));
    assert!(!git::branch_is_protected(&patterns, "feature/x"));

    let o = git::outgoing(&dir).await.unwrap();
    assert!(o.protected, "pushing main should be flagged");
}

#[tokio::test]
async fn undo_rolls_back_merge() {
    let dir = tmp_repo("undomerge");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();
    let base = git::log(&dir, 1, 0).await.unwrap().0[0].sha.clone();

    sh(&dir, &["switch", "-q", "-c", "feature"]);
    write(&dir, "b.txt", "2\n");
    git::stage(&dir, &["b.txt".into()]).await.unwrap();
    git::commit(&dir, "feat", false, false).await.unwrap();
    sh(&dir, &["switch", "-q", "main"]);

    let r = git::merge(&dir, "feature").await.unwrap();
    assert!(r.ok, "{}", r.message);
    assert!(dir.join("b.txt").exists());

    let u = git::undo_last(&dir).await.unwrap();
    assert!(u.ok, "{}", u.message);
    assert_eq!(git::log(&dir, 1, 0).await.unwrap().0[0].sha, base);
    assert!(!dir.join("b.txt").exists(), "merge changes rolled back");
}

#[tokio::test]
async fn multiple_reworks_in_one_rebase() {
    let dir = tmp_repo("multireword");
    write(&dir, "init.txt", "i\n");
    git::stage(&dir, &["init.txt".into()]).await.unwrap();
    git::commit(&dir, "init", false, false).await.unwrap();
    let init = git::log(&dir, 1, 0).await.unwrap().0[0].sha.clone();

    for (i, name) in ["c1", "c2", "c3"].iter().enumerate() {
        write(&dir, &format!("f{i}.txt"), name);
        git::stage(&dir, &[format!("f{i}.txt")]).await.unwrap();
        git::commit(&dir, name, false, false).await.unwrap();
    }

    let plan = git::rebase_plan(&dir, Some(&init)).await.unwrap();
    assert_eq!(plan.len(), 3);
    let actions = vec![
        grove_core::model::RebaseAction { sha: plan[0].sha.clone(), action: "pick".into(), message: None },
        grove_core::model::RebaseAction { sha: plan[1].sha.clone(), action: "reword".into(), message: Some("renamed two".into()) },
        grove_core::model::RebaseAction { sha: plan[2].sha.clone(), action: "reword".into(), message: Some("renamed three".into()) },
    ];
    let r = git::rebase_start(&dir, &init, &actions).await.unwrap();
    assert!(r.ok, "{} | {}", r.message, r.output);

    let (commits, _) = git::log(&dir, 10, 0).await.unwrap();
    let subjects: Vec<&str> = commits.iter().map(|c| c.subject.as_str()).collect();
    assert!(subjects.contains(&"renamed two"));
    assert!(subjects.contains(&"renamed three"));
}

#[tokio::test]
async fn blame_reports_author_per_line() {
    let dir = tmp_repo("blame");
    std::fs::write(dir.join("a.txt"), "one\ntwo\n").unwrap();
    sh(&dir, &["add", "a.txt"]);
    let c = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["commit", "-qm", "first"])
        .env("GIT_AUTHOR_NAME", "Alice")
        .env("GIT_AUTHOR_EMAIL", "alice@example.com")
        .env("GIT_COMMITTER_NAME", "Alice")
        .env("GIT_COMMITTER_EMAIL", "alice@example.com")
        .output()
        .unwrap();
    assert!(c.status.success());

    std::fs::write(dir.join("a.txt"), "one\ntwo\nthree\n").unwrap();
    sh(&dir, &["add", "a.txt"]);
    let c = Command::new("git")
        .arg("-C")
        .arg(&dir)
        .args(["commit", "-qm", "second"])
        .env("GIT_AUTHOR_NAME", "Bob")
        .env("GIT_AUTHOR_EMAIL", "bob@example.com")
        .env("GIT_COMMITTER_NAME", "Bob")
        .env("GIT_COMMITTER_EMAIL", "bob@example.com")
        .output()
        .unwrap();
    assert!(c.status.success());

    let bf = git::blame(&dir, "a.txt", None).await.unwrap();
    assert_eq!(bf.lines.len(), 3);
    assert_eq!(bf.lines[0].author, "Alice");
    assert_eq!(bf.lines[2].author, "Bob");
    assert_eq!(bf.lines[2].content, "three");
    assert_eq!(bf.lines[0].line, 1);
}

#[tokio::test]
async fn worktrees_can_be_listed_added_and_removed() {
    let dir = tmp_repo("worktree");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();
    sh(&dir, &["branch", "feature"]);

    let wt = std::env::temp_dir().join(format!("grove-wt-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&wt);

    let r = git::worktree_add(&dir, wt.to_str().unwrap(), "feature", false)
        .await
        .unwrap();
    assert!(r.ok, "{}", r.message);

    let list = git::worktrees(&dir).await.unwrap();
    assert_eq!(list.len(), 2);
    assert!(list[0].main);
    assert_eq!(list[1].branch.as_deref(), Some("feature"));

    let r = git::worktree_remove(&dir, wt.to_str().unwrap(), true).await.unwrap();
    assert!(r.ok, "{}", r.message);
    assert_eq!(git::worktrees(&dir).await.unwrap().len(), 1);
}

#[tokio::test]
async fn revert_commit_creates_inverse_commit() {
    let dir = tmp_repo("revert");
    write(&dir, "a.txt", "one\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "first", false, false).await.unwrap();
    write(&dir, "a.txt", "two\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "second", false, false).await.unwrap();
    let head = git::log(&dir, 1, 0).await.unwrap().0[0].sha.clone();

    let r = git::revert_commit(&dir, &head).await.unwrap();
    assert!(r.ok, "{}", r.message);
    let (commits, _) = git::log(&dir, 10, 0).await.unwrap();
    assert_eq!(commits.len(), 3);
    assert!(std::fs::read_to_string(dir.join("a.txt")).unwrap().contains("one"));
}

#[tokio::test]
async fn stash_preview_lists_files_and_diff() {
    let dir = tmp_repo("stashpreview");
    write(&dir, "a.txt", "one\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    git::commit(&dir, "base", false, false).await.unwrap();
    write(&dir, "a.txt", "one changed\n");
    sh(&dir, &["stash", "push", "-q", "-m", "wip"]);

    let list = git::stashes(&dir).await.unwrap();
    assert_eq!(list.len(), 1);
    let files = git::stash_files(&dir, &list[0].selector).await.unwrap();
    assert_eq!(files.len(), 1);
    assert_eq!(files[0].path, "a.txt");

    let d = git::stash_diff(&dir, &list[0].selector, "a.txt").await.unwrap();
    assert!(!d.hunks.is_empty());
}

#[tokio::test]
async fn filtered_history_by_branch_and_author() {
    let dir = tmp_repo("filter");
    write(&dir, "a.txt", "1\n");
    git::stage(&dir, &["a.txt".into()]).await.unwrap();
    let c = Command::new("git").arg("-C").arg(&dir).args(["commit","-qm","base"])
        .env("GIT_AUTHOR_NAME","Alice").env("GIT_AUTHOR_EMAIL","a@e.c")
        .env("GIT_COMMITTER_NAME","Alice").env("GIT_COMMITTER_EMAIL","a@e.c").output().unwrap();
    assert!(c.status.success());

    sh(&dir, &["switch", "-q", "-c", "feature"]);
    write(&dir, "b.txt", "2\n");
    git::stage(&dir, &["b.txt".into()]).await.unwrap();
    let c = Command::new("git").arg("-C").arg(&dir).args(["commit","-qm","feat"])
        .env("GIT_AUTHOR_NAME","Bob").env("GIT_AUTHOR_EMAIL","b@e.c")
        .env("GIT_COMMITTER_NAME","Bob").env("GIT_COMMITTER_EMAIL","b@e.c").output().unwrap();
    assert!(c.status.success());

    let (all, _) = git::log_filtered(&dir, 50, 0, Some("all"), None, false).await.unwrap();
    assert_eq!(all.len(), 2);

    let (feat, _) = git::log_filtered(&dir, 50, 0, Some("feature"), None, false).await.unwrap();
    assert_eq!(feat.len(), 2);

    let (bob, _) = git::log_filtered(&dir, 50, 0, Some("all"), Some("Bob"), false).await.unwrap();
    assert_eq!(bob.len(), 1);
    assert_eq!(bob[0].author, "Bob");

    let names = git::authors(&dir).await.unwrap();
    assert!(names.contains(&"Bob".to_string()));
    assert!(names.contains(&"Alice".to_string()));
}

#[tokio::test]
async fn history_pagination_does_not_overlap() {
    let dir = tmp_repo("page");
    for i in 1..=5 {
        write(&dir, "a.txt", &format!("{i}\n"));
        git::stage(&dir, &["a.txt".into()]).await.unwrap();
        git::commit(&dir, &format!("c{i}"), false, false).await.unwrap();
    }
    let (p1, more1) = git::log_filtered(&dir, 2, 0, Some("current"), None, false)
        .await
        .unwrap();
    let (p2, more2) = git::log_filtered(&dir, 2, 2, Some("current"), None, false)
        .await
        .unwrap();
    assert_eq!(p1.len(), 2);
    assert!(more1);
    assert_eq!(p2.len(), 2);
    assert!(more2);
    assert!(p1.iter().all(|c| p2.iter().all(|d| d.sha != c.sha)));
}
