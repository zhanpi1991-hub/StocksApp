import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { api } from '@/services/api'
import { Button, Card, CardHeader, IconButton, Input, Select, Table, td, th } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/DataState'
import { SkeletonRows } from '@/components/ui/primitives'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Change, Logo, instrumentPath } from '@/components/market/bits'
import { errMsg, fmtPrice } from '@/utils/format'
import type { AssetType } from '@/types/api'

export default function Watchlists() {
  const qc = useQueryClient()
  const lists = useQuery({ queryKey: ['watchlists'], queryFn: api.watchlists })
  const [sel, setSel] = useState<number | null>(null)
  const [newName, setNewName] = useState('')
  const [type, setType] = useState<AssetType>('stock')
  const [sym, setSym] = useState('')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => { if (lists.data && (sel == null || !lists.data.some((l) => l.id === sel))) setSel(lists.data[0]?.id ?? null) }, [lists.data, sel])
  const quotes = useQuery({ queryKey: ['watch-quotes', sel], queryFn: () => api.watchQuotes(sel!), enabled: sel != null, refetchInterval: 30_000 })
  const inval = () => { qc.invalidateQueries({ queryKey: ['watchlists'] }); qc.invalidateQueries({ queryKey: ['watch-quotes'] }) }
  const fail = (e: unknown) => setErr(errMsg(e))
  const create = useMutation({ mutationFn: () => api.createWatchlist(newName), onSuccess: (w) => { setNewName(''); setSel(w.id); setErr(null); inval() }, onError: fail })
  const del = useMutation({ mutationFn: (id: number) => api.deleteWatchlist(id), onSuccess: inval, onError: fail })
  const add = useMutation({ mutationFn: () => api.addWatchItem(sel!, { asset_type: type, symbol: type === 'crypto' ? sym.trim().toLowerCase() : sym.trim().toUpperCase() }), onSuccess: () => { setSym(''); setErr(null); inval() }, onError: fail })
  const rm = useMutation({ mutationFn: (id: number) => api.removeWatchItem(sel!, id), onSuccess: inval, onError: fail })

  if (lists.isLoading) return <Card><SkeletonRows /></Card>
  if (lists.isError) return <Card><ErrorState message={errMsg(lists.error)} onRetry={() => lists.refetch()} /></Card>
  const current = lists.data?.find((l) => l.id === sel)
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Watchlists</h1>
      <div className="grid gap-4 lg:grid-cols-4">
        <Card className="lg:col-span-1">
          <CardHeader title="Your lists" />
          <ul>{lists.data?.map((l) => (
            <li key={l.id} className="flex items-center border-b border-line/60 last:border-0">
              <button onClick={() => setSel(l.id)} className={'flex-1 px-4 py-2.5 text-left text-sm ' + (l.id === sel ? 'text-accent' : 'hover:text-accent')}>{l.name} <span className="text-xs text-muted">({l.items.length})</span></button>
              <IconButton label={`Delete ${l.name}`} onClick={() => confirm(`Delete watchlist "${l.name}"?`) && del.mutate(l.id)}><Trash2 size={14} /></IconButton>
            </li>))}</ul>
          <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) create.mutate() }}>
            <Input aria-label="New watchlist name" placeholder="New list…" value={newName} onChange={(e) => setNewName(e.target.value)} /><Button type="submit" variant="primary"><Plus size={14} /></Button>
          </form>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title={current?.name ?? 'Watchlist'} />
          {current && (
            <form className="flex flex-wrap items-end gap-2 border-b border-line p-3" onSubmit={(e) => { e.preventDefault(); if (sym.trim()) add.mutate() }}>
              <Select label="Type" value={type} onChange={(e) => setType(e.target.value as AssetType)} className="w-32"><option value="stock">Stock</option><option value="crypto">Crypto</option><option value="forex">Currency pair</option></Select>
              <Input label={type === 'crypto' ? 'CoinGecko id (e.g. bitcoin)' : type === 'forex' ? 'Pair (e.g. EUR/USD)' : 'Ticker (e.g. AAPL)'} value={sym} onChange={(e) => setSym(e.target.value)} className="w-64" />
              <Button type="submit" variant="primary" disabled={add.isPending}>Add</Button>
            </form>)}
          {err && <p role="alert" className="px-4 pt-2 text-xs text-down">{err}</p>}
          {!current ? <EmptyState title="Create a watchlist to get started" /> : current.items.length === 0 ? <EmptyState title="This watchlist is empty" hint="Add stocks, cryptocurrencies or currency pairs above, or use the star button on any detail page." /> : (
            <Table><thead><tr><th className={th}>Instrument</th><th className={th}>Type</th><th className={th + ' text-right'}>Price</th><th className={th + ' text-right'}>Change</th><th className={th}>Data</th><th className={th}></th></tr></thead>
              <tbody>{current.items.map((it) => {
                const r = quotes.data?.find((x) => x.id === it.id)
                return <tr key={it.id}><td className={td}><Link className="flex items-center gap-2 font-medium hover:text-accent" to={instrumentPath(it.asset_type, it.symbol)}>{it.asset_type === 'crypto' && <Logo src={r?.data?.image} name={r?.data?.name ?? it.symbol} size={20} />}{it.symbol} <span className="text-xs font-normal text-muted">{r?.data?.name ?? it.name}</span></Link></td><td className={td + ' capitalize text-muted'}>{it.asset_type}</td>
                  <td className={td + ' num text-right'}>{quotes.isLoading ? '…' : r?.data?.price != null ? fmtPrice(r.data.price, it.asset_type === 'forex' ? 4 : 2) : '—'}</td><td className={td + ' text-right'}><Change v={r?.data?.change_pct} /></td>
                  <td className={td}>{r ? <span title={r.message ?? ''}><StatusBadge status={r.status} /></span> : null}</td>
                  <td className={td + ' text-right'}><IconButton label={`Remove ${it.symbol}`} onClick={() => rm.mutate(it.id)}><Trash2 size={14} /></IconButton></td></tr>
              })}</tbody></Table>)}
        </Card>
      </div>
    </div>
  )
}
