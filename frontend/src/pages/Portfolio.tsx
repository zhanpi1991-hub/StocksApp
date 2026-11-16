import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { Button, Card, CardHeader, IconButton, Input, Modal, Select, SkeletonRows, Table, td, th } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/DataState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { instrumentPath } from '@/components/market/bits'
import { AllocationPie } from '@/components/charts/RechartsViews'
import { cn, dec, errMsg, fmtDateTime } from '@/utils/format'
import type { AssetType } from '@/types/api'

const toneOf = (v: string | null) => (v == null || Number(v) === 0 ? 'text-muted' : Number(v) > 0 ? 'text-up' : 'text-down')

function TxForm({ pid, onDone }: { pid: number; onDone: () => void }) {
  const [v, setV] = useState({ asset_type: 'stock' as AssetType, symbol: '', side: 'buy', quantity: '', price: '', fee: '0', executed_at: '' })
  const [err, setErr] = useState<string | null>(null)
  const m = useMutation({
    mutationFn: () => api.addTx(pid, { ...v, symbol: v.asset_type === 'crypto' ? v.symbol.trim().toLowerCase() : v.symbol.trim().toUpperCase(), executed_at: v.executed_at ? new Date(v.executed_at).toISOString() : undefined }),
    onSuccess: onDone, onError: (e) => setErr(errMsg(e)),
  })
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); m.mutate() }}>
      <div className="grid grid-cols-2 gap-3">
        <Select label="Asset type" value={v.asset_type} onChange={set('asset_type')}><option value="stock">Stock</option><option value="crypto">Crypto</option><option value="forex">Currency pair</option></Select>
        <Select label="Side" value={v.side} onChange={set('side')}><option value="buy">Buy</option><option value="sell">Sell</option></Select>
      </div>
      <Input label={v.asset_type === 'crypto' ? 'CoinGecko id' : v.asset_type === 'forex' ? 'Pair (EUR/USD)' : 'Ticker'} required value={v.symbol} onChange={set('symbol')} />
      <div className="grid grid-cols-3 gap-3">
        <Input label="Quantity" type="number" step="any" min="0" required value={v.quantity} onChange={set('quantity')} />
        <Input label="Price" type="number" step="any" min="0" required value={v.price} onChange={set('price')} />
        <Input label="Fee" type="number" step="any" min="0" value={v.fee} onChange={set('fee')} />
      </div>
      <Input label="Date (optional, default now)" type="datetime-local" value={v.executed_at} onChange={set('executed_at')} />
      <p className="text-[11px] text-muted">Virtual record only. No order is placed anywhere.</p>
      {err && <p role="alert" className="text-xs text-down">{err}</p>}
      <Button type="submit" variant="primary" disabled={m.isPending}>Record transaction</Button>
    </form>
  )
}

