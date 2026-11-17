import { useState } from 'react'
import { FileLock2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Modal, ModalHeader } from './ui'

export function LocalOnlyDialog() {
  const open = useStore((s) => s.localOnlyOpen)
  const patterns = useStore((s) => s.localOnlyPatterns)
  const close = useStore((s) => s.closeLocalOnly)
  const save = useStore((s) => s.saveLocalOnly)
  const [text, setText] = useState(patterns.join('\n'))

  // re-sync when opening with fresh patterns
  const [synced, setSynced] = useState(false)
  if (open && !synced) {
    setText(patterns.join('\n'))
    setSynced(true)
  }
  if (!open && synced) setSynced(false)

  const lines = text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  return (
    <Modal open={open} onClose={close} width={460}>
      <ModalHeader
        title="本地私有文件"
        subtitle="这些文件只在本机改动，永远不会被提交"
        onClose={close}
      />
      <div className="space-y-3 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={'*_test.php\nconfig/local.*\n.env.local'}
          className="h-[120px] w-full resize-none rounded-[8px] border border-line bg-panel p-2.5 font-mono text-[11.5px] leading-[18px] text-ink outline-none placeholder:text-faint focus:border-accent/60"
        />
        <div className="flex items-start gap-2 rounded-[8px] border border-line/60 bg-panel/40 px-2.5 py-2 text-[10.5px] leading-[15px] text-faint">
          <FileLock2 size={12} className="mt-[1px] shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            支持 <span className="font-mono">*</span> 与 <span className="font-mono">?</span> 通配符；规则保存在{' '}
            <span className="font-mono">.git/grove/local-only.json</span>，不会影响团队仓库。
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-faint">{lines.length} 条规则</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={close}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void save(lines)}>
              保存
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
