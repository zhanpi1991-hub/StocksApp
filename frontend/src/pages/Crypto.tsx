import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { api } from '@/services/api'
import { REFRESH, STALE } from '@/services/cacheTimes'
import { Button, Card, CardHeader, Input, Select, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { Change, Logo } from '@/components/market/bits'
import { Sparkline } from '@/components/charts/Sparkline'
import { fmtCompact, fmtMoney, fmtPct, fmtPrice } from '@/utils/format'
import type { Coin } from '@/types/api'

type SortKey = 'rank' | 'price' | 'change_1h' | 'change_24h' | 'change_7d' | 'market_cap' | 'volume'

function GlobalBar() {
  const q = useQuery({ queryKey: ['crypto-global'], queryFn: api.cryptoGlobal, staleTime: STALE.cryptoGlobal, refetchInterval: REFRESH.cryptoGlobal })
  return (
    <Card>
      <EnvelopeView query={q}>
        {(g) => (
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <div><p className="text-xs text-muted">Total market cap</p><p className="num text-xl font-semibold">{fmtMoney(g.total_market_cap)}</p><p className="num text-xs">{fmtPct(g.change_24h)} (24h)</p></div>
            <div><p className="text-xs text-muted">24h volume</p><p className="num text-xl font-semibold">{fmtMoney(g.total_volume)}</p><p className="text-xs text-muted">{g.active_coins?.toLocaleString()} active coins</p></div>
            <div>
              <p className="mb-1 text-xs text-muted">Market dominance</p>
              <div className="flex h-2 overflow-hidden rounded-full bg-surface-2" role="img" aria-label="Dominance bar">
                {Object.entries(g.dominance).slice(0, 5).map(([k, v], i) => <div key={k} style={{ width: `${v}%`, background: ['#f7931a', '#627eea', '#26a17b', '#f3ba2f', '#2775ca'][i] }} title={`${k} ${v.toFixed(1)}%`} />)}
              </div>
              <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">{Object.entries(g.dominance).slice(0, 5).map(([k, v]) => <span key={k}>{k} {v.toFixed(1)}%</span>)}</p>
            </div>
          </div>
        )}
      </EnvelopeView>
    </Card>
  )
}

function Highlights() {
  const tr = useQuery({ queryKey: ['crypto-trending'], queryFn: api.cryptoTrending, staleTime: STALE.trending })
  const mv = useQuery({ queryKey: ['crypto-movers'], queryFn: api.cryptoMovers, staleTime: STALE.cryptoList })
  const list = (title: string, rows: { id: string; name: string; symbol: string; image: string | null; change: number | null }[]) => (
    <Card>
      <CardHeader title={title} />
      <ul>{rows.slice(0, 5).map((r) => (
        <li key={r.id} className="flex items-center justify-between border-b border-line/60 px-4 py-2 last:border-0">
          <Link to={`/crypto/${r.id}`} className="flex min-w-0 items-center gap-2 truncate font-medium hover:text-accent"><Logo src={r.image} name={r.symbol} size={20} />{r.name} <span className="text-xs text-muted">{r.symbol}</span></Link>
          <Change v={r.change} />
        </li>))}</ul>
    </Card>
  )
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div><EnvelopeView query={tr} isEmpty={(d) => d.length === 0} footer={false}>{(d) => list('Trending', d.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, image: c.image, change: c.change_24h })))}</EnvelopeView></div>
      <div><EnvelopeView query={mv} footer={false}>{(d) => list('Top gainers (24h)', d.gainers.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, image: c.image, change: c.change_24h })))}</EnvelopeView></div>
      <div><EnvelopeView query={mv} footer={false}>{(d) => list('Top losers (24h)', d.losers.map((c) => ({ id: c.id, name: c.name, symbol: c.symbol, image: c.image, change: c.change_24h })))}</EnvelopeView></div>
    </div>
  )
}

