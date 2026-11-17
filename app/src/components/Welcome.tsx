import { FolderGit2, GitBranch, Command } from 'lucide-react'
import { IS_TAURI } from '../lib/api'
import { useStore } from '../lib/store'

export function Welcome() {
  const recents = useStore((s) => s.recents)
  const openRepo = useStore((s) => s.openRepo)

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8">
      <div className="glow-accent pointer-events-none absolute left-1/2 top-[38%] h-[420px] w-[620px] -translate-x-1/2 -translate-y-1/2 opacity-70" />
      <div className="relative flex w-[420px] flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[16px] border border-line-strong/60 bg-panel2 shadow-card">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-accent">
            <circle cx="7" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="7" cy="18.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            <circle cx="17" cy="9.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
            <path d="M7 8.1v7.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M9.4 10.6c3.6 0 5-1 7.6-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">打开一个 Git 仓库</h1>
        <p className="mt-1.5 text-[12px] leading-5 text-muted">
          快、可逆、冲突有解。Grove 只在本地工作，不登录、不上传。
        </p>

        <button
          onClick={() => void openRepo()}
          className="mt-5 flex h-[34px] items-center gap-2 rounded-[9px] bg-accent px-4 text-[12.5px] font-semibold text-[rgb(var(--accent-ink))] transition hover:brightness-110"
        >
          <FolderGit2 size={14} strokeWidth={2.2} />
          选择仓库文件夹
          <span className="ml-1 rounded-[4px] border border-black/15 bg-black/10 px-1.5 py-[1px] text-[10px] font-medium text-black/55">
            ⌘O
          </span>
        </button>

        {recents.length > 0 && (
          <div className="mt-7 w-full">
            <div className="mb-1.5 flex items-center gap-1.5 text-left text-[9.5px] uppercase tracking-[0.12em] text-faint">
              <GitBranch size={10} /> 最近打开
            </div>
            <div className="overflow-hidden rounded-[10px] border border-line/80 bg-panel/50">
              {recents.slice(0, 5).map((r, i) => (
                <button
                  key={r}
                  onClick={() => void openRepo(r)}
                  className={`flex h-[34px] w-full items-center gap-2.5 px-3 text-left transition hover:bg-elevated/70 ${
                    i > 0 ? 'border-t border-line/50' : ''
                  }`}
                >
                  <FolderGit2 size={13} className="shrink-0 text-faint" />
                  <span className="shrink-0 text-[11.5px] text-ink">{r.split('/').filter(Boolean).pop()}</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] text-faint">
                    {r.replace(/^\/Users\/[^/]+/, '~')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex items-center gap-3 text-[10px] text-faint/80">
          <span className="flex items-center gap-1">
            <Command size={10} /> K 命令面板
          </span>
          <span className="h-3 w-px bg-line" />
          <span>{IS_TAURI ? 'Tauri 2 · Rust 内核' : '浏览器预览模式'}</span>
        </div>
      </div>
    </div>
  )
}
