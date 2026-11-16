import { Link } from 'react-router-dom'
import { ExternalLink, Newspaper } from 'lucide-react'
import type { Article } from '@/types/api'
import { RemoteImage } from '@/components/ui/RemoteImage'
import { timeAgo } from '@/utils/format'

/** Thumbnail from the provider's own image URL; a neutral placeholder tile when absent or failing. */
export function ArticleThumb({ src, source }: { src: string | null; source: string }) {
  return (
    <RemoteImage
      src={src}
      className="h-16 w-24 shrink-0 rounded-md bg-surface-2 object-cover"
      fallback={
        <div aria-hidden title="No image provided" className="grid h-16 w-24 shrink-0 place-items-center rounded-md border border-line bg-surface-2 text-muted">
          <div className="flex flex-col items-center gap-0.5">
            <Newspaper size={16} />
            <span className="max-w-20 truncate text-[9px] uppercase tracking-wider">{source || 'News'}</span>
          </div>
        </div>
      }
    />
  )
}

export function ArticleList({ items }: { items: Article[] }) {
  return (
    <ul className="divide-y divide-line/60">
      {items.map((a) => (
        <li key={a.id + a.url} className="flex gap-3 p-4">
          <div className="hidden sm:block"><ArticleThumb src={a.image} source={a.source} /></div>
          <div className="min-w-0">
            <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-start gap-1 font-medium hover:text-accent">
              {a.headline} <ExternalLink size={12} className="mt-1 shrink-0 text-muted" />
            </a>
            {a.summary && <p className="mt-1 line-clamp-2 text-xs text-muted">{a.summary}</p>}
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
              <span className="font-medium text-fg/80">{a.source}</span>
              <span>{timeAgo(a.published_at)}</span>
              {a.related.slice(0, 4).map((r) => <Link key={r} to={`/stocks/${r}`} className="num rounded bg-surface-2 px-1.5 py-0.5 hover:text-accent">{r}</Link>)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
