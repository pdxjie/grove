import type { Commit, GraphRow } from './types'

/** Lane layout; must mirror core/src/graph.rs so paged results stay consistent. */
export function layoutGraph(commits: Commit[]): GraphRow[] {
  const active: (string | null)[] = []
  const firstFree = () => {
    const i = active.indexOf(null)
    if (i >= 0) return i
    active.push(null)
    return active.length - 1
  }
  const rows: GraphRow[] = []
  for (const c of commits) {
    let lane = active.findIndex((s) => s === c.sha)
    if (lane < 0) lane = firstFree()
    active[lane] = null
    const parentLanes: number[] = []
    c.parents.forEach((p, idx) => {
      let target = active.findIndex((s) => s === p)
      if (target < 0) target = idx === 0 ? lane : firstFree()
      while (active.length <= target) active.push(null)
      active[target] = p
      parentLanes.push(target)
    })
    const lines = active
      .map((s, i) => (s !== null && i !== lane ? i : -1))
      .filter((i) => i >= 0)
    if (parentLanes[0] === lane) lines.push(lane)
    lines.sort((a, b) => a - b)
    const lanes = Math.max(lane + 1, ...active.map((s, i) => (s !== null ? i + 1 : 0)))
    rows.push({ sha: c.sha, lane, lanes, lines, parentLanes, merge: c.parents.length > 1 })
    while (active.length && active[active.length - 1] === null) active.pop()
  }
  return rows
}
