import type { ReactNode } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox, KeyRound, Lock, RefreshCw } from 'lucide-react'
import { Button, SkeletonRows } from './primitives'
import { StatusBadge } from './StatusBadge'
import type { Envelope, Meta } from '@/types/api'
import { errMsg } from '@/utils/format'

export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-muted">
      {icon ?? <Inbox size={28} />}
      <p className="font-medium text-fg">{title}</p>
      {hint && <p className="max-w-md text-xs">{hint}</p>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <AlertTriangle size={26} className="text-down" />
      <p className="font-medium">Could not load data</p>
      <p className="max-w-md text-xs text-muted">{message}</p>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          <RefreshCw size={12} /> Retry
        </Button>
      )}
    </div>
  )
}

const REASON: Record<string, { title: string; hint: string; retry: boolean }> = {
  no_key: { title: 'API key not configured', hint: 'The backend has no key for this provider. Add it to the backend environment and restart; no placeholder data is shown.', retry: false },
  plan_required: { title: 'Requires a paid provider plan', hint: 'The provider rejected this request for the current key or plan.', retry: false },
  rate_limited: { title: 'Provider rate limit reached', hint: 'The provider is throttling requests. The backend is backing off automatically; try again in a little while.', retry: true },
  network: { title: 'Provider unreachable', hint: 'A temporary network problem prevented reaching the data provider.', retry: true },
  bad_response: { title: 'Unexpected provider response', hint: 'The provider returned data in a shape the app could not read.', retry: true },
  provider_error: { title: 'Data unavailable', hint: '', retry: true },
}

export function UnavailableState({ meta, onRetry }: { meta: Meta; onRetry?: () => void }) {
  const r = REASON[meta.reason ?? (meta.plan_required ? 'plan_required' : 'provider_error')] ?? REASON.provider_error
  return (
    <div role="status" className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      {meta.reason === 'no_key' ? <KeyRound size={26} className="text-warn" /> : <Lock size={26} className="text-warn" />}
      <p className="font-medium">{r.title}</p>
      {r.hint && <p className="max-w-lg text-xs text-muted">{r.hint}</p>}
      {meta.message && <p className="max-w-lg text-xs text-muted/80">{meta.message}</p>}
      <div className="flex items-center gap-3 text-[11px] text-muted">
        <span>Source: <span className="num">{meta.provider}</span></span>
        <Link to="/status" className="text-accent">Provider status</Link>
        {r.retry && onRetry && (
          <Button size="sm" onClick={onRetry}>
            <RefreshCw size={12} /> Retry
          </Button>
        )}
      </div>
    </div>
  )
}

/** Renders an Envelope query with loading / error / unavailable / empty states and a data-status footer. */
export function EnvelopeView<T>({
  query, children, isEmpty, emptyTitle = 'Nothing to show', emptyHint, skeleton, footer = true,
}: {
  query: UseQueryResult<Envelope<T>>
  children: (data: T, meta: Meta) => ReactNode
  isEmpty?: (d: T) => boolean
  emptyTitle?: string
  emptyHint?: string
  skeleton?: ReactNode
  footer?: boolean
}) {
  if (query.isLoading) return <>{skeleton ?? <SkeletonRows />}</>
  if (query.isError) return <ErrorState message={errMsg(query.error)} onRetry={() => query.refetch()} />
  const env = query.data
  if (!env) return null
  if (env.meta.status === 'unavailable' || env.data == null) return <UnavailableState meta={env.meta} onRetry={() => query.refetch()} />
  if (isEmpty?.(env.data)) return <EmptyState title={emptyTitle} hint={emptyHint} />
  return (
    <div className="fade-in">
      {env.meta.status === 'cached' && (
        <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-xs text-warn">{env.meta.message}</div>
      )}
      {env.meta.status === 'demo' && (
        <div className="border-b border-warn/30 bg-warn/10 px-4 py-1.5 text-xs font-medium text-warn">DEMO MODE - {env.meta.message}</div>
      )}
      {children(env.data, env.meta)}
      {footer && (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2 text-[11px] text-muted">
          <StatusBadge status={env.meta.status} />
          <span>{env.meta.provider}</span>
          {env.meta.as_of && <span>as of {new Date(env.meta.as_of).toLocaleTimeString()}</span>}
          {env.meta.message && env.meta.status !== 'cached' && env.meta.status !== 'demo' && <span className="basis-full sm:basis-auto">{env.meta.message}</span>}
        </div>
      )}
    </div>
  )
}
