import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { REFRESH, STALE } from '@/services/cacheTimes'
import { Card, CardHeader, Segmented, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Change, Logo } from '@/components/market/bits'
import { Sparkline } from '@/components/charts/Sparkline'
import type { IndexRow } from '@/types/api'
import { cn, fmtMoney, fmtPct, fmtPrice, tone } from '@/utils/format'

function Summary() {
  const q = useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 60_000 })
  const cg = useQuery({ queryKey: ['crypto-global'], queryFn: api.cryptoGlobal, staleTime: STALE.cryptoGlobal, refetchInterval: REFRESH.cryptoGlobal })
  const s = q.data?.data
  const tiles = [
    { k: 'Exchanges open (scheduled)', v: s ? `${s.open_exchanges} / ${s.total_exchanges}` : '—' },
    { k: 'Index breadth', v: s && s.indices_with_data ? `${s.advancing} up / ${s.declining} down` : 'No index data' },
    { k: 'Avg index move', v: s?.avg_change_pct != null ? fmtPct(s.avg_change_pct) : '—', t: s?.avg_change_pct },
    { k: 'Crypto market cap', v: fmtMoney(cg.data?.data?.total_market_cap), sub: cg.data?.data ? fmtPct(cg.data.data.change_24h) + ' 24h' : undefined, t: cg.data?.data?.change_24h },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.k} className="p-4">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">{t.k}</p>
          {q.isLoading ? <div className="skeleton mt-2 h-6 w-24" /> : <p className={cn('num mt-1 text-lg font-semibold', tone(t.t))}>{t.v}</p>}
          {t.sub && <p className={cn('num text-xs', tone(t.t))}>{t.sub}</p>}
        </Card>
      ))}
    </div>
  )
}

function IndexBanner({ rows }: { rows: IndexRow[] }) {
  const missing = rows.filter((r) => !r.quote)
  if (missing.length === 0) return null
  const reasons = new Set(missing.map((r) => r.reason))
  const why = reasons.has('no_key')
    ? 'Twelve Data API key not configured (TWELVE_DATA_API_KEY).'
    : reasons.has('plan_required')
      ? 'These indices are not available on the current Twelve Data plan or are not covered.'
      : reasons.has('rate_limited')
        ? 'Twelve Data rate limit reached; the backend is backing off.'
        : 'The provider returned errors for these indices.'
  return (
    <div role="status" className="border-b border-warn/30 bg-warn/10 px-4 py-2 text-xs text-warn">
      {missing.length} of {rows.length} indices have no data. {why} Nothing is substituted. <Link to="/status" className="underline">Provider status</Link>
    </div>
  )
}

function Indices() {
  const q = useQuery({ queryKey: ['indices'], queryFn: api.indices, refetchInterval: 60_000 })
  return (
    <Card>
      <CardHeader title="Global indices" sub="Each index shows its own data status and the scheduled session of its exchange" />
      <EnvelopeView query={q} footer={false}>
        {(rows, meta) => (
          <>
            <IndexBanner rows={rows} />
            <Table>
              <thead><tr><th className={th}>Index</th><th className={th + ' text-right'}>Value</th><th className={th + ' text-right'}>Change</th><th className={th + ' text-right'}>%</th><th className={th}>Session</th><th className={th}>Data</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code}>
                    <td className={td}><span className="font-medium">{r.name}</span> <span className="text-xs text-muted">{r.code}</span></td>
                    {r.quote ? (
                      <>
                        <td className={td + ' num text-right'}>{fmtPrice(r.quote.price)}</td>
                        <td className={td + ' num text-right ' + tone(r.quote.change)}>{r.quote.change != null ? (r.quote.change > 0 ? '+' : '') + fmtPrice(r.quote.change) : '—'}</td>
                        <td className={td + ' text-right'}><Change v={r.quote.change_pct} /></td>
                      </>
                    ) : (
                      <td className={td + ' text-xs text-muted'} colSpan={3} title={r.message ?? ''}>
                        <span className="line-clamp-1 max-w-72 whitespace-normal">{r.message ?? 'Unavailable'}</span>
                      </td>
                    )}
                    <td className={td}>
                      <span title={r.session.note} className={cn('inline-flex items-center gap-1.5 text-xs', r.session.status === 'open' ? 'text-up' : 'text-muted')}>
                        <span className={cn('h-1.5 w-1.5 rounded-full', r.session.status === 'open' ? 'bg-up' : 'bg-muted')} />{r.session.status === 'open' ? 'Open' : 'Closed'} · {r.session.exchange}
                      </span>
                    </td>
                    <td className={td}><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {meta.message && <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{meta.message} Session status is a weekday schedule and does not reflect holidays.</p>}
          </>
        )}
      </EnvelopeView>
    </Card>
  )
}

