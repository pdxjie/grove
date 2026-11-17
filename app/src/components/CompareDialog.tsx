import { ArrowDown, ArrowUp, GitCompare } from 'lucide-react'
import { useStore } from '../lib/store'
import { shortSha, timeAgo } from '../lib/utils'
import { Modal, ModalHeader, Spinner } from './ui'

export function CompareDialog() {
  const open = useStore((s) => s.compareOpen)
  const data = useStore((s) => s.compare)
  const close = useStore((s) => s.closeCompare)
  const current = useStore((s) => s.snapshot?.info.branch ?? '当前分支')

  return (
    <Modal open={open} onClose={close} width={640}>
      <ModalHeader
        title="分支对比"
        subtitle={data ? `${current} ↔ ${data.other}` : '正在计算差异…'}
        onClose={close}
      />
      {!data ? (
        <div className="flex h-[160px] items-center justify-center gap-2 text-[11.5px] text-faint">
          <Spinner size={13} /> 读取分支差异
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-3 rounded-[9px] border border-line/70 bg-panel/40 px-3 py-2 text-[11px]">
            <span className="text-faint">{data.fileCount} 个文件</span>
            <span className="text-green">+{data.additions}</span>
            <span className="text-red">−{data.deletions}</span>
            <span className="ml-auto text-faint">
              {data.ahead.length ? `${data.ahead.length} 个提交领先` : '无领先提交'}
              {data.behind.length ? ` · ${data.behind.length} 个提交落后` : ''}
            </span>
          </div>

          <Section
            title={<>对方独有 · 合入后会带来的提交</>}
            icon={<ArrowDown size={11} className="text-green" />}
            commits={data.ahead}
            empty="对方没有额外的提交"
          />
          <Section
            title={<>当前分支独有 · 合入后会落后的提交</>}
            icon={<ArrowUp size={11} className="text-blue" />}
            commits={data.behind}
            empty="当前分支没有额外提交"
          />

          {data.ahead.length === 0 && data.behind.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-5 text-[11px] text-faint">
              <GitCompare size={13} /> 两个分支的提交历史一致
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

function Section({
  title,
  icon,
  commits,
  empty,
}: {
  title: React.ReactNode
  icon: React.ReactNode
  commits: { sha: string; subject: string; author: string; time: number }[]
  empty: string
}) {
  return (
    <div className="overflow-hidden rounded-[9px] border border-line/70">
      <div className="flex items-center gap-1.5 border-b border-line/50 bg-panel/60 px-3 py-1.5 text-[10px] text-faint">
        {icon}
        {title}
        <span className="ml-auto tabular-nums">{commits.length}</span>
      </div>
      {commits.length === 0 ? (
        <div className="px-3 py-2.5 text-[10.5px] text-faint">{empty}</div>
      ) : (
        <div className="max-h-[220px] overflow-y-auto scroll-thin">
          {commits.map((c) => (
            <div key={c.sha} className="flex items-center gap-2 border-b border-line/30 px-3 py-[6px] last:border-0">
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-ink/90">{c.subject}</span>
              <span className="shrink-0 text-[10px] text-faint">{c.author}</span>
              <span className="w-[46px] shrink-0 text-right text-[9.5px] text-faint/70">{timeAgo(c.time)}</span>
              <span className="w-[50px] shrink-0 text-right font-mono text-[9.5px] text-faint/70">{shortSha(c.sha)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
