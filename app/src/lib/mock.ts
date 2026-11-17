import { layoutGraph } from './graph'
import type {
  Branch,
  Commit,
  CommitDetail,
  FileChange,
  FileDiff,
  GraphRow,
  LogEntry,
  OpResult,
  Snapshot,
  Stash,
  Status,
} from './types'

const now = Math.floor(Date.now() / 1000)

function commit(
  sha: string,
  parents: string[],
  subject: string,
  author: string,
  minutesAgo: number,
  refs: string[] = [],
): Commit {
  return {
    sha,
    parents,
    subject,
    author,
    email: `${author}@corp.com`,
    time: now - minutesAgo * 60,
    refs,
  }
}

function file(path: string, index: string, worktree: string): FileChange {
  const untracked = index === '?' && worktree === '?'
  return {
    path,
    origPath: null,
    index,
    worktree,
    staged: !untracked && index !== '.' && index !== ' ',
    unstaged: untracked || (worktree !== '.' && worktree !== ' '),
    untracked,
    conflicted: false,
  }
}

function seedCommits(): Commit[] {
  return [
    commit('a1b2c3d4e5f60718', ['90ab12cd34ef5678', '77fe12ab34cd5688'], 'feat: 库存分配支持渠道维度', '张三', 120, [
      'HEAD -> main',
      'origin/main',
    ]),
    commit('90ab12cd34ef5678', ['55bc12de34fa5678'], 'fix: 修正 VSKU 淘汰判断', '李四', 300),
    commit('77fe12ab34cd5688', ['55bc12de34fa5678'], 'feat: 调拨单批量导出', '王五', 480, [
      'feature/stock-alloc',
    ]),
    commit('55bc12de34fa5678', ['33de45fa56bc7890'], 'chore: 升级 composer 依赖', '张三', 1440),
    commit('33de45fa56bc7890', ['11fa23bc45de6789'], 'docs: 补充调拨规则说明', '李四', 1560),
    commit('11fa23bc45de6789', ['99cd88ef77ab6655'], 'test: 补齐库存分配用例', '张三', 2880),
    commit('99cd88ef77ab6655', ['66ab55cd44ef3322'], 'refactor: 拆分 StockRepository', '王五', 3000),
    commit('66ab55cd44ef3322', [], 'init: 初始化 ERP 仓库', '张三', 20000, ['tag: v0.1.0']),
  ]
}

function seedStatus(): Status {
  return {
    state: 'clean',
    staged: [
      file('src/Service/StockAllocator.php', 'M', 'M'),
      file('src/Repo/StockRepository.php', 'A', '.'),
    ],
    unstaged: [
      file('src/Service/StockAllocator.php', 'M', 'M'),
      file('src/Http/AllocController.php', '.', 'M'),
      file('tests/AllocTest.php', '.', 'M'),
      file('config/local.php', '?', '?'),
      file('storage/logs/app.log', '.', 'M'),
      file('README.md', '.', 'M'),
    ],
    conflicts: [
      {
        ...file('src/Service/ChannelResolver.php', 'U', 'U'),
        conflicted: true,
        staged: false,
        unstaged: true,
      },
    ],
  }
}

function seedBranches(): Branch[] {
  return [
    { name: 'main', sha: 'a1b2c3d4e5f60718', current: true, upstream: 'origin/main', time: now - 120, remote: false, ahead: 2, behind: 0, gone: false },
    { name: 'feature/stock-alloc', sha: '77fe12ab34cd5688', current: false, upstream: 'origin/feature/stock-alloc', time: now - 480, remote: false, ahead: 1, behind: 2, gone: false },
    { name: 'hotfix/pay-null', sha: '90ab12cd34ef5678', current: false, upstream: null, time: now - 86400, remote: false, ahead: 0, behind: 0, gone: false },
    { name: 'release/2026.11', sha: '55bc12de34fa5678', current: false, upstream: null, time: now - 172800, remote: false, ahead: 0, behind: 0, gone: false },
    { name: 'origin/main', sha: 'a1b2c3d4e5f60718', current: false, upstream: null, time: now - 120, remote: true, ahead: 0, behind: 0, gone: false },
    { name: 'origin/feature/stock-alloc', sha: '77fe12ab34cd5688', current: false, upstream: null, time: now - 480, remote: true, ahead: 0, behind: 0, gone: false },
  ]
}

