import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

export interface SelectOption {
  value: string
  label: string
  hint?: string
  group?: string
  disabled?: boolean
  icon?: LucideIcon
}

export function Select({
  value,
  options,
  onChange,
  icon: Icon,
  width = 216,
  title,
  className,
  initialOpen,
}: {
  value: string
  options: SelectOption[]
  onChange: (v: string) => void
  icon?: LucideIcon
  width?: number
  title?: string
  className?: string
  initialOpen?: boolean
}) {
  const [open, setOpen] = useState(!!initialOpen)
  const ref = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  let lastGroup: string | undefined

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={title}
        className={cn(
          'flex h-[23px] items-center gap-1 rounded-[6px] border px-1.5 text-[11.5px] transition',
          open
            ? 'border-accent/50 bg-panel2 text-ink'
            : 'border-line bg-panel text-muted hover:border-linestrong hover:text-ink',
          className,
        )}
      >
        {Icon && <Icon size={11} className="shrink-0 text-faint" />}
        <span className="max-w-[110px] truncate">{current?.label}</span>
        <ChevronDown
          size={10}
          className={cn('shrink-0 text-faint transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div
          className="animate-pop-in absolute left-0 top-[27px] z-[70] overflow-hidden rounded-[9px] border border-line-strong/60 bg-panel2 shadow-pop"
          style={{ width }}
        >
          <div className="max-h-[320px] overflow-y-auto p-1 scroll-thin">
            {options.map((o) => {
              const header = o.group && o.group !== lastGroup ? o.group : null
              lastGroup = o.group
              return (
                <div key={`${o.group ?? ''}-${o.value}`}>
                  {header && (
                    <div className="px-2 pb-0.5 pt-1.5 text-[10px] uppercase tracking-[0.12em] text-faint/80">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={o.disabled}
                    onClick={() => {
                      onChange(o.value)
                      setOpen(false)
                    }}
                    className={cn(
                      o.disabled && 'pointer-events-none opacity-35',
                      'flex h-[26px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[12px] transition',
                      o.value === value
                        ? 'bg-elevated text-ink'
                        : 'text-muted hover:bg-elevated/60 hover:text-ink',
                    )}
                    title={o.disabled ? '第一行不能是合并操作' : undefined}
                  >
                    {o.icon && <o.icon size={12} className="shrink-0 text-faint" />}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="shrink-0 text-[10.5px] text-faint">{o.hint}</span>}
                    {o.value === value && <Check size={11} strokeWidth={2.6} className="shrink-0 text-accent" />}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