function Detail({ id }: { id: number }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const q = useQuery({ queryKey: ['portfolio', id], queryFn: () => api.portfolio(id), refetchInterval: 60_000 })
  const del = useMutation({ mutationFn: (t: number) => api.deleteTx(id, t), onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolio', id] }), onError: (e) => alert(errMsg(e)) })
  if (q.isLoading) return <Card><SkeletonRows /></Card>
  if (q.isError) return <Card><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card>
  const p = q.data!
  const t = p.totals
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{p.name} <span className="text-sm text-muted">{p.currency}</span></h2><Button variant="primary" onClick={() => setOpen(true)}><Plus size={14} /> Add transaction</Button></div>
      <Modal open={open} onClose={() => setOpen(false)} title="Record transaction"><TxForm pid={id} onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['portfolio', id] }) }} /></Modal>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[['Market value', t.market_value, null], ['Cost basis', t.cost_basis, null], ['Unrealized P/L', t.unrealized_pnl, t.unrealized_pnl], ['Realized P/L', t.realized_pnl, t.realized_pnl]].map(([k, v, tn]) => (
          <Card key={k as string} className="p-4"><p className="text-xs text-muted">{k}</p><p className={cn('num mt-1 text-lg font-semibold', toneOf(tn as string | null))}>{dec(v as string)}</p></Card>))}
      </div>
      {t.unpriced_holdings > 0 && <p role="status" className="text-xs text-warn">{t.unpriced_holdings} holding(s) have no available price; they are excluded from market value and unrealized P/L.</p>}
      {t.note && <p className="text-[11px] text-muted">{t.note}</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Holdings" />
          {p.holdings.length === 0 ? <EmptyState title="No open positions" hint="Record a buy transaction to start tracking." /> : (
            <Table><thead><tr><th className={th}>Asset</th><th className={th + ' text-right'}>Qty</th><th className={th + ' text-right'}>Avg cost</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Value</th><th className={th + ' text-right'}>Unrealized</th><th className={th + ' text-right'}>Weight</th></tr></thead>
              <tbody>{p.holdings.map((h) => <tr key={h.asset_type + h.symbol}><td className={td}><Link className="font-medium hover:text-accent" to={instrumentPath(h.asset_type, h.symbol)}>{h.symbol}</Link></td><td className={td + ' num text-right'}>{dec(h.quantity, 4)}</td><td className={td + ' num text-right'}>{dec(h.avg_cost, 4)}</td>
                <td className={td + ' num text-right'}>{h.price ? dec(h.price, 4) : <span title={h.price_message ?? ''}><StatusBadge status="unavailable" /></span>}</td><td className={td + ' num text-right'}>{dec(h.market_value)}</td>
                <td className={td + ' num text-right ' + toneOf(h.unrealized_pnl)}>{dec(h.unrealized_pnl)} <span className="text-xs">{h.unrealized_pnl_pct ? `(${dec(h.unrealized_pnl_pct)}%)` : ''}</span></td><td className={td + ' num text-right'}>{h.weight_pct ? dec(h.weight_pct) + '%' : '—'}</td></tr>)}</tbody></Table>)}
        </Card>
        <Card>
          <CardHeader title="Allocation" />
          {p.allocation.length ? <AllocationPie data={p.allocation.map((a) => ({ name: a.asset_type, value: Number(a.value) }))} /> : <EmptyState title="No priced holdings" />}
        </Card>
      </div>
      <Card>
        <CardHeader title="Net invested over time" sub="Cumulative buys minus sells at recorded prices (not mark-to-market performance, which would need historical prices)" />
        {p.timeline.length < 2 ? <EmptyState title="Not enough transactions" /> : (
          <div className="flex items-end gap-1 p-4" role="img" aria-label="Net invested bars">{(() => { const vals = p.timeline.map((x) => Number(x.net_invested)); const max = Math.max(...vals.map(Math.abs), 1); return vals.map((v, i) => <div key={i} title={`${dec(String(v))} on ${fmtDateTime(p.timeline[i].time)}`} className={cn('w-full min-w-1 rounded-sm', v >= 0 ? 'bg-accent' : 'bg-down')} style={{ height: `${Math.max(3, (Math.abs(v) / max) * 90)}px` }} />) })()}</div>)}
      </Card>
      <Card>
        <CardHeader title="Transactions" />
        {p.transactions.length === 0 ? <EmptyState title="No transactions" /> : (
          <Table><thead><tr><th className={th}>Date</th><th className={th}>Side</th><th className={th}>Asset</th><th className={th + ' text-right'}>Qty</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Fee</th><th className={th}></th></tr></thead>
            <tbody>{p.transactions.map((x) => <tr key={x.id}><td className={td + ' text-muted'}>{fmtDateTime(x.executed_at)}</td><td className={td + (x.side === 'buy' ? ' text-up' : ' text-down') + ' uppercase'}>{x.side}</td><td className={td}>{x.symbol}</td><td className={td + ' num text-right'}>{dec(x.quantity, 4)}</td><td className={td + ' num text-right'}>{dec(x.price, 4)}</td><td className={td + ' num text-right'}>{dec(x.fee)}</td>
              <td className={td + ' text-right'}><IconButton label="Delete transaction" onClick={() => confirm('Delete this transaction?') && del.mutate(x.id)}><Trash2 size={14} /></IconButton></td></tr>)}</tbody></Table>)}
      </Card>
    </div>
  )
}

export default function Portfolio() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['portfolios'], queryFn: api.portfolios })
  const [sel, setSel] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [cur, setCur] = useState('USD')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (list.data && (sel == null || !list.data.some((p) => p.id === sel))) setSel(list.data[0]?.id ?? null) }, [list.data, sel])
  const create = useMutation({ mutationFn: () => api.createPortfolio({ name, currency: cur }), onSuccess: (p) => { setName(''); setErr(null); setSel(p.id); qc.invalidateQueries({ queryKey: ['portfolios'] }) }, onError: (e) => setErr(errMsg(e)) })
  const del = useMutation({ mutationFn: (id: number) => api.deletePortfolio(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['portfolios'] }) })
  if (list.isLoading) return <Card><SkeletonRows /></Card>
  if (list.isError) return <Card><ErrorState message={errMsg(list.error)} onRetry={() => list.refetch()} /></Card>
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-semibold">Virtual portfolio</h1><p className="text-sm text-muted">Track hypothetical positions with average-cost accounting. This is not a brokerage and never executes trades.</p></div>
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          {list.data && list.data.length > 0 && <Select label="Portfolio" value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))} className="w-56">{list.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>}
          {sel != null && <Button variant="danger" onClick={() => confirm('Delete this portfolio and all its transactions?') && del.mutate(sel)}><Trash2 size={14} /> Delete</Button>}
          <form className="ml-auto flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}>
            <Input label="New portfolio" value={name} onChange={(e) => setName(e.target.value)} className="w-44" /><Input label="Currency" maxLength={3} value={cur} onChange={(e) => setCur(e.target.value.toUpperCase())} className="w-20" /><Button type="submit" variant="primary">Create</Button>
          </form>
        </div>
        {err && <p role="alert" className="mt-2 text-xs text-down">{err}</p>}
      </Card>
      {sel == null ? <Card><EmptyState title="Create your first portfolio" hint="Then record virtual buy/sell transactions to see holdings, allocation and profit/loss." /></Card> : <Detail id={sel} />}
    </div>
  )
}
