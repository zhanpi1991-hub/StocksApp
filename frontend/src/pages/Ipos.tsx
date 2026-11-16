import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, CardHeader, Segmented, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { fmtCompact } from '@/utils/format'

export default function Ipos() {
  const [mode, setMode] = useState<'Upcoming' | 'Past 30 days'>('Upcoming')
  const q = useQuery({ queryKey: ['ipo'], queryFn: () => api.ipo() })
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">IPO calendar</h1>
      <Card>
        <CardHeader title="Initial public offerings" right={<Segmented label="IPO range" options={['Upcoming', 'Past 30 days'] as const} value={mode} onChange={setMode} />} />
        <EnvelopeView query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No IPOs returned for this window">
          {(d) => {
            const items = d.items.filter((i) => (mode === 'Upcoming' ? (i.date ?? '') >= today : (i.date ?? '') < today))
            if (!items.length) return <p className="p-6 text-center text-sm text-muted">No {mode.toLowerCase()} IPOs in the provider data.</p>
            return (
              <Table><thead><tr><th className={th}>Date</th><th className={th}>Company</th><th className={th}>Symbol</th><th className={th}>Exchange</th><th className={th + ' text-right'}>Price range</th><th className={th + ' text-right'}>Shares</th><th className={th + ' text-right'}>Value</th><th className={th}>Status</th></tr></thead>
                <tbody>{items.map((i, k) => <tr key={k}><td className={td + ' num'}>{i.date}</td><td className={td + ' max-w-64 truncate'}>{i.company}</td><td className={td}>{i.symbol ? <Link className="font-medium hover:text-accent" to={`/stocks/${i.symbol}`}>{i.symbol}</Link> : '—'}</td><td className={td + ' text-muted'}>{i.exchange ?? '—'}</td><td className={td + ' num text-right'}>{i.price_range ?? '—'}</td><td className={td + ' num text-right'}>{fmtCompact(i.shares)}</td><td className={td + ' num text-right'}>{fmtCompact(i.total_value)}</td><td className={td + ' capitalize'}>{i.status ?? '—'}</td></tr>)}</tbody></Table>
            )
          }}
        </EnvelopeView>
      </Card>
    </div>
  )
}