function seedStashes(): Stash[] {
  return [
    { index: 0, selector: 'stash@{0}', message: 'WIP: 调拨导出调试', time: now - 3600 },
    { index: 1, selector: 'stash@{1}', message: 'WIP: 临时日志', time: now - 86400 },
  ]
}

let state: Snapshot = {
  info: {
    path: '/Users/gaochenjie/Documents/MC',
    name: 'MC',
    branch: 'main',
    detached: false,
    head: 'a1b2c3d4e5f60718',
    upstream: 'origin/main',
    ahead: 2,
    behind: 0,
    state: 'clean',
  },
  status: seedStatus(),
  branches: seedBranches(),
  stashes: seedStashes(),
  worktrees: [
    {
      path: '/tmp/grove-demo',
      head: 'a1b2c3d4e5f60718',
      branch: 'main',
      bare: false,
      prunable: false,
      main: true,
    },
  ],
  commits: seedCommits(),
  graph: layoutGraph(seedCommits()),
  hasMore: false,
}

export const MOCK_LOGS: LogEntry[] = [
  { id: 1, at: now - 4, cmd: 'git status --porcelain=v2 -z --branch', durationMs: 23, ok: true, output: '' },
  { id: 2, at: now - 3, cmd: 'git log --topo-order -n 250 --skip 0', durationMs: 41, ok: true, output: '' },
  { id: 3, at: now - 2, cmd: 'git for-each-ref refs/heads refs/remotes', durationMs: 12, ok: true, output: '' },
]

const phpDiff = (): FileDiff => ({
  path: 'src/Service/StockAllocator.php',
  oldPath: null,
  binary: false,
  additions: 12,
  deletions: 4,
  truncated: false,
  hunks: [
    {
      header: '@@ -42,7 +42,9 @@ class StockAllocator',
      oldStart: 42,
      oldLines: 7,
      newStart: 42,
      newLines: 9,
      lines: [
        { kind: ' ', oldNo: 42, newNo: 42, content: '    public function allocate(Order $order): void' },
        { kind: ' ', oldNo: 43, newNo: 43, content: '    {' },
        { kind: '-', oldNo: 44, newNo: null, content: '        $channel = $order->channel;' },
        { kind: '-', oldNo: 45, newNo: null, content: '        $stock = $this->repo->find($channel);' },
        { kind: '+', oldNo: null, newNo: 44, content: '        $channel = $order->channel ?? $this->defaultChannel();' },
        { kind: '+', oldNo: null, newNo: 45, content: '        $stock = $this->repo->findByChannel($channel);' },
        { kind: '+', oldNo: null, newNo: 46, content: '        if ($stock === null) {' },
        { kind: '+', oldNo: null, newNo: 47, content: '            throw new StockNotFoundException($channel);' },
        { kind: '+', oldNo: null, newNo: 48, content: '        }' },
        { kind: ' ', oldNo: 46, newNo: 49, content: '        $this->apply($order, $stock);' },
        { kind: ' ', oldNo: 47, newNo: 50, content: '    }' },
      ],
    },
    {
      header: '@@ -88,3 +91,5 @@ class StockAllocator',
      oldStart: 88,
      oldLines: 3,
      newStart: 91,
      newLines: 5,
      lines: [
        { kind: ' ', oldNo: 88, newNo: 91, content: '    private function defaultChannel(): string' },
        { kind: ' ', oldNo: 89, newNo: 92, content: '    {' },
        { kind: '+', oldNo: null, newNo: 93, content: '        return $this->config->get(\'default_channel\') ?? \'direct\';' },
        { kind: ' ', oldNo: 90, newNo: 94, content: '    }' },
      ],
    },
  ],
})

