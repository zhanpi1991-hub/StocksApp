import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, CardHeader, Input, Segmented, Select, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { cn, fmtDateTime, fmtNum } from '@/utils/format'

const impactCls: Record<string, string> = { high: 'bg-down/15 text-down', medium: 'bg-warn/15 text-warn', low: 'bg-surface-2 text-muted' }

export default function Calendar() {
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10))
  const [impact, setImpact] = useState('')
  const [country, setCountry] = useState('')
  const q = useQuery({ queryKey: ['econ', view, start, impact, country], queryFn: () => api.economic({ view, start, impact: impact || undefined, country: country || undefined }) })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Economic calendar</h1>
      <Card>
        <CardHeader title="Events" right={<Segmented label="Calendar view" options={['day', 'week', 'month'] as const} value={view} onChange={setView} />} />
        <div className="flex flex-wrap gap-3 border-b border-line p-3">
          <Input label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-44" />
          <Select label="Impact" value={impact} onChange={(e) => setImpact(e.target.value)} className="w-36"><option value="">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select>
          <Input label="Country code" placeholder="US" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} className="w-28" />
        </div>
        <EnvelopeView query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No events in this range" emptyHint="The provider returned no events, or filters excluded them.">
          {(d) => (
            <Table><thead><tr><th className={th}>Time</th><th className={th}>Country</th><th className={th}>Event</th><th className={th}>Impact</th><th className={th + ' text-right'}>Previous</th><th className={th + ' text-right'}>Forecast</th><th className={th + ' text-right'}>Actual</th></tr></thead>
              <tbody>{d.items.map((e, i) => <tr key={i}><td className={td + ' num text-muted'}>{fmtDateTime(e.time)}</td><td className={td}>{e.country ?? '—'} {e.currency && <span className="text-xs text-muted">{e.currency}</span>}</td><td className={td + ' max-w-80 truncate'} title={e.event}>{e.event}</td>
                <td className={td}>{e.impact ? <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', impactCls[e.impact] ?? impactCls.low)}>{e.impact}</span> : '—'}</td>
                <td className={td + ' num text-right'}>{fmtNum(e.previous, 3)}</td><td className={td + ' num text-right'}>{fmtNum(e.forecast, 3)}</td><td className={td + ' num text-right font-medium'}>{fmtNum(e.actual, 3)}</td></tr>)}</tbody></Table>
          )}
        </EnvelopeView>
      </Card>
    </div>
  )
}
