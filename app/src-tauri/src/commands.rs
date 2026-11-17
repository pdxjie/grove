use grove_core::{
    git, graph,
    model::*,
};
use std::path::PathBuf;

fn root(path: &str) -> PathBuf {
    PathBuf::from(path)
}

fn build_snapshot(
    info: RepoInfo,
    status: Status,
    branches: Vec<Branch>,
    stashes: Vec<Stash>,
    worktrees: Vec<Worktree>,
    commits: Vec<Commit>,
) -> Snapshot {
    let graph = graph::layout(&commits);
    Snapshot {
        info,
        status,
        branches,
        stashes,
        worktrees,
        commits,
        graph,
        has_more: false,
    }
}

#[tauri::command]
pub async fn open_repo(path: String) -> Result<Snapshot, grove_core::Error> {
    let info = git::open_repo(&root(&path)).await?;
    let repo = root(&info.path);
    let status = git::status(&repo).await?;
    let branches = git::branches(&repo).await.unwrap_or_default();
    let stashes = git::stashes(&repo).await.unwrap_or_default();
    let worktrees = git::worktrees(&repo).await.unwrap_or_default();
    let (commits, has_more) = git::log(&repo, 250, 0).await.unwrap_or_default();
    let mut snap = build_snapshot(info, status, branches, stashes, worktrees, commits);
    snap.has_more = has_more;
    Ok(snap)
}

#[tauri::command]
pub async fn repo_snapshot(path: String) -> Result<Snapshot, grove_core::Error> {
    let repo = root(&path);
    let info = git::repo_info(&repo).await?;
    let status = git::status(&repo).await?;
    let branches = git::branches(&repo).await.unwrap_or_default();
    let stashes = git::stashes(&repo).await.unwrap_or_default();
    let worktrees = git::worktrees(&repo).await.unwrap_or_default();
    let (commits, has_more) = git::log(&repo, 250, 0).await.unwrap_or_default();
    let mut snap = build_snapshot(info, status, branches, stashes, worktrees, commits);
    snap.has_more = has_more;
    Ok(snap)
}

#[tauri::command]
pub async fn status(path: String) -> Result<Status, grove_core::Error> {
    git::status(&root(&path)).await
}

#[tauri::command]
pub async fn log_page(
    path: String,
    limit: usize,
    skip: usize,
    branch: Option<String>,
    author: Option<String>,
    first_parent: bool,
) -> Result<LogPage, grove_core::Error> {
    let (commits, has_more) = git::log_filtered(
        &root(&path),
        limit,
        skip,
        branch.as_deref(),
        author.as_deref(),
        first_parent,
    )
    .await?;
    let graph = graph::layout(&commits);
    Ok(LogPage { commits, graph, has_more })
}

#[tauri::command]
pub async fn authors(path: String) -> Result<Vec<String>, grove_core::Error> {
    git::authors(&root(&path)).await
}

#[tauri::command]
pub async fn diff(
    path: String,
    scope: String,
    file_path: String,
    commit: Option<String>,
) -> Result<FileDiff, grove_core::Error> {
    git::diff(&root(&path), &scope, Some(&file_path), commit.as_deref()).await
}

#[tauri::command]
pub async fn commit_detail(path: String, sha: String) -> Result<CommitDetail, grove_core::Error> {
    git::commit_detail(&root(&path), &sha).await
}

#[tauri::command]
pub async fn stage(path: String, paths: Vec<String>) -> Result<(), grove_core::Error> {
    git::stage(&root(&path), &paths).await
}

#[tauri::command]
pub async fn stage_hunk(
    path: String,
    file: String,
    scope: String,
    index: usize,
) -> Result<(), grove_core::Error> {
    git::stage_hunk(&root(&path), &file, &scope, index).await
}

#[tauri::command]
pub async fn stage_lines(
    path: String,
    file: String,
    scope: String,
    hunk_index: usize,
    lines: Vec<usize>,
) -> Result<(), grove_core::Error> {
    git::stage_lines(&root(&path), &file, &scope, hunk_index, &lines).await
}

#[tauri::command]
pub async fn outgoing(path: String) -> Result<Outgoing, grove_core::Error> {
    git::outgoing(&root(&path)).await
}

