import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Folder,
  FolderGit2,
  FolderTree,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Branch } from '../lib/types'
import { cn, timeAgo } from '../lib/utils'
import { Button, Field, Menu, Modal, ModalHeader, type MenuItem } from './ui'

interface TreeNode {
  key: string
  label: string
  branch?: Branch
  children: TreeNode[]
}

function buildTree(branches: Branch[]): TreeNode[] {
  const root: TreeNode = { key: '', label: '', children: [] }
  for (const b of branches) {
    const parts = b.name.split('/')
    let node = root
    parts.forEach((part, idx) => {
      const key = parts.slice(0, idx + 1).join('/')
      let child = node.children.find((c) => c.key === key)
      if (!child) {
        child = { key, label: part, children: [] }
        node.children.push(child)
      }
      node = child
      if (idx === parts.length - 1) node.branch = b
    })
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }))
    nodes.forEach((n) => sortRec(n.children))
  }
  sortRec(root.children)
  return root.children
}

function countBranches(node: TreeNode): number {
  return (node.branch ? 1 : 0) + node.children.reduce((sum, c) => sum + countBranches(c), 0)
}

export function Sidebar() {
  const snap = useStore((s) => s.snapshot)
  const recents = useStore((s) => s.recents)
  const openRepo = useStore((s) => s.openRepo)
  const checkout = useStore((s) => s.checkout)
  const createBranch = useStore((s) => s.createBranch)
  const deleteBranch = useStore((s) => s.deleteBranch)
  const stashApply = useStore((s) => s.stashApply)
  const stashDrop = useStore((s) => s.stashDrop)
  const setStashPanel = useStore((s) => s.setStashPanel)

  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [repoMenu, setRepoMenu] = useState<{ x: number; y: number } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; branch: Branch } | null>(null)
  const [stashMenu, setStashMenu] = useState<{ x: number; y: number; selector: string; message: string } | null>(null)
  const [renameTarget, setRenameTarget] = useState<Branch | null>(null)
  const [mergeTarget, setMergeTarget] = useState<Branch | null>(null)
  const [switchTarget, setSwitchTarget] = useState<Branch | null>(null)
  const [newName, setNewName] = useState('')

  const locals = useMemo(
    () =>
      (snap?.branches ?? [])
        .filter((b) => !b.remote)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [snap],
  )
  const remotes = useMemo(
    () =>
      (snap?.branches ?? [])
        .filter((b) => b.remote)
        .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })),
    [snap],
  )

  const localTree = useMemo(() => buildTree(locals), [locals])
  const remoteTree = useMemo(() => buildTree(remotes), [remotes])

  const q = query.trim().toLowerCase()
  const localHits = q ? locals.filter((b) => b.name.toLowerCase().includes(q)) : []
  const remoteHits = q ? remotes.filter((b) => b.name.toLowerCase().includes(q)) : []

  // expand the current branch's ancestors when the repo/branch changes
  useEffect(() => {
    const b = snap?.info.branch
    if (!b) return
    const parts = b.split('/')
    const acc = new Set<string>()
    for (let i = 1; i < parts.length; i++) acc.add(parts.slice(0, i).join('/'))
    setExpanded(acc)
    setQuery('')
  }, [snap?.info.path, snap?.info.branch])

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const copyName = (b: Branch) => void navigator.clipboard.writeText(b.name)

  const branchMenu = (b: Branch): MenuItem[] => {
    const current = snap?.info.branch ?? ''
    const items: MenuItem[] = []
    if (!b.current) {
      items.push({ label: '检出此分支', icon: GitBranch, onClick: () => setSwitchTarget(b) })
    }
    if (!b.remote && !b.current) {
      items.push({ label: `合并到 ${current}`, icon: GitMerge, onClick: () => setMergeTarget(b) })
    }
    items.push({ label: '与当前分支对比', icon: ArrowUpRight, onClick: () => void useStore.getState().openCompare(b.name) })
    items.push({ separator: true })
    if (b.remote) {
      items.push({
        label: '跟踪为本地分支',
        icon: GitPullRequest,
        onClick: () => void useStore.getState().trackRemote(b.name),
      })
    } else {
      items.push({
        label: b.upstream ? `推送到 ${b.upstream}` : '推送到远程',
        icon: ArrowUpRight,
        onClick: () => void useStore.getState().pushBranch(b.name),
      })
      if (!b.upstream) {
        items.push({
          label: '设置上游为 origin/' + b.name,
          icon: GitBranch,
          onClick: () => void useStore.getState().trackRemote(`origin/${b.name}`),
        })
      }
    }
    items.push({ separator: true })
    if (!b.remote) {
      items.push({
        label: '重命名…',
        icon: Pencil,
        onClick: () => {
          setNewName(b.name)
          setRenameTarget(b)
        },
      })
    }
    items.push({ label: '复制分支名', icon: Copy, onClick: () => copyName(b) })
    items.push({
      label: '创建拉取请求',
      icon: GitPullRequest,
      onClick: () => void useStore.getState().openPr(b.name),
    })
    if (!b.remote && !b.current) {
      items.push({ separator: true })
      items.push({ label: '删除分支', icon: Trash2, danger: true, onClick: () => void deleteBranch(b.name) })
    }
    return items
  }

  const repoItems: MenuItem[] = [
    ...recents.map((r) => ({
      label: r.split('/').filter(Boolean).pop() || r,
      hint: r.replace(/^\/Users\/[^/]+/, '~'),
      icon: FolderGit2,
      onClick: () => void openRepo(r),
    })),
    ...(recents.length ? [{ separator: true } as MenuItem] : []),
    { label: '打开仓库…', icon: Plus, hint: '⌘O', onClick: () => void openRepo() },
  ]

  if (!snap) {
    return (
      <aside className="flex h-full w-full flex-col border-r border-line/80 bg-sidebar">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-line bg-panel text-faint">
            <FolderGit2 size={17} strokeWidth={1.6} />
          </div>
          <div className="text-[12px] leading-5 text-muted">还没有打开仓库</div>
          <button
            onClick={() => void openRepo()}
            className="mt-1 flex h-[27px] items-center gap-1.5 rounded-[7px] bg-accent px-3 text-[11.5px] font-semibold text-[rgb(var(--accent-ink))] transition hover:brightness-110"
          >
            <Plus size={12} strokeWidth={2.4} /> 打开仓库
          </button>
          {recents.length > 0 && (
            <div className="mt-2 w-full">
              <div className="mb-1 text-left text-[10px] uppercase tracking-[0.12em] text-faint">最近</div>
              {recents.slice(0, 5).map((r) => (
                <button
                  key={r}
                  onClick={() => void openRepo(r)}
                  className="flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[11px] text-muted transition hover:bg-elevated hover:text-ink"
                >
                  <FolderGit2 size={12} className="shrink-0 text-faint" />
                  <span className="truncate">{r.split('/').filter(Boolean).pop()}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    )
  }

  const renderBranch = (b: Branch, depth: number, remote?: boolean) => (
    <div key={b.name} className="group relative">
      <button
        onClick={() => !b.current && setSwitchTarget(b)}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, branch: b })
        }}
        style={{ paddingLeft: 8 + depth * 12 }}
        className={cn('sidebar-item', b.current && 'bg-accent/10 text-ink')}
      >
        {b.current ? (
          <Check size={12} className="shrink-0 text-accent" strokeWidth={2.6} />
        ) : remote ? (
          <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-blue/70" />
        ) : (
          <GitBranch size={12} className="shrink-0 text-faint" />
        )}
        <span className="min-w-0 flex-1 truncate">{b.name.split('/').slice(depth).join('/')}</span>
        {!remote && (b.ahead > 0 || b.behind > 0) && (
          <span className="flex shrink-0 items-center gap-1 text-[9.5px] tabular-nums">
            {b.ahead > 0 && <span className="text-amber">↑{b.ahead}</span>}
            {b.behind > 0 && <span className="text-blue">↓{b.behind}</span>}
          </span>
        )}
        {b.gone && <span className="shrink-0 text-[9px] text-red">gone</span>}
      </button>
      {!remote && !b.current && (
        <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 group-hover:flex">
          <span
            role="button"
            title="删除分支"
            onClick={(e) => {
              e.stopPropagation()
              void deleteBranch(b.name)
            }}
            className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-sidebar text-faint hover:bg-red/15 hover:text-red"
          >
            <Trash2 size={11} />
          </span>
        </span>
      )}
    </div>
  )

  const renderTree = (nodes: TreeNode[], depth: number, remote?: boolean): React.ReactNode =>
    nodes.map((node) => {
      if (node.children.length > 0) {
        const open = expanded.has(node.key)
        return (
          <div key={node.key}>
            <button
              onClick={() => toggle(node.key)}
              onContextMenu={(e) => {
                if (!node.branch) return
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, branch: node.branch })
              }}
              style={{ paddingLeft: 8 + depth * 12 }}
              className="sidebar-item"
            >
              {open ? (
                <ChevronDown size={10} className="shrink-0 text-faint" />
              ) : (
                <ChevronRight size={10} className="shrink-0 text-faint" />
              )}
              <Folder size={12} className="shrink-0 text-faint/80" />
              <span className="min-w-0 flex-1 truncate text-muted">{node.label}</span>
              <span className="shrink-0 text-[9px] tabular-nums text-faint/70">{countBranches(node)}</span>
            </button>
            {open && <div>{renderTree(node.children, depth + 1, remote)}</div>}
          </div>
        )
      }
      return node.branch ? renderBranch(node.branch, depth, remote) : null
    })

  return (
    <aside className="flex h-full w-full flex-col border-r border-line/80 bg-sidebar">
      <div className="px-2 pt-2">
        <button
          onClick={(e) => setRepoMenu({ x: e.clientX, y: e.clientY + 8 })}
          className="group w-full rounded-[9px] border border-line/90 bg-panel px-2.5 py-2 text-left transition hover:border-linestrong hover:bg-panel2"
        >
          <div className="flex items-center gap-2">
            <FolderGit2 size={13} className="shrink-0 text-accent" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">{snap.info.name}</span>
            <ChevronDown size={12} className="text-faint" />
          </div>
          <div className="mt-1 truncate pl-[21px] text-[10px] text-faint">
            {snap.info.path.replace(/^\/Users\/[^/]+/, '~')}
          </div>
        </button>
      </div>

      <div className="px-2 pb-1 pt-2">
        <div className="flex h-[26px] items-center gap-1.5 rounded-[7px] border border-line bg-panel px-2">
          <Search size={11} className="shrink-0 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索分支"
            className="h-full min-w-0 flex-1 bg-transparent text-[11px] text-ink outline-none placeholder:text-faint"
          />
          {query && (
            <button onClick={() => setQuery('')} className="shrink-0 text-faint hover:text-muted">
              <X size={10} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1 scroll-thin">
        {q ? (
          <div className="mb-2">
            <div className="flex h-[22px] items-center px-1 text-[10px] uppercase tracking-[0.1em] text-faint">
              搜索结果 {localHits.length + remoteHits.length}
            </div>
            {localHits.map((b) => renderBranch(b, 0))}
            {remoteHits.map((b) => renderBranch(b, 0, true))}
            {localHits.length + remoteHits.length === 0 && (
              <div className="px-2 py-2 text-[10.5px] text-faint">没有匹配的分支</div>
            )}
          </div>
        ) : (
          <>
            <Section
              id="branches"
              title="分支"
              count={locals.length}
              action={
                <button onClick={() => setCreating(true)} className="icon-btn h-5 w-5" title="新建分支">
                  <Plus size={12} />
                </button>
              }
            >
              {creating && (
                <form
                  className="px-1 pb-1"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (name.trim()) void createBranch(name.trim())
                    setName('')
                    setCreating(false)
                  }}
                >
                  <input
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => setCreating(false)}
                    placeholder="feature/新分支"
                    className="h-[25px] w-full rounded-[6px] border border-accent/50 bg-panel px-2 text-[11px] text-ink outline-none placeholder:text-faint"
                  />
                </form>
              )}
              {renderTree(localTree, 0)}
              {locals.length === 0 && <div className="px-2 py-1 text-[10.5px] text-faint">没有分支</div>}
            </Section>

            <Section id="remotes" title="远程" count={remotes.length} defaultOpen={false}>
              {renderTree(remoteTree, 0, true)}
              {remotes.length === 0 && <div className="px-2 py-1 text-[10.5px] text-faint">没有远端分支</div>}
            </Section>
          </>
        )}

        <Section
          id="worktrees"
          title="工作树"
          count={snap.worktrees.length}
          action={
            <button
              onClick={() => useStore.getState().openWorktreeDialog()}
              className="icon-btn h-5 w-5"
              title="新建工作树"
            >
              <Plus size={12} />
            </button>
          }
        >
          {snap.worktrees.map((w) => (
            <div key={w.path} className="group flex items-center rounded-[6px] hover:bg-elevated/60">
              <button
                onClick={() => void openRepo(w.path)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2 pr-1 text-left"
                title={w.path}
              >
                <FolderTree size={12} className="shrink-0 text-teal/80" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted group-hover:text-ink">
                  {w.branch ?? 'detached'}
                </span>
                <span className="shrink-0 text-[9px] text-faint">{w.main ? '主' : ''}</span>
              </button>
              {!w.main && (
                <button
                  onClick={() => void useStore.getState().worktreeRemove(w.path)}
                  title="移除工作树"
                  className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-faint hover:bg-red/15 hover:text-red group-hover:flex"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </Section>

        <Section
          id="stashes"
          title="贮藏"
          count={snap.stashes.length}
          action={
            <button onClick={() => setStashPanel(true)} className="icon-btn h-5 w-5" title="贮藏当前改动">
              <Plus size={12} />
            </button>
          }
        >
          {snap.stashes.length === 0 && <div className="px-2 py-1 text-[10.5px] text-faint">没有贮藏</div>}
          {snap.stashes.map((s) => (
            <div
              key={s.selector}
              onContextMenu={(e) => {
                e.preventDefault()
                setStashMenu({ x: e.clientX, y: e.clientY, selector: s.selector, message: s.message })
              }}
              className="group flex items-center rounded-[6px] hover:bg-elevated/60"
            >
              <button
                onClick={() => void useStore.getState().openStashPreview(s.selector, s.message)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-2 pr-1 text-left"
                title="查看贮藏内容（右键更多操作）"
              >
                <Archive size={12} className="shrink-0 text-violet/80" />
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted group-hover:text-ink">{s.message}</span>
                <span className="shrink-0 text-[9px] text-faint">{timeAgo(s.time)}</span>
              </button>
              <button
                onClick={() => void stashDrop(s.selector)}
                title="删除贮藏"
                className="mr-1 hidden h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-faint hover:bg-red/15 hover:text-red group-hover:flex"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </Section>
      </div>

      <div className="border-t border-line/60 px-3 py-2">
        <div className="flex items-center justify-between text-[10px] text-faint">
          <span className="truncate">{snap.info.upstream ?? '未设置上游'}</span>
          <span className="shrink-0">
            {snap.info.ahead > 0 ? `↑${snap.info.ahead}` : ''} {snap.info.behind > 0 ? `↓${snap.info.behind}` : ''}
          </span>
        </div>
      </div>

      {repoMenu && <Menu x={repoMenu.x} y={repoMenu.y} items={repoItems} onClose={() => setRepoMenu(null)} />}
      {menu && <Menu x={menu.x} y={menu.y} items={branchMenu(menu.branch)} onClose={() => setMenu(null)} />}
      {stashMenu && (
        <Menu
          x={stashMenu.x}
          y={stashMenu.y}
          onClose={() => setStashMenu(null)}
          items={[
            {
              label: '查看内容',
              icon: Archive,
              onClick: () => void useStore.getState().openStashPreview(stashMenu.selector, stashMenu.message),
            },
            {
              label: '应用贮藏（保留）',
              icon: RotateCcw,
              onClick: () => void stashApply(stashMenu.selector, false),
            },
            {
              label: '弹出贮藏（应用并删除）',
              icon: ArrowUpRight,
              onClick: () => void stashApply(stashMenu.selector, true),
            },
            { separator: true },
            {
              label: '删除贮藏',
              icon: Trash2,
              danger: true,
              onClick: () => void stashDrop(stashMenu.selector),
            },
          ]}
        />
      )}

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} width={380}>
        <ModalHeader title="重命名分支" subtitle={renameTarget?.name} onClose={() => setRenameTarget(null)} />
        <div className="space-y-3 p-4">
          <Field label="新名称">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="field h-[30px] text-[12px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameTarget && newName.trim()) {
                  void useStore.getState().renameBranch(renameTarget.name, newName.trim())
                  setRenameTarget(null)
                }
              }}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              disabled={!newName.trim()}
              onClick={() => {
                if (renameTarget && newName.trim()) {
                  void useStore.getState().renameBranch(renameTarget.name, newName.trim())
                  setRenameTarget(null)
                }
              }}
            >
              重命名
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!switchTarget} onClose={() => setSwitchTarget(null)} width={420}>
        <ModalHeader title="切换分支" onClose={() => setSwitchTarget(null)} />
        <div className="space-y-3 p-4">
          <div className="rounded-[9px] border border-line/70 bg-panel/40 px-3 py-2.5 text-[11.5px] leading-5 text-muted">
            从 <span className="font-medium text-ink">{snap.info.branch}</span> 切换到{' '}
            <span className="font-medium text-ink">{switchTarget?.name}</span>
            {switchTarget?.remote && (
              <div className="mt-1 text-[10.5px] text-blue/90">
                这是远程分支，将自动创建同名本地分支并跟踪它。
              </div>
            )}
          </div>
          {(snap.status.staged.length > 0 || snap.status.unstaged.length > 0 || snap.status.conflicts.length > 0) && (
            <div className="rounded-[8px] border border-amber/30 bg-amber/8 px-2.5 py-2 text-[10.5px] leading-[16px] text-amber/90">
              当前有 {snap.status.staged.length + snap.status.unstaged.length + snap.status.conflicts.length}{' '}
              个未提交改动。切换可能失败，建议先提交或贮藏。
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setSwitchTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              icon={GitBranch}
              onClick={() => {
                if (switchTarget) {
                  if (switchTarget.remote) void useStore.getState().trackRemote(switchTarget.name)
                  else void checkout(switchTarget.name)
                }
                setSwitchTarget(null)
              }}
            >
              {switchTarget?.remote ? '跟踪并检出' : '切换'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!mergeTarget} onClose={() => setMergeTarget(null)} width={400}>
        <ModalHeader title="合并分支" onClose={() => setMergeTarget(null)} />
        <div className="space-y-3 p-4">
          <div className="rounded-[9px] border border-line/70 bg-panel/40 px-3 py-2.5 text-[11.5px] leading-5 text-muted">
            将 <span className="font-medium text-ink">{mergeTarget?.name}</span> 合并到当前分支{' '}
            <span className="font-medium text-ink">{snap.info.branch}</span>。
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMergeTarget(null)}>
              取消
            </Button>
            <Button
              variant="primary"
              icon={GitMerge}
              onClick={() => {
                if (mergeTarget) void useStore.getState().mergeBranch(mergeTarget.name)
                setMergeTarget(null)
              }}
            >
              合并
            </Button>
          </div>
        </div>
      </Modal>
    </aside>
  )
}

function Section({
  id,
  title,
  count,
  action,
  children,
  defaultOpen = true,
}: {
  id: string
  title: string
  count: number
  action?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const key = `grove.section.${id}`
  const [open, setOpen] = useState(() => {
    const v = localStorage.getItem(key)
    return v === null ? defaultOpen : v === '1'
  })
  const toggle = () => {
    setOpen((o) => {
      localStorage.setItem(key, o ? '0' : '1')
      return !o
    })
  }
  return (
    <div className="mb-1">
      <div className="flex h-[22px] items-center justify-between pl-1 pr-2">
        <button onClick={toggle} className="flex min-w-0 items-center gap-1 rounded-[4px] py-0.5 pr-1 hover:text-muted">
          {open ? (
            <ChevronDown size={10} className="shrink-0 text-faint" />
          ) : (
            <ChevronRight size={10} className="shrink-0 text-faint" />
          )}
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{title}</span>
          <span className="text-[9.5px] tabular-nums text-faint/70">{count}</span>
        </button>
        {action}
      </div>
      {open && <div>{children}</div>}
    </div>
  )
}
