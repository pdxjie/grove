import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  Undo2,
  FileLock2,
  ShieldAlert,
  FolderTree,
  GitMerge,
  History as HistoryIcon,
  ArrowDown,
  CloudDownload,
  CloudUpload,
  FolderGit2,
  GitBranch,
  GitCompare,
  History,
  RefreshCw,
  Search,
  Terminal,
  type LucideIcon,
} from 'lucide-react'
import { useStore } from '../lib/store'
import { cn } from '../lib/utils'
import { Kbd } from './ui'

interface Cmd {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: string
  run: () => void
}

export function Palette() {
  const open = useStore((s) => s.palette)
  const setPalette = useStore((s) => s.setPalette)
  const snap = useStore((s) => s.snapshot)
  const openRepo = useStore((s) => s.openRepo)
  const refresh = useStore((s) => s.refresh)
  const setView = useStore((s) => s.setView)
  const sync = useStore((s) => s.sync)
  const setStashPanel = useStore((s) => s.setStashPanel)
  const setLogPanel = useStore((s) => s.setLogPanel)
  const checkout = useStore((s) => s.checkout)
  const recents = useStore((s) => s.recents)

  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: 'open', label: '打开仓库…', hint: '⌘O', icon: FolderGit2, group: '操作', run: () => void openRepo() },
      { id: 'refresh', label: '刷新仓库', hint: '⌘R', icon: RefreshCw, group: '操作', run: () => void refresh() },
      { id: 'changes', label: '切换到「变更」', hint: '⌘1', icon: GitCompare, group: '视图', run: () => setView('changes') },
      { id: 'history', label: '切换到「历史」', hint: '⌘2', icon: History, group: '视图', run: () => setView('history') },
      { id: 'fetch', label: '抓取所有远端', icon: CloudDownload, group: '同步', run: () => void sync('fetch') },
      { id: 'pull', label: '拉取当前分支', icon: ArrowDown, group: '同步', run: () => void sync('pull') },
      { id: 'push', label: '推送当前分支', icon: CloudUpload, group: '同步', run: () => void sync('push') },
      { id: 'stash', label: '贮藏当前改动…', icon: Archive, group: '操作', run: () => setStashPanel(true) },
      { id: 'undo', label: '撤销上次提交（保留改动）', icon: Undo2, group: '操作', run: () => void useStore.getState().undoCommit() },
      { id: 'undoLast', label: '撤销上一步操作', hint: '⌘⇧Z', icon: Undo2, group: '操作', run: () => void useStore.getState().undoLast() },
      { id: 'rebase', label: '交互式变基（最近 5 个提交）', icon: GitMerge, group: '操作', run: () => void useStore.getState().openRebase() },
      { id: 'localOnly', label: '本地私有文件规则…', icon: FileLock2, group: '操作', run: () => void useStore.getState().openLocalOnly() },
      { id: 'worktree', label: '新建工作树…', icon: FolderTree, group: '操作', run: () => useStore.getState().openWorktreeDialog() },
      { id: 'protected', label: '保护分支规则…', icon: ShieldAlert, group: '操作', run: () => void useStore.getState().openProtected() },
      { id: 'journal', label: '操作历史 / 撤销…', icon: HistoryIcon, group: '操作', run: () => void useStore.getState().openJournal() },
      { id: 'log', label: '打开命令日志', hint: '⌘L', icon: Terminal, group: '视图', run: () => setLogPanel(true) },
    ]
    if (snap) {
      snap.branches
        .filter((b) => !b.remote && !b.current)
        .slice(0, 5)
        .forEach((b) =>
          list.push({
            id: `branch:${b.name}`,
            label: `切换到分支 ${b.name}`,
            icon: GitBranch,
            group: '分支',
            run: () => void checkout(b.name),
          }),
        )
      recents
        .filter((r) => r !== snap.info.path)
        .slice(0, 4)
        .forEach((r) =>
          list.push({
            id: `repo:${r}`,
            label: `打开 ${r.split('/').filter(Boolean).pop()}`,
            hint: r.replace(/^\/Users\/[^/]+/, '~'),
            icon: FolderGit2,
            group: '最近',
            run: () => void openRepo(r),
          }),
        )
    }
    return list
  }, [snap, recents, openRepo, refresh, setView, sync, setStashPanel, setLogPanel, checkout])

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(k) || c.group.toLowerCase().includes(k))
  }, [commands, q])

  useEffect(() => {
    if (open) {
      setQ('')
      setIdx(0)
      setTimeout(() => inputRef.current?.focus(), 20)
    }
  }, [open])

  useEffect(() => setIdx(0), [q])

  if (!open) return null

  const run = (c?: Cmd) => {
    if (!c) return
    setPalette(false)
    c.run()
  }

  const groups = [...new Set(filtered.map((c) => c.group))]
  let flat: Cmd[] = []
  groups.forEach((g) => flat.push(...filtered.filter((c) => c.group === g)))
  const active = flat[Math.min(idx, Math.max(flat.length - 1, 0))]

  return (
    <div
      className="fixed inset-0 z-[85] flex items-start justify-center pt-[12vh]"
      style={{ backgroundColor: 'rgba(4,5,7,0.55)' }}
      onClick={() => setPalette(false)}
    >
      <div
        className="animate-pop-in w-[560px] overflow-hidden rounded-[14px] border border-line-strong/60 bg-panel2 shadow-pop"
        style={{ backgroundColor: 'rgb(var(--panel2))' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-[46px] items-center gap-2.5 border-b border-line/70 px-3.5">
          <Search size={14} className="text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索分支、操作…"
            className="h-full flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-faint"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setIdx((i) => Math.min(i + 1, flat.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setIdx((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(active)
              } else if (e.key === 'Escape') {
                setPalette(false)
              }
            }}
          />
          <Kbd>esc</Kbd>
        </div>

        <div className="max-h-[360px] overflow-y-auto scroll-thin p-1.5">
          {flat.length === 0 && <div className="px-3 py-6 text-center text-[11.5px] text-faint">没有匹配的命令</div>}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <div className="px-2 py-1 text-[9.5px] uppercase tracking-[0.12em] text-faint/80">{g}</div>
              {filtered
                .filter((c) => c.group === g)
                .map((c) => {
                  const isActive = active?.id === c.id
                  return (
                    <button
                      key={c.id}
                      onMouseEnter={() => setIdx(flat.findIndex((f) => f.id === c.id))}
                      onClick={() => run(c)}
                      className={cn(
                        'flex h-[30px] w-full items-center gap-2.5 rounded-[7px] px-2 text-left transition',
                        isActive ? 'bg-elevated text-ink' : 'text-muted hover:bg-elevated/50',
                      )}
                    >
                      <c.icon size={13} className={isActive ? 'text-accent' : 'text-faint'} strokeWidth={1.9} />
                      <span className="flex-1 truncate text-[12px]">{c.label}</span>
                      {c.hint && <span className="text-[10px] text-faint">{c.hint}</span>}
                      {isActive && <Kbd>↵</Kbd>}
                    </button>
                  )
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
