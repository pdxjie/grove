import { Archive, ArrowDownToLine, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { DiffView } from './DiffView'
import { Button, IconButton } from './ui'

export function StashDetail() {
  const preview = useStore((s) => s.stashPreview)
  const files = useStore((s) => s.stashFiles)
  const selected = useStore((s) => s.selectedFile)
  const selectFile = useStore((s) => s.selectStashFile)
  const apply = useStore((s) => s.stashApply)
  const drop = useStore((s) => s.stashDrop)
  const close = useStore((s) => s.closeStashPreview)

  if (!preview) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel/20">
      <div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-line/70 px-3">
        <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-violet/15 text-violet">
          <Archive size={13} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[12px] text-ink">贮藏：{preview.message}</div>
          <div className="font-mono text-[9.5px] text-faint">{preview.selector}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" icon={ArrowDownToLine} onClick={() => void apply(preview.selector, true)}>
            弹出
          </Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => void drop(preview.selector)}>
            删除
          </Button>
          <IconButton icon={X} label="关闭预览" onClick={close} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[264px] shrink-0 overflow-y-auto border-r border-line/60 py-1 scroll-thin">
          <div className="px-3 pb-1 text-[9.5px] uppercase tracking-[0.1em] text-faint">文件 {files.length}</div>
          {files.map((f) => (
            <button
              key={f.path}
              onClick={() => void selectFile(f.path)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-[5px] text-left text-[11px] transition',
                selected?.path === f.path ? 'bg-elevated/80 text-ink' : 'text-muted hover:bg-elevated/40',
              )}
            >
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              {f.additions > 0 && <span className="shrink-0 text-[9.5px] text-green">+{f.additions}</span>}
              {f.deletions > 0 && <span className="shrink-0 text-[9.5px] text-red">−{f.deletions}</span>}
            </button>
          ))}
          {files.length === 0 && <div className="px-3 py-2 text-[10.5px] text-faint">没有文件</div>}
        </div>
        <div className="min-w-0 flex-1">
          <DiffView />
        </div>
      </div>
    </div>
  )
}
