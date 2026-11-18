import { Check, GitMerge, SplitSquareHorizontal, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { Button, Spinner } from './ui'

export function ConflictCenter() {
  const open = useStore((s) => s.conflictOpen)
  const doc = useStore((s) => s.conflictDoc)
  const file = useStore((s) => s.conflictFile)
  const choices = useStore((s) => s.conflictChoices)
  const allConflicts = useStore((s) => s.snapshot?.status.conflicts)
  const conflicts = allConflicts ?? []
  const busy = useStore((s) => s.busy)
  const close = useStore((s) => s.closeConflict)
  const openConflict = useStore((s) => s.openConflict)
  const setChoice = useStore((s) => s.setConflictChoice)
  const apply = useStore((s) => s.applyConflict)
  const takeSide = useStore((s) => s.takeSide)

  if (!open) return null

  const blocks = doc?.blocks ?? []
  const chosen = blocks.filter((_, i) => !!choices[i]).length
  const allChosen = blocks.length > 0 && chosen === blocks.length

  return (
    <div className="fixed inset-0 z-[82] flex items-center justify-center bg-black/60 p-6">
      <div className="flex h-full max-h-[720px] w-full max-w-[1040px] flex-col overflow-hidden rounded-[14px] border border-line-strong/60 bg-panel2 shadow-pop">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line/70 px-4">
          <span className="flex h-6 w-6 items-center justify-center rounded-[7px] bg-amber/15 text-amber">
            <GitMerge size={13} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-medium text-ink">解决冲突</div>
            <div className="truncate text-[11.5px] text-faint">
              {file ?? '选择文件'} · 剩余 {conflicts.length} 个冲突文件
            </div>
          </div>
          <button
            onClick={close}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-elevated hover:text-ink"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="w-[232px] shrink-0 overflow-y-auto border-r border-line/60 bg-sidebar/40 py-1.5 scroll-thin">
            <div className="px-3 pb-1 text-[10.5px] uppercase tracking-[0.12em] text-faint">冲突文件</div>
            {conflicts.map((f) => (
              <button
                key={f.path}
                onClick={() => void openConflict(f.path)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-[6px] text-left text-[12px] transition',
                  f.path === file ? 'bg-elevated/80 text-ink' : 'text-muted hover:bg-elevated/40',
                )}
              >
                <span className={cn('h-[5px] w-[5px] shrink-0 rounded-full', f.path === file ? 'bg-amber' : 'bg-red/70')} />
                <span className="truncate">{f.path}</span>
              </button>
            ))}
            {conflicts.length === 0 && <div className="px-3 py-2 text-[11.5px] text-faint">没有冲突文件</div>}
          </div>

          <div className="min-w-0 flex-1 overflow-y-auto p-4 scroll-thin">
            {!doc ? (
              <div className="flex h-full items-center justify-center gap-2 text-[12.5px] text-faint">
                <Spinner size={13} /> 读取冲突内容
              </div>
            ) : blocks.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <SplitSquareHorizontal size={18} className="text-faint" />
                <div className="text-[13px] text-muted">这个文件没有可逐块解决的内容</div>
                <div className="max-w-[320px] text-[11.5px] leading-[16px] text-faint">
                  删除/重命名或二进制冲突无法按块合并，请在下方选择整文件采用某一侧。
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-[11.5px] text-faint">
                  <span>
                    已处理 <span className="text-ink">{chosen}</span> / {blocks.length} 块
                  </span>
                  <div className="ml-2 h-1 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div
                      className="h-full rounded-full bg-amber transition-all"
                      style={{ width: `${blocks.length ? (chosen / blocks.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {blocks.map((b, i) => {
                  const c = choices[i]
                  return (
                    <div key={i} className="overflow-hidden rounded-[10px] border border-line/80 bg-panel/40">
                      <div className="flex items-center gap-2 border-b border-line/50 px-3 py-1.5">
                        <span className="text-[11px] font-medium text-faint">冲突块 {i + 1}</span>
                        <span className="ml-auto text-[10.5px] text-faint/70">选择要保留的内容</span>
                      </div>
                      <div className="grid grid-cols-2">
                        <div
                          className={cn(
                            'border-r border-line/50 p-2.5 transition',
                            c === 'ours' && 'bg-red/8',
                          )}
                        >
                          <div className="mb-1 text-[10.5px] font-medium text-red/90">我方 · HEAD</div>
                          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-[16px] text-ink/85 scroll-thin">
                            {b.ours || '（空）'}
                          </pre>
                        </div>
                        <div className={cn('p-2.5 transition', c === 'theirs' && 'bg-blue/8')}>
                          <div className="mb-1 text-[10.5px] font-medium text-blue/90">对方 · incoming</div>
                          <pre className="max-h-[180px] overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-[16px] text-ink/85 scroll-thin">
                            {b.theirs || '（空）'}
                          </pre>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 border-t border-line/50 px-2 py-1.5">
                        <Choice active={c === 'ours'} onClick={() => setChoice(i, 'ours')} tone="red">
                          采用我方
                        </Choice>
                        <Choice active={c === 'theirs'} onClick={() => setChoice(i, 'theirs')} tone="blue">
                          采用对方
                        </Choice>
                        <Choice active={c === 'both'} onClick={() => setChoice(i, 'both')} tone="green">
                          两者都保留
                        </Choice>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-[52px] shrink-0 items-center gap-2 border-t border-line/70 px-4">
          <Button size="sm" variant="ghost" onClick={() => void takeSide('ours')} disabled={!file || !!busy}>
            整文件采用我方
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void takeSide('theirs')} disabled={!file || !!busy}>
            整文件采用对方
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[11px] text-faint">
              {blocks.length > 0 && !allChosen ? '还有未选择的冲突块' : '保存后会 git add 该文件'}
            </span>
            <Button variant="ghost" onClick={close}>
              稍后处理
            </Button>
            <Button
              variant="primary"
              icon={Check}
              disabled={!file || (blocks.length > 0 && !allChosen) || !!busy}
              loading={busy === '解决冲突'}
              onClick={() => void apply()}
            >
              保存并标记解决
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Choice({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean
  onClick: () => void
  tone: 'red' | 'blue' | 'green'
  children: React.ReactNode
}) {
  const activeCls =
    tone === 'red'
      ? 'border-red/45 bg-red/12 text-red'
      : tone === 'blue'
        ? 'border-blue/45 bg-blue/12 text-blue'
        : 'border-green/45 bg-green/12 text-green'
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[23px] items-center rounded-[6px] border px-2 text-[11.5px] transition',
        active ? activeCls : 'border-line/70 text-faint hover:border-linestrong hover:text-muted',
      )}
    >
      {children}
    </button>
  )
}
