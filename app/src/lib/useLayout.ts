import { useCallback, useState } from 'react'

export function useLayoutWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(() => {
    const raw = Number(localStorage.getItem(key))
    return Number.isFinite(raw) && raw >= min ? Math.min(raw, max) : initial
  })
  const update = useCallback(
    (w: number) => {
      const next = Math.max(min, Math.min(max, w))
      setWidth(next)
      localStorage.setItem(key, String(next))
    },
    [key, min, max],
  )
  return [width, update] as const
}
