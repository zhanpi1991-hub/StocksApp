/**
 * Where the backend lives.
 *
 * Local dev and the Docker/nginx setup: unset -> same-origin "/api" (proxied by Vite or nginx).
 * Vercel (static hosting, backend elsewhere): set VITE_API_URL=https://<your-api-host>/api at BUILD time.
 * The WebSocket URL is derived from VITE_API_URL unless VITE_WS_URL is set. Vercel rewrites are not used for the
 * WebSocket because proxying upgraded connections through them is not documented, so the browser connects directly.
 *
 * Only VITE_API_URL / VITE_WS_URL exist, and both are public values: never put a provider key in a VITE_ variable,
 * because Vite inlines them into the downloadable bundle.
 */
const env = import.meta.env

export const API_BASE: string = String(env.VITE_API_URL ?? '/api').replace(/\/+$/, '')

export function wsUrl(): string {
  if (env.VITE_WS_URL) return String(env.VITE_WS_URL)
  if (/^https?:\/\//i.test(API_BASE)) return API_BASE.replace(/^http/i, 'ws') + '/ws'
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${API_BASE}/ws`
}