export default function Crypto() {
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(50)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState<SortKey>('rank')
  const [desc, setDesc] = useState(false)
  const cats = useQuery({ queryKey: ['crypto-cats'], queryFn: api.cryptoCategories, staleTime: STALE.categories })
  const q = useQuery({ queryKey: ['crypto-markets', page, perPage, category], queryFn: () => api.cryptoMarkets({ page, per_page: perPage, category: category || undefined }), placeholderData: keepPreviousData, staleTime: STALE.cryptoList, refetchInterval: REFRESH.cryptoList })

  const rows = useMemo(() => {
    let r: Coin[] = q.data?.data ?? []
    if (search) r = r.filter((c) => (c.name + c.symbol).toLowerCase().includes(search.toLowerCase()))
    return [...r].sort((a, b) => {
      const x = a[sort] ?? (desc ? -Infinity : Infinity), y = b[sort] ?? (desc ? -Infinity : Infinity)
      return desc ? Number(y) - Number(x) : Number(x) - Number(y)
    })
  }, [q.data, search, sort, desc])

  const Th = ({ k, label, right = true }: { k: SortKey; label: string; right?: boolean }) => (
    <th className={th + (right ? ' text-right' : '')} aria-sort={sort === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => { if (sort === k) setDesc(!desc); else { setSort(k); setDesc(k !== 'rank') } }}>
        {label}{sort === k && (desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </button>
    </th>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2"><h1 className="text-xl font-semibold">Cryptocurrency</h1><Link to="/screener?tab=crypto" className="text-sm text-accent">Open crypto screener</Link></div>
      <GlobalBar />
      <Highlights />
      <Card>
        <CardHeader title="Directory" sub="Search and sort apply to the loaded page; categories and pagination query CoinGecko." />
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-3">
          <Input label="Search this page" placeholder="Bitcoin, SOL…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-52" />
          <Select label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1) }} className="w-56">
            <option value="">All categories</option>
            {cats.data?.data?.slice(0, 300).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select label="Per page" value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1) }} className="w-24">
            {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
          </Select>
        </div>
        <EnvelopeView query={q} isEmpty={(d) => d.length === 0} emptyTitle="No coins in this category">
          {() => (
            <>
              {rows.length === 0 ? <p className="p-6 text-center text-sm text-muted">No coins on this page match "{search}".</p> : (
                <Table>
                  <thead><tr><Th k="rank" label="#" right={false} /><th className={th}>Coin</th><Th k="price" label="Price" /><Th k="change_1h" label="1h" /><Th k="change_24h" label="24h" /><Th k="change_7d" label="7d" /><Th k="market_cap" label="Market cap" /><Th k="volume" label="Volume (24h)" /><th className={th + ' text-right'}>Circulating</th><th className={th}>7d chart</th></tr></thead>
                  <tbody>{rows.map((c) => (
                    <tr key={c.id} className="hover:bg-surface-2/50">
                      <td className={td + ' num text-muted'}>{c.rank ?? '—'}</td>
                      <td className={td}><Link to={`/crypto/${c.id}`} className="flex items-center gap-2 font-medium hover:text-accent"><Logo src={c.image} name={c.symbol} />{c.name}<span className="text-xs text-muted">{c.symbol}</span></Link></td>
                      <td className={td + ' num text-right'}>${fmtPrice(c.price)}</td>
                      <td className={td + ' text-right'}><Change v={c.change_1h} /></td><td className={td + ' text-right'}><Change v={c.change_24h} /></td><td className={td + ' text-right'}><Change v={c.change_7d} /></td>
                      <td className={td + ' num text-right'}>${fmtCompact(c.market_cap)}</td><td className={td + ' num text-right'}>${fmtCompact(c.volume)}</td>
                      <td className={td + ' num text-right'}>{fmtCompact(c.circulating_supply)} <span className="text-muted">{c.symbol}</span></td>
                      <td className={td}><Sparkline data={c.sparkline} /></td>
                    </tr>))}</tbody>
                </Table>)}
              <div className="flex items-center justify-between border-t border-line p-3">
                <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="text-xs text-muted">Page {page}</span>
                <Button size="sm" disabled={(q.data?.data?.length ?? 0) < perPage} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </>
          )}
        </EnvelopeView>
      </Card>
    </div>
  )
}
