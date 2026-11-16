import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Card, CardHeader, Segmented, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AlertButton, Change, Logo, WatchButton } from '@/components/market/bits'
import { PriceChart } from '@/components/charts/PriceChart'
import { ArticleList } from '@/components/market/ArticleList'
import { useLiveQuote } from '@/hooks/useLive'
import { cn, fmtCompact, fmtNum, fmtPct, fmtPrice, tone } from '@/utils/format'

const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const
const TABS = ['Financials', 'Earnings', 'Dividends', 'News'] as const

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[11px] text-muted">{k}</p>
      <p className="num mt-0.5 text-sm font-medium">{v}</p>
    </div>
  )
}

function pretty(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim()
}

function Statements({ symbol }: { symbol: string }) {
  const [kind, setKind] = useState<'income' | 'balance' | 'cashflow'>('income')
  const [period, setPeriod] = useState<'annual' | 'quarter'>('annual')
  const q = useQuery({ queryKey: ['statements', symbol, kind, period], queryFn: () => api.statements(symbol, kind, period) })
  return (
    <>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <Segmented label="Statement" options={['income', 'balance', 'cashflow'] as const} value={kind} onChange={setKind} />
        <Segmented label="Period" options={['annual', 'quarter'] as const} value={period} onChange={setPeriod} />
      </div>
      <EnvelopeView query={q} isEmpty={(d) => d.length === 0} emptyTitle="No statements returned">
        {(rows) => {
          const keys = Object.keys(rows[0]).filter((k) => typeof rows[0][k] === 'number')
          return (
            <Table>
              <thead><tr><th className={th}>{kind === 'income' ? 'Income statement' : kind === 'balance' ? 'Balance sheet' : 'Cash flow'}</th>
                {rows.map((r, i) => <th key={i} className={th + ' text-right'}>{String(r.fiscalYear ?? '')} {String(r.period ?? '')}<br /><span className="font-normal">{String(r.date ?? '')}</span></th>)}</tr></thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k}><td className={td + ' text-muted'}>{pretty(k)}</td>
                    {rows.map((r, i) => <td key={i} className={td + ' num text-right'}>{/eps|ratio/i.test(k) ? fmtNum(r[k] as number) : fmtCompact(r[k] as number)}</td>)}</tr>
                ))}
              </tbody>
            </Table>
          )
        }}
      </EnvelopeView>
    </>
  )
}

