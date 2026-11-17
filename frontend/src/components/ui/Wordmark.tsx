import { cn } from '@/utils/format'

/**
 * StocksApp typographic wordmark. "Stocks" in champagne gold, "App" in warm white, one font and baseline,
 * no icon. Colours come from the --brand-a / --brand-b tokens (the light theme darkens both so the mark
 * stays legible on a light surface).
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('select-none whitespace-nowrap font-sans font-semibold leading-none tracking-[-0.03em]', className)}>
      <span style={{ color: 'var(--brand-a)' }}>Stocks</span>
      <span style={{ color: 'var(--brand-b)' }}>App</span>
    </span>
  )
}
