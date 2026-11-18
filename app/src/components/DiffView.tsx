import { useEffect, useState } from 'react'
import { FileDiff, FileText } from 'lucide-react'
import { api } from '../lib/api'
import { useStore } from '../lib/store'
import type { BlameFile } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'
import { EmptyState, Spinner } from './ui'

export function DiffView({ compact = false }: { compact?: boolean }) {
  const diff = useStore((s) => s.diff)
  const loading = useStore((s) => s.diffLoading)
  const selectedFile = useStore((s) => s.selectedFile)
  const viewName = useStore((s) => s.view)
  const detail = useStore((s) => s.detail)
  const selectedCommitFile = useStore((s) => s.selectedCommitFile)
  const stageHunk = useStore((s) => s.stageHunk)
  const stageLines = useStore((s) => s.stageLines)
  const selectedSha = useStore((s) => s.selectedSha)
  const stashPreview = useStore((s) => s.stashPreview)
  const [mode, setMode] = useState<'diff' | 'blame'>(() =>
    new URLSearchParams(location.search).get('ui') === 'blame' ? 'blame' : 'diff',
  )
  const [blame, setBlame] = useState<BlameFile | null>(null)
  const [blameLoading, setBlameLoading] = useState(false)
  const [selHunk, setSelHunk] = useState<number | null>(null)
  const [selLines, setSelLines] = useState<Set<number>>(new Set())

  const blamePath =
    selectedFile?.scope === 'stash' ? null : selectedFile?.path ?? selectedCommitFile ?? diff?.path ?? null
  const blameRev = selectedFile ? undefined : selectedSha ?? undefined

  useEffect(() => {
    setSelHunk(null)
    setSelLines(new Set())
    setMode(new URLSearchParams(location.search).get('ui') === 'blame' ? 'blame' : 'diff')
    setBlame(null)
  }, [diff?.path, selectedFile?.path, selectedFile?.scope])

  useEffect(() => {
    if (mode !== 'blame' || !blamePath) return
    let cancelled = false
    setBlameLoading(true)
    api
      .blame(useStore.getState().snapshot!.info.path, blamePath, blameRev)
      .then((b) => {
        if (!cancelled) setBlame(b)
      })
      .catch(() => {
        if (!cancelled) setBlame(null)
      })
      .finally(() => {
        if (!cancelled) setBlameLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, blamePath, blameRev])

  const canPick = viewName === 'changes' && (selectedFile?.scope === 'worktree' || selectedFile?.scope === 'index')
  const toggleLine = (hi: number, li: number) => {
    if (selHunk !== hi) {
      setSelHunk(hi)
      setSelLines(new Set([li]))
      return
    }
    const next = new Set(selLines)
    if (next.has(li)) next.delete(li)
    else next.add(li)
    setSelLines(next)
  }

  let label = ''
  if (selectedFile) {
    if (selectedFile.scope === 'index') label = '已暂存'
    else if (selectedFile.scope === 'untracked') label = '未跟踪'
    else if (selectedFile.scope === 'stash') label = `贮藏 ${stashPreview?.message ?? ''}`
    else if (viewName === 'history') label = `提交 ${detail?.commit.sha.slice(0, 7) ?? ''}`
    else label = '工作区'
  } else if (viewName === 'history') {
    label = `提交 ${detail?.commit.sha.slice(0, 7) ?? ''}`
  }
  return (
    <div className="flex h-full min-h-0 flex-col bg-panel/30">
      <div className="flex h-[34px] shrink-0 items-center gap-2 border-b border-line/70 px-3">
        <FileDiff size={12} className="shrink-0 text-faint" />
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">
          {diff?.path ?? selectedCommitFile ?? selectedFile?.path ?? '差异'}
        </span>
        {mode === 'diff' && diff && !diff.binary && diff.hunks.length > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] tabular-nums">
            <span className="text-green">+{diff.additions}</span>
            <span className="text-red">−{diff.deletions}</span>
          </span>
        )}
        {label && (
          <span className="shrink-0 rounded-[4px] border border-line bg-panel px-1.5 py-[1px] text-[10.5px] text-faint">
            {label}
          </span>
        )}
        {blamePath && (
          <div className="ml-1 flex h-[20px] shrink-0 items-center rounded-[5px] border border-line bg-panel p-[1px]">
            <button
              onClick={() => setMode('diff')}
              className={cn(
                'h-[16px] rounded-[4px] px-1.5 text-[10.5px] transition',
                mode === 'diff' ? 'bg-elevated text-ink' : 'text-faint hover:text-muted',
              )}
            >
              差异
            </button>
            <button
              onClick={() => setMode('blame')}
              className={cn(
                'h-[16px] rounded-[4px] px-1.5 text-[10.5px] transition',
                mode === 'blame' ? 'bg-elevated text-ink' : 'text-faint hover:text-muted',
              )}
            >
              Blame
            </button>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto scroll-thin">
        {loading && (
          <div className="absolute right-3 top-2 z-10 flex items-center gap-1.5 rounded-[6px] border border-line bg-panel2/90 px-2 py-1 text-[11px] text-faint backdrop-blur">
            <Spinner size={11} /> 读取中
          </div>
        )}
        {mode === 'diff' && !diff && !loading && (
          <EmptyState icon={FileText} title="选择一个文件查看差异" hint="在左侧列表点击文件，或从历史里选择提交" />
        )}
        {mode === 'diff' && diff && !diff.binary && diff.hunks.length === 0 && (
          <EmptyState
            icon={FileText}
            title={diff.path.endsWith('/') ? '这是一个目录' : '没有可显示的差异'}
            hint={diff.path.endsWith('/') ? '目录下的文件需要在暂存后查看内容' : '文件内容相同，或差异为空'}
          />
        )}
        {mode === 'blame' && (
          <div className="min-w-full pb-8 font-mono text-[12.5px] leading-[19px]">
            {blameLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-[11.5px] text-faint">
                <Spinner size={11} /> 计算 blame
              </div>
            )}
            {!blameLoading && !blame && (
              <EmptyState icon={FileText} title="无法计算 blame" hint="文件可能未被跟踪或不在当前提交中" />
            )}
            {blame?.lines.map((l) => (
              <div key={l.line} className="flex w-full min-w-max hover:bg-elevated/30">
                <span className="w-[44px] shrink-0 select-none border-r border-line/30 px-2 text-right text-[11px] text-faint">
                  {l.line}
                </span>
                <span className="w-[62px] shrink-0 truncate px-2 text-[10.5px] text-blue/80">
                  {l.sha.startsWith('0000000') ? '未提交' : l.sha.slice(0, 7)}
                </span>
                <span className="w-[74px] shrink-0 truncate px-1 text-[11px] text-amber/90">{l.author}</span>
                <span className="w-[64px] shrink-0 px-1 text-[10.5px] text-faint">{timeAgo(l.time)}</span>
                <span className="whitespace-pre pr-6 text-ink/85">{l.content || ' '}</span>
              </div>
            ))}
          </div>
        )}

        {mode === 'diff' && diff?.binary && (
          <EmptyState icon={FileDiff} title="二进制文件" hint="Grove 不渲染二进制内容，可在 Finder 中打开查看" />
        )}
        {mode === 'diff' && diff && !diff.binary && diff.hunks.length > 0 && (
          <div className={cn('min-w-full pb-8 font-mono text-[12.5px] leading-[20px]', compact && 'text-[12px]')}>
            {diff.hunks.map((h, hi) => (
              <div key={hi}>
                <div className="diff-hunk group/hunk sticky top-0 z-[1] flex h-[24px] items-center gap-2 border-y border-line/40 px-3 text-[11px] text-blue/90">
                  <span className="min-w-0 flex-1 truncate">{h.header}</span>
                  {viewName === 'changes' &&
                    (selectedFile?.scope === 'worktree' || selectedFile?.scope === 'index') && (
                      <button
                        onClick={() => void stageHunk(hi)}
                        title={selectedFile.scope === 'index' ? '把这个 hunk 从暂存区取回' : '只把这个 hunk 放进暂存区'}
                        className="shrink-0 rounded-[4px] border border-blue/30 bg-blue/10 px-1.5 py-[1px] text-[10.5px] text-blue opacity-75 transition hover:bg-blue/20 hover:opacity-100"
                      >
                        {selectedFile.scope === 'index' ? '取消暂存此 hunk' : '暂存此 hunk'}
                      </button>
                    )}
                </div>
                {h.lines.map((line, li) => (
                  <div
                    key={li}
                    onClick={() => {
                      if (!canPick || line.kind === ' ' || line.kind === '\\') return
                      toggleLine(hi, li)
                    }}
                    className={cn(
                      'group/line flex w-full min-w-max',
                      line.kind === '+' && 'diff-add',
                      line.kind === '-' && 'diff-del',
                      selHunk === hi && selLines.has(li) && 'bg-accent/15 ring-1 ring-inset ring-accent/40',
                      canPick && line.kind !== ' ' && 'cursor-pointer',
                    )}
                  >
                    <span className="flex w-[18px] shrink-0 items-center justify-center border-r border-line/25">
                      {canPick && line.kind !== ' ' && line.kind !== '\\' ? (
                        <span
                          className={cn(
                            'flex h-[11px] w-[11px] items-center justify-center rounded-[3px] border transition',
                            selHunk === hi && selLines.has(li)
                              ? 'border-accent bg-accent text-[rgb(var(--accent-ink))]'
                              : 'border-line-strong/70 bg-panel/60 opacity-0 group-hover/line:opacity-100',
                          )}
                        >
                          {selHunk === hi && selLines.has(li) && (
                            <svg width="7" height="7" viewBox="0 0 10 10" fill="none">
                              <path d="M1.5 5.2 3.9 7.5 8.5 2.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="diff-num w-[44px] shrink-0 select-none border-r border-line/35 px-2 text-right text-[11.5px]">
                      {line.oldNo ?? ''}
                    </span>
                    <span className="diff-num w-[44px] shrink-0 select-none border-r border-line/35 px-2 text-right text-[11.5px]">
                      {line.newNo ?? ''}
                    </span>
                    <span
                      className={cn(
                        'w-[16px] shrink-0 select-none text-center',
                        line.kind === '+' && 'text-green',
                        line.kind === '-' && 'text-red',
                        line.kind === ' ' && 'text-transparent',
                      )}
                    >
                      {line.kind === ' ' ? '·' : line.kind}
                    </span>
                    <span className="whitespace-pre pr-6 text-ink/85">{line.content || ' '}</span>
                  </div>
                ))}
              </div>
            ))}
            {diff.truncated && (
              <div className="px-3 py-2 text-[11.5px] text-amber">差异过大，已截断显示</div>
            )}
          </div>
        )}
      </div>

      {selLines.size > 0 && canPick && (
        <div className="flex h-[38px] shrink-0 items-center gap-2 border-t border-line/70 bg-panel2 px-3">
          <span className="text-[12px] text-muted">
            已选 <span className="font-semibold text-ink">{selLines.size}</span> 行
          </span>
          <span className="text-[11px] text-faint">只影响这一处改动</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => {
                setSelHunk(null)
                setSelLines(new Set())
              }}
              className="text-[11.5px] text-faint hover:text-muted"
            >
              清除
            </button>
            <button
              onClick={() => {
                if (selHunk !== null) void stageLines(selHunk, [...selLines])
                setSelHunk(null)
                setSelLines(new Set())
              }}
              className="flex h-[24px] items-center rounded-[6px] bg-accent px-2.5 text-[11.5px] font-semibold text-[rgb(var(--accent-ink))] transition hover:brightness-110"
            >
              {selectedFile?.scope === 'index' ? '取消暂存选中行' : '暂存选中行'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