function Movers() {
  const [kind, setKind] = useState<'gainers' | 'losers' | 'active'>('gainers')
  const q = useQuery({ queryKey: ['movers', kind], queryFn: () => api.movers(kind), refetchInterval: 120_000 })
  return (
    <Card>
      <CardHeader title="Market movers" right={<Segmented label="Movers type" options={['gainers', 'losers', 'active'] as const} value={kind} onChange={setKind} />} />
      <EnvelopeView query={q} isEmpty={(d) => d.length === 0} emptyTitle="No movers returned">
        {(rows) => (
          <Table>
            <thead><tr><th className={th}>Symbol</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Change</th></tr></thead>
            <tbody>
              {rows.slice(0, 10).map((m) => (
                <tr key={m.symbol}>
                  <td className={td}><Link className="font-medium hover:text-accent" to={`/stocks/${m.symbol}`}>{m.symbol}</Link> <span className="text-xs text-muted">{(m.name ?? '').slice(0, 24)}</span></td>
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

function Heatmap() {
  const q = useQuery({ queryKey: ['heatmap'], queryFn: api.heatmap })
  return (
    <Card>
      <CardHeader title="Sector heatmap" sub="Average daily change by sector" />
      <EnvelopeView query={q} isEmpty={(d) => d.length === 0} emptyTitle="No sector data">
        {(rows) => (
          <div className="grid grid-cols-2 gap-1.5 p-3 sm:grid-cols-3">
            {rows.map((r) => {
              const v = r.change_pct ?? 0
              const a = Math.min(0.85, 0.15 + Math.abs(v) / 4)
              return (
                <div key={r.sector} className="rounded-md p-2.5" style={{ background: `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${Math.round(a * 100)}%, var(--surface-2))` }}>
                  <p className="truncate text-xs font-medium">{r.sector}</p>
                  <p className="num text-sm font-semibold">{fmtPct(r.change_pct)}</p>
                </div>
              )
            })}
          </div>
        )}
      </EnvelopeView>
    </Card>
  )
}

function CryptoSnapshot() {
  const q = useQuery({ queryKey: ['crypto-top5'], queryFn: () => api.cryptoMarkets({ per_page: 6 }), staleTime: STALE.cryptoList, refetchInterval: REFRESH.cryptoList })
  return (
    <Card>
      <CardHeader title="Crypto" right={<Link className="text-xs text-accent" to="/crypto">All coins</Link>} />
      <EnvelopeView query={q} isEmpty={(d) => d.length === 0}>
        {(coins) => (
          <ul>
            {coins.map((c) => (
              <li key={c.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-2.5 last:border-0">
                <Logo src={c.image} name={c.symbol} />
                <Link to={`/crypto/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:text-accent">{c.name} <span className="text-xs text-muted">{c.symbol}</span></Link>
                <Sparkline data={c.sparkline} width={70} height={22} />
                <span className="num w-24 text-right">${fmtPrice(c.price)}</span>
                <Change v={c.change_24h} className="w-16 text-right" />
              </li>
            ))}
          </ul>
        )}
      </EnvelopeView>
    </Card>
  )
}

function ForexSnapshot() {
  const q = useQuery({ queryKey: ['fx-snapshot'], queryFn: () => api.fxRates('USD', 'EUR,GBP,JPY,CHF,CAD,AUD,CNY,KZT') })
  return (
    <Card>
      <CardHeader title="Currencies vs USD" right={<Link className="text-xs text-accent" to="/forex">Forex</Link>} />
      <EnvelopeView query={q} isEmpty={(d) => Object.keys(d.rates).length === 0}>
        {(d) => (
          <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
            {Object.entries(d.rates).map(([k, v]) => (
              <Link key={k} to={`/forex?pair=USD/${k}`} className="bg-surface p-3 hover:bg-surface-2">
                <p className="text-xs text-muted">USD/{k}</p>
                <p className="num font-semibold">{fmtPrice(v.rate, 4)}</p>
              </Link>
            ))}
          </div>
        )}
      </EnvelopeView>
    </Card>
  )
}

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Global market overview</h1>
        <p className="text-sm text-muted">Every panel states its source and data status. Markets do not trade simultaneously; sessions below are scheduled hours only.</p>
      </div>
      <Summary />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2"><Indices /></div>
        <Movers />
      </div>
      <div className="grid gap-4 lg:grid-cols-2"><CryptoSnapshot /><ForexSnapshot /></div>
      <Heatmap />
    </div>
  )
}