export default function StockDetail() {
  const { symbol = '' } = useParams()
  const sym = symbol.toUpperCase()
  const [range, setRange] = useState<(typeof RANGES)[number]>('1Y')
  const [candles, setCandles] = useState(false)
  const [tab, setTab] = useState<(typeof TABS)[number]>('Financials')
  const ov = useQuery({ queryKey: ['overview', sym], queryFn: () => api.stockOverview(sym), refetchInterval: 60_000 })
  const hist = useQuery({ queryKey: ['history', sym, range], queryFn: () => api.stockHistory(sym, range) })
  const earn = useQuery({ queryKey: ['earnings', sym], queryFn: () => api.earnings(sym), enabled: tab === 'Earnings' })
  const div = useQuery({ queryKey: ['dividends', sym], queryFn: () => api.dividends(sym), enabled: tab === 'Dividends' })
  const news = useQuery({ queryKey: ['stock-news', sym], queryFn: () => api.stockNews(sym), enabled: tab === 'News' })
  const liveQ = useLiveQuote(`stock:${sym}`)

  const rest = ov.data?.quote.data
  const live = liveQ?.data?.price != null ? liveQ : null
  const price = live ? live.data!.price : rest?.price
  const pct = live ? live.data!.change_pct : rest?.change_pct
  const status = live ? live.status : ov.data?.quote.meta.status
  const p = ov.data?.profile.data
  const m = ov.data?.metrics.data
  const qd = rest

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo src={p?.logo} name={sym} />
            <div>
              <h1 className="text-xl font-semibold">{p?.name ?? sym} <span className="num text-base text-muted">{sym}</span></h1>
              <p className="text-xs text-muted">{[p?.exchange, p?.industry, p?.country].filter(Boolean).join(' · ') || 'Company profile unavailable'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <WatchButton assetType="stock" symbol={sym} name={p?.name} />
            <AlertButton assetType="stock" symbol={sym} name={p?.name} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-x-6 gap-y-2">
          {ov.isLoading ? <div className="skeleton h-9 w-40" /> : price != null ? (
            <>
              <span className="num text-3xl font-semibold">{fmtPrice(price)}</span>
              <span className={cn('num text-lg', tone(pct))}>{fmtPct(pct)}</span>
            </>
          ) : <span className="text-sm text-muted">{ov.data?.quote.meta.message ?? 'Price unavailable'}</span>}
          {status && <StatusBadge status={status} />}
          {live && <span className="text-[11px] text-muted">live via WebSocket (polling every {liveQ?.interval_seconds}s)</span>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Price chart" right={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Chart type" options={['Area', 'Candles'] as const} value={candles ? 'Candles' : 'Area'} onChange={(v) => setCandles(v === 'Candles')} />
            <Segmented label="Chart range" options={RANGES} value={range} onChange={setRange} />
          </div>} />
        <EnvelopeView query={hist} isEmpty={(d) => d.length === 0} emptyTitle="No price history for this range" emptyHint="This interval may not be supported for this symbol by the provider.">
          {(c) => <div className="p-2">{candles ? <PriceChart mode="candle" candles={c} /> : <PriceChart mode="line" points={c.map((x) => ({ time: x.time, value: x.close }))} />}</div>}
        </EnvelopeView>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Key statistics" />
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 md:grid-cols-4">
            <Stat k="Open" v={fmtPrice(qd?.open)} /><Stat k="High" v={fmtPrice(qd?.high)} />
            <Stat k="Low" v={fmtPrice(qd?.low)} /><Stat k="Previous close" v={fmtPrice(qd?.prev_close)} />
            <Stat k="Volume" v={fmtCompact(qd?.volume)} /><Stat k="Market cap" v={fmtCompact(p?.market_cap)} />
            <Stat k="P/E (TTM)" v={fmtNum(m?.pe)} /><Stat k="EPS (TTM)" v={fmtNum(m?.eps)} />
            <Stat k="Dividend yield" v={m?.dividend_yield != null ? fmtPct(m.dividend_yield, 2, false) : '—'} /><Stat k="Beta" v={fmtNum(m?.beta)} />
            <Stat k="52w high" v={fmtPrice(m?.high_52w ?? qd?.high_52w)} /><Stat k="52w low" v={fmtPrice(m?.low_52w ?? qd?.low_52w)} />
          </div>
          {ov.data?.metrics.meta.status === 'unavailable' && <p className="border-t border-line px-4 py-2 text-[11px] text-muted">Fundamentals unavailable: {ov.data.metrics.meta.message}</p>}
        </Card>
        <Card>
          <CardHeader title="About" />
          <div className="space-y-2 p-4 text-sm">
            {p ? (
              <>
                <p className="text-muted">{p.industry} · {p.country}</p>
                <p className="text-xs text-muted">IPO: {p.ipo || '—'} · Shares out: {fmtCompact(p.shares_outstanding)}</p>
                {p.website && <a href={p.website} target="_blank" rel="noreferrer noopener" className="text-xs text-accent">{p.website}</a>}
                <p className="text-[11px] text-muted">Long-form business descriptions are not included in the free Finnhub profile endpoint.</p>
              </>
            ) : <p className="text-xs text-muted">{ov.data?.profile.meta.message ?? 'Profile unavailable.'}</p>}
          </div>
        </Card>
      </div>

      <Card>
        <div className="border-b border-line p-3"><Segmented label="Detail sections" options={TABS} value={tab} onChange={setTab} /></div>
        {tab === 'Financials' && <Statements symbol={sym} />}
        {tab === 'Earnings' && (
          <EnvelopeView query={earn} isEmpty={(d) => d.length === 0} emptyTitle="No earnings history">
            {(rows) => (
              <Table><thead><tr><th className={th}>Period</th><th className={th + ' text-right'}>Actual EPS</th><th className={th + ' text-right'}>Estimate</th><th className={th + ' text-right'}>Surprise</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.period}><td className={td}>{r.period}</td><td className={td + ' num text-right'}>{fmtNum(r.actual)}</td><td className={td + ' num text-right'}>{fmtNum(r.estimate)}</td><td className={td + ' text-right'}><Change v={r.surprise_pct} /></td></tr>)}</tbody></Table>
            )}
          </EnvelopeView>
        )}
        {tab === 'Dividends' && (
          <EnvelopeView query={div} isEmpty={(d) => d.length === 0} emptyTitle="No dividend history" emptyHint="Either the company pays no dividend or the provider does not expose it on your plan.">
            {(rows) => (
              <Table><thead><tr><th className={th}>Ex-date</th><th className={th}>Pay date</th><th className={th + ' text-right'}>Amount</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.ex_date}><td className={td}>{r.ex_date}</td><td className={td}>{r.pay_date ?? '—'}</td><td className={td + ' num text-right'}>{fmtNum(r.amount, 4)} {r.currency}</td></tr>)}</tbody></Table>
            )}
          </EnvelopeView>
        )}
        {tab === 'News' && <EnvelopeView query={news} isEmpty={(d) => d.length === 0} emptyTitle={`No recent news for ${sym}`}>{(a) => <ArticleList items={a.slice(0, 20)} />}</EnvelopeView>}
      </Card>
    </div>
  )
}
