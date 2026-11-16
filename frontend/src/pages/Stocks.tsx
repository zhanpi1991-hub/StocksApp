import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Button, Card, CardHeader, Input, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { Change } from '@/components/market/bits'
import { fmtPrice } from '@/utils/format'

const POPULAR = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM']

function MoversCard({ kind, title }: { kind: 'gainers' | 'losers' | 'active'; title: string }) {
  const q = useQuery({ queryKey: ['movers', kind], queryFn: () => api.movers(kind) })
  return (
    <Card>
      <CardHeader title={title} />
      <EnvelopeView query={q} isEmpty={(d) => d.length === 0}>
        {(rows) => (
          <Table>
            <tbody>
              {rows.slice(0, 8).map((m) => (
                <tr key={m.symbol}>
                  <td className={td}><Link className="font-medium hover:text-accent" to={`/stocks/${m.symbol}`}>{m.symbol}</Link></td>
                  <td className={td + ' num text-right'}>{fmtPrice(m.price)}</td>
                  <td className={td + ' text-right'}><Change v={m.change_pct} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </EnvelopeView>
    </Card>
  )
}

function QuoteRow({ symbol }: { symbol: string }) {
  const q = useQuery({ queryKey: ['quote', symbol], queryFn: () => api.stockQuote(symbol), refetchInterval: 30_000 })
  const d = q.data?.data
  return (
    <tr>
      <td className={td}><Link className="font-medium hover:text-accent" to={`/stocks/${symbol}`}>{symbol}</Link></td>
      <td className={td + ' num text-right'}>{q.isLoading ? <span className="skeleton inline-block h-3 w-14" /> : d ? fmtPrice(d.price) : '—'}</td>
      <td className={td + ' text-right'}>{d ? <Change v={d.change_pct} /> : <span className="text-xs text-muted" title={q.data?.meta.message ?? ''}>unavailable</span>}</td>
    </tr>
  )
}

export default function Stocks() {
  const [sym, setSym] = useState('')
  const nav = useNavigate()
  const probe = useQuery({ queryKey: ['quote', 'AAPL'], queryFn: () => api.stockQuote('AAPL') })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Stocks</h1>
      <Card className="p-4">
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (sym.trim()) nav(`/stocks/${sym.trim().toUpperCase()}`) }}>
          <Input label="Open a stock by ticker" placeholder="e.g. AAPL" value={sym} onChange={(e) => setSym(e.target.value)} className="max-w-xs flex-1" />
          <Button type="submit" variant="primary">Open</Button>
        </form>
        <p className="mt-2 text-xs text-muted">Use the global search (Ctrl K) to find companies by name.</p>
      </Card>
      {probe.data?.meta.status === 'unavailable' && (
        <Card className="border-warn/40 p-4 text-sm">
          <p className="font-medium text-warn">Stock data provider not available</p>
          <p className="mt-1 text-xs text-muted">{probe.data.meta.message} See the <Link className="text-accent" to="/status">Data providers</Link> page.</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Popular" />
          <Table><thead><tr><th className={th}>Symbol</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Change</th></tr></thead>
            <tbody>{POPULAR.map((s) => <QuoteRow key={s} symbol={s} />)}</tbody></Table>
        </Card>
        <div className="space-y-4 lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          <MoversCard kind="gainers" title="Top gainers" />
          <MoversCard kind="losers" title="Top losers" />
          <div className="lg:col-span-2"><MoversCard kind="active" title="Most active" /></div>
        </div>
      </div>
    </div>
  )
}
