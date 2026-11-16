import type { DataStatus } from '@/types/api'
import { cn } from '@/utils/format'
import { Tooltip } from './primitives'

const STYLE: Record<DataStatus, { label: string; cls: string; hint: string }> = {
  realtime: { label: 'REAL-TIME', cls: 'bg-up/15 text-up', hint: 'Provider reports real-time data.' },
  delayed: { label: 'DELAYED', cls: 'bg-accent/15 text-accent', hint: 'Provider data may be delayed or aggregated; not tick-level real time.' },
  historical: { label: 'HISTORICAL', cls: 'bg-surface-2 text-muted', hint: 'Historical (past) data.' },
  cached: { label: 'CACHED', cls: 'bg-warn/15 text-warn', hint: 'Provider failed; showing the last cached response.' },
  unavailable: { label: 'UNAVAILABLE', cls: 'bg-down/15 text-down', hint: 'No data available from the provider.' },
  demo: { label: 'DEMO SAMPLE', cls: 'bg-warn/20 text-warn', hint: 'Illustrative sample data, not real market data.' },
}

export function StatusBadge({ status, className }: { status: DataStatus; className?: string }) {
  const s = STYLE[status]
  return (
    <Tooltip text={s.hint}>
      <span tabIndex={0} className={cn('inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider', s.cls, className)}>
        {s.label}
      </span>
    </Tooltip>
  )
}
