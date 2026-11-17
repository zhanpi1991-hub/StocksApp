import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/utils/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-accent font-semibold text-on-accent hover:bg-accent-2 active:brightness-95',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-faint hover:bg-surface active:brightness-95',
  ghost: 'text-muted hover:text-fg hover:bg-surface-2',
  danger: 'bg-down/10 text-down border border-down/30 hover:bg-down/20',
}

export function Button({ variant = 'secondary', size = 'md', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...p}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variants[variant],
        className,
      )}
    />
  )
}

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...p} aria-label={label} title={label} className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg', className)} />
}

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section {...p} className={cn('rounded-lg border border-line bg-surface shadow-card', className)}>
      {children}
    </section>
  )
}

export function CardHeader({ title, right, sub }: { title: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-fg">{title}</h2>
        {sub && <p className="mt-0.5 text-xs normal-case tracking-normal text-muted">{sub}</p>}
      </div>
      {right}
    </header>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />
}

export function SkeletonRows({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2.5 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={j === 0 ? 'w-1/3' : 'flex-1'} />
          ))}
        </div>
      ))}
    </div>
  )
}

const inputCls = 'h-9 w-full rounded-md border border-line bg-surface-2 px-3 text-sm text-fg transition placeholder:text-faint hover:border-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]'

export function Input({ label, error, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  const id = useId()
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
          {label}
        </label>
      )}
      <input id={id} {...p} aria-invalid={!!error} className={cn(inputCls, error && 'border-down')} />
      {error && <p className="mt-1 text-xs text-down">{error}</p>}
    </div>
  )
}

export function Select({ label, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId()
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">
          {label}
        </label>
      )}
      <select id={id} {...p} className={inputCls}>
        {children}
      </select>
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex overflow-x-auto rounded-md border border-line bg-bg p-0.5">
      {options.map((o) => (
        <button
          key={o}
          role="tab"
          aria-selected={o === value}
          onClick={() => onChange(o)}
          className={cn('rounded px-2.5 py-1 text-xs font-medium transition', o === value ? 'bg-surface-2 text-accent shadow-[inset_0_0_0_1px_rgba(214,182,108,0.35)]' : 'text-muted hover:text-fg')}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span role="tooltip" className="pointer-events-none absolute left-1/2 top-full z-30 mt-1.5 w-max max-w-64 -translate-x-1/2 rounded-md border border-line bg-surface-2 px-2.5 py-1.5 text-xs text-fg opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="fade-in w-full max-w-md rounded-lg border border-line bg-surface shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-max text-left text-[13px]">{children}</table>
    </div>
  )
}
export const th = 'whitespace-nowrap border-b border-line px-4 py-2.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted'
export const td = 'whitespace-nowrap border-b border-line/50 px-4 py-2.5'
