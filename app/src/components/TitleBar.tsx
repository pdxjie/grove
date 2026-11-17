import { Moon, Plus, RefreshCw, Search, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { IS_TAURI } from '../lib/api'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'
import { useStore } from '../lib/store'
import { IconButton, Kbd } from './ui'

function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="7" cy="5.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="7" cy="18.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17" cy="9.5" r="2.6" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 8.1v7.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M9.4 10.6c3.6 0 5-1 7.6-1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function TitleBar() {
  const setPalette = useStore((s) => s.setPalette)
  const openRepo = useStore((s) => s.openRepo)
  const refresh = useStore((s) => s.refresh)
  const snapshot = useStore((s) => s.snapshot)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    (document.documentElement.dataset.theme as 'dark' | 'light') || 'dark',
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.background = theme === 'light' ? '#F5F3EE' : '#08090B'
    localStorage.setItem('grove.theme', theme)
  }, [theme])

  return (
    <header
      onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize}
      className={`titlebar relative z-30 flex h-[48px] shrink-0 items-center pr-3 ${IS_TAURI ? 'pl-[88px]' : 'pl-4'}`}
    >
      <div className="absolute inset-0 z-0" />
      <div className="pointer-events-none relative z-10 flex w-full items-center">
        <div className="flex w-[190px] shrink-0 select-none items-center gap-2">
          <span className="text-accent">
            <Logo size={19} />
          </span>
          <span className="text-[14px] font-semibold tracking-[-0.02em] text-ink">grove</span>
          <span className="mt-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-faint">git</span>
        </div>

        <div className="flex flex-1 justify-center px-4">
          <button
            onClick={() => setPalette(true)}
            className="no-drag pointer-events-auto group flex h-[29px] w-full max-w-[360px] items-center gap-2 rounded-[8px] border border-line bg-panel/70 px-2.5 text-left transition hover:border-linestrong hover:bg-panel"
          >
            <Search size={12} className="text-faint transition group-hover:text-muted" />
            <span className="flex-1 truncate text-[11px] text-faint">
              {snapshot ? '搜索分支、提交或操作' : '打开仓库，开始工作'}
            </span>
            <span className="flex items-center gap-0.5">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>

        <div className="no-drag pointer-events-auto flex w-[190px] shrink-0 items-center justify-end gap-0.5">
          {snapshot && (
            <IconButton icon={RefreshCw} label="刷新 (⌘R)" onClick={() => void refresh()} />
          )}
          <IconButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? '切换到浅色' : '切换到深色'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <div className="mx-1 h-4 w-px bg-line" />
          <button
            onClick={() => void openRepo()}
            className="flex h-[27px] items-center gap-1 rounded-[7px] border border-line bg-elevated px-2 text-[11px] font-medium text-ink transition hover:border-linestrong hover:bg-panel2"
          >
            <Plus size={12} className="text-accent" />
            打开仓库
          </button>
        </div>
      </div>
    </header>
  )
}
