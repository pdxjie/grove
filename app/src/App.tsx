import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { listen } from '@tauri-apps/api/event'
import { CommandLog } from './components/CommandLog'
import { CompareDialog } from './components/CompareDialog'
import { JournalDialog } from './components/JournalDialog'
import { LocalOnlyDialog } from './components/LocalOnlyDialog'
import { ProtectedDialog } from './components/ProtectedDialog'
import { BranchDialog } from './components/BranchDialog'
import { WorktreeDialog } from './components/WorktreeDialog'
import { RebaseDialog } from './components/RebaseDialog'
import { ConflictCenter } from './components/ConflictCenter'
import { PushDialog } from './components/PushDialog'
import { Palette } from './components/Palette'
import { RepoHeader } from './components/RepoHeader'
import { Sidebar } from './components/Sidebar'
import { StashDialog } from './components/StashDialog'
import { StatusBar } from './components/StatusBar'
import { TabBar } from './components/TabBar'
import { VDivider } from './components/VDivider'
import { useLayoutWidth } from './lib/useLayout'
import { TitleBar } from './components/TitleBar'
import { Welcome } from './components/Welcome'
import { IS_TAURI } from './lib/api'
import { useStore } from './lib/store'
import { ChangesView } from './views/ChangesView'
import { HistoryView } from './views/HistoryView'

export default function App() {
  const snapshot = useStore((s) => s.snapshot)
  const view = useStore((s) => s.view)
  const logPanel = useStore((s) => s.logPanel)
  const [sidebarWidth, setSidebarWidth] = useLayoutWidth('grove.layout.sidebar', 232, 190, 360)

  useEffect(() => {
    void useStore.getState().boot()
  }, [])

  useEffect(() => {
    if (!IS_TAURI) return
    let timer: number | undefined
    let wantsRefs = false
    const schedule = (refs: boolean) => {
      if (refs) wantsRefs = true
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const st = useStore.getState()
        const refetch = wantsRefs
        wantsRefs = false
        if (!st.snapshot || st.busy) return
        if (refetch) void st.refresh()
        else void st.refreshStatus()
      }, 380)
    }
    let un1: (() => void) | undefined
    let un2: (() => void) | undefined
    void listen('repo:worktree', () => schedule(false)).then((u) => (un1 = u))
    void listen('repo:refs', () => schedule(true)).then((u) => (un2 = u))
    return () => {
      window.clearTimeout(timer)
      un1?.()
      un2?.()
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const st = useStore.getState()
      if (st.snapshot && !st.busy) void st.refreshBranches()
    }, 25_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const typing =
        el?.tagName === 'INPUT' || el?.tagName === 'TEXTAREA' || el?.isContentEditable
      const st = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        st.setPalette(!st.palette)
        return
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        void st.openRepo()
        return
      }
      if (mod && e.key.toLowerCase() === 'r') {
        e.preventDefault()
        void st.refresh()
        return
      }
      if (mod && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        st.setLogPanel(!st.logPanel)
        return
      }
      if (mod && e.key === '1') {
        e.preventDefault()
        st.setView('changes')
        return
      }
      if (mod && e.key === '2') {
        e.preventDefault()
        st.setView('history')
        return
      }
      if (mod && e.shiftKey && (e.code === 'BracketLeft' || e.code === 'BracketRight')) {
        e.preventDefault()
        if (st.tabs.length > 1) {
          const idx = st.tabs.findIndex((t) => t.path === st.activePath)
          const next = (idx + (e.code === 'BracketRight' ? 1 : -1) + st.tabs.length) % st.tabs.length
          st.activateTab(st.tabs[next].path)
        }
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void st.undoLast()
        return
      }
      if (typing) return

      if (e.key === ' ' && st.selectedFile && st.view === 'changes') {
        e.preventDefault()
        const f = st.selectedFile
        if (f.scope === 'index') void st.unstage([f.path])
        else if (f.scope === 'worktree' || f.scope === 'untracked') void st.stage([f.path])
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'a' && st.snapshot) {
        e.preventDefault()
        void st.stage(st.snapshot.status.unstaged.map((f) => f.path))
        return
      }
      if (mod && e.shiftKey && e.key.toLowerCase() === 'u' && st.snapshot) {
        e.preventDefault()
        void st.unstage(st.snapshot.status.staged.map((f) => f.path))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-app text-ink">
      <TitleBar />
      <TabBar />
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 shrink-0" style={{ width: sidebarWidth }}>
          <Sidebar />
        </div>
        <VDivider value={sidebarWidth} min={190} max={360} onChange={setSidebarWidth} />
        <main className="flex min-w-0 flex-1 flex-col">
          {snapshot ? (
            <>
              <RepoHeader />
              {view === 'changes' ? <ChangesView /> : <HistoryView />}
            </>
          ) : (
            <Welcome />
          )}
        </main>
      </div>
      {logPanel && <CommandLog />}
      <StatusBar />
      <Palette />
      <StashDialog />
      <PushDialog />
      <ConflictCenter />
      <CompareDialog />
      <RebaseDialog />
      <LocalOnlyDialog />
      <ProtectedDialog />
      <WorktreeDialog />
      <BranchDialog />
      <JournalDialog />
      <Toaster
        position="bottom-right"
        offset={34}
        toastOptions={{
          style: {
            background: 'rgb(var(--panel2))',
            color: 'rgb(var(--ink))',
            border: '1px solid rgb(var(--line-strong) / 0.6)',
            borderRadius: '10px',
            fontSize: '12px',
            boxShadow: '0 16px 50px -12px rgba(0,0,0,.55)',
          },
        }}
      />
    </div>
  )
}
