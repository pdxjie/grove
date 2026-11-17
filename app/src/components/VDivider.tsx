import { cn } from '../lib/utils'

export function VDivider({
  value,
  min,
  max,
  onChange,
  invert,
  className,
}: {
  value: number
  min: number
  max: number
  onChange: (w: number) => void
  invert?: boolean
  className?: string
}) {
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = value
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const next = invert ? startW - dx : startW + dx
      onChange(Math.max(min, Math.min(max, next)))
    }
    const up = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      className={cn('group relative z-10 w-[5px] shrink-0 cursor-col-resize select-none', className)}
      title="拖动调整宽度"
    >
      <div className="pointer-events-none absolute inset-y-0 left-[2px] w-px bg-line/60 transition group-hover:bg-accent/70" />
    </div>
  )
}
