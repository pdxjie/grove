import { create } from 'zustand'
import { toast } from 'sonner'
import { api, IS_TAURI, pickRepo } from './api'
import { layoutGraph } from './graph'
import type { BranchCompare, CommitDetail, CommitFile, ConflictDoc, FileDiff, JournalEntry, LogEntry, Outgoing, RebaseAction, Snapshot } from './types'

const RECENT_KEY = 'grove.repos'
const LAST_KEY = 'grove.lastRepo'
const TABS_KEY = 'grove.tabs'

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function loadTabState(): { paths: string[]; active: string | null } {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (!raw) return { paths: [], active: null }
    const v = JSON.parse(raw)
    return {
      paths: Array.isArray(v.paths) ? v.paths.filter((p: unknown) => typeof p === 'string') : [],
      active: typeof v.active === 'string' ? v.active : null,
    }
  } catch {
    return { paths: [], active: null }
  }
}

function saveRecents(list: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)))
}

export type Scope = 'index' | 'worktree' | 'untracked' | 'commit' | 'stash'

export interface TabState {
  path: string
  name: string
  snapshot: Snapshot
  view: 'changes' | 'history'
  selectedFile: { path: string; scope: Scope } | null
  selectedSha: string | null
  detail: CommitDetail | null
  selectedCommitFile: string | null
  diff: FileDiff | null
}

interface GroveState {
  snapshot: Snapshot | null
  tabs: TabState[]
  activePath: string | null
  recents: string[]
  loading: boolean
  loadingMore: boolean
  busy: string | null
  view: 'changes' | 'history'
  selectedFile: { path: string; scope: Scope } | null
  diff: FileDiff | null
  diffLoading: boolean
  selectedSha: string | null
  detail: CommitDetail | null
  selectedCommitFile: string | null
  logs: LogEntry[]
  pushOpen: boolean
  outgoing: Outgoing | null
  conflictOpen: boolean
  conflictFile: string | null
  conflictDoc: ConflictDoc | null
  conflictChoices: Record<number, string>
  compareOpen: boolean
  compare: BranchCompare | null
  rebaseOpen: boolean
  rebaseBase: string
  rebaseActions: RebaseAction[]
  localOnlyOpen: boolean
  localOnlyPatterns: string[]
  localOnly: string[]
  stashPreview: { selector: string; message: string } | null
  stashFiles: CommitFile[]
  historyFilter: { branch: string; author: string; firstParent: boolean }
  authors: string[]
  worktreeOpen: boolean
  protectedOpen: boolean
  protectedPatterns: string[]
  journalOpen: boolean
  journal: JournalEntry[]
  logPanel: boolean
  palette: boolean
  stashPanel: boolean
  boot: () => Promise<void>
  openRepo: (path?: string) => Promise<void>
  activateTab: (path: string) => void
  closeTab: (path: string) => void
  refresh: () => Promise<void>
  setView: (v: 'changes' | 'history') => void
  selectFile: (path: string, scope: Scope) => Promise<void>
  selectCommit: (sha: string) => Promise<void>
  selectCommitFile: (path: string) => Promise<void>
  stage: (paths: string[]) => Promise<void>
  stageHunk: (index: number) => Promise<void>
  stageLines: (hunkIndex: number, lines: number[]) => Promise<void>
  openPush: () => Promise<void>
  closePush: () => void
  openConflict: (file: string) => Promise<void>
  closeConflict: () => void
  setConflictChoice: (index: number, choice: string) => void
  applyConflict: () => Promise<void>
  takeSide: (side: 'ours' | 'theirs') => Promise<void>
  refreshBranches: () => Promise<void>
  pushBranch: (name: string) => Promise<void>
  trackRemote: (remoteRef: string) => Promise<void>
  renameBranch: (oldName: string, newName: string) => Promise<void>
  mergeBranch: (name: string) => Promise<void>
  openCompare: (name: string) => Promise<void>
  closeCompare: () => void
  openPr: (name: string) => Promise<void>
  undoLast: () => Promise<void>
  openRebase: (base?: string) => Promise<void>
  closeRebase: () => void
  setRebaseAction: (index: number, action: RebaseAction['action']) => void
  setRebaseMessage: (index: number, message: string) => void
  moveRebase: (index: number, dir: -1 | 1) => void
  moveRebaseTo: (from: number, to: number) => void
  runRebase: () => Promise<void>
  loadHistory: (partial?: Partial<{ branch: string; author: string; firstParent: boolean }>) => Promise<void>
  loadMoreHistory: () => Promise<void>
  openStashPreview: (selector: string, message: string) => Promise<void>
  closeStashPreview: () => void
  selectStashFile: (path: string) => Promise<void>
  openJournal: () => Promise<void>
  closeJournal: () => void
  openWorktreeDialog: () => void
  closeWorktreeDialog: () => void
  worktreeAdd: (target: string, branch: string, create: boolean) => Promise<void>
  worktreeRemove: (target: string) => Promise<void>
  openProtected: () => Promise<void>
  closeProtected: () => void
  saveProtected: (patterns: string[]) => Promise<void>
  openLocalOnly: () => Promise<void>
  closeLocalOnly: () => void
  saveLocalOnly: (patterns: string[]) => Promise<void>
  unstage: (paths: string[]) => Promise<void>
  discard: (paths: string[], untracked: string[]) => Promise<void>
  commit: (message: string, amend: boolean, sign: boolean) => Promise<boolean>
  checkout: (name: string) => Promise<void>
  createBranch: (name: string) => Promise<void>
  deleteBranch: (name: string) => Promise<void>
  cherryPick: (shas: string[], noCommit: boolean) => Promise<void>
  undoCommit: () => Promise<void>
  sequencer: (action: 'continue' | 'skip' | 'abort') => Promise<void>
  revertCommit: (sha: string) => Promise<void>
  stashPush: (message: string, keepIndex: boolean, includeUntracked: boolean) => Promise<void>
  stashApply: (selector: string, pop: boolean) => Promise<void>
  stashDrop: (selector: string) => Promise<void>
  sync: (kind: 'fetch' | 'pull' | 'push') => Promise<void>
  openLog: () => Promise<void>
  setLogPanel: (v: boolean) => void
  setPalette: (v: boolean) => void
  setStashPanel: (v: boolean) => void
}

