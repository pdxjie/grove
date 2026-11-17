import { invoke } from '@tauri-apps/api/core'
import type {
  BlameFile,
  Branch,
  BranchCompare,
  Commit,
  CommitDetail,
  CommitFile,
  ConflictDoc,
  FileDiff,
  LogEntry,
  LogPage,
  OpResult,
  Outgoing,
  JournalEntry,
  RebaseAction,
  Snapshot,
  Status,
} from './types'
import { mockApi } from './mock'

export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in (window as any)

async function call<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  if (!IS_TAURI) throw new Error('not in tauri')
  return invoke<T>(cmd, args)
}

export async function pickRepo(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const res = await open({ directory: true, multiple: false, title: '选择 Git 仓库' })
  return typeof res === 'string' ? res : null
}

export const api = {
  async initialRepo(): Promise<string | null> {
    if (!IS_TAURI) return null
    return call<string | null>('initial_repo', {})
  },

  async initialUi(): Promise<string | null> {
    if (!IS_TAURI) return null
    return call<string | null>('initial_ui', {})
  },

  async openRepo(path: string): Promise<Snapshot> {
    if (!IS_TAURI) return mockApi.openRepo(path)
    return call<Snapshot>('open_repo', { path })
  },

  async snapshot(path: string): Promise<Snapshot> {
    if (!IS_TAURI) return mockApi.snapshot()
    return call<Snapshot>('repo_snapshot', { path })
  },

  async branches(path: string): Promise<Branch[]> {
    if (!IS_TAURI) return mockApi.branches()
    return call<Branch[]>('branches', { path })
  },

  async pushBranch(path: string, branch: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.pushBranch(branch)
    return call<OpResult>('push_branch', { path, branch })
  },

  async trackRemote(path: string, remoteRef: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.trackRemote(remoteRef)
    return call<OpResult>('track_remote', { path, remoteRef })
  },

  async renameBranch(path: string, oldName: string, newName: string): Promise<void> {
    if (!IS_TAURI) return mockApi.renameBranch(oldName, newName)
    return call('rename_branch', { path, old: oldName, new: newName })
  },

  async compareBranches(path: string, other: string): Promise<BranchCompare> {
    if (!IS_TAURI) return mockApi.compareBranches(other)
    return call<BranchCompare>('compare_branches', { path, other })
  },

  async prUrl(path: string, branch: string): Promise<string> {
    if (!IS_TAURI) return mockApi.prUrl(branch)
    return call<string>('pr_url', { path, branch })
  },

  async openUrl(url: string): Promise<void> {
    if (!IS_TAURI) {
      window.open(url, '_blank')
      return
    }
    return call('open_url', { url })
  },

  async rebasePlan(path: string, base?: string): Promise<Commit[]> {
    if (!IS_TAURI) return mockApi.rebasePlan()
    return call<Commit[]>('rebase_plan', { path, base: base ?? null })
  },

  async rebaseStart(path: string, base: string, actions: RebaseAction[]): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.rebaseStart()
    return call<OpResult>('rebase_start', { path, base, actions })
  },

  async localOnly(path: string): Promise<string[]> {
    if (!IS_TAURI) return mockApi.localOnly()
    return call<string[]>('local_only', { path })
  },

  async setLocalOnly(path: string, patterns: string[]): Promise<void> {
    if (!IS_TAURI) return mockApi.setLocalOnly(patterns)
    return call('set_local_only', { path, patterns })
  },

  async journal(path: string): Promise<JournalEntry[]> {
    if (!IS_TAURI) return mockApi.journal()
    return call<JournalEntry[]>('journal', { path })
  },

  async undoLast(path: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.undoLast()
    return call<OpResult>('undo_last', { path })
  },

  async status(path: string): Promise<Status> {
    return call<Status>('status', { path })
  },

  async logPage(
    path: string,
    limit: number,
    skip: number,
    branch?: string,
    author?: string,
    firstParent?: boolean,
  ): Promise<LogPage> {
    if (!IS_TAURI) return mockApi.logPage(skip)
    return call<LogPage>('log_page', {
      path,
      limit,
      skip,
      branch: branch ?? null,
      author: author || null,
      firstParent: !!firstParent,
    })
  },

  async authors(path: string): Promise<string[]> {
    if (!IS_TAURI) return ['张三', '李四', '王五']
    return call<string[]>('authors', { path })
  },

  async diff(
    path: string,
    scope: string,
    filePath: string,
    commit?: string,
  ): Promise<FileDiff> {
    if (!IS_TAURI) return mockApi.diff(filePath, scope)
    return call<FileDiff>('diff', { path, scope, filePath, commit: commit ?? null })
  },

  async commitDetail(path: string, sha: string): Promise<CommitDetail> {
    if (!IS_TAURI) return mockApi.commitDetail(sha)
    return call<CommitDetail>('commit_detail', { path, sha })
  },

  async stage(path: string, paths: string[]): Promise<void> {
    if (!IS_TAURI) return mockApi.stage(paths)
    return call('stage', { path, paths })
  },

  async stageHunk(
    path: string,
    file: string,
    scope: string,
    index: number,
  ): Promise<void> {
    if (!IS_TAURI) return mockApi.stageHunk(file, scope, index)
    return call('stage_hunk', { path, file, scope, index })
  },

  async worktreeAdd(
    path: string,
    target: string,
    branch: string,
    create: boolean,
  ): Promise<OpResult> {
    if (!IS_TAURI) return { ok: true, message: '已创建工作树', conflicted: false, output: '' }
    return call<OpResult>('worktree_add', { path, target, branch, create })
  },

  async worktreeRemove(path: string, target: string, force: boolean): Promise<OpResult> {
    if (!IS_TAURI) return { ok: true, message: '已移除工作树', conflicted: false, output: '' }
    return call<OpResult>('worktree_remove', { path, target, force })
  },

  async blame(path: string, file: string, rev?: string): Promise<BlameFile> {
    if (!IS_TAURI) return mockApi.blame(file)
    return call<BlameFile>('blame', { path, file, rev: rev ?? null })
  },

  async protectedRules(path: string): Promise<string[]> {
    if (!IS_TAURI) return ['main', 'master']
    return call<string[]>('protected_rules', { path })
  },

  async setProtectedRules(path: string, patterns: string[]): Promise<void> {
    if (!IS_TAURI) return
    return call('set_protected_rules', { path, patterns })
  },

  async stageLines(
    path: string,
    file: string,
    scope: string,
    hunkIndex: number,
    lines: number[],
  ): Promise<void> {
    if (!IS_TAURI) return mockApi.stageLines()
    return call('stage_lines', { path, file, scope, hunkIndex, lines })
  },

  async outgoing(path: string): Promise<Outgoing> {
    if (!IS_TAURI) return mockApi.outgoing()
    return call<Outgoing>('outgoing', { path })
  },

  async conflictDoc(path: string, file: string): Promise<ConflictDoc> {
    if (!IS_TAURI) return mockApi.conflictDoc(file)
    return call<ConflictDoc>('conflict_doc', { path, file })
  },

  async resolveConflict(path: string, file: string, choices: string[]): Promise<void> {
    if (!IS_TAURI) return mockApi.resolveConflict(file, choices)
    return call('resolve_conflict', { path, file, choices })
  },

  async checkoutSide(path: string, file: string, side: string): Promise<void> {
    if (!IS_TAURI) return mockApi.checkoutSide(file, side)
    return call('checkout_side', { path, file, side })
  },

  async unstage(path: string, paths: string[]): Promise<void> {
    if (!IS_TAURI) return mockApi.unstage(paths)
    return call('unstage', { path, paths })
  },

  async discard(path: string, tracked: string[], untracked: string[]): Promise<void> {
    if (!IS_TAURI) return mockApi.discard([...tracked, ...untracked])
    return call('discard', { path, tracked, untracked })
  },

  async commit(
    path: string,
    message: string,
    amend: boolean,
    sign: boolean,
  ): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.commit(message, amend)
    return call<OpResult>('commit', { path, message, amend, sign })
  },

  async merge(path: string, branch: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.cherryPick([branch], false)
    return call<OpResult>('merge', { path, branch })
  },

  async checkout(path: string, target: string): Promise<void> {
    if (!IS_TAURI) return mockApi.checkout(target)
    return call('checkout', { path, target })
  },

  async createBranch(path: string, name: string, from?: string): Promise<void> {
    if (!IS_TAURI) return mockApi.createBranch(name)
    return call('create_branch', { path, name, from: from ?? null })
  },

  async deleteBranch(path: string, name: string, force: boolean): Promise<void> {
    if (!IS_TAURI) return mockApi.deleteBranch(name)
    return call('delete_branch', { path, name, force })
  },

  async cherryPick(
    path: string,
    shas: string[],
    noCommit: boolean,
    recordSource: boolean,
  ): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.cherryPick(shas, noCommit)
    return call<OpResult>('cherry_pick', { path, shas, noCommit, recordSource })
  },

  async revertCommit(path: string, sha: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.revertCommit()
    return call<OpResult>('revert_commit', { path, sha })
  },

  async sequencerControl(path: string, action: string): Promise<OpResult> {
    return call<OpResult>('sequencer_control', { path, action })
  },

  async undoCommit(path: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.undoCommit()
    return call<OpResult>('undo_commit', { path })
  },

  async stashPush(
    path: string,
    message: string,
    keepIndex: boolean,
    includeUntracked: boolean,
    paths: string[] = [],
  ): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.stashPush(message, keepIndex)
    return call<OpResult>('stash_push', { path, message, keepIndex, includeUntracked, paths })
  },

  async stashFiles(path: string, selector: string): Promise<CommitFile[]> {
    if (!IS_TAURI)
      return [{ path: 'src/Service/StockAllocator.php', status: 'M', additions: 12, deletions: 4 }]
    return call<CommitFile[]>('stash_files', { path, selector })
  },

  async stashDiff(path: string, selector: string, file: string): Promise<FileDiff> {
    if (!IS_TAURI) return mockApi.diff(file, 'stash')
    return call<FileDiff>('stash_diff', { path, selector, file })
  },

  async stashApply(path: string, selector: string, pop: boolean): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.stashApply(selector, pop)
    return call<OpResult>('stash_apply', { path, selector, pop })
  },

  async stashDrop(path: string, selector: string): Promise<void> {
    if (!IS_TAURI) return mockApi.stashDrop(selector)
    return call('stash_drop', { path, selector })
  },

  async fetchAll(path: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.fetchAll()
    return call<OpResult>('fetch_all', { path })
  },

  async pull(path: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.pull()
    return call<OpResult>('pull', { path })
  },

  async push(path: string): Promise<OpResult> {
    if (!IS_TAURI) return mockApi.push()
    return call<OpResult>('push', { path })
  },

  async cmdLog(): Promise<LogEntry[]> {
    if (!IS_TAURI) return mockApi.cmdLog()
    return call<LogEntry[]>('cmd_log', {})
  },

  async clearCmdLog(): Promise<void> {
    if (!IS_TAURI) return
    return call('clear_cmd_log', {})
  },
}
