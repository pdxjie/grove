import { useState } from 'react'
import { Archive } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Checkbox, Field, Modal, ModalHeader } from './ui'

export function StashDialog() {
  const open = useStore((s) => s.stashPanel)
  const setOpen = useStore((s) => s.setStashPanel)
  const stashPush = useStore((s) => s.stashPush)
  const snap = useStore((s) => s.snapshot)
  const busy = useStore((s) => s.busy)
  const [message, setMessage] = useState('')
  const [keepIndex, setKeepIndex] = useState(false)
  const [untracked, setUntracked] = useState(false)

  const total = (snap?.status.staged.length ?? 0) + (snap?.status.unstaged.length ?? 0)

  return (
    <Modal open={open} onClose={() => setOpen(false)} width={400}>
      <ModalHeader title="贮藏改动" subtitle={`${total} 个文件 · 存起来，工作区恢复干净`} onClose={() => setOpen(false)} />
      <div className="space-y-3 p-4">
        <Field label="贮藏名称" hint="可选">
          <input
            autoFocus
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="例如：WIP 调拨导出调试"
            className="field h-[30px] text-[12px]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void stashPush(message, keepIndex, untracked)
                setMessage('')
              }
            }}
          />
        </Field>

        <div className="space-y-0.5 rounded-[9px] border border-line/70 bg-panel/40 p-1.5">
          <Checkbox
            checked={keepIndex}
            onChange={setKeepIndex}
            label="贮藏但保留暂存区"
            hint="把未暂存的部分藏起来，已暂存的留着继续提交"
          />
          <Checkbox
            checked={untracked}
            onChange={setUntracked}
            label="包含未跟踪文件"
            hint="默认不贮藏新文件，勾选后一并藏起"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            icon={Archive}
            loading={busy === '贮藏'}
            onClick={() => {
              void stashPush(message, keepIndex, untracked)
              setMessage('')
            }}
          >
            贮藏
          </Button>
        </div>
      </div>
    </Modal>
  )
}
