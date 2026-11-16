import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Star } from 'lucide-react'
import { api } from '@/services/api'
import { useAuth } from '@/store/auth'
import type { AssetType } from '@/types/api'
import { Button, Input, Modal, Select, IconButton } from '@/components/ui/primitives'
import { RemoteImage } from '@/components/ui/RemoteImage'
import { coinImageAlternates } from '@/utils/images'
import { cn, errMsg, fmtPct, tone } from '@/utils/format'

export function Change({ v, className }: { v: number | null | undefined; className?: string }) {
  return <span className={cn('num', tone(v), className)}>{fmtPct(v)}</span>
}

export function Logo({ src, name, size = 24 }: { src?: string | null; name: string; size?: number }) {
  const box = { width: size, height: size }
  return (
    <RemoteImage
      src={src}
      alternates={coinImageAlternates(src)}
      style={box}
      className="shrink-0 rounded-full bg-surface-2 object-cover"
      fallback={
        <span aria-hidden style={box} className="grid shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted">
          {name.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || '?'}
        </span>
      }
    />
  )
}

export function instrumentPath(t: AssetType, symbol: string): string {
  return t === 'stock' ? `/stocks/${encodeURIComponent(symbol)}` : t === 'crypto' ? `/crypto/${encodeURIComponent(symbol)}` : `/forex?pair=${encodeURIComponent(symbol)}`
}

export function SymbolLink({ t, symbol, children }: { t: AssetType; symbol: string; children?: React.ReactNode }) {
  return (
    <Link to={instrumentPath(t, symbol)} className="font-medium text-fg hover:text-accent">
      {children ?? symbol}
    </Link>
  )
}

function useRequireLogin() {
  const token = useAuth((s) => s.token)
  const nav = useNavigate()
  return (action: () => void) => (token ? action() : nav('/login'))
}

export function WatchButton({ assetType, symbol, name }: { assetType: AssetType; symbol: string; name?: string }) {
  const [open, setOpen] = useState(false)
  const [wid, setWid] = useState<number | ''>('')
  const [msg, setMsg] = useState<string | null>(null)
  const qc = useQueryClient()
  const guard = useRequireLogin()
  const lists = useQuery({ queryKey: ['watchlists'], queryFn: api.watchlists, enabled: open })
  const add = useMutation({
    mutationFn: () => api.addWatchItem(Number(wid || lists.data?.[0]?.id), { asset_type: assetType, symbol, name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['watchlists'] })
      setMsg('Added to watchlist.')
    },
    onError: (e) => setMsg(errMsg(e)),
  })
  return (
    <>
      <IconButton label="Add to watchlist" onClick={() => guard(() => { setMsg(null); setOpen(true) })}>
        <Star size={16} />
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title={`Add ${symbol} to watchlist`}>
        <div className="space-y-3">
          <Select label="Watchlist" value={wid} onChange={(e) => setWid(Number(e.target.value))}>
            {lists.data?.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </Select>
          {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
          <Button variant="primary" disabled={add.isPending || !lists.data?.length} onClick={() => add.mutate()}>Add</Button>
        </div>
      </Modal>
    </>
  )
}

export function AlertButton({ assetType, symbol, name }: { assetType: AssetType; symbol: string; name?: string }) {
  const [open, setOpen] = useState(false)
  const [condition, setCondition] = useState('above')
  const [threshold, setThreshold] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const qc = useQueryClient()
  const guard = useRequireLogin()
  const create = useMutation({
    mutationFn: () => api.createAlert({ asset_type: assetType, symbol, name, condition, threshold }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] })
      setMsg('Alert created. It is evaluated on the server and shown in the app (no email/push configured).')
    },
    onError: (e) => setMsg(errMsg(e)),
  })
  const pct = condition.startsWith('pct')
  return (
    <>
      <IconButton label="Create price alert" onClick={() => guard(() => { setMsg(null); setOpen(true) })}>
        <Bell size={16} />
      </IconButton>
      <Modal open={open} onClose={() => setOpen(false)} title={`Alert for ${symbol}`}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate() }}>
          <Select label="Condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
            <option value="above">Price at or above</option>
            <option value="below">Price at or below</option>
            <option value="pct_up">Rises by % from now</option>
            <option value="pct_down">Falls by % from now</option>
          </Select>
          <Input label={pct ? 'Percent' : 'Price'} type="number" step="any" min="0" required value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          {msg && <p role="status" className="text-xs text-muted">{msg}</p>}
          <Button type="submit" variant="primary" disabled={create.isPending}>Create alert</Button>
        </form>
      </Modal>
    </>
  )
}
