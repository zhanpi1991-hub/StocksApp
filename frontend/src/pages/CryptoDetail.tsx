import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { REFRESH, STALE } from '@/services/cacheTimes'
import { Card, CardHeader, Segmented } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AlertButton, Change, Logo, WatchButton } from '@/components/market/bits'
import { PriceChart } from '@/components/charts/PriceChart'
import { useLiveQuote } from '@/hooks/useLive'
import { fmtCompact, fmtNum, fmtPrice } from '@/utils/format'
import { sanitizeHtml } from '@/utils/sanitize'

const RANGES = ['1D', '7D', '1M', '3M', '1Y', 'MAX'] as const

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="bg-surface p-3"><p className="text-[11px] text-muted">{k}</p><p className="num mt-0.5 text-sm font-medium">{v}</p></div>
}

export default function CryptoDetail() {
  const { id = '' } = useParams()
  const [range, setRange] = useState<(typeof RANGES)[number]>('1M')
  const q = useQuery({ queryKey: ['coin', id], queryFn: () => api.coin(id), staleTime: STALE.coin, refetchInterval: REFRESH.cryptoList })
  const chart = useQuery({ queryKey: ['coin-chart', id, range], queryFn: () => api.coinChart(id, range), staleTime: STALE.chart })
  const liveQ = useLiveQuote(`crypto:${id}`)
  const c = q.data?.data
  const livePrice = liveQ?.data?.price

  return (
    <div className="space-y-4">
      <Card>
        <EnvelopeView query={q} footer={false}>
          {(d, meta) => (
            <div className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Logo src={d.image} name={d.symbol ?? ''} />
                  <div><h1 className="text-xl font-semibold">{d.name} <span className="text-base text-muted">{d.symbol}</span></h1>
                    <p className="text-xs text-muted">Rank #{d.rank ?? '—'} {d.categories?.slice(0, 3).map((x) => ` · ${x}`)}</p></div>
                </div>
                <div className="flex"><WatchButton assetType="crypto" symbol={id} name={d.name} /><AlertButton assetType="crypto" symbol={id} name={d.name} /></div>
              </div>
              <div className="mt-4 flex flex-wrap items-end gap-x-5 gap-y-2">
                <span className="num text-3xl font-semibold">${fmtPrice(livePrice ?? d.price)}</span>
                <Change v={liveQ?.data?.change_pct ?? d.change_24h} className="text-lg" />
                <StatusBadge status={liveQ?.data?.price != null ? liveQ.status : meta.status} />
                <span className="text-[11px] text-muted">{meta.message}</span>
              </div>
            </div>
          )}
        </EnvelopeView>
      </Card>

      <Card>
        <CardHeader title="Price (USD)" right={<Segmented label="Chart range" options={RANGES} value={range} onChange={setRange} />} />
        <EnvelopeView query={chart} isEmpty={(d) => d.length === 0}>{(pts) => <div className="p-2"><PriceChart mode="line" points={pts} /></div>}</EnvelopeView>
      </Card>

      {c && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Market data" />
            <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
              <Stat k="Market cap" v={`$${fmtCompact(c.market_cap)}`} /><Stat k="24h volume" v={`$${fmtCompact(c.volume)}`} />
              <Stat k="Fully diluted valuation" v={`$${fmtCompact(c.fdv)}`} />
              <Stat k="24h high / low" v={`${fmtPrice(c.high_24h)} / ${fmtPrice(c.low_24h)}`} />
              <Stat k="All-time high" v={`$${fmtPrice(c.ath)}`} /><Stat k="All-time low" v={`$${fmtPrice(c.atl)}`} />
              <Stat k="Circulating supply" v={fmtCompact(c.circulating_supply)} /><Stat k="Total supply" v={c.total_supply ? fmtCompact(c.total_supply) : 'Not reported'} />
              <Stat k="Max supply" v={c.max_supply ? fmtCompact(c.max_supply) : 'Unlimited / n.a.'} />
              <Stat k="1h" v={<Change v={c.change_1h} />} /><Stat k="24h" v={<Change v={c.change_24h} />} /><Stat k="7d" v={<Change v={c.change_7d} />} />
              <Stat k="30d" v={<Change v={c.change_30d} />} /><Stat k="1y" v={<Change v={c.change_1y} />} /><Stat k="Genesis" v={c.genesis_date ?? '—'} />
            </div>
          </Card>
          <Card>
            <CardHeader title="About" />
            <div className="space-y-2 p-4 text-sm">
              {c.description ? <div className="max-h-64 overflow-auto text-xs leading-relaxed text-muted" dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.description) }} /> : <p className="text-xs text-muted">No description provided.</p>}
              {c.homepage && <a className="text-xs text-accent" href={c.homepage} target="_blank" rel="noreferrer noopener">{c.homepage}</a>}
              <p className="text-[11px] text-muted">Supply values: {fmtNum(c.circulating_supply, 0)} circulating.</p>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
