import { useQuery } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { api } from '@/services/api'
import { API_BASE } from '@/services/config'

/** Shown when the frontend cannot reach a working StocksApp API (typical first-deployment mistake). */
export function ApiBanner() {
  const q = useQuery({ queryKey: ['api-health'], queryFn: api.health, retry: 1, staleTime: 5 * 60_000, refetchOnWindowFocus: false })
  if (q.isLoading) return null
  const broken = q.isError || typeof (q.data as { status?: unknown } | undefined)?.status !== 'string'
  if (!broken) return null
  const crossOrigin = /^https?:\/\//i.test(API_BASE)
  return (
    <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
      <TriangleAlert size={16} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-medium">Cannot reach the StocksApp API{crossOrigin ? ` at ${API_BASE}` : ''}.</p>
        <p className="mt-0.5 text-xs">
          {crossOrigin
            ? 'Check that the backend is running (a free Render service may take about a minute to wake up) and that CORS_ORIGINS on the backend includes this site.'
            : 'Start the backend, or build the frontend with VITE_API_URL set to your API (for example https://your-api.onrender.com/api).'}
        </p>
      </div>
    </div>
  )
}
