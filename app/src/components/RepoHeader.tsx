import { ArrowDown, ArrowUp, CloudDownload, CloudUpload, GitBranch, RotateCcw, AlertTriangle } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'
import { IconButton, Segmented } from './ui'

const stateLabel: Record<string, string> = {
  clean: '',
  merging: '合并中',
  rebasing: '变基中',
  cherryPicking: '遴选中',
  reverting: '回滚中',
  bisecting: '二分查找中',
}

export function RepoHeader() {
  const snap = useStore((s) => s.snapshot)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const sync = useStore((s) => s.sync)
  const busy = useStore((s) => s.busy)
  const sequencer = useStore((s) => s.sequencer)
  const openPush = useStore((s) => s.openPush)
  const openConflict = useStore((s) => s.openConflict)
  const openJournal = useStore((s) => s.openJournal)

  if (!snap) return null
  const { info } = snap
  const dirty = snap.status.staged.length + snap.status.unstaged.length + snap.status.conflicts.length
  const conflictCount = snap.status.conflicts.length

  return (
    <div
      onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize}
      className="flex h-[44px] shrink-0 items-center gap-2 border-b border-line/70 bg-panel/20 px-3"
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <GitBranch size={13} className="shrink-0 text-accent" />
        <span className="truncate text-[13.5px] font-medium text-ink">{info.branch}</span>
        {info.ahead > 0 && (
          <span className="flex items-center gap-0.5 text-[11.5px] text-amber">
            <ArrowUp size={10} />
            {info.ahead}
          </span>
        )}
        {info.behind > 0 && (
          <span className="flex items-center gap-0.5 text-[11.5px] text-blue">
            <ArrowDown size={10} />
            {info.behind}
          </span>
        )}
        {dirty > 0 && <span className="ml-1 h-[5px] w-[5px] rounded-full bg-amber/80" title={`${dirty} 个未提交改动`} />}
      </div>

      {conflictCount > 0 && (
        <button
          onClick={() => void openConflict(snap.status.conflicts[0].path)}
          className="flex shrink-0 items-center gap-1.5 rounded-[6px] border border-red/35 bg-red/12 px-2 py-[3px] text-[11.5px] text-red transition hover:bg-red/18"
        >
          <AlertTriangle size={11} />
          {conflictCount} 个冲突
          <span className="text-[11px] opacity-80">解决</span>
        </button>
      )}

      {info.state !== 'clean' && (
        <div className="flex items-center gap-1.5 rounded-[6px] border border-amber/30 bg-amber/10 px-2 py-[3px]">
          <AlertTriangle size={11} className="text-amber" />
          <span className="text-[11.5px] text-amber">{stateLabel[info.state]}</span>
          <button onClick={() => void sequencer('continue')} className="text-[11px] text-amber/90 underline-offset-2 hover:underline">
            继续
          </button>
          <button onClick={() => void sequencer('abort')} className="text-[11px] text-amber/70 hover:text-amber">
            中止
          </button>
        </div>
      )}

      <div className="mx-auto">
        <Segmented
          value={view}
          onChange={(v) => setView(v)}
          items={[
            { value: 'changes', label: '变更' },
            { value: 'history', label: '历史' },
          ]}
        />
      </div>

      <div className="flex items-center gap-0.5">
        <IconButton icon={RotateCcw} label="撤销上一步 / 操作历史" onClick={() => void openJournal()} />
        <div className="mx-0.5 h-4 w-px bg-line/70" />
        <IconButton icon={CloudDownload} label="抓取 (fetch)" onClick={() => void sync('fetch')} />
        <IconButton icon={ArrowDown} label="拉取 (pull)" onClick={() => void sync('pull')} />
        <button
          onClick={() => void openPush()}
          disabled={busy === '推送中'}
          className={cn(
            'flex h-[26px] items-center gap-1 rounded-[7px] border px-2 text-[12px] transition',
            info.ahead > 0
              ? 'border-accent/50 bg-accent/15 text-accent hover:bg-accent/20'
              : 'border-line bg-elevated/60 text-muted hover:text-ink',
          )}
        >
          <CloudUpload size={12} />
          推送
          {info.ahead > 0 && <span className="text-[11px] opacity-80">{info.ahead}</span>}
        </button>
      </div>
    </div>
  )
}