#[tauri::command]
pub async fn conflict_doc(path: String, file: String) -> Result<ConflictDoc, grove_core::Error> {
    git::conflict_doc(&root(&path), &file).await
}

#[tauri::command]
pub async fn resolve_conflict(
    path: String,
    file: String,
    choices: Vec<String>,
) -> Result<(), grove_core::Error> {
    git::resolve_conflict(&root(&path), &file, &choices).await
}

#[tauri::command]
pub async fn checkout_side(
    path: String,
    file: String,
    side: String,
) -> Result<(), grove_core::Error> {
    git::checkout_side(&root(&path), &file, &side).await
}

#[tauri::command]
pub async fn unstage(path: String, paths: Vec<String>) -> Result<(), grove_core::Error> {
    git::unstage(&root(&path), &paths).await
}

#[tauri::command]
pub async fn discard(
    path: String,
    tracked: Vec<String>,
    untracked: Vec<String>,
) -> Result<(), grove_core::Error> {
    git::discard(&root(&path), &tracked, &untracked).await
}

#[tauri::command]
pub async fn commit(
    path: String,
    message: String,
    amend: bool,
    sign: bool,
) -> Result<OpResult, grove_core::Error> {
    git::commit(&root(&path), &message, amend, sign).await
}

#[tauri::command]
pub async fn branches(path: String) -> Result<Vec<Branch>, grove_core::Error> {
    git::branches(&root(&path)).await
}

#[tauri::command]
pub async fn push_branch(path: String, branch: String) -> Result<OpResult, grove_core::Error> {
    git::push_branch(&root(&path), &branch).await
}

#[tauri::command]
pub async fn track_remote(path: String, remote_ref: String) -> Result<OpResult, grove_core::Error> {
    git::track_remote(&root(&path), &remote_ref).await
}

#[tauri::command]
pub async fn rename_branch(
    path: String,
    old: String,
    new: String,
) -> Result<(), grove_core::Error> {
    git::rename_branch(&root(&path), &old, &new).await
}

#[tauri::command]
pub async fn compare_branches(
    path: String,
    other: String,
) -> Result<BranchCompare, grove_core::Error> {
    git::compare_branches(&root(&path), &other).await
}

#[tauri::command]
pub async fn pr_url(path: String, branch: String) -> Result<String, grove_core::Error> {
    git::pr_url(&root(&path), &branch).await
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&url)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法打开浏览器：{e}"))
}

#[tauri::command]
pub async fn rebase_plan(
    path: String,
    base: Option<String>,
) -> Result<Vec<Commit>, grove_core::Error> {
    git::rebase_plan(&root(&path), base.as_deref()).await
}

#[tauri::command]
pub async fn rebase_start(
    path: String,
    base: String,
    actions: Vec<RebaseAction>,
) -> Result<OpResult, grove_core::Error> {
    git::rebase_start(&root(&path), &base, &actions).await
}

#[tauri::command]
pub async fn worktree_add(
    path: String,
    target: String,
    branch: String,
    create: bool,
) -> Result<OpResult, grove_core::Error> {
    git::worktree_add(&root(&path), &target, &branch, create).await
}

#[tauri::command]
pub async fn worktree_remove(
    path: String,
    target: String,
    force: bool,
) -> Result<OpResult, grove_core::Error> {
    git::worktree_remove(&root(&path), &target, force).await
}

#[tauri::command]
pub async fn worktree_prune(path: String) -> Result<(), grove_core::Error> {
    git::worktree_prune(&root(&path)).await
}

#[tauri::command]
pub async fn blame(
    path: String,
    file: String,
    rev: Option<String>,
) -> Result<BlameFile, grove_core::Error> {
    git::blame(&root(&path), &file, rev.as_deref()).await
}

#[tauri::command]
pub async fn protected_rules(path: String) -> Result<Vec<String>, grove_core::Error> {
    git::protected_patterns(&root(&path)).await
}

#[tauri::command]
pub async fn set_protected_rules(
    path: String,
    patterns: Vec<String>,
) -> Result<(), grove_core::Error> {
    git::set_protected_patterns(&root(&path), &patterns).await
}

#[tauri::command]
pub async fn local_only(path: String) -> Result<Vec<String>, grove_core::Error> {
    git::local_only_patterns(&root(&path)).await
}