export const useStore = create<GroveState>((set, get) => {
  const runOp = async (
    label: string,
    fn: () => Promise<{ ok: boolean; message: string } | void>,
  ) => {
    set({ busy: label })
    try {
      const res = await fn()
      if (res && 'ok' in res) {
        if (res.ok) toast.success(res.message)
        else toast.error(res.message)
      }
      await get().refresh()
      if (get().logPanel) await get().openLog()
      return res
    } catch (e) {
      toast.error(String(e))
    } finally {
      set({ busy: null })
    }
  }

  const advanceConflict = async () => {
    const next = get().snapshot?.status.conflicts[0]
    if (next) {
      await get().openConflict(next.path)
    } else {
      set({ conflictOpen: false, conflictDoc: null, conflictFile: null, conflictChoices: {} })
      toast.success('冲突已全部解决')
    }
  }

  const captureTab = (): TabState | null => {
    const st = get()
    if (!st.snapshot || !st.activePath) return null
    return {
      path: st.activePath,
      name: st.snapshot.info.name,
      snapshot: st.snapshot,
      view: st.view,
      selectedFile: st.selectedFile,
      selectedSha: st.selectedSha,
      detail: st.detail,
      selectedCommitFile: st.selectedCommitFile,
      diff: st.diff,
    }
  }

  const persistTabs = () => {
    try {
      localStorage.setItem(
        TABS_KEY,
        JSON.stringify({ paths: get().tabs.map((t) => t.path), active: get().activePath }),
      )
    } catch {
      /* ignore */
    }
  }

  const persistActive = () => {
    const tab = captureTab()
    if (!tab) return
    set({ tabs: get().tabs.map((t) => (t.path === tab.path ? tab : t)) })
  }

  return {
    snapshot: null,
    tabs: [],
    activePath: null,
    recents: loadRecents(),
    loading: false,
    loadingMore: false,
    busy: null,
    view: 'changes',
    selectedFile: null,
    diff: null,
    diffLoading: false,
    selectedSha: null,
    detail: null,
    selectedCommitFile: null,
    logs: [],
    pushOpen: false,
    outgoing: null,
    conflictOpen: false,
    conflictFile: null,
    conflictDoc: null,
    conflictChoices: {},
    compareOpen: false,
    compare: null,
    rebaseOpen: false,
    rebaseBase: '',
    rebaseActions: [],
    localOnlyOpen: false,
    localOnlyPatterns: [],
    localOnly: [],
    stashPreview: null,
    stashFiles: [],
    historyFilter: { branch: 'current', author: '', firstParent: false },
    authors: [],
    worktreeOpen: false,
    protectedOpen: false,
    protectedPatterns: [],
    journalOpen: false,
    journal: [],
    logPanel: false,
    palette: false,
    stashPanel: false,

    boot: async () => {
      const saved = loadTabState()
      const initial = await api.initialRepo().catch(() => null)
      const fallback = localStorage.getItem(LAST_KEY) ?? (!IS_TAURI ? '/Users/gaochenjie/Documents/MC' : null)
      if (initial) {
        await get().openRepo(initial)
      } else if (saved.paths.length > 0) {
        for (const p of saved.paths.slice(0, 4)) {
          await get().openRepo(p)
        }
        if (saved.active && get().tabs.some((t) => t.path === saved.active)) {
          get().activateTab(saved.active)
        }
      } else if (fallback) {
        await get().openRepo(fallback)
      }
      const snap = get().snapshot
      if (!snap) return
      const params = new URLSearchParams(location.search)
      const envUi = await api.initialUi().catch(() => null)
      const ui = params.get('ui') ?? envUi
      set({
        view: params.get('view') === 'history' ? 'history' : 'changes',
        palette: ui === 'palette',
        stashPanel: ui === 'stash',
      })
      if (ui === 'conflict') {
        const target = snap.status.conflicts[0]
        if (target) void get().openConflict(target.path)
      }
      if (ui === 'push') void get().openPush()
      if (ui === 'compare') {
        const target = snap.branches.find((b) => !b.current && !b.remote)
        if (target) void get().openCompare(target.name)
      }
      if (ui === 'rebase') void get().openRebase()
      if (ui === 'localonly') void get().openLocalOnly()
      if (ui === 'journal') void get().openJournal()
      if (ui === 'protected') void get().openProtected()
      if (ui === 'worktree') get().openWorktreeDialog()
      if (ui === 'stashpreview' && snap.stashes[0]) {
        void get().openStashPreview(snap.stashes[0].selector, snap.stashes[0].message)
      }
      if (ui === 'tabs' && !IS_TAURI) {
        await get().openRepo('/tmp/grove-web')
        await get().openRepo('/tmp/grove-api')
      }
    },
    openRepo: async (p) => {
      let path = p
      if (!path) {
        try {
          path = (await pickRepo()) ?? undefined
        } catch (e) {
          toast.error(String(e))
          return
        }
      }
      if (!path) return

      const known = get().tabs.find((t) => t.path === path)
      if (known) {
        get().activateTab(known.path)
        return
      }

      set({ loading: true })
      try {
        const snap = await api.openRepo(path)
        const existing = get().tabs.find((t) => t.path === snap.info.path)
        if (existing) {
          get().activateTab(existing.path)
          return
        }
        const recents = [snap.info.path, ...get().recents.filter((x) => x !== snap.info.path)].slice(0, 10)
        saveRecents(recents)
        localStorage.setItem(LAST_KEY, snap.info.path)
        document.title = `${snap.info.name} — Grove`
        const localOnly = await api.localOnly(snap.info.path).catch(() => [])
        const authors = await api.authors(snap.info.path).catch(() => [])
        const tab: TabState = {
          path: snap.info.path,
          name: snap.info.name,
          snapshot: snap,
          view: 'changes',
          selectedFile: null,
          selectedSha: null,
          detail: null,
          selectedCommitFile: null,
          diff: null,
        }
        set({
          snapshot: snap,
          tabs: [...get().tabs, tab],
          activePath: tab.path,
          localOnly,
          authors,
          recents,
          view: 'changes',
          selectedFile: null,
          diff: null,
          selectedSha: null,
          detail: null,
          selectedCommitFile: null,
        })
        persistTabs()
        const first = snap.status.unstaged[0] ?? snap.status.staged[0] ?? snap.status.conflicts[0]
        if (first) {
          void get().selectFile(
            first.path,
            first.conflicted
              ? 'worktree'
              : first.untracked
                ? 'untracked'
                : first.staged && !first.unstaged
                  ? 'index'
                  : 'worktree',
          )
        }
      } catch (e) {
        toast.error(String(e))
      } finally {
        set({ loading: false })
      }
    },

    activateTab: (path) => {
      const s = get()
      if (s.activePath === path) return
      const target = s.tabs.find((t) => t.path === path)
      if (!target) return
      const current = captureTab()
      set({
        tabs: current ? s.tabs.map((t) => (t.path === current.path ? current : t)) : s.tabs,
        activePath: target.path,
        snapshot: target.snapshot,
        view: target.view,
        selectedFile: target.selectedFile,
        selectedSha: target.selectedSha,
        detail: target.detail,
        selectedCommitFile: target.selectedCommitFile,
        diff: target.diff,
      })
      document.title = `${target.name} — Grove`
      localStorage.setItem(LAST_KEY, target.path)
      persistTabs()
      void api
        .localOnly(target.path)
        .then((localOnly) => set({ localOnly }))
        .catch(() => {})
    },

    closeTab: (path) => {
      const s = get()
      const idx = s.tabs.findIndex((t) => t.path === path)
      if (idx < 0) return
      const nextTabs = s.tabs.filter((t) => t.path !== path)
      if (s.activePath !== path) {
        set({ tabs: nextTabs })
        persistTabs()
        return
      }
      const neighbor = nextTabs[Math.min(idx, nextTabs.length - 1)]
      if (neighbor) {
        set({ tabs: nextTabs, activePath: null })
        get().activateTab(neighbor.path)
      } else {
        set({
          tabs: [],
          activePath: null,
          snapshot: null,
          selectedFile: null,
          diff: null,
          selectedSha: null,
          detail: null,
          selectedCommitFile: null,
          view: 'changes',
        })
        persistTabs()
      }
    },
    refresh: async () => {
      const snap = get().snapshot
      if (!snap) return
      try {
        const next = await api.snapshot(snap.info.path)
        set({ snapshot: next })
        persistActive()
      } catch {
        /* repo may have been moved; keep current view */
      }
    },

    setView: (view) => {
      set({ view })
      persistActive()
    },

    selectFile: async (path, scope) => {
      const snap = get().snapshot
      if (!snap) return
      if (scope !== 'stash' && get().stashPreview) set({ stashPreview: null, stashFiles: [] })
      set({ selectedFile: { path, scope }, diffLoading: true })
      if (path.endsWith('/')) {
        set({
          diff: {
            path,
            oldPath: null,
            binary: false,
            hunks: [],
            additions: 0,
            deletions: 0,
            truncated: false,
          },
          diffLoading: false,
        })
        return
      }
      try {
        const d = await api.diff(snap.info.path, scope, path, scope === 'commit' ? get().selectedSha ?? undefined : undefined)
        set({ diff: d })
      } catch (e) {
        weToast(String(e))
        set({ diff: null })
      } finally {
        set({ diffLoading: false })
        persistActive()
      }
    },

    selectCommit: async (sha) => {
      const snap = get().snapshot
      if (!snap) return
      if (get().selectedSha === sha && get().detail) return
      set({ selectedSha: sha, detail: null, diff: null, selectedCommitFile: null })
      try {
        const detail = await api.commitDetail(snap.info.path, sha)
        set({ detail })
        const first = detail.files[0]
        if (first) {
          set({ selectedCommitFile: first.path })
          const d = await api.diff(snap.info.path, 'commit', first.path, sha)
          set({ diff: d })
        }
      } catch (e) {
        weToast(String(e))
      }
    },

    selectCommitFile: async (path) => {
      const snap = get().snapshot
      const sha = get().selectedSha
      if (!snap || !sha) return
      set({ selectedCommitFile: path, diffLoading: true })
      try {
        const d = await api.diff(snap.info.path, 'commit', path, sha)
        set({ diff: d })
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ diffLoading: false })
        persistActive()
      }
    },

    stage: async (paths) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('暂存', () => api.stage(snap.info.path, paths))
    },

    stageHunk: async (index) => {
      const snap = get().snapshot
      const sel = get().selectedFile
      if (!snap || !sel) return
      set({ busy: '暂存 hunk' })
      try {
        await api.stageHunk(snap.info.path, sel.path, sel.scope, index)
        await get().refresh()
        await get().selectFile(sel.path, sel.scope)
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    stageLines: async (hunkIndex, lines) => {
      const snap = get().snapshot
      const sel = get().selectedFile
      if (!snap || !sel || lines.length === 0) return
      set({ busy: '暂存选中行' })
      try {
        await api.stageLines(snap.info.path, sel.path, sel.scope, hunkIndex, lines)
        await get().refresh()
        await get().selectFile(sel.path, sel.scope)
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    openPush: async () => {
      const snap = get().snapshot
      if (!snap) return
      set({ pushOpen: true, outgoing: null })
      try {
        const o = await api.outgoing(snap.info.path)
        set({ outgoing: o })
      } catch (e) {
        weToast(String(e))
      }
    },

    closePush: () => set({ pushOpen: false, outgoing: null }),

    openConflict: async (file) => {
      const snap = get().snapshot
      if (!snap) return
      set({ conflictOpen: true, conflictFile: file, conflictDoc: null, conflictChoices: {} })
      try {
        const doc = await api.conflictDoc(snap.info.path, file)
        set({ conflictDoc: doc })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeConflict: () =>
      set({ conflictOpen: false, conflictDoc: null, conflictFile: null, conflictChoices: {} }),

    setConflictChoice: (index, choice) =>
      set({ conflictChoices: { ...get().conflictChoices, [index]: choice } }),

    applyConflict: async () => {
      const snap = get().snapshot
      const doc = get().conflictDoc
      if (!snap || !doc) return
      const choices = doc.blocks.map((_, i) => get().conflictChoices[i] ?? 'ours')
      set({ busy: '解决冲突' })
      try {
        await api.resolveConflict(snap.info.path, doc.path, choices)
        toast.success('已保存并标记解决')
        await get().refresh()
        await advanceConflict()
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    takeSide: async (side) => {
      const snap = get().snapshot
      const file = get().conflictFile
      if (!snap || !file) return
      set({ busy: '解决冲突' })
      try {
        await api.checkoutSide(snap.info.path, file, side)
        toast.success(side === 'ours' ? '已采用我方版本' : '已采用对方版本')
        await get().refresh()
        await advanceConflict()
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    refreshBranches: async () => {
      const snap = get().snapshot
      if (!snap) return
      try {
        const branches = await api.branches(snap.info.path)
        set({ snapshot: { ...snap, branches } })
        persistActive()
      } catch {
        /* ignore */
      }
    },

    pushBranch: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('推送分支', () => api.pushBranch(snap.info.path, name))
    },

    trackRemote: async (remoteRef) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('跟踪远程分支', () => api.trackRemote(snap.info.path, remoteRef))
    },

    renameBranch: async (oldName, newName) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('重命名分支', () => api.renameBranch(snap.info.path, oldName, newName))
    },

    mergeBranch: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('合并', () => api.merge(snap.info.path, name))
    },

    openCompare: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      set({ compareOpen: true, compare: null })
      try {
        const compare = await api.compareBranches(snap.info.path, name)
        set({ compare })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeCompare: () => set({ compareOpen: false, compare: null }),

    openPr: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      try {
        const url = await api.prUrl(snap.info.path, name)
        await api.openUrl(url)
        toast.success('已在浏览器打开拉取请求页面')
      } catch (e) {
        weToast(String(e))
      }
    },

    undoLast: async () => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('撤销', () => api.undoLast(snap.info.path))
    },

    openRebase: async (base) => {
      const snap = get().snapshot
      if (!snap) return
      let start = base
      if (!start) {
        const c = snap.commits[Math.min(5, snap.commits.length - 1)]
        start = c?.sha
      }
      if (!start) {
        toast.error('没有可整理的提交')
        return
      }
      try {
        const plan = await api.rebasePlan(snap.info.path, start)
        if (plan.length === 0) {
          toast.error('这个提交之后没有可整理的提交')
          return
        }
        set({
          rebaseOpen: true,
          rebaseBase: start,
          rebaseActions: plan.map((c) => ({ sha: c.sha, action: 'pick' as const })),
        })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeRebase: () => set({ rebaseOpen: false, rebaseActions: [], rebaseBase: '' }),

    setRebaseAction: (index, action) => {
      const actions = [...get().rebaseActions]
      if (!actions[index]) return
      actions[index] = { ...actions[index], action }
      set({ rebaseActions: actions })
    },

    setRebaseMessage: (index, message) => {
      const actions = [...get().rebaseActions]
      if (!actions[index]) return
      actions[index] = { ...actions[index], message }
      set({ rebaseActions: actions })
    },

    moveRebase: (index, dir) => {
      const actions = [...get().rebaseActions]
      const j = index + dir
      if (j < 0 || j >= actions.length) return
      ;[actions[index], actions[j]] = [actions[j], actions[index]]
      set({ rebaseActions: actions })
    },

    moveRebaseTo: (from, to) => {
      if (from === to) return
      const actions = [...get().rebaseActions]
      const [item] = actions.splice(from, 1)
      actions.splice(to, 0, item)
      set({ rebaseActions: actions })
    },

    runRebase: async () => {
      const snap = get().snapshot
      const { rebaseBase, rebaseActions } = get()
      if (!snap) return
      set({ busy: '变基中' })
      try {
        const r = await api.rebaseStart(snap.info.path, rebaseBase, rebaseActions)
        if (r.ok) {
          toast.success(r.message)
          set({ rebaseOpen: false })
        } else {
          toast.error(r.message)
          if (r.conflicted) set({ rebaseOpen: false })
        }
        await get().refresh()
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    loadHistory: async (partial) => {
      const snap = get().snapshot
      if (!snap) return
      const filter = { ...get().historyFilter, ...(partial ?? {}) }
      set({ historyFilter: filter, busy: '加载历史' })
      try {
        const page = await api.logPage(
          snap.info.path,
          250,
          0,
          filter.branch === 'current' ? undefined : filter.branch,
          filter.author,
          filter.firstParent,
        )
        set({ snapshot: { ...snap, commits: page.commits, graph: page.graph, hasMore: page.hasMore } })
        const keep = get().selectedSha
        if (!keep || !page.commits.some((c) => c.sha === keep)) {
          set({ selectedSha: null, detail: null })
          if (page.commits[0]) void get().selectCommit(page.commits[0].sha)
        }
        persistActive()
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ busy: null })
      }
    },

    loadMoreHistory: async () => {
      const st = get()
      const snap = st.snapshot
      if (!snap || !snap.hasMore || st.loadingMore) return
      const filter = st.historyFilter
      set({ loadingMore: true })
      try {
        const page = await api.logPage(
          snap.info.path,
          250,
          snap.commits.length,
          filter.branch === 'current' ? undefined : filter.branch,
          filter.author,
          filter.firstParent,
        )
        const base = get().snapshot!
        if (page.commits.length === 0) {
          set({ snapshot: { ...base, hasMore: false } })
          return
        }
        const commits = [...base.commits, ...page.commits]
        set({
          snapshot: { ...base, commits, graph: layoutGraph(commits), hasMore: page.hasMore },
        })
        persistActive()
      } catch (e) {
        weToast(String(e))
      } finally {
        set({ loadingMore: false })
      }
    },

    openStashPreview: async (selector, message) => {
      const snap = get().snapshot
      if (!snap) return
      set({ stashPreview: { selector, message }, stashFiles: [], diff: null, selectedFile: null })
      try {
        const files = await api.stashFiles(snap.info.path, selector)
        set({ stashFiles: files })
        const first = files[0]
        if (first) {
          set({ selectedFile: { path: first.path, scope: 'stash' } })
          const d = await api.stashDiff(snap.info.path, selector, first.path)
          set({ diff: d })
        }
      } catch (e) {
        weToast(String(e))
      }
    },

    closeStashPreview: () =>
      set({ stashPreview: null, stashFiles: [], diff: null, selectedFile: null }),

    selectStashFile: async (path) => {
      const snap = get().snapshot
      const preview = get().stashPreview
      if (!snap || !preview) return
      set({ selectedFile: { path, scope: 'stash' } })
      try {
        const d = await api.stashDiff(snap.info.path, preview.selector, path)
        set({ diff: d })
      } catch (e) {
        weToast(String(e))
      }
    },

    openJournal: async () => {
      const snap = get().snapshot
      if (!snap) return
      set({ journalOpen: true })
      try {
        const journal = await api.journal(snap.info.path)
        set({ journal })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeJournal: () => set({ journalOpen: false }),

    openWorktreeDialog: () => set({ worktreeOpen: true }),
    closeWorktreeDialog: () => set({ worktreeOpen: false }),

    worktreeAdd: async (target, branch, create) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('创建工作树', () => api.worktreeAdd(snap.info.path, target, branch, create))
      set({ worktreeOpen: false })
    },

    worktreeRemove: async (target) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('移除工作树', () => api.worktreeRemove(snap.info.path, target, false))
    },

    openProtected: async () => {
      const snap = get().snapshot
      if (!snap) return
      try {
        const patterns = await api.protectedRules(snap.info.path)
        set({ protectedOpen: true, protectedPatterns: patterns })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeProtected: () => set({ protectedOpen: false }),

    saveProtected: async (patterns) => {
      const snap = get().snapshot
      if (!snap) return
      try {
        await api.setProtectedRules(snap.info.path, patterns)
        set({ protectedPatterns: patterns, protectedOpen: false })
        toast.success('已保存保护分支规则')
      } catch (e) {
        weToast(String(e))
      }
    },

    openLocalOnly: async () => {
      const snap = get().snapshot
      if (!snap) return
      try {
        const patterns = await api.localOnly(snap.info.path)
        set({ localOnlyOpen: true, localOnlyPatterns: patterns })
      } catch (e) {
        weToast(String(e))
      }
    },

    closeLocalOnly: () => set({ localOnlyOpen: false }),

    saveLocalOnly: async (patterns) => {
      const snap = get().snapshot
      if (!snap) return
      try {
        await api.setLocalOnly(snap.info.path, patterns)
        set({ localOnlyPatterns: patterns, localOnly: patterns, localOnlyOpen: false })
        toast.success('已保存本地私有规则')
      } catch (e) {
        weToast(String(e))
      }
    },

    unstage: async (paths) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('取消暂存', () => api.unstage(snap.info.path, paths))
    },

    discard: async (paths, untracked) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('撤销改动', () => api.discard(snap.info.path, paths, untracked))
    },

    commit: async (message, amend, sign) => {
      const snap = get().snapshot
      if (!snap) return false
      if (!message.trim()) {
        toast.error('提交信息不能为空')
        return false
      }
      set({ busy: '提交中' })
      try {
        const r = await api.commit(snap.info.path, message, amend, sign)
        toast.success(r.message || '已提交')
        await get().refresh()
        if (get().logPanel) await get().openLog()
        return true
      } catch (e) {
        toast.error(String(e))
        return false
      } finally {
        set({ busy: null })
      }
    },

    checkout: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('切换分支', () => api.checkout(snap.info.path, name))
    },

    createBranch: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('新建分支', () => api.createBranch(snap.info.path, name))
    },

    deleteBranch: async (name) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('删除分支', () => api.deleteBranch(snap.info.path, name, false))
    },

    undoCommit: async () => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('撤销提交', () => api.undoCommit(snap.info.path))
    },

    cherryPick: async (shas, noCommit) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('遴选', () => api.cherryPick(snap.info.path, shas, noCommit, true))
    },

    revertCommit: async (sha) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('回滚提交', () => api.revertCommit(snap.info.path, sha))
    },

    sequencer: async (action) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp(action, () => api.sequencerControl(snap.info.path, action))
    },

    stashPush: async (message, keepIndex, includeUntracked) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('贮藏', () => api.stashPush(snap.info.path, message, keepIndex, includeUntracked))
      set({ stashPanel: false })
    },

    stashApply: async (selector, pop) => {
      set({ stashPreview: null, stashFiles: [] })
      const snap = get().snapshot
      if (!snap) return
      await runOp(pop ? '弹出贮藏' : '应用贮藏', () => api.stashApply(snap.info.path, selector, pop))
    },

    stashDrop: async (selector) => {
      const snap = get().snapshot
      if (!snap) return
      await runOp('删除贮藏', () => api.stashDrop(snap.info.path, selector))
    },

    sync: async (kind) => {
      const snap = get().snapshot
      if (!snap) return
      const label = kind === 'fetch' ? '抓取中' : kind === 'pull' ? '拉取中' : '推送中'
      await runOp(label, () =>
        kind === 'fetch' ? api.fetchAll(snap.info.path) : kind === 'pull' ? api.pull(snap.info.path) : api.push(snap.info.path),
      )
    },

    openLog: async () => {
      const logs = await api.cmdLog()
      set({ logs })
    },

    setLogPanel: (v) => {
      set({ logPanel: v })
      if (v) void get().openLog()
    },
    setPalette: (v) => set({ palette: v }),
    setStashPanel: (v) => set({ stashPanel: v }),
  }
})

function weToast(msg: string) {
  toast.error(msg.replace(/^Error:\s*/, ''))
}
