import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellOff, RotateCcw, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { Card, CardHeader, IconButton, SkeletonRows, Table, td, th } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/DataState'
import { instrumentPath } from '@/components/market/bits'
import { cn, dec, errMsg, fmtDateTime } from '@/utils/format'

const LABEL = { above: 'Price ≥', below: 'Price ≤', pct_up: 'Rises by', pct_down: 'Falls by' }

export default function Alerts() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['alerts'], queryFn: api.alerts, refetchInterval: 30_000 })
  const done = () => qc.invalidateQueries({ queryKey: ['alerts'] })
  const del = useMutation({ mutationFn: api.deleteAlert, onSuccess: done })
  const re = useMutation({ mutationFn: api.reactivateAlert, onSuccess: done })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Price alerts</h1>
      <Card className="flex items-start gap-3 border-warn/30 p-4 text-sm"><BellOff size={16} className="mt-0.5 shrink-0 text-warn" /><p className="text-muted">{q.data?.delivery ?? 'Alerts are evaluated on the server every minute. No email or push channel is configured, so triggered alerts appear here and as a live event while the app is open.'} Create alerts with the bell button on any stock, coin or currency pair page.</p></Card>
      <Card>
        <CardHeader title="Your alerts" />
        {q.isLoading ? <SkeletonRows /> : q.isError ? <ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /> : !q.data?.items.length ? <EmptyState title="No alerts yet" hint="Open an instrument page and click the bell to create one." /> : (
          <Table><thead><tr><th className={th}>Instrument</th><th className={th}>Condition</th><th className={th}>Status</th><th className={th}>Last check</th><th className={th}></th></tr></thead>
            <tbody>{q.data.items.map((a) => (
              <tr key={a.id}><td className={td}><Link className="font-medium hover:text-accent" to={instrumentPath(a.asset_type, a.symbol)}>{a.symbol}</Link></td>
                <td className={td + ' num'}>{LABEL[a.condition]} {dec(a.threshold, 4)}{a.condition.startsWith('pct') ? '%' : ''}{a.reference_price && <span className="text-xs text-muted"> (from {dec(a.reference_price, 4)})</span>}</td>
                <td className={td}>{a.triggered_at ? <span className="text-up">Triggered at {dec(a.triggered_price, 4)} · {fmtDateTime(a.triggered_at)}</span> : a.active ? <span className={cn(a.last_error ? 'text-warn' : 'text-accent')} title={a.last_error ?? ''}>{a.last_error ? 'Active - price unavailable' : 'Active'}</span> : 'Inactive'}</td>
                <td className={td + ' text-xs text-muted'}>{fmtDateTime(a.last_checked_at)}</td>
                <td className={td + ' text-right'}>{!a.active && <IconButton label="Re-arm alert" onClick={() => re.mutate(a.id)}><RotateCcw size={14} /></IconButton>}<IconButton label="Delete alert" onClick={() => del.mutate(a.id)}><Trash2 size={14} /></IconButton></td></tr>))}</tbody></Table>)}
      </Card>
    </div>
  )
}
