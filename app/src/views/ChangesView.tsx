import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleAlert,
  FileLock2,
  Archive,
  FilePlus2,
  FileText,
  Minus,
  Plus,
  Undo2,
} from 'lucide-react'
import { beginWindowDrag, beginWindowMaximize } from '../lib/window'
import { useStore } from '../lib/store'
import type { FileChange } from '../lib/types'
import { useLayoutWidth } from '../lib/useLayout'
import { cn, isLocalOnlyPath } from '../lib/utils'
import { DiffView } from '../components/DiffView'
import { StashDetail } from '../components/StashDetail'
import { VDivider } from '../components/VDivider'
import { Spinner } from '../components/ui'

const statusColor = (ch: string) => {
  switch (ch) {
    case 'A':
    case '?':
      return 'text-green'
    case 'D':
      return 'text-red'
    case 'R':
      return 'text-blue'
    case 'U':
      return 'text-amber'
    default:
      return 'text-amber'
  }
}

function splitPath(path: string) {
  const i = path.lastIndexOf('/')
  if (i < 0) return { dir: '', name: path }
  return { dir: path.slice(0, i + 1), name: path.slice(i + 1) }
}

export function ChangesView() {
  const snap = useStore((s) => s.snapshot)
  const selectedFile = useStore((s) => s.selectedFile)
  const selectFile = useStore((s) => s.selectFile)
  const stage = useStore((s) => s.stage)
  const unstage = useStore((s) => s.unstage)
  const discard = useStore((s) => s.discard)
  const openConflict = useStore((s) => s.openConflict)
  const localOnly = useStore((s) => s.localOnly)
  const stashPreview = useStore((s) => s.stashPreview)
  const isLocal = (path: string) => isLocalOnlyPath(localOnly, path)
  const [listWidth, setListWidth] = useLayoutWidth('grove.layout.changes', 306, 240, 480)

  const status = snap?.status
  const staged = status?.staged ?? []
  const unstaged = useMemo(() => {
    const list = [...(status?.unstaged ?? [])]
    return list.sort((a, b) => {
      const au = a.untracked ? 1 : 0
      const bu = b.untracked ? 1 : 0
      if (au !== bu) return au - bu
      return a.path.localeCompare(b.path, 'en', { sensitivity: 'base' })
    })
  }, [status])
  const conflicts = status?.conflicts ?? []

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex shrink-0 flex-col border-r border-line/70 bg-panel/20" style={{ width: listWidth }}>
        <div onMouseDown={beginWindowDrag} onDoubleClick={beginWindowMaximize} className="flex h-[34px] shrink-0 items-center gap-2 border-b border-line/70 px-3">
          <span className="text-[12px] font-medium text-ink">变更</span>
          <span className="text-[11px] tabular-nums text-faint">
            {staged.length + unstaged.length + conflicts.length}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              onClick={() => void stage(unstaged.filter((f) => !isLocal(f.path)).map((f) => f.path))}
              disabled={unstaged.length === 0}
              title="全部暂存 (⇧⌘A)"
              className="icon-btn h-6 w-6 disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={() => void unstage([...staged.map((f) => f.path)])}
              disabled={staged.length === 0}
              title="全部取消暂存"
              className="icon-btn h-6 w-6 disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
            <button
              onClick={() => void useStore.getState().openLocalOnly()}
              title="本地私有文件规则"
              className="icon-btn h-6 w-6"
            >
              <FileLock2 size={12} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-thin py-1">
          {conflicts.length > 0 && (
            <Section title="冲突" count={conflicts.length} tone="amber">
              {conflicts.map((f) => (
                <FileRow
                  key={`c-${f.path}`}
                  file={f}
                  scope="worktree"
                  conflict
                  selected={selectedFile?.path === f.path}
                  onSelect={() => void openConflict(f.path)}
                  onStage={() => void stage([f.path])}
                  onDiscard={() => void discard([], [f.path])}
                />
              ))}
            </Section>
          )}

          <Section
            title="已暂存"
            count={staged.length}
            tone="green"
            action={
              staged.length > 0 ? (
                <button
                  className="text-[11px] text-faint hover:text-muted"
                  onClick={() => void unstage(staged.map((f) => f.path))}
                >
                  全部取消
                </button>
              ) : undefined
            }
          >
            {staged.length === 0 && <Hint>还没有暂存的改动</Hint>}
            {staged.map((f) => (
              <FileRow
                key={`s-${f.path}`}
                file={f}
                scope="index"
                selected={selectedFile?.path === f.path && selectedFile?.scope === 'index'}
                onSelect={() => void selectFile(f.path, 'index')}
                onUnstage={() => void unstage([f.path])}
              />
            ))}
          </Section>

          <Section
            title="未暂存"
            count={unstaged.length}
            action={
              unstaged.length > 0 ? (
                <button
                  className="text-[11px] text-faint hover:text-muted"
                  onClick={() => void stage(unstaged.filter((f) => !isLocal(f.path)).map((f) => f.path))}
                >
                  全部暂存
                </button>
              ) : undefined
            }
          >
            {unstaged.length === 0 && <Hint>工作区是干净的</Hint>}
            {unstaged.map((f) => (
              <FileRow
                key={`u-${f.path}`}
                file={f}
                scope="worktree"
                local={isLocal(f.path)}
                selected={selectedFile?.path === f.path && selectedFile?.scope !== 'index'}
                onSelect={() => void selectFile(f.path, f.untracked ? 'untracked' : 'worktree')}
                onStage={() => void stage([f.path])}
                onDiscard={() => void discard(f.untracked ? [] : [f.path], f.untracked ? [f.path] : [])}
              />
            ))}
          </Section>
        </div>

        <CommitPanel />
      </div>

      <VDivider value={listWidth} min={240} max={480} onChange={setListWidth} />
      <div className="min-w-0 flex-1">
        {stashPreview ? <StashDetail /> : <DiffView />}
      </div>
    </div>
  )
}

