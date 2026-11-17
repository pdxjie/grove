import { getCurrentWindow } from '@tauri-apps/api/window'
import { IS_TAURI } from './api'

function isInteractive(e: React.MouseEvent) {
  const t = e.target as HTMLElement | null
  return !!t?.closest('button, a, input, textarea, select, [role="button"], [data-no-drag]')
}

/**
 * Start a native window drag once the pointer moves a few pixels, so a plain
 * click (and double-click to maximize) still works on the same bar.
 */
export function beginWindowDrag(e: React.MouseEvent) {
  if (!IS_TAURI || e.button !== 0 || isInteractive(e)) return
  const win = getCurrentWindow()
  const startX = e.clientX
  const startY = e.clientY
  let started = false

  const cleanup = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  const move = (ev: MouseEvent) => {
    if (started) return
    if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
    started = true
    cleanup()
    void win.startDragging()
  }
  const up = () => cleanup()

  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

export function beginWindowMaximize(e: React.MouseEvent) {
  if (!IS_TAURI || e.button !== 0 || isInteractive(e)) return
  void getCurrentWindow().toggleMaximize()
}
