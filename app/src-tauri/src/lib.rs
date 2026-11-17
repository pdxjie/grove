mod commands;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

struct WatchState(Mutex<Option<RecommendedWatcher>>);

#[tauri::command]
fn watch_repo(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let state = app.state::<WatchState>();
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    *guard = None;

    let root = std::path::PathBuf::from(path);
    let handle = app.clone();
    let mut watcher = notify::recommended_watcher(
        move |res: Result<notify::Event, notify::Error>| {
            let Ok(ev) = res else { return };
            let mut worktree = false;
            let mut refs = false;
            for p in &ev.paths {
                let s = p.to_string_lossy();
                if s.contains("/.git/objects/") || s.contains("/.git/logs/") {
                    continue;
                }
                if s.contains("/.git/") {
                    refs = true;
                } else {
                    worktree = true;
                }
            }
            if refs {
                let _ = handle.emit("repo:refs", ());
            } else if worktree {
                let _ = handle.emit("repo:worktree", ());
            }
        },
    )
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&root, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .manage(WatchState(Mutex::new(None)))
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            watch_repo,
            commands::open_repo,
            commands::repo_snapshot,
            commands::status,
            commands::log_page,
            commands::authors,
            commands::diff,
            commands::commit_detail,
            commands::stage,
            commands::stage_hunk,
            commands::stage_lines,
            commands::outgoing,
            commands::conflict_doc,
            commands::resolve_conflict,
            commands::checkout_side,
            commands::unstage,
            commands::discard,
            commands::commit,
            commands::branches,
            commands::push_branch,
            commands::track_remote,
            commands::rename_branch,
            commands::compare_branches,
            commands::pr_url,
            commands::open_url,
            commands::rebase_plan,
            commands::rebase_start,
            commands::worktree_add,
            commands::worktree_remove,
            commands::worktree_prune,
            commands::blame,
            commands::protected_rules,
            commands::set_protected_rules,
            commands::local_only,
            commands::set_local_only,
            commands::undo_last,
            commands::journal,
            commands::checkout,
            commands::create_branch,
            commands::delete_branch,
            commands::merge,
            commands::cherry_pick,
            commands::revert_commit,
            commands::sequencer_control,
            commands::undo_commit,
            commands::stash_push,
            commands::stash_files,
            commands::stash_diff,
            commands::stash_apply,
            commands::stash_drop,
            commands::fetch_all,
            commands::pull,
            commands::push,
            commands::initial_repo,
            commands::initial_ui,
            commands::cmd_log,
            commands::clear_cmd_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running grove");
}