function Section({
  title,
  count,
  tone,
  action,
  children,
}: {
  title: string
  count: number
  tone?: 'green' | 'amber'
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="mb-1">
      <div className="flex h-[24px] items-center gap-1.5 px-3">
        <ChevronDown size={10} className="text-faint" />
        <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-faint">{title}</span>
        <span
          className={cn(
            'rounded-full px-1.5 text-[10.5px] tabular-nums',
            tone === 'green' ? 'bg-green/15 text-green' : tone === 'amber' ? 'bg-amber/15 text-amber' : 'bg-elevated text-faint',
          )}
        >
          {count}
        </span>
        <span className="ml-auto">{action}</span>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-1.5 text-[11.5px] text-faint">{children}</div>
}

function FileRow({
  file,
  scope,
  selected,
  conflict,
  local,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
}: {
  file: FileChange
  scope: 'index' | 'worktree'
  selected: boolean
  conflict?: boolean
  local?: boolean
  onSelect: () => void
  onStage?: () => void
  onUnstage?: () => void
  onDiscard?: () => void
}) {
  const { dir, name } = splitPath(file.path)
  const ch = conflict ? 'U' : scope === 'index' ? file.index : file.untracked ? '?' : file.worktree
  const partial = file.staged && file.unstaged && !conflict

  return (
    <div
      onClick={onSelect}
      className={cn(
        'group relative flex h-[26px] cursor-default items-center gap-2 pl-3 pr-1.5 text-[12.5px]',
        selected ? 'row-selected' : 'hover:bg-elevated/50',
      )}
    >
      {selected && <span className="absolute left-0 top-0 h-full w-[2px] bg-accent" />}
      <span className={cn('w-[10px] shrink-0 text-center text-[11.5px] font-semibold', statusColor(ch))}>
        {ch === '?' ? '?' : ch}
      </span>
      <span className="min-w-0 flex-1 truncate">
        <span className="text-faint">{dir}</span>
        <span className={cn('text-ink/90', partial && 'italic')}>{name}</span>
        {partial && <span className="ml-1 text-[10.5px] text-accent">◐</span>}
        {local && (
          <span className="ml-1.5 rounded-[3px] border border-violet/35 bg-violet/10 px-1 text-[8.5px] text-violet/90">
            本地
          </span>
        )}
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
        {onStage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onStage()
            }}
            title={conflict ? '标记已解决' : '暂存'}
            className="flex h-5 w-5 items-center justify-center rounded-[4px] text-faint hover:bg-green/15 hover:text-green"
          >
            <Check size={12} />
          </button>
        )}
        {onUnstage && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onUnstage()
            }}
            title="取消暂存"
            className="flex h-5 w-5 items-center justify-center rounded-[4px] text-faint hover:bg-elevated hover:text-ink"
          >
            <Minus size={12} />
          </button>
        )}
        {onDiscard && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDiscard()
            }}
            title="撤销改动"
            className="flex h-5 w-5 items-center justify-center rounded-[4px] text-faint hover:bg-red/15 hover:text-red"
          >
            <Undo2 size={12} />
          </button>
        )}
      </span>
    </div>
  )
}

