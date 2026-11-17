import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('animate-spin', className)} />
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-[rgb(var(--accent-ink))] font-semibold shadow-[0_1px_0_rgba(255,255,255,.25)_inset,0_6px_18px_-10px_rgba(255,107,87,.8)] hover:brightness-110 active:brightness-95',
  secondary:
    'border border-line bg-elevated/80 text-ink hover:border-linestrong hover:bg-elevated',
  ghost: 'text-muted hover:bg-elevated hover:text-ink',
  danger: 'border border-red/30 bg-red/10 text-red hover:bg-red/15',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  loading,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'md'
  icon?: LucideIcon
  loading?: boolean
}) {
  return (
    <button
      type="button"
      disabled={props.disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[7px] font-medium transition disabled:pointer-events-none disabled:opacity-40',
        size === 'sm' ? 'h-[24px] px-2 text-[10.5px]' : 'h-[27px] px-2.5 text-[11.5px]',
        variants[variant],
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={12} /> : Icon ? <Icon size={13} strokeWidth={2} /> : null}
      {children}
    </button>
  )
}

export function IconButton({
  icon: Icon,
  label,
  active,
  className,
  size = 14,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon
  label: string
  active?: boolean
  size?: number
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted transition hover:bg-elevated hover:text-ink active:scale-[0.94] disabled:opacity-35',
        active && 'bg-elevated text-ink',
        className,
      )}
      {...props}
    >
      <Icon size={size} strokeWidth={1.9} />
    </button>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string }[]
}) {
  return (
    <div className="flex h-[27px] items-center gap-0.5 rounded-[8px] border border-line/80 bg-panel p-0.5">
      {items.map((it) => (
        <button
          key={it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'h-[21px] rounded-[6px] px-2.5 text-[11.5px] transition',
            value === it.value
              ? 'bg-elevated font-medium text-ink shadow-[0_1px_0_rgba(255,255,255,.04)_inset]'
              : 'text-faint hover:text-muted',
          )}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Modal({
  open,
  onClose,
  children,
  width = 420,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 pt-[14vh] backdrop-blur-[2px] animate-fade-in">
      <div
        className="overflow-hidden rounded-[14px] border border-line-strong/60 bg-panel2 shadow-pop animate-pop-in"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
      <button className="absolute inset-0 -z-10 cursor-default" onClick={onClose} aria-label="关闭" />
    </div>
  )
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string
  subtitle?: string
  onClose?: () => void
}) {
  return (
    <div className="flex items-start justify-between border-b border-line/70 px-4 py-3">
      <div>
        <div className="text-[13px] font-semibold text-ink">{title}</div>
        {subtitle && <div className="mt-0.5 text-[11px] text-faint">{subtitle}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} className="icon-btn -mr-1 -mt-0.5">
          <X size={14} />
        </button>
      )}
    </div>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[10.5px] text-faint">{hint}</span>}
      </div>
      {children}
    </label>
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-2.5 rounded-[8px] px-1 py-1.5 text-left transition hover:bg-elevated/40"
    >
      <span
        className={cn(
          'mt-[1px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border transition',
          checked ? 'border-accent bg-accent text-[rgb(var(--accent-ink))]' : 'border-linestrong bg-panel',
        )}
      >
        {checked && (
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
            <path d="M1.5 5.2 3.9 7.5 8.5 2.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-[10.5px] leading-[15px] text-faint">{hint}</span>}
      </span>
    </button>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <div className="mb-1 flex h-9 w-9 items-center justify-center rounded-[10px] border border-line bg-panel text-faint">
        <Icon size={16} strokeWidth={1.6} />
      </div>
      <div className="text-[12.5px] text-muted">{title}</div>
      {hint && <div className="max-w-[260px] text-[11px] leading-[16px] text-faint">{hint}</div>}
      {action}
    </div>
  )
}

export interface MenuItem {
  label?: string
  icon?: LucideIcon
  hint?: string
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  onClick?: () => void
}

export function Menu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - items.length * 28 - 20)

  return (
    <div
      ref={ref}
      className="fixed z-[90] w-[228px] overflow-hidden rounded-[10px] border border-line-strong/70 bg-panel2/95 p-1 shadow-pop backdrop-blur-xl animate-pop-in"
      style={{ left, top }}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="my-1 h-px bg-line/70" />
        ) : (
          <button
            key={i}
            disabled={it.disabled}
            onClick={() => {
              it.onClick?.()
              onClose()
            }}
            className={cn(
              'flex h-[27px] w-full items-center gap-2 rounded-[6px] px-2 text-left text-[11.5px] transition disabled:opacity-35',
              it.danger ? 'text-red hover:bg-red/10' : 'text-ink hover:bg-elevated',
            )}
          >
            {it.icon && <it.icon size={13} strokeWidth={1.8} className={it.danger ? 'text-red' : 'text-muted'} />}
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <span className="text-[10px] text-faint">{it.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}
