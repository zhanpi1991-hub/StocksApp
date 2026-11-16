import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, CircleAlert, CircleSlash, Clock, Hourglass } from 'lucide-react'
import { api } from '@/services/api'
import { Card, CardHeader, SkeletonRows } from '@/components/ui/primitives'
import { ErrorState } from '@/components/ui/DataState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { cn, errMsg, timeAgo } from '@/utils/format'
import type { DataStatus, ProviderHealth } from '@/types/api'

const STATE: Record<ProviderHealth['state'], { label: string; icon: typeof CheckCircle2; cls: string; text: string }> = {
  ok: { label: 'Working', icon: CheckCircle2, cls: 'text-up', text: 'Last request succeeded.' },
  idle: { label: 'Ready', icon: Clock, cls: 'text-accent', text: 'Key configured; no request made since the API started.' },
  not_configured: { label: 'No API key', icon: CircleSlash, cls: 'text-muted', text: 'Features that depend on this provider show "unavailable".' },
  rate_limited: { label: 'Rate limited', icon: Hourglass, cls: 'text-warn', text: 'Provider throttled us; requests are paused during the cool-down.' },
  error: { label: 'Last request failed', icon: CircleAlert, cls: 'text-down', text: 'Last request failed (bad key, paid endpoint, or provider outage).' },
}

const POWERS: Record<string, string> = {
  finnhub: 'Stock quotes, company profile and metrics, company/market news (with images), IPO calendar, earnings, dividends',
  twelve_data: 'Stock price history and charts, global index quotes (S&P 500, FTSE, DAX, Nikkei, Hang Seng, KOSPI, MOEX, KASE)',
  fmp: 'Financial statements, market movers, stock screener, sector heatmap, economic calendar',
  coingecko: 'Cryptocurrency lists, details, logos, charts, trending, dominance',
  frankfurter: 'Forex rates, history and the currency converter',
}

const LEGEND: { s: DataStatus; t: string }[] = [
  { s: 'realtime', t: 'The provider says the figure is real time (e.g. Finnhub US quotes).' },
  { s: 'delayed', t: 'Delayed, aggregated or daily-reference data. Never presented as real time.' },
  { s: 'historical', t: 'Past data (charts, statements, history).' },
  { s: 'cached', t: 'The provider failed; showing the last good response with its original timestamp.' },
  { s: 'demo', t: 'Development-only static sample data (DEMO_MODE). Not market data.' },
  { s: 'unavailable', t: 'No data. Reason is shown: missing key, paid plan, rate limit, or network problem.' },
]

export default function Status() {
  const q = useQuery({ queryKey: ['providers'], queryFn: api.providers, refetchInterval: 15_000 })
  const h = useQuery({ queryKey: ['health'], queryFn: api.health, refetchInterval: 15_000 })
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Data providers</h1>
      <p className="text-sm text-muted">API keys are held by the backend and are never sent to the browser. A provider without a key shows an explanatory "unavailable" state instead of placeholder numbers, and one failing provider never takes down the rest of the app.</p>
      {q.data?.demo_mode && <Card className="border-warn/40 p-3 text-sm text-warn">DEMO MODE is on: where a key is missing, a few symbols show clearly labelled static sample data.</Card>}

      <Card>
        <CardHeader title="How to read data statuses" />
        <ul className="grid gap-2 p-4 sm:grid-cols-2">
          {LEGEND.map((l) => <li key={l.s} className="flex items-start gap-2 text-xs text-muted"><StatusBadge status={l.s} className="mt-0.5 shrink-0" />{l.t}</li>)}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Backend" />
        <p className="p-4 text-sm">{h.isError ? <span className="text-down">API unreachable - is the backend running?</span> : h.data ? <>API <b>{h.data.status}</b> · database {h.data.database ? 'connected' : 'down'} · redis {String(h.data.redis)}</> : '…'}</p>
      </Card>

      {q.isLoading ? <Card><SkeletonRows /></Card> : q.isError ? <Card><ErrorState message={errMsg(q.error)} onRetry={() => q.refetch()} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data!.providers.map((p) => {
            const st = STATE[p.state] ?? STATE.idle
            const Icon = st.icon
            return (
              <Card key={p.name} className="p-4">
                <div className="flex items-center gap-2"><Icon size={18} className={st.cls} /><h2 className="font-semibold">{p.name}</h2>
                  <span className={cn('ml-auto text-xs font-medium', st.cls)}>{st.label}</span></div>
                <p className="mt-1 text-xs text-muted">{st.text}{p.state === 'rate_limited' && ` Resumes in about ${p.cooldown_seconds}s.`}</p>
                <p className="mt-2 text-xs"><span className="text-muted">Powers:</span> {POWERS[p.name]}</p>
                <p className="mt-2 text-xs text-muted">{q.data!.notes[p.name]}</p>
                {!p.configured && <p className="mt-2 text-xs">Set <code className="num rounded bg-surface-2 px-1">{p.key_env}</code> in the backend environment and restart the API.</p>}
                <p className="mt-2 text-[11px] text-muted">Sent upstream {p.calls}{p.budget_per_minute ? ` (${p.calls_last_minute}/${p.budget_per_minute} this minute)` : ''} · served from cache {p.cache_hits} · shared in-flight {p.deduped} · paused locally {p.throttled} · errors {p.errors} · last success {p.last_ok ? timeAgo(p.last_ok) : 'never'}</p>
                {p.last_error && <p className="mt-1 text-[11px] text-warn">Last error: {p.last_error}</p>}
              </Card>)
          })}
        </div>)}
    </div>
  )
}
