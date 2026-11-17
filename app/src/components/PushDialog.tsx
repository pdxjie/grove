import { useEffect, useState } from 'react'
import { CloudUpload, GitCommitHorizontal, Info, ShieldAlert } from 'lucide-react'
import { useStore } from '../lib/store'
import { shortSha, timeAgo } from '../lib/utils'
import { Button, Modal, ModalHeader, Spinner } from './ui'

export function PushDialog() {
  const open = useStore((s) => s.pushOpen)
  const outgoing = useStore((s) => s.outgoing)
  const close = useStore((s) => s.closePush)
  const sync = useStore((s) => s.sync)
  const busy = useStore((s) => s.busy)

  const [ack, setAck] = useState(false)
  useEffect(() => setAck(false), [open])

  const commits = outgoing?.commits ?? []
  const target = outgoing?.upstream ?? (outgoing ? `origin/${outgoing.branch}` : '')
  const empty = !!outgoing && commits.length === 0

  return (
    <Modal open={open} onClose={close} width={540}>
      <ModalHeader
        title="推送预览"
        subtitle={outgoing ? `${outgoing.branch} → ${target}` : '正在计算待推送的提交…'}
        onClose={close}
      />
      <div className="space-y-3 p-4">
        {!outgoing ? (
          <div className="flex h-[120px] items-center justify-center gap-2 text-[11.5px] text-faint">
            <Spinner size={13} /> 读取待推送提交
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="提交" value={String(commits.length)} />
              <Stat label="文件" value={String(outgoing.fileCount)} />
              <Stat
                label="行数"
                value={`+${outgoing.additions} −${outgoing.deletions}`}
                tone="mixed"
              />
            </div>

            {empty ? (
              <div className="rounded-[9px] border border-line bg-panel/50 px-3 py-6 text-center text-[11.5px] text-faint">
                没有需要推送的提交
              </div>
            ) : (
              <div className="max-h-[264px] overflow-y-auto rounded-[9px] border border-line/80 bg-panel/40 scroll-thin">
                {commits.map((c) => (
                  <div key={c.sha} className="flex items-center gap-2 border-b border-line/40 px-3 py-[7px] last:border-0">
                    <GitCommitHorizontal size={12} className="shrink-0 text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/90">{c.subject}</span>
                    <span className="shrink-0 text-[10px] text-faint">{c.author}</span>
                    <span className="w-[52px] shrink-0 text-right font-mono text-[9.5px] text-faint/80">
                      {shortSha(c.sha)}
                    </span>
                  </div>
                ))}
                {commits.length >= 200 && (
                  <div className="px-3 py-2 text-center text-[10px] text-faint">仅展示前 200 个提交</div>
                )}
              </div>
            )}

            {outgoing.protected && (
              <div className="flex items-start gap-2 rounded-[8px] border border-red/30 bg-red/8 px-2.5 py-2 text-[10.5px] leading-[15px] text-red/90">
                <ShieldAlert size={12} className="mt-[1px] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div>
                    <span className="font-mono">{outgoing.branch}</span> 是保护分支，推送会直接影响主干。
                  </div>
                  <button
                    onClick={() => setAck(!ack)}
                    className="mt-1 flex items-center gap-1.5 text-[10px] text-red/80 hover:text-red"
                  >
                    <span className={`flex h-[12px] w-[12px] items-center justify-center rounded-[3px] border ${ack ? 'border-red bg-red text-white' : 'border-red/50'}`}>
                      {ack && '✓'}
                    </span>
                    我确认要直接推送到保护分支
                  </button>
                </div>
              </div>
            )}

            {!outgoing.upstream && (
              <div className="flex items-start gap-2 rounded-[8px] border border-amber/25 bg-amber/8 px-2.5 py-2 text-[10.5px] leading-[15px] text-amber/90">
                <Info size={12} className="mt-[1px] shrink-0" />
                这是该分支的首次推送，将创建并设置上游 <span className="font-mono">{target}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-faint">推送后不可撤销（可用 force push 回退，但 Grove 不代劳）</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={close}>
                  取消
                </Button>
                <Button
                  variant="primary"
                  icon={CloudUpload}
                  loading={busy === '推送中'}
                  disabled={empty || (outgoing.protected && !ack)}
                  onClick={async () => {
                    await sync('push')
                    close()
                  }}
                >
                  {outgoing.protected ? '仍然推送' : '推送'}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'mixed' }) {
  return (
    <div className="rounded-[9px] border border-line/70 bg-panel/40 px-3 py-2">
      <div className="text-[9.5px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tabular-nums ${tone === 'mixed' ? 'text-ink' : 'text-ink'}`}>
        {tone === 'mixed' ? <span className="text-[13px]">{value}</span> : value}
      </div>
    </div>
  )
}