#[tauri::command]
pub async fn set_local_only(
    path: String,
    patterns: Vec<String>,
) -> Result<(), grove_core::Error> {
    git::set_local_only_patterns(&root(&path), &patterns).await
}

#[tauri::command]
pub async fn undo_last(path: String) -> Result<OpResult, grove_core::Error> {
    git::undo_last(&root(&path)).await
}

#[tauri::command]
pub async fn journal(path: String) -> Result<Vec<JournalEntry>, grove_core::Error> {
    git::journal_entries(&root(&path)).await
}

#[tauri::command]
pub async fn checkout(path: String, target: String) -> Result<(), grove_core::Error> {
    git::checkout(&root(&path), &target).await
}

#[tauri::command]
pub async fn create_branch(
    path: String,
    name: String,
    from: Option<String>,
) -> Result<(), grove_core::Error> {
    git::create_branch(&root(&path), &name, from.as_deref()).await
}

#[tauri::command]
pub async fn delete_branch(
    path: String,
    name: String,
    force: bool,
) -> Result<(), grove_core::Error> {
    git::delete_branch(&root(&path), &name, force).await
}

#[tauri::command]
pub async fn merge(path: String, branch: String) -> Result<OpResult, grove_core::Error> {
    git::merge(&root(&path), &branch).await
}

#[tauri::command]
pub async fn cherry_pick(
    path: String,
    shas: Vec<String>,
    no_commit: bool,
    record_source: bool,
) -> Result<OpResult, grove_core::Error> {
    git::cherry_pick(&root(&path), &shas, no_commit, record_source).await
}

#[tauri::command]
pub async fn revert_commit(path: String, sha: String) -> Result<OpResult, grove_core::Error> {
    git::revert_commit(&root(&path), &sha).await
}

#[tauri::command]
pub async fn sequencer_control(
    path: String,
    action: String,
) -> Result<OpResult, grove_core::Error> {
    git::sequencer_control(&root(&path), &action).await
}

#[tauri::command]
pub async fn undo_commit(path: String) -> Result<OpResult, grove_core::Error> {
    git::undo_last_commit(&root(&path)).await
}

#[tauri::command]
pub async fn stash_push(
    path: String,
    message: String,
    keep_index: bool,
    include_untracked: bool,
    paths: Vec<String>,
) -> Result<OpResult, grove_core::Error> {
    git::stash_push(&root(&path), &message, keep_index, include_untracked, &paths).await
}

#[tauri::command]
pub async fn stash_files(
    path: String,
    selector: String,
) -> Result<Vec<CommitFile>, grove_core::Error> {
    git::stash_files(&root(&path), &selector).await
}

#[tauri::command]
pub async fn stash_diff(
    path: String,
    selector: String,
    file: String,
) -> Result<FileDiff, grove_core::Error> {
    git::stash_diff(&root(&path), &selector, &file).await
}

#[tauri::command]
pub async fn stash_apply(
    path: String,
    selector: String,
    pop: bool,
) -> Result<OpResult, grove_core::Error> {
    git::stash_apply(&root(&path), &selector, pop).await
}

#[tauri::command]
pub async fn stash_drop(path: String, selector: String) -> Result<(), grove_core::Error> {
    git::stash_drop(&root(&path), &selector).await
}

#[tauri::command]
pub async fn fetch_all(path: String) -> Result<OpResult, grove_core::Error> {
    git::fetch_all(&root(&path)).await
}

#[tauri::command]
pub async fn pull(path: String) -> Result<OpResult, grove_core::Error> {
    git::pull(&root(&path)).await
}

#[tauri::command]
pub async fn push(path: String) -> Result<OpResult, grove_core::Error> {
    git::push(&root(&path)).await
}

#[tauri::command]
pub fn initial_repo() -> Option<String> {
    std::env::var("GROVE_REPO")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[tauri::command]
pub fn initial_ui() -> Option<String> {
    std::env::var("GROVE_UI").ok().filter(|s| !s.trim().is_empty())
}

#[tauri::command]
pub fn cmd_log() -> Vec<LogEntry> {
    grove_core::error::logs()
}

#[tauri::command]
pub fn clear_cmd_log() {
    grove_core::error::clear_logs()
}
