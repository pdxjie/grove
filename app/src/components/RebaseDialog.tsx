import { useState } from 'react'
import { ArrowDown, ArrowUp, GitMerge, GripVertical } from 'lucide-react'
import { useStore } from '../lib/store'
import { cn, shortSha } from '../lib/utils'
import { Button, Modal, ModalHeader } from './ui'
import { Select } from './Select'

const ACTIONS = [
  { value: 'pick', label: '保留', hint: 'pick' },
  { value: 'squash', label: '合入上一个', hint: 'squash' },
  { value: 'fixup', label: '合入并丢弃信息', hint: 'fixup' },
  { value: 'reword', label: '改写信息', hint: 'reword' },
  { value: 'drop', label: '丢弃', hint: 'drop' },
] as const

export function RebaseDialog() {
  const open = useStore((s) => s.rebaseOpen)
  const actions = useStore((s) => s.rebaseActions)
  const allCommits = useStore((s) => s.snapshot?.commits)
  const commits = allCommits ?? []
  const busy = useStore((s) => s.busy)
  const close = useStore((s) => s.closeRebase)
  const setAction = useStore((s) => s.setRebaseAction)
  const setMessage = useStore((s) => s.setRebaseMessage)
  const move = useStore((s) => s.moveRebase)
  const moveTo = useStore((s) => s.moveRebaseTo)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const run = useStore((s) => s.runRebase)

  const subjectOf = (sha: string) => commits.find((c) => c.sha === sha)?.subject ?? shortSha(sha)
  const drops = actions.filter((a) => a.action === 'drop').length
  const squashes = actions.filter((a) => a.action === 'squash' || a.action === 'fixup').length
  const firstInvalid = actions[0]?.action === 'squash' || actions[0]?.action === 'fixup'
  const rewordCount = actions.filter((a) => a.action === 'reword').length
  const rewordConflict = rewordCount > 0 && squashes > 0

  return (
    <Modal open={open} onClose={close} width={720}>
      <ModalHeader
        title="交互式变基"
        subtitle="拖拽排序，或选择 squash / fixup / drop / reword；冲突时进入冲突中心"
        onClose={close}
      />
      <div className="space-y-3 p-4">
        <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1 scroll-thin">
          {actions.map((a, i) => (
            <div
              key={a.sha}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null) moveTo(dragIndex, i)
                setDragIndex(null)
              }}
              className={cn(
                'rounded-[8px] border px-2 py-1.5 transition',
                a.action === 'drop' ? 'border-red/25 bg-red/5 opacity-70' : 'border-line/70 bg-panel/40',
                dragIndex === i && 'opacity-40',
              )}
            >
              <div className="flex items-center gap-2">
                <GripVertical size={12} className="shrink-0 text-faint/60" />
                <span className="w-[18px] shrink-0 text-center text-[10px] tabular-nums text-faint">{i + 1}</span>
                <div className="w-[104px] shrink-0">
                  <Select
                    value={a.action}
                    width={150}
                    onChange={(v) => setAction(i, v as any)}
                    options={ACTIONS.map((op) => ({
                      value: op.value,
                      label: op.label,
                      hint: op.value,
                      disabled: i === 0 && (op.value === 'squash' || op.value === 'fixup'),
                    }))}
                  />
                </div>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/90">{subjectOf(a.sha)}</span>
                <span className="shrink-0 font-mono text-[9.5px] text-faint/70">{shortSha(a.sha)}</span>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="flex h-5 w-5 items-center justify-center rounded-[4px] text-faint hover:bg-elevated hover:text-ink disabled:opacity-25"
                  >
                    <ArrowUp size={11} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === actions.length - 1}
                    className="flex h-5 w-5 items-center justify-center rounded-[4px] text-faint hover:bg-elevated hover:text-ink disabled:opacity-25"
                  >
                    <ArrowDown size={11} />
                  </button>
                </div>
              </div>
              {a.action === 'reword' && (
                <input
                  value={a.message ?? ''}
                  onChange={(e) => setMessage(i, e.target.value)}
                  placeholder={subjectOf(a.sha)}
                  className="mt-1.5 h-[26px] w-full rounded-[6px] border border-line bg-panel px-2 text-[11px] text-ink outline-none placeholder:text-faint focus:border-accent/60"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[10.5px] text-faint">
          <span>{actions.length} 个提交</span>
          {squashes > 0 && <span className="text-blue">{squashes} 个合并</span>}
          {drops > 0 && <span className="text-red">{drops} 个丢弃</span>}
          {firstInvalid && <span className="text-amber">第一行不能是合并操作</span>}
          {rewordConflict && <span className="text-amber">改写信息不能与 squash/fixup 同时使用</span>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line/60 pt-3">
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button
            variant="primary"
            icon={GitMerge}
            disabled={firstInvalid || rewordConflict || !!busy}
            loading={busy === '变基中'}
            onClick={() => void run()}
          >
            开始变基
          </Button>
        </div>
      </div>
    </Modal>
  )
}