function CommitPanel() {
  const snap = useStore((s) => s.snapshot)
  const commit = useStore((s) => s.commit)
  const busy = useStore((s) => s.busy)
  const [message, setMessage] = useState('')
  const [amend, setAmend] = useState(false)
  const [sign, setSign] = useState(false)

  const staged = snap?.status.staged ?? []
  const disabled = staged.length === 0 || !message.trim() || !!busy

  const submit = async () => {
    if (disabled) return
    const ok = await commit(message, amend, sign)
    if (ok) {
      setMessage('')
      setAmend(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        void submit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="shrink-0 border-t border-line/70 bg-panel/40 p-2.5">
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={`提交到 ${snap?.info.branch ?? ''}…`}
        spellCheck={false}
        className="h-[64px] w-full resize-none rounded-[8px] border border-line bg-panel px-2.5 py-2 text-[13px] leading-[17px] text-ink outline-none transition placeholder:text-faint focus:border-accent/60 focus:ring-[3px] focus:ring-accent/10"
      />
      <div className="mt-1.5 flex items-center gap-1">
        <Toggle active={amend} onClick={() => setAmend(!amend)} label="修改上次" />
        <Toggle active={sign} onClick={() => setSign(!sign)} label="签名" />
        <button
          onClick={() => useStore.getState().setStashPanel(true)}
          title="把当前改动贮藏起来"
          className="ml-1 flex h-[21px] items-center gap-1 rounded-[5px] border border-line/70 px-1.5 text-[11px] text-faint transition hover:border-linestrong hover:text-muted"
        >
          <Archive size={10} />
          贮藏
        </button>
        <span className="ml-auto text-[11px] text-faint">
          {staged.length > 0 ? `已暂存 ${staged.length} 个文件` : '没有暂存的改动'}
        </span>
      </div>
      <button
        onClick={() => void submit()}
        disabled={disabled}
        className="mt-2 flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[8px] bg-accent text-[13px] font-semibold text-[rgb(var(--accent-ink))] transition enabled:hover:brightness-110 disabled:bg-elevated disabled:text-faint"
      >
        {busy === '提交中' ? <Spinner size={13} /> : <Check size={13} strokeWidth={2.6} />}
        提交
        <span className="ml-1 flex items-center gap-0.5 text-[11px] font-normal opacity-60">
          <span>⌘</span>
          <span>↩</span>
        </span>
      </button>
      {staged.length === 0 && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px] text-faint">
          <CircleAlert size={10} />
          先暂存文件，提交只包含暂存区
        </div>
      )}
    </div>
  )
}

function Toggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[21px] items-center gap-1 rounded-[5px] border px-1.5 text-[11px] transition',
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line/70 bg-transparent text-faint hover:border-linestrong hover:text-muted',
      )}
    >
      {active && <Check size={9} strokeWidth={3} />}
      {label}
    </button>
  )
}
