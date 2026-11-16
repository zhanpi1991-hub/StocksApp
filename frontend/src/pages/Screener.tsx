import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { STALE } from '@/services/cacheTimes'
import { Button, Card, CardHeader, Input, Segmented, Select, Table, td, th } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { Change, Logo } from '@/components/market/bits'
import { fmtCompact, fmtPrice } from '@/utils/format'

type F = Record<string, string>
const clean = (f: F) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''))

function Field({ f, set, k, label, ...p }: { f: F; set: (f: F) => void; k: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input label={label} value={f[k] ?? ''} onChange={(e) => set({ ...f, [k]: e.target.value })} {...p} />
}

function StockScreener() {
  const [f, setF] = useState<F>({ exchange: 'NASDAQ' })
  const [applied, setApplied] = useState<F>(f)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('market_cap')
  const q = useQuery({ queryKey: ['stock-screener', applied, page, sort], queryFn: () => api.stockScreener({ ...clean(applied), page, sort, per_page: 25 }), placeholderData: keepPreviousData })
  return (
    <Card>
      <CardHeader title="Stock screener" sub="Filters shown are those supported by the data provider (FMP). P/E, EPS, daily change and 52-week performance filters are not available from the provider endpoint." />
      <form className="grid grid-cols-2 gap-3 border-b border-line p-3 md:grid-cols-4 xl:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setApplied(f); setPage(1) }}>
        <Select label="Exchange" value={f.exchange ?? ''} onChange={(e) => setF({ ...f, exchange: e.target.value })}>{['', 'NASDAQ', 'NYSE', 'AMEX'].map((x) => <option key={x} value={x}>{x || 'Any'}</option>)}</Select>
        <Field f={f} set={setF} k="sector" label="Sector" placeholder="Technology" />
        <Field f={f} set={setF} k="industry" label="Industry" placeholder="Software" />
        <Field f={f} set={setF} k="q" label="Name / ticker" />
        <Field f={f} set={setF} k="min_cap" label="Min market cap" type="number" />
        <Field f={f} set={setF} k="max_cap" label="Max market cap" type="number" />
        <Field f={f} set={setF} k="min_price" label="Min price" type="number" />
        <Field f={f} set={setF} k="max_price" label="Max price" type="number" />
        <Field f={f} set={setF} k="min_volume" label="Min volume" type="number" />
        <Field f={f} set={setF} k="min_dividend" label="Min dividend / share" type="number" />
        <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>{['market_cap', 'price', 'volume', 'beta', 'dividend', 'name'].map((x) => <option key={x}>{x}</option>)}</Select>
        <div className="flex items-end gap-2"><Button type="submit" variant="primary">Apply</Button><Button type="button" onClick={() => { setF({}); setApplied({}); setPage(1) }}>Reset</Button></div>
      </form>
      <EnvelopeView query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No stocks match these filters">
        {(d) => (
          <>
            <Table><thead><tr><th className={th}>Symbol</th><th className={th}>Name</th><th className={th}>Sector</th><th className={th}>Exchange</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Market cap</th><th className={th + ' text-right'}>Volume</th><th className={th + ' text-right'}>Beta</th></tr></thead>
              <tbody>{d.items.map((r) => <tr key={r.symbol} className="hover:bg-surface-2/50"><td className={td}><Link className="font-medium hover:text-accent" to={`/stocks/${r.symbol}`}>{r.symbol}</Link></td><td className={td + ' max-w-56 truncate'}>{r.name}</td><td className={td + ' text-muted'}>{r.sector ?? '—'}</td><td className={td + ' text-muted'}>{r.exchange}</td><td className={td + ' num text-right'}>{fmtPrice(r.price)}</td><td className={td + ' num text-right'}>{fmtCompact(r.market_cap)}</td><td className={td + ' num text-right'}>{fmtCompact(r.volume)}</td><td className={td + ' num text-right'}>{r.beta?.toFixed(2) ?? '—'}</td></tr>)}</tbody></Table>
            <div className="flex items-center justify-between border-t border-line p-3"><Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs text-muted">Page {page} of {Math.max(1, Math.ceil(d.total / d.per_page))} · {d.total} results</span><Button size="sm" disabled={page * d.per_page >= d.total} onClick={() => setPage(page + 1)}>Next</Button></div>
          </>
        )}
      </EnvelopeView>
    </Card>
  )
}

function CryptoScreener() {
  const [f, setF] = useState<F>({})
  const [applied, setApplied] = useState<F>({})
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('rank')
  const [desc, setDesc] = useState(false)
  const cats = useQuery({ queryKey: ['crypto-cats'], queryFn: api.cryptoCategories, staleTime: STALE.categories })
  const q = useQuery({ queryKey: ['crypto-screener', applied, page, sort, desc], queryFn: () => api.cryptoScreener({ ...clean(applied), page, sort, desc, per_page: 25 }), placeholderData: keepPreviousData, staleTime: STALE.cryptoList })
  return (
    <Card>
      <CardHeader title="Crypto screener" sub="Covers the top 250 coins by market cap (CoinGecko)." />
      <form className="grid grid-cols-2 gap-3 border-b border-line p-3 md:grid-cols-4 xl:grid-cols-6" onSubmit={(e) => { e.preventDefault(); setApplied(f); setPage(1) }}>
        <Field f={f} set={setF} k="q" label="Search" />
        <Select label="Category" value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Any</option>{cats.data?.data?.slice(0, 300).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Field f={f} set={setF} k="min_cap" label="Min market cap" type="number" /><Field f={f} set={setF} k="max_cap" label="Max market cap" type="number" />
        <Field f={f} set={setF} k="min_price" label="Min price" type="number" /><Field f={f} set={setF} k="max_price" label="Max price" type="number" />
        <Field f={f} set={setF} k="min_volume" label="Min 24h volume" type="number" />
        <Field f={f} set={setF} k="min_change" label="Min 24h change %" type="number" /><Field f={f} set={setF} k="max_change" label="Max 24h change %" type="number" />
        <Field f={f} set={setF} k="max_rank" label="Max rank" type="number" />
        <Select label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)}>{['rank', 'price', 'market_cap', 'volume', 'change_24h', 'change_7d', 'name'].map((x) => <option key={x}>{x}</option>)}</Select>
        <Select label="Direction" value={desc ? 'desc' : 'asc'} onChange={(e) => setDesc(e.target.value === 'desc')}><option value="asc">Ascending</option><option value="desc">Descending</option></Select>
        <div className="flex items-end gap-2"><Button type="submit" variant="primary">Apply</Button><Button type="button" onClick={() => { setF({}); setApplied({}); setPage(1) }}>Reset</Button></div>
      </form>
      <EnvelopeView query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No coins match these filters">
        {(d) => (
          <>
            <Table><thead><tr><th className={th}>#</th><th className={th}>Coin</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>24h</th><th className={th + ' text-right'}>7d</th><th className={th + ' text-right'}>Market cap</th><th className={th + ' text-right'}>Volume</th></tr></thead>
              <tbody>{d.items.map((c) => <tr key={c.id} className="hover:bg-surface-2/50"><td className={td + ' num text-muted'}>{c.rank}</td><td className={td}><Link to={`/crypto/${c.id}`} className="flex items-center gap-2 font-medium hover:text-accent"><Logo src={c.image} name={c.symbol} />{c.name} <span className="text-xs text-muted">{c.symbol}</span></Link></td><td className={td + ' num text-right'}>${fmtPrice(c.price)}</td><td className={td + ' text-right'}><Change v={c.change_24h} /></td><td className={td + ' text-right'}><Change v={c.change_7d} /></td><td className={td + ' num text-right'}>${fmtCompact(c.market_cap)}</td><td className={td + ' num text-right'}>${fmtCompact(c.volume)}</td></tr>)}</tbody></Table>
            <div className="flex items-center justify-between border-t border-line p-3"><Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><span className="text-xs text-muted">Page {page} of {Math.max(1, Math.ceil(d.total / d.per_page))} · {d.total} results</span><Button size="sm" disabled={page * d.per_page >= d.total} onClick={() => setPage(page + 1)}>Next</Button></div>
          </>
        )}
      </EnvelopeView>
    </Card>
  )
}

export default function Screener() {
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') === 'crypto' ? 'Crypto' : 'Stocks'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-xl font-semibold">Screener</h1>
        <Segmented label="Screener type" options={['Stocks', 'Crypto'] as const} value={tab} onChange={(v) => setSp({ tab: v.toLowerCase() })} /></div>
      {tab === 'Stocks' ? <StockScreener /> : <CryptoScreener />}
    </div>
  )
}
