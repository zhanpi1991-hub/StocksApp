import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, Search } from 'lucide-react'
import { api } from '@/services/api'
import { useDebounce } from '@/hooks/useLive'
import { useUi } from '@/store/ui'
import { Skeleton } from '@/components/ui/primitives'
import { Logo } from '@/components/market/bits'
import { cn } from '@/utils/format'

interface Item { group: string; label: string; sub?: string; to: string; image?: string | null }

export function SearchBox() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const dq = useDebounce(q.trim(), 300)
  const nav = useNavigate()
  const box = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const { recent, addRecent, clearRecent } = useUi()

  const res = useQuery({ queryKey: ['search', dq], queryFn: () => api.search(dq), enabled: dq.length > 0, staleTime: 60_000 })

  const items = useMemo<Item[]>(() => {
    if (!dq) return recent.map((r) => ({ group: 'Recent', label: r.label, to: r.to }))
    const d = res.data
    if (!d) return []
    return [
      ...d.stocks.map((s) => ({ group: 'Stocks', label: s.symbol, sub: s.name, to: `/stocks/${encodeURIComponent(s.symbol)}` })),
      ...d.crypto.map((c) => ({ group: 'Crypto', label: c.symbol, sub: c.name, to: `/crypto/${c.id}`, image: c.image })),
      ...d.forex.map((p) => ({ group: 'Currency pairs', label: p, to: `/forex?pair=${encodeURIComponent(p)}` })),
      ...d.indices.map((i) => ({ group: 'Indices', label: i.code, sub: i.name, to: '/' })),
    ]
  }, [dq, res.data, recent])

  useEffect(() => setActive(0), [items.length, dq])
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        input.current?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  function go(it: Item) {
    addRecent({ label: it.sub ? `${it.label} - ${it.sub}` : it.label, to: it.to })
    setOpen(false)
    setQ('')
    nav(it.to)
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && items[active]) go(items[active])
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur() }
  }

  let lastGroup = ''
  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
      <input
        ref={input}
        role="combobox"
        aria-expanded={open}
        aria-controls="search-list"
        aria-label="Search stocks, crypto, currencies and indices"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search markets  (Ctrl K)"
        className="h-9 w-full rounded-md border border-line bg-surface-2 pl-9 pr-3 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
      />
      {open && (
        <div id="search-list" role="listbox" className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-2xl">
          {dq && res.isFetching && !res.data && <div className="space-y-2 p-3"><Skeleton /><Skeleton className="w-2/3" /></div>}
          {dq && res.isError && <p className="p-3 text-xs text-down">Search failed. Is the API running?</p>}
          {dq && res.data && items.length === 0 && <p className="p-3 text-xs text-muted">No results for "{dq}".</p>}
          {dq && res.data?.unavailable.stocks && <p className="px-3 py-1.5 text-[11px] text-warn">Stock search unavailable: {res.data.notes[0]}</p>}
          {!dq && recent.length === 0 && <p className="p-3 text-xs text-muted">Search by symbol or name.</p>}
          {!dq && recent.length > 0 && (
            <button onClick={clearRecent} className="float-right px-2 py-1 text-[11px] text-muted hover:text-fg">Clear</button>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.to + i}>
                {header && <p className="flex items-center gap-1 px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted">{header === 'Recent' && <Clock size={10} />}{header}</p>}
                <div role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(it)}
                  className={cn('flex cursor-pointer items-center justify-between rounded-md px-3 py-1.5', i === active && 'bg-surface-2')}>
                  <span className="flex items-center gap-2">{it.group === 'Crypto' && <Logo src={it.image} name={it.label} size={18} />}<span className="num font-medium">{it.label}</span></span>
                  {it.sub && <span className="ml-3 truncate text-xs text-muted">{it.sub}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
