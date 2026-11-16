import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api } from '@/services/api'
import { Button, Card, Input } from '@/components/ui/primitives'
import { EnvelopeView } from '@/components/ui/DataState'
import { ArticleList } from '@/components/market/ArticleList'
import { useDebounce } from '@/hooks/useLive'
import { cn } from '@/utils/format'

const CATS = ['global-markets', 'stocks', 'cryptocurrency', 'forex', 'business', 'technology', 'economy', 'companies', 'banking', 'commodities']
const label = (c: string) => c.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')

export default function News() {
  const [cat, setCat] = useState('global-markets')
  const [text, setText] = useState('')
  const [symbol, setSymbol] = useState('')
  const [page, setPage] = useState(1)
  const dq = useDebounce(text, 350)
  const ds = useDebounce(symbol.trim().toUpperCase(), 500)
  const q = useQuery({ queryKey: ['news', cat, dq, ds, page], queryFn: () => api.news({ category: cat, q: dq || undefined, symbol: ds || undefined, page, per_page: 15 }), placeholderData: keepPreviousData })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Financial news</h1>
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="News categories">
        {CATS.map((c) => <button key={c} role="tab" aria-selected={c === cat && !ds} onClick={() => { setCat(c); setSymbol(''); setPage(1) }}
          className={cn('rounded-full border px-3 py-1 text-xs transition', c === cat && !ds ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted hover:text-fg')}>{label(c)}</button>)}
      </div>
      <Card>
        <div className="flex flex-wrap gap-3 border-b border-line p-3">
          <Input aria-label="Search headlines" placeholder="Search headlines…" value={text} onChange={(e) => { setText(e.target.value); setPage(1) }} className="w-64" />
          <Input aria-label="Company ticker" placeholder="Company news: ticker (e.g. AAPL)" value={symbol} onChange={(e) => { setSymbol(e.target.value); setPage(1) }} className="w-64" />
        </div>
        <EnvelopeView query={q} isEmpty={(d) => d.items.length === 0} emptyTitle="No articles match" emptyHint="Try another category or clear the search.">
          {(d, meta) => (
            <>
              <ArticleList items={d.items} />
              <div className="flex items-center justify-between border-t border-line p-3">
                <Button size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="text-xs text-muted">Page {page} of {Math.max(1, Math.ceil(d.total / d.per_page))} · {d.total} articles</span>
                <Button size="sm" disabled={page * d.per_page >= d.total} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
              {meta.attribution && <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{meta.attribution}</p>}
            </>
          )}
        </EnvelopeView>
      </Card>
    </div>
  )
}
