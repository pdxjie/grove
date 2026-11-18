import { Plus, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'

export function TabBar() {
  const tabs = useStore((s) => s.tabs)
  const activePath = useStore((s) => s.activePath)
  const activateTab = useStore((s) => s.activateTab)
  const closeTab = useStore((s) => s.closeTab)
  const openRepo = useStore((s) => s.openRepo)

  if (tabs.length === 0) return null

  return (
    <div
      onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize}
      className="flex h-[34px] shrink-0 items-end gap-0.5 border-b border-line/70 bg-sidebar px-2"
    >
      {tabs.map((t) => {
        const active = t.path === activePath
        const dirty =
          t.snapshot.status.staged.length +
          t.snapshot.status.unstaged.length +
          t.snapshot.status.conflicts.length
        return (
          <div
            key={t.path}
            className={cn(
              'group flex h-[28px] max-w-[230px] min-w-[120px] items-center gap-1.5 rounded-t-[7px] border border-b-0 px-2.5',
              active
                ? 'border-line/80 bg-app text-ink'
                : 'border-transparent text-faint hover:bg-elevated/40 hover:text-muted',
            )}
            data-no-drag
          >
            <button
              onClick={() => activateTab(t.path)}
              className="min-w-0 flex-1 truncate text-left text-[12.5px]"
              title={t.path}
            >
              {t.name}
            </button>
            {dirty > 0 && (
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-amber/80" title={`${dirty} 个未提交改动`} />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.path)
              }}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-faint opacity-0 transition hover:bg-elevated hover:text-ink group-hover:opacity-100"
              title="关闭标签"
            >
              <X size={10} />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => void openRepo()}
        className="mb-[3px] flex h-[22px] w-[22px] items-center justify-center rounded-[5px] text-faint transition hover:bg-elevated hover:text-ink"
        title="打开仓库（新标签）"
      >
        <Plus size={13} />
      </button>
      <span className="mb-[6px] ml-auto text-[10.5px] text-faint/70">{tabs.length} 个仓库</span>
    </div>
  )
}
