import { useEffect, useState } from 'react'
import { FolderGit2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Checkbox, Field, Modal, ModalHeader } from './ui'

export function WorktreeDialog() {
  const open = useStore((s) => s.worktreeOpen)
  const snap = useStore((s) => s.snapshot)
  const close = useStore((s) => s.closeWorktreeDialog)
  const add = useStore((s) => s.worktreeAdd)
  const busy = useStore((s) => s.busy)
  const [target, setTarget] = useState('')
  const [branch, setBranch] = useState('')
  const [create, setCreate] = useState(true)

  useEffect(() => {
    if (open && snap) {
      setTarget(`${snap.info.path}-wt`)
      setBranch(`${snap.info.branch}-wt`)
      setCreate(true)
    }
  }, [open])

  return (
    <Modal open={open} onClose={close} width={460}>
      <ModalHeader
        title="新建工作树"
        subtitle="同一仓库的第二个工作目录，用于并行开发"
        onClose={close}
      />
      <div className="space-y-3 p-4">
        <Field label="路径" hint="不能已存在">
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="field h-[30px] font-mono text-[12.5px]"
            placeholder="/path/to/worktree"
          />
        </Field>
        <Field label="分支">
          <input
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="field h-[30px] font-mono text-[12.5px]"
            placeholder="feature/parallel"
          />
        </Field>
        <Checkbox
          checked={create}
          onChange={setCreate}
          label="新建分支"
          hint="同一分支不能被两个工作树同时检出"
        />
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={close}>
            取消
          </Button>
          <Button
            variant="primary"
            icon={FolderGit2}
            loading={busy === '创建工作树'}
            disabled={!target.trim() || !branch.trim()}
            onClick={() => void add(target.trim(), branch.trim(), create)}
          >
            创建工作树
          </Button>
        </div>
      </div>
    </Modal>
  )
}
