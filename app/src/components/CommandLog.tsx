import { useState } from 'react'
import { ChevronRight, Trash2, X } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'

export function CommandLog() {
  const logs = useStore((s) => s.logs)
  const setLogPanel = useStore((s) => s.setLogPanel)
  const openLog = useStore((s) => s.openLog)
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="flex h-[212px] shrink-0 flex-col border-t border-line bg-sidebar">
      <div className="flex h-[30px] shrink-0 items-center gap-2 border-b border-line/60 px-3">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">命令日志</span>
        <span className="text-[10px] tabular-nums text-faint/70">{logs.length}</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => void openLog()} className="icon-btn h-5 w-5" title="刷新">
            <ChevronRight size={12} />
          </button>
          <button
            onClick={async () => {
              await api.clearCmdLog()
              await openLog()
            }}
            className="icon-btn h-5 w-5"
            title="清空"
          >
            <Trash2 size={11} />
          </button>
          <button onClick={() => setLogPanel(false)} className="icon-btn h-5 w-5" title="关闭">
            <X size={12} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scroll-thin py-1 font-mono text-[10.5px]">
        {logs.length === 0 && <div className="px-3 py-2 text-faint">还没有执行过命令</div>}
        {[...logs].reverse().map((l) => (
          <div key={l.id}>
            <button
              onClick={() => setExpanded(expanded === l.id ? null : l.id)}
              className="flex h-[23px] w-full items-center gap-2 px-3 text-left transition hover:bg-elevated/50"
            >
              <span className={cn('h-[5px] w-[5px] shrink-0 rounded-full', l.ok ? 'bg-green/80' : 'bg-red')} />
              <span className="w-[46px] shrink-0 text-faint/70">
                {new Date(l.at * 1000).toLocaleTimeString('zh-CN', { hour12: false })}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">{l.cmd}</span>
              <span className="shrink-0 tabular-nums text-faint/70">{l.durationMs}ms</span>
            </button>
            {expanded === l.id && l.output && (
              <pre className="mx-3 mb-1 max-h-[120px] overflow-auto whitespace-pre-wrap rounded-[6px] border border-line/60 bg-panel p-2 text-[10px] leading-[15px] text-faint">
                {l.output}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
