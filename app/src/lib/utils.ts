import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor(Date.now() / 1000 - ts))
  if (s < 60) return `${s} 秒前`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo} 个月前`
  return `${Math.floor(mo / 12)} 年前`
}

export function shortSha(sha: string) {
  return sha.slice(0, 7)
}

export function wildcardMatch(pattern: string, text: string): boolean {
  const p = [...pattern]
  const t = [...text]
  let pi = 0
  let ti = 0
  let star = -1
  let mark = 0
  while (ti < t.length) {
    if (pi < p.length && (p[pi] === '?' || p[pi] === t[ti])) {
      pi++
      ti++
    } else if (pi < p.length && p[pi] === '*') {
      star = pi++
      mark = ti
    } else if (star >= 0) {
      pi = star + 1
      ti = ++mark
    } else {
      return false
    }
  }
  while (pi < p.length && p[pi] === '*') pi++
  return pi === p.length
}

export function isLocalOnlyPath(patterns: string[], path: string): boolean {
  return patterns.some((p) => wildcardMatch(p, path))
}