function genericDiff(path: string, scope: string): FileDiff {
  if (path.endsWith('.php')) return phpDiff()
  return {
    path,
    oldPath: null,
    binary: false,
    additions: 3,
    deletions: 1,
    truncated: false,
    hunks: [
      {
        header: '@@ -1,3 +1,5 @@',
        oldStart: 1,
        oldLines: 3,
        newStart: 1,
        newLines: 5,
        lines: [
          { kind: ' ', oldNo: 1, newNo: 1, content: `// ${path} (${scope})` },
          { kind: '-', oldNo: 2, newNo: null, content: '旧的一行内容' },
          { kind: '+', oldNo: null, newNo: 2, content: '新的内容 A' },
          { kind: '+', oldNo: null, newNo: 3, content: '新的内容 B' },
          { kind: ' ', oldNo: 3, newNo: 4, content: '上下文保持不动' },
        ],
      },
    ],
  }
}

const delay = (ms = 90) => new Promise((r) => setTimeout(r, ms))
const clone = <T,>(v: T): T => structuredClone(v)

export const mockApi = {
  async seedConflict(): Promise<void> {
    await delay(20)
  },
  async openRepo(path: string): Promise<Snapshot> {
    await delay(120)
    state.info.path = path
    state.info.name = path.split('/').filter(Boolean).pop() || 'repo'
    return clone(state)
  },
  async snapshot(): Promise<Snapshot> {
    await delay(40)
    return clone(state)
  },
  async authors(): Promise<string[]> {
    return ['张三', '李四', '王五']
  },
  async logPage(_skip: number): Promise<{ commits: Commit[]; graph: GraphRow[]; hasMore: boolean }> {
    await delay(40)
    return { commits: clone(state.commits), graph: clone(state.graph), hasMore: false }
  },
  async diff(path: string, scope: string): Promise<FileDiff> {
    await delay(40)
    return genericDiff(path, scope)
  },
  async commitDetail(sha: string): Promise<CommitDetail> {
    await delay(50)
    const c = state.commits.find((x) => x.sha === sha) || state.commits[0]
    return {
      commit: clone(c),
      additions: 340,
      deletions: 88,
      files: [
        { path: 'src/Service/StockAllocator.php', status: 'M', additions: 12, deletions: 4 },
        { path: 'src/Repo/StockRepository.php', status: 'M', additions: 48, deletions: 12 },
        { path: 'src/Http/AllocController.php', status: 'M', additions: 6, deletions: 6 },
        { path: 'tests/AllocTest.php', status: 'A', additions: 96, deletions: 0 },
        { path: 'composer.lock', status: 'M', additions: 178, deletions: 66 },
      ],
    }
  },
  async stageHunk(_file: string, _scope: string, _index: number): Promise<void> {
    await delay(80)
  },
  async blame(file: string) {
    await delay(40)
    const src = file.endsWith('.php')
      ? ['<?php', '', 'namespace App\\Service;', '', 'class ChannelResolver', '{', '    public function resolve(Order $order): string', '    {', "        return $order->channel ?? 'direct';", '    }', '}']
      : ['line one', 'line two', 'line three']
    return {
      path: file,
      lines: src.map((content, i) => ({
        line: i + 1,
        sha: i < 4 ? 'a1b2c3d4e5f60718' : '90ab12cd34ef5678',
        author: i < 4 ? '张三' : '李四',
        time: now - 3600 * (i + 1),
        content,
        summary: 'feat: 库存分配支持渠道维度',
      })),
    }
  },
  async stageLines(): Promise<void> {
    await delay(80)
  },
  async outgoing() {
    await delay(50)
    return {
      branch: state.info.branch,
      upstream: state.info.upstream,
      commits: state.commits.slice(0, 2).map((c) => ({ ...c })),
      fileCount: 5,
      additions: 58,
      deletions: 12,
      protected: true,
    }
  },
  async conflictDoc(file: string) {
    await delay(60)
    return {
      path: file,
      hasBase: false,
      blocks: [
        {
          ours: '    $channel = $order->channel ?? \'direct\';\n',
          base: '',
          theirs: '    $channel = $order->channel ?? $this->defaultChannel();\n',
        },
      ],
    }
  },
  async resolveConflict(_file: string, _choices: string[]): Promise<void> {
    await delay(80)
    state.status.conflicts = []
  },
  async checkoutSide(_file: string, _side: string): Promise<void> {
    await delay(80)
    state.status.conflicts = []
  },
  async stage(paths: string[]): Promise<void> {
    await delay(60)
    for (const p of paths) {
      const i = state.status.unstaged.findIndex((f) => f.path === p)
      if (i >= 0) {
        const f = state.status.unstaged.splice(i, 1)[0]
        const existing = state.status.staged.find((s) => s.path === p)
        if (!existing) state.status.staged.push({ ...f, staged: true, unstaged: false })
      }
    }
  },
  async unstage(paths: string[]): Promise<void> {
    await delay(60)
    for (const p of paths) {
      const i = state.status.staged.findIndex((f) => f.path === p)
      if (i >= 0) {
        const f = state.status.staged.splice(i, 1)[0]
        if (!state.status.unstaged.find((s) => s.path === p)) {
          state.status.unstaged.push({ ...f, staged: false, unstaged: true })
        }
      }
    }
  },
  async discard(paths: string[]): Promise<void> {
    await delay(60)
    state.status.unstaged = state.status.unstaged.filter((f) => !paths.includes(f.path))
  },
  async commit(message: string, amend: boolean): Promise<OpResult> {
    await delay(160)
    if (!amend) {
      const c = commit(
        Math.random().toString(16).slice(2, 18),
        [state.info.head],
        message.split('\n')[0],
        'gaochenjie',
        0,
        ['HEAD -> main'],
      )
      state.commits.unshift(c)
      state.graph = layoutGraph(state.commits)
      state.info.head = c.sha
    }
    state.status.staged = []
    return { ok: true, message: `[main ${state.info.head.slice(0, 7)}] ${message.split('\n')[0]}`, conflicted: false, output: '' }
  },
  async undoCommit(): Promise<OpResult> {
    await delay(80)
    if (state.commits.length > 1) {
      const [c] = state.commits.splice(0, 1)
      state.info.head = c.parents[0] ?? state.info.head
      state.graph = layoutGraph(state.commits)
      return { ok: true, message: '已撤销上次提交，改动仍在暂存区', conflicted: false, output: '' }
    }
    return { ok: false, message: '没有可撤销的提交', conflicted: false, output: '' }
  },
  async checkout(target: string): Promise<void> {
    await delay(120)
    state.info.branch = target
    state.info.detached = false
    state.branches = state.branches.map((b) => ({ ...b, current: b.name === target }))
  },
  async branches() {
    await delay(30)
    return clone(state.branches)
  },
  async pushBranch(branch: string): Promise<OpResult> {
    await delay(300)
    const b = state.branches.find((x) => x.name === branch)
    if (b) b.ahead = 0
    return { ok: true, message: `已推送 ${branch}`, conflicted: false, output: '' }
  },
  async trackRemote(remoteRef: string): Promise<OpResult> {
    await delay(120)
    return { ok: true, message: `已跟踪 ${remoteRef}`, conflicted: false, output: '' }
  },
  async renameBranch(oldName: string, newName: string): Promise<void> {
    await delay(80)
    state.branches = state.branches.map((b) => (b.name === oldName ? { ...b, name: newName } : b))
    if (state.info.branch === oldName) state.info.branch = newName
  },
  async compareBranches(other: string) {
    await delay(80)
    return {
      other,
      ahead: state.commits.slice(0, 2).map((c) => ({ ...c })),
      behind: state.commits.slice(2, 3).map((c) => ({ ...c })),
      fileCount: 4,
      additions: 52,
      deletions: 9,
    }
  },
  async prUrl(branch: string): Promise<string> {
    return `https://github.com/example/mc/compare/main...${branch}?expand=1`
  },
  async rebasePlan(): Promise<Commit[]> {
    await delay(40)
    return clone(state.commits.slice(0, 5).reverse())
  },
  async rebaseStart(): Promise<OpResult> {
    await delay(500)
    return { ok: true, message: '已整理 5 个提交', conflicted: false, output: '' }
  },
  async localOnly(): Promise<string[]> {
    return ['*_test.php', 'config/local.*']
  },
  async setLocalOnly(_patterns: string[]): Promise<void> {
    await delay(30)
  },
  async journal() {
    await delay(30)
    return [
      { seq: 3, at: now - 120, kind: 'commit', label: '撤销提交' },
      { seq: 2, at: now - 600, kind: 'branchDelete', label: '恢复分支' },
      { seq: 1, at: now - 1200, kind: 'stashDrop', label: '恢复贮藏' },
    ]
  },
  async undoLast(): Promise<OpResult> {
    await delay(80)
    return { ok: true, message: '已撤销上一步', conflicted: false, output: '' }
  },
  async createBranch(name: string): Promise<void> {
    await delay(80)
    state.branches.unshift({ name, sha: state.info.head, current: true, upstream: null, time: now, remote: false, ahead: 0, behind: 0, gone: false })
    state.info.branch = name
  },
  async deleteBranch(name: string): Promise<void> {
    await delay(60)
    state.branches = state.branches.filter((b) => b.name !== name)
  },
  async revertCommit(): Promise<OpResult> {
    await delay(200)
    return { ok: true, message: '已回滚该提交（生成反向提交）', conflicted: false, output: '' }
  },
  async merge(branch: string): Promise<OpResult> {
    await delay(200)
    return { ok: true, message: `已合并 ${branch}`, conflicted: false, output: '' }
  },
  async cherryPick(_shas: string[], noCommit: boolean): Promise<OpResult> {
    await delay(160)
    return {
      ok: true,
      message: noCommit ? '已遴选到工作区（未提交）' : '已遴选 1 个提交',
      conflicted: false,
      output: '',
    }
  },
  async stashPush(message: string, keepIndex: boolean): Promise<OpResult> {
    await delay(120)
    state.stashes.unshift({ index: 0, selector: 'stash@{0}', message: message || 'WIP', time: now })
    if (!keepIndex) state.status.unstaged = []
    return { ok: true, message: '已贮藏', conflicted: false, output: '' }
  },
  async stashApply(_selector: string, pop: boolean): Promise<OpResult> {
    await delay(120)
    if (pop) state.stashes.shift()
    return { ok: true, message: pop ? '已弹出贮藏' : '已应用贮藏', conflicted: false, output: '' }
  },
  async stashDrop(selector: string): Promise<void> {
    await delay(60)
    state.stashes = state.stashes.filter((s) => s.selector !== selector)
  },
  async fetchAll(): Promise<OpResult> {
    await delay(400)
    return { ok: true, message: '已抓取全部远端', conflicted: false, output: '' }
  },
  async pull(): Promise<OpResult> {
    await delay(400)
    return { ok: true, message: '已拉取', conflicted: false, output: '' }
  },
  async push(): Promise<OpResult> {
    await delay(400)
    state.info.ahead = 0
    return { ok: true, message: '已推送', conflicted: false, output: '' }
  },
  async cmdLog(): Promise<LogEntry[]> {
    return clone(MOCK_LOGS)
  },
}
