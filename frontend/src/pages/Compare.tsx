import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { api } from '@/services/api'
import { Button, Card, CardHeader, Input, Table, td, th } from '@/components/ui/primitives'
import { ErrorState, EmptyState } from '@/components/ui/DataState'
import { SkeletonRows } from '@/components/ui/primitives'
import { Change } from '@/components/market/bits'
import { CompareLines } from '@/components/charts/RechartsViews'
import { errMsg, fmtCompact, fmtNum, fmtPct, fmtPrice } from '@/utils/format'
import type { CompareRow } from '@/types/api'

const ROWS: { label: string; get: (r: CompareRow) => React.ReactNode }[] = [
  { label: 'Price', get: (r) => fmtPrice(r.price) },
  { label: 'Day change', get: (r) => <Change v={r.change_pct} /> },
  { label: 'Market cap', get: (r) => fmtCompact(r.market_cap) },
  { label: 'Revenue (latest FY)', get: (r) => fmtCompact(r.revenue) },
  { label: 'Net income (latest FY)', get: (r) => fmtCompact(r.net_income) },
  { label: 'EPS (TTM)', get: (r) => fmtNum(r.eps) },
  { label: 'P/E (TTM)', get: (r) => fmtNum(r.pe) },
  { label: 'Dividend yield', get: (r) => (r.dividend_yield != null ? fmtPct(r.dividend_yield, 2, false) : '—') },
  { label: '1Y performance', get: (r) => { const p = r.performance_1y; return p.length > 1 ? <Change v={(p[p.length - 1].value / p[0].value - 1) * 100} /> : '—' } },
]

export default function Compare() {
  const [input, setInput] = useState('')
  const [symbols, setSymbols] = useState<string[]>(['AAPL', 'MSFT'])
  const q = useQuery({ queryKey: ['compare', symbols], queryFn: () => api.compare(symbols.join(',')), enabled: symbols.length >= 2 })
  const add = () => {
    const s = input.trim().toUpperCase()
    if (s && !symbols.includes(s) && symbols.length < 5) setSymbols([...symbols, s])
    setInput('')
  }
  const rows = q.data?.data ?? []
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Compare companies</h1>
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add() }}>
          <Input label="Add ticker (2-5 companies)" value={input} onChange={(e) => setInput(e.target.value)} className="w-56" />
          <Button type="submit" disabled={symbols.length >= 5}>Add</Button>
          <div className="flex flex-wrap gap-1.5">{symbols.map((s) => <span key={s} className="num inline-flex items-center gap-1 rounded-full bg-accent/15 px-2.5 py-1 text-xs text-accent">{s}<button aria-label={`Remove ${s}`} onClick={() => setSymbols(symbols.filter((x) => x !== s))}><X size={12} /></button></span>)}</div>
        </form>
      </Card>
      {symbols.length < 2 && <Card><EmptyState title="Add at least two tickers" /></Card>}
      {q.isLoading && <Card><SkeletonRows /></Card>}
      {q.isError && <Card><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card>}
      {rows.length > 0 && (
        <>
          <Card>
            <CardHeader title="Fundamentals &amp; valuation" />
            <Table><thead><tr><th className={th}>Metric</th>{rows.map((r) => <th key={r.symbol} className={th + ' text-right'}>{r.symbol}<br /><span className="font-normal">{r.name}</span></th>)}</tr></thead>
              <tbody>{ROWS.map((row) => <tr key={row.label}><td className={td + ' text-muted'}>{row.label}</td>{rows.map((r) => <td key={r.symbol} className={td + ' num text-right'}>{row.get(r)}</td>)}</tr>)}</tbody></Table>
            {rows.some((r) => r.messages.length) && <div className="border-t border-line px-4 py-2 text-[11px] text-muted">Some data is unavailable: {[...new Set(rows.flatMap((r) => r.messages))].join(' | ')}</div>}
          </Card>
          <Card>
            <CardHeader title="1-year performance (rebased to 100)" />
            {rows.some((r) => r.performance_1y.length) ? <div className="p-3"><CompareLines series={rows.map((r) => ({ name: r.symbol, points: r.performance_1y }))} /></div> : <EmptyState title="No price history available" hint="Price history requires a Twelve Data API key." />}
          </Card>
        </>
      )}
    </div>
  )
}
