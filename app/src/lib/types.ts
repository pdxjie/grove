export type RepoState =
  | 'clean'
  | 'merging'
  | 'rebasing'
  | 'cherryPicking'
  | 'reverting'
  | 'bisecting'

export interface RepoInfo {
  path: string
  name: string
  branch: string
  detached: boolean
  head: string
  upstream: string | null
  ahead: number
  behind: number
  state: RepoState
}

export interface FileChange {
  path: string
  origPath: string | null
  index: string
  worktree: string
  staged: boolean
  unstaged: boolean
  untracked: boolean
  conflicted: boolean
}

export interface Status {
  staged: FileChange[]
  unstaged: FileChange[]
  conflicts: FileChange[]
  state: RepoState
}

export interface Commit {
  sha: string
  parents: string[]
  author: string
  email: string
  time: number
  subject: string
  refs: string[]
}

export interface GraphRow {
  sha: string
  lane: number
  lanes: number
  lines: number[]
  parentLanes: number[]
  merge: boolean
}

export interface Branch {
  name: string
  sha: string
  current: boolean
  upstream: string | null
  time: number
  remote: boolean
  ahead: number
  behind: number
  gone: boolean
}

export interface Stash {
  index: number
  selector: string
  message: string
  time: number
}

export interface Worktree {
  path: string
  head: string
  branch: string | null
  bare: boolean
  prunable: boolean
  main: boolean
}

export interface Snapshot {
  info: RepoInfo
  status: Status
  branches: Branch[]
  stashes: Stash[]
  worktrees: Worktree[]
  commits: Commit[]
  graph: GraphRow[]
  hasMore: boolean
}

export interface DiffLine {
  kind: string
  oldNo: number | null
  newNo: number | null
  content: string
}

export interface Hunk {
  header: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: DiffLine[]
}

export interface FileDiff {
  path: string
  oldPath: string | null
  binary: boolean
  hunks: Hunk[]
  additions: number
  deletions: number
  truncated: boolean
}

export interface CommitFile {
  path: string
  status: string
  additions: number
  deletions: number
}

export interface CommitDetail {
  commit: Commit
  files: CommitFile[]
  additions: number
  deletions: number
}

export interface OpResult {
  ok: boolean
  message: string
  conflicted: boolean
  output: string
}

export interface LogEntry {
  id: number
  at: number
  cmd: string
  durationMs: number
  ok: boolean
  output: string
}

export interface LogPage {
  commits: Commit[]
  graph: GraphRow[]
  hasMore: boolean
}

export interface ConflictBlock {
  ours: string
  base: string
  theirs: string
}

export interface ConflictDoc {
  path: string
  blocks: ConflictBlock[]
  hasBase: boolean
}

export interface Outgoing {
  branch: string
  upstream: string | null
  commits: Commit[]
  fileCount: number
  additions: number
  deletions: number
  protected: boolean
}

export interface BranchCompare {
  other: string
  ahead: Commit[]
  behind: Commit[]
  fileCount: number
  additions: number
  deletions: number
}

export interface RebaseAction {
  sha: string
  action: 'pick' | 'squash' | 'fixup' | 'drop' | 'reword' | 'edit'
  message?: string | null
}

export interface JournalEntry {
  seq: number
  at: number
  kind: string
  label: string
}

export interface BlameLine {
  line: number
  sha: string
  author: string
  time: number
  content: string
  summary: string
}

export interface BlameFile {
  path: string
  lines: BlameLine[]
}
