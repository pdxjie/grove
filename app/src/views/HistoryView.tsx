import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Copy, GitMerge, Tag, Check, SlidersHorizontal, Undo2, GitBranch, User } from 'lucide-react'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'
import { useStore } from '../lib/store'
import type { Commit } from '../lib/types'
import { useLayoutWidth } from '../lib/useLayout'
import { cn, shortSha, timeAgo } from '../lib/utils'
import { DiffView } from '../components/DiffView'
import { VDivider } from '../components/VDivider'
import { Graph, laneColor } from '../components/Graph'
import { Select } from '../components/Select'
import { Button, EmptyState, Menu, type MenuItem, Spinner } from '../components/ui'
import { GitCommitHorizontal } from 'lucide-react'

const ROW_H = 34

export function HistoryView() {
  const snap = useStore((s) => s.snapshot)
  const selectedSha = useStore((s) => s.selectedSha)
  const selectCommit = useStore((s) => s.selectCommit)
  const detail = useStore((s) => s.detail)
  const selectCommitFile = useStore((s) => s.selectCommitFile)
  const selectedCommitFile = useStore((s) => s.selectedCommitFile)
  const cherryPick = useStore((s) => s.cherryPick)
  const loadHistory = useStore((s) => s.loadHistory)
  const loadMoreHistory = useStore((s) => s.loadMoreHistory)
  const loadingMore = useStore((s) => s.loadingMore)
  const hasMore = useStore((s) => s.snapshot?.hasMore ?? false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportH, setViewportH] = useState(560)
  const filter = useStore((s) => s.historyFilter)
  const authorOptions = useStore((s) => s.authors)
  const busy = useStore((s) => s.busy)

  const [menu, setMenu] = useState<{ x: number; y: number; sha: string } | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [detailWidth, setDetailWidth] = useLayoutWidth('grove.layout.history', 620, 360, 940)

  const commits = snap?.commits ?? []
  const graph = snap?.graph ?? []

  useEffect(() => {
    if (!selectedSha && commits.length) void selectCommit(commits[0].sha)
  }, [selectedSha, commits, selectCommit])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportH(el.clientHeight))
    ro.observe(el)
    setViewportH(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    setScrollTop(0)
  }, [filter.branch, filter.author, filter.firstParent])

  const total = commits.length
  const start = Math.max(0, Math.floor(scrollTop / ROW_H) - 8)
  const end = Math.min(total, Math.ceil((scrollTop + viewportH) / ROW_H) + 8)
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    setScrollTop(el.scrollTop)
    if (hasMore && !loadingMore && el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      void loadMoreHistory()
    }
  }

  const maxLanes = useMemo(
    () => graph.reduce((m, r) => Math.max(m, r.lanes), 1),
    [graph],
  )
  const graphWidth = Math.min(8, Math.max(1, maxLanes)) * 13 + 14

  const toggleChecked = (sha: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(sha)) next.delete(sha)
      else next.add(sha)
      return next
    })
  }

  const targets = useMemo(() => {
    if (menu && checked.size > 0 && checked.has(menu.sha)) return [...checked]
    if (menu) return [menu.sha]
    return []
  }, [menu, checked])

  const menuItems: MenuItem[] = menu
    ? [
        {
          label: targets.length > 1 ? `遴选 ${targets.length} 个提交到当前分支` : '遴选到当前分支',
          icon: GitMerge,
          hint: 'cherry-pick',
          onClick: () => void cherryPick(targets, false),
        },
        {
          label: '遴选到工作区（不提交）',
          icon: ArrowDownToLine,
          hint: '-n',
          onClick: () => void cherryPick(targets, true),
        },
        {
          label: '回滚此提交（生成反向提交）',
          icon: Undo2,
          onClick: () => void useStore.getState().revertCommit(menu.sha),
        },
        { separator: true },
        {
          label: '复制 SHA',
          icon: Copy,
          onClick: () => void navigator.clipboard.writeText(menu.sha),
        },
        {
          label: '在提交上新建分支',
          icon: GitCommitHorizontal,
          onClick: () => void useStore.getState().createBranch(`from-${shortSha(menu.sha)}`),
        },
      ]
    : []

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize} className="flex h-[38px] shrink-0 items-center gap-1.5 border-b border-line/70 px-3">
          <span className="text-[11px] font-medium text-ink">历史</span>
          <span className="text-[10px] tabular-nums text-faint">{commits.length}</span>
          <div className="ml-2">
            <Select
              value={filter.branch}
              title="按分支筛选"
              initialOpen={new URLSearchParams(location.search).get('ui') === 'filters'}
              icon={GitBranch}
              width={240}
              onChange={(v) => void loadHistory({ branch: v })}
              options={[
                { value: 'current', label: '当前分支' },
                { value: 'all', label: '全部分支' },
                ...(snap?.branches ?? [])
                  .filter((b) => !b.remote)
                  .map((b) => ({ value: b.name, label: b.name, group: '本地分支' })),
                ...(snap?.branches ?? [])
                  .filter((b) => b.remote)
                  .map((b) => ({ value: b.name, label: b.name, group: '远程分支' })),
              ]}
            />
          </div>
          <Select
            value={filter.author}
            title="按提交人筛选"
            icon={User}
            width={190}
            onChange={(v) => void loadHistory({ author: v })}
            options={[
              { value: '', label: '全部作者' },
              ...authorOptions.map((a) => ({ value: a, label: a, group: '作者' })),
            ]}
          />
          <button
            onClick={() => void loadHistory({ firstParent: !filter.firstParent })}
            className={cn(
              'flex h-[22px] items-center rounded-[5px] border px-1.5 text-[10px] transition',
              filter.firstParent
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line bg-panel text-faint hover:text-muted',
            )}
            title="只显示第一父提交，减少分叉线"
          >
            简化图
          </button>
          <span className="ml-auto text-[10px] text-faint">右键可遴选 / 复制</span>
          <button
            onClick={() => void useStore.getState().openRebase()}
            className="flex h-[22px] items-center gap-1 rounded-[5px] border border-line bg-panel px-1.5 text-[10px] text-muted transition hover:border-linestrong hover:text-ink"
            title="交互式变基：整理最近几个提交"
          >
            <SlidersHorizontal size={10} />
            整理提交
          </button>
        </div>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto scroll-thin">
          <div style={{ height: start * ROW_H }} />
          {commits.slice(start, end).map((c, idx) => {
            const i = start + idx
            const row = graph[i] ?? { sha: c.sha, lane: 0, lanes: 1, lines: [], parentLanes: [], merge: false }
            const selected = selectedSha === c.sha
            const isChecked = checked.has(c.sha)
            return (
              <div
                key={c.sha}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) {
                    toggleChecked(c.sha)
                  } else {
                    void selectCommit(c.sha)
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setMenu({ x: e.clientX, y: e.clientY, sha: c.sha })
                }}
                className={cn(
                  'group relative flex h-[34px] cursor-default items-center gap-2 pl-2.5 pr-2',
                  selected ? 'row-selected' : 'hover:bg-elevated/45',
                )}
              >
                {selected && <span className="absolute left-0 top-0 h-full w-[2px] bg-accent" />}
                {isChecked && (
                  <span className="absolute left-0 top-0 h-full w-[2px] bg-blue" />
                )}
                <Graph row={row} width={graphWidth} />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex max-w-[46%] shrink-0 items-center gap-1 overflow-hidden">
                    {c.refs.slice(0, 3).map((r) => (
                      <RefChip key={r} label={r} lane={row.lane} />
                    ))}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink/90">{c.subject}</span>
                </div>
                <span className="w-[52px] shrink-0 truncate text-right text-[10.5px] text-faint">{c.author}</span>
                <span className="w-[48px] shrink-0 text-right text-[10px] text-faint">{timeAgo(c.time)}</span>
                <span className="w-[52px] shrink-0 text-right font-mono text-[10px] text-faint/80">
                  {shortSha(c.sha)}
                </span>
              </div>
            )
          })}
          <div style={{ height: Math.max(0, (total - end) * ROW_H) }} />
          <div className="flex h-[44px] items-center justify-center">
            {loadingMore ? (
              <span className="text-[10px] text-faint">加载更多提交…</span>
            ) : hasMore ? (
              <button
                onClick={() => void loadMoreHistory()}
                className="rounded-[6px] border border-line bg-panel px-2 py-[3px] text-[10.5px] text-muted transition hover:border-linestrong hover:text-ink"
              >
                加载更多
              </button>
            ) : total > 0 ? (
              <span className="text-[10px] text-faint/60">已加载全部 {total} 条</span>
            ) : null}
          </div>
          {commits.length === 0 && (
            <EmptyState icon={GitCommitHorizontal} title="还没有提交" hint="做出第一次提交后，这里会显示提交图" />
          )}
        </div>

        {checked.size > 0 && (
          <div className="pointer-events-auto absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-[10px] border border-line-strong/70 bg-panel2/95 px-3 py-1.5 shadow-pop backdrop-blur-xl">
            <span className="text-[11px] text-muted">
              已选 <span className="font-semibold text-ink">{checked.size}</span> 个提交
            </span>
            <div className="h-4 w-px bg-line" />
            <Button size="sm" icon={GitMerge} onClick={() => void cherryPick([...checked], false)} loading={busy === '遴选'}>
              遴选
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void cherryPick([...checked], true)}>
              仅到工作区
            </Button>
            <button onClick={() => setChecked(new Set())} className="text-[10.5px] text-faint hover:text-muted">
              清除
            </button>
          </div>
        )}
      </div>

      <VDivider value={detailWidth} min={360} max={940} onChange={setDetailWidth} invert />
      <div className="flex shrink-0 flex-col border-l border-line/70 bg-panel/10" style={{ width: detailWidth }}>
        {detail ? (
          <>
            <div className="shrink-0 border-b border-line/70 px-3.5 pb-2.5 pt-3">
              <div className="text-[13px] font-medium leading-[18px] text-ink">{detail.commit.subject}</div>
              <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-faint">
                <span className="font-mono text-[10px]">{shortSha(detail.commit.sha)}</span>
                <span>·</span>
                <span>{detail.commit.author}</span>
                <span>·</span>
                <span>{timeAgo(detail.commit.time)}</span>
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-green">+{detail.additions}</span>
                  <span className="text-red">−{detail.deletions}</span>
                </span>
              </div>
            </div>

            <div className="max-h-[128px] shrink-0 overflow-y-auto border-b border-line/60 py-1 scroll-thin">
              {detail.files.map((f) => (
                <button
                  key={f.path}
                  onClick={() => void selectCommitFile(f.path)}
                  className={cn(
                    'flex h-[24px] w-full items-center gap-2 px-3.5 text-left text-[11px] transition',
                    selectedCommitFile === f.path ? 'bg-elevated/70 text-ink' : 'text-muted hover:bg-elevated/40',
                  )}
                >
                  <StatusBadge status={f.status} />
                  <span className="min-w-0 flex-1 truncate">{f.path}</span>
                  <span className="shrink-0 text-[10px] text-green">+{f.additions}</span>
                  <span className="shrink-0 text-[10px] text-red">−{f.deletions}</span>
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1">
              <DiffView compact />
            </div>
          </>
        ) : (
          <EmptyState icon={GitMerge} title="选择一个提交" hint="查看改动、文件列表，或右键遴选到当前分支" />
        )}
      </div>

      {menu && <Menu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'A'
      ? 'text-green'
      : status === 'D'
        ? 'text-red'
        : status === 'R'
          ? 'text-blue'
          : 'text-amber'
  return <span className={cn('w-[9px] shrink-0 text-center text-[10px] font-semibold', color)}>{status}</span>
}

function RefChip({ label, lane }: { label: string; lane: number }) {
  const isHead = label.startsWith('HEAD')
  const isTag = label.startsWith('tag: ')
  const name = isHead ? label.replace('HEAD -> ', '') : isTag ? label.replace('tag: ', '') : label
  const isRemote = name.includes('/') && !isTag

  if (isHead) {
    return (
      <span
        className="inline-flex h-[16px] max-w-[120px] shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[9.5px] font-semibold text-[rgb(var(--accent-ink))]"
        style={{ background: laneColor(lane) }}
      >
        <Check size={8} strokeWidth={3.5} />
        <span className="truncate">{name}</span>
      </span>
    )
  }
  if (isTag) {
    return (
      <span className="inline-flex h-[16px] max-w-[100px] shrink-0 items-center gap-1 rounded-[4px] border border-amber/40 bg-amber/10 px-1.5 text-[9.5px] text-amber">
        <Tag size={8} />
        <span className="truncate">{name}</span>
      </span>
    )
  }
  return (
    <span
      className={cn(
        'inline-flex h-[16px] max-w-[110px] shrink-0 items-center rounded-[4px] border px-1.5 text-[9.5px]',
        isRemote ? 'border-blue/30 bg-blue/8 text-blue/90' : 'border-line bg-elevated/60 text-muted',
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  )
}
