import { useState } from 'react'
import { ShieldAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { Button, Modal, ModalHeader } from './ui'

export function ProtectedDialog() {
  const open = useStore((s) => s.protectedOpen)
  const patterns = useStore((s) => s.protectedPatterns)
  const close = useStore((s) => s.closeProtected)
  const save = useStore((s) => s.saveProtected)
  const [text, setText] = useState(patterns.join('\n'))
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
        title="保护分支"
        subtitle="推送这些分支前需要显式确认"
        onClose={close}
      />
      <div className="space-y-3 p-4">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={'main\nmaster\nrelease/*'}
          className="h-[110px] w-full resize-none rounded-[8px] border border-line bg-panel p-2.5 font-mono text-[12.5px] leading-[18px] text-ink outline-none placeholder:text-faint focus:border-accent/60"
        />
        <div className="flex items-start gap-2 rounded-[8px] border border-line/60 bg-panel/40 px-2.5 py-2 text-[11.5px] leading-[15px] text-faint">
          <ShieldAlert size={12} className="mt-[1px] shrink-0 text-red/80" />
          <span className="min-w-0 flex-1">
            支持通配符；规则保存在 <span className="font-mono">.git/grove/protected.json</span>。命中后推送预览会要求勾选确认。
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-faint">{lines.length} 条规则</span>
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
