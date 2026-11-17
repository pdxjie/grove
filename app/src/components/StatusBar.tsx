import { Circle, Eraser, Terminal } from 'lucide-react'
import { IS_TAURI } from '../lib/api'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'
import { Spinner } from './ui'

export function StatusBar() {
  const snap = useStore((s) => s.snapshot)
  const busy = useStore((s) => s.busy)
  const logs = useStore((s) => s.logs)
  const logPanel = useStore((s) => s.logPanel)
  const setLogPanel = useStore((s) => s.setLogPanel)
  const openLog = useStore((s) => s.openLog)

  const failures = logs.filter((l) => !l.ok).length

  return (
    <div
      onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize}
      className="flex h-[26px] shrink-0 items-center gap-3 border-t border-line/70 bg-sidebar px-3 text-[10.5px] text-faint"
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Circle size={5} className={cn('fill-current', snap ? 'text-green' : 'text-faint')} />
        <span className="truncate">{snap ? snap.info.branch : '未打开仓库'}</span>
      </span>
      {snap && (
        <>
          <span className="text-faint/60">|</span>
          <span className="truncate">{snap.info.path.replace(/^\/Users\/[^/]+/, '~')}</span>
          {snap.info.ahead > 0 && <span className="text-amber">↑{snap.info.ahead}</span>}
          {snap.info.behind > 0 && <span className="text-blue">↓{snap.info.behind}</span>}
        </>
      )}

      <div className="ml-auto flex items-center gap-2">
        {busy && (
          <span className="flex items-center gap-1.5 text-muted">
            <Spinner size={10} /> {busy}
          </span>
        )}
        <button
          onClick={() => setLogPanel(!logPanel)}
          className={cn(
            'flex h-[19px] items-center gap-1 rounded-[5px] px-1.5 transition hover:bg-elevated hover:text-muted',
            logPanel && 'bg-elevated text-muted',
          )}
          title="命令日志"
        >
          <Terminal size={10} />
          命令日志
          {failures > 0 && <span className="rounded-full bg-red/20 px-1 text-[9px] text-red">{failures}</span>}
          <span className="flex items-center gap-0.5 opacity-60">
            <span className="kbd h-[14px] min-w-[14px] text-[9px]">⌘</span>
            <span className="kbd h-[14px] min-w-[14px] text-[9px]">L</span>
          </span>
        </button>
        <button
          onClick={() => void openLog()}
          className="hidden h-[19px] items-center rounded-[5px] px-1.5 hover:bg-elevated hover:text-muted md:flex"
          title="刷新日志"
        >
          <Eraser size={10} />
        </button>
        <span className="text-faint/50">{IS_TAURI ? '本地优先' : '预览模式'} · 无遥测</span>
      </div>
    </div>
  )
}
