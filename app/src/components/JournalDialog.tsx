import { History, RotateCcw } from 'lucide-react'
import { useStore } from '../lib/store'
import { timeAgo } from '../lib/utils'
import { Button, Modal, ModalHeader } from './ui'

export function JournalDialog() {
  const open = useStore((s) => s.journalOpen)
  const journal = useStore((s) => s.journal)
  const close = useStore((s) => s.closeJournal)
  const undoLast = useStore((s) => s.undoLast)
  const busy = useStore((s) => s.busy)

  return (
    <Modal open={open} onClose={close} width={520}>
      <ModalHeader
        title="操作历史"
        subtitle="最近的可恢复操作；只有最新一条可以撤销"
        onClose={close}
      />
      <div className="p-4">
        {journal.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-[12px] text-faint">
            <History size={16} />
            还没有可恢复的操作
          </div>
        ) : (
          <div className="overflow-hidden rounded-[9px] border border-line/70">
            {[...journal].reverse().map((e, idx) => {
              const isLatest = idx === 0
              return (
                <div
                  key={e.seq}
                  className="flex items-center gap-2 border-b border-line/40 px-3 py-2 last:border-0"
                >
                  <span className={`h-[5px] w-[5px] shrink-0 rounded-full ${isLatest ? 'bg-accent' : 'bg-line-strong/70'}`} />
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink/90">{e.label}</span>
                  <span className="shrink-0 font-mono text-[10.5px] text-faint/70">{e.kind}</span>
                  <span className="w-[56px] shrink-0 text-right text-[11px] text-faint">{timeAgo(e.at)}</span>
                  {isLatest ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={RotateCcw}
                      disabled={!!busy}
                      loading={busy === '撤销'}
                      onClick={() => void undoLast()}
                    >
                      撤销
                    </Button>
                  ) : (
                    <span className="w-[52px] shrink-0 text-right text-[10.5px] text-faint/50">先撤销更新</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div className="mt-3 text-[11px] leading-[15px] text-faint">
          撤销通过 <span className="font-mono">.git/grove/journal.jsonl</span> 恢复；提交、删分支、删贮藏可逆，推送与 reset --hard 不在其内。
        </div>
      </div>
    </Modal>
  )
}
