use crate::model::LogEntry;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("{0}")]
    Message(String),
    #[error("文件错误: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Git(String),
}

impl serde::Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;

pub fn msg<T>(s: impl Into<String>) -> Result<T> {
    Err(Error::Message(s.into()))
}

/// Turn raw git stderr into one human sentence (Chinese), keeping the raw text
/// available to the caller for the command log.
pub fn friendly_git_error(stderr: &str) -> String {
    let s = stderr.trim();
    let lower = s.to_lowercase();

    if lower.contains("not a git repository") {
        return "这里不是 Git 仓库".into();
    }
    if lower.contains("could not read username") || lower.contains("authentication failed") {
        return "远端认证失败，请检查凭据或 SSH Key".into();
    }
    if lower.contains("permission denied (publickey)") {
        return "SSH 公钥被拒绝，请检查 ~/.ssh/config 与远端授权".into();
    }
    if lower.contains("could not resolve host") || lower.contains("network is unreachable") {
        return "网络不可达，无法连接远端".into();
    }
    if lower.contains("non-fast-forward") || lower.contains("fetch first") {
        return "远端有新提交，需要先拉取（或合并/变基）".into();
    }
    if lower.contains("your local changes") && lower.contains("would be overwritten") {
        return "本地改动会被覆盖：请先提交或贮藏这些文件".into();
    }
    if lower.contains("index.lock") {
        return "另一个 Git 操作正在进行（存在 index.lock），稍后重试".into();
    }
    if lower.contains("nothing to commit") {
        return "没有可提交的改动".into();
    }
    if lower.contains("no upstream branch") {
        return "当前分支还没有上游分支".into();
    }
    if lower.contains("hook") && (lower.contains("failed") || lower.contains("rejected")) {
        return "Git Hook 拒绝了本次操作，详见输出".into();
    }
    if lower.contains("conflict") || lower.contains("automatic merge failed") {
        return "产生冲突，请在冲突中心解决".into();
    }
    if lower.contains("did not match any file") || lower.contains("pathspec") {
        return "路径不存在或已被移动".into();
    }
    if lower.contains("would be overwritten by checkout") {
        return "切换分支会覆盖本地改动，请先提交或贮藏".into();
    }
    if lower.contains("not fully merged") {
        return "分支尚未完全合并，删除需要强制".into();
    }
    if lower.contains("fatal:") || lower.contains("error:") {
        // Keep the first meaningful line, drop the "fatal:" prefix noise.
        let first = s
            .lines()
            .find(|l| !l.trim().is_empty())
            .unwrap_or(s)
            .trim();
        return first
            .trim_start_matches("fatal:")
            .trim_start_matches("error:")
            .trim()
            .to_string();
    }
    if s.is_empty() {
        "Git 操作失败".into()
    } else {
        s.lines().next().unwrap_or(s).to_string()
    }
}

// ---------------------------------------------------------------------------
// Command log (global, append-only ring buffer). Core has no Tauri dependency;
// the app layer reads this and forwards it to the UI.
// ---------------------------------------------------------------------------

static LOG: OnceLock<Mutex<VecDeque<LogEntry>>> = OnceLock::new();
static NEXT_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
const LOG_CAP: usize = 400;

fn log_store() -> &'static Mutex<VecDeque<LogEntry>> {
    LOG.get_or_init(|| Mutex::new(VecDeque::with_capacity(LOG_CAP)))
}

pub fn push_log(cmd: String, duration_ms: u64, ok: bool, output: String) {
    let id = NEXT_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let at = now_secs();
    let mut store = log_store().lock().unwrap();
    store.push_back(LogEntry {
        id,
        at,
        cmd,
        duration_ms,
        ok,
        output: output.chars().take(8000).collect(),
    });
    while store.len() > LOG_CAP {
        store.pop_front();
    }
}

pub fn logs() -> Vec<LogEntry> {
    log_store().lock().unwrap().iter().cloned().collect()
}

pub fn clear_logs() {
    log_store().lock().unwrap().clear();
}

pub fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
