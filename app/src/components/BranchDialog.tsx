import { useState } from 'react'
import { GitBranchPlus } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Field, Modal, ModalHeader } from './ui'

export function BranchDialog() {
  const open = useStore((s) => s.branchDialogOpen)
  const snap = useStore((s) => s.snapshot)
  const close = useStore((s) => s.closeBranchDialog)
  const create = useStore((s) => s.createBranch)
  const [name, setName] = useState('')
  const [synced, setSynced] = useState(false)

  if (open && !synced) {
    setName('feature/')
    setSynced(true)
  }
  if (!open && synced) setSynced(false)

  const submit = () => {
    const v = name.trim()
    if (!v) return
    void create(v)
  }

  return (
    <Modal open={open} onClose={close} width={400}>
      <ModalHeader
        title="新建分支"
        subtitle={snap ? `从 ${snap.info.branch} 创建并切换` : undefined}
        onClose={close}
      />
      <div className="space-y-3 p-4">
        <Field label="分支名" hint="不能包含空格">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => {
              const i = e.target.value.indexOf('/')
              if (i >= 0) e.target.setSelectionRange(i + 1, i + 1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            placeholder="feature/stock-alloc"
            className="field h-[30px] font-mono text-[12px]"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button variant="primary" icon={GitBranchPlus} disabled={!name.trim()} onClick={submit}>
            创建并切换
          </Button>
        </div>
      </div>
    </Modal>
  )
}
