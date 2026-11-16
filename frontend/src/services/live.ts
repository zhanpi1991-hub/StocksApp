import type { DataStatus } from '@/types/api'
import { useAuth } from '@/store/auth'

export interface LiveQuote {
  key: string
  status: DataStatus
  message: string | null
  mode: 'polling'
  interval_seconds: number
  data: { price: number | null; change_pct?: number | null } | null
  server_time: number
}
type Listener = (q: LiveQuote) => void

/** Singleton WebSocket client: reference-counted subscriptions, exponential-backoff reconnect. */
class LiveClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private retry = 0
  private timer: number | undefined
  connected = false
  private statusListeners = new Set<(c: boolean) => void>()

  private url(): string {
    const base = import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`
    const t = useAuth.getState().token
    return t ? `${base}?token=${encodeURIComponent(t)}` : base
  }

  private connect() {
    if (this.ws || this.listeners.size === 0) return
    const ws = new WebSocket(this.url())
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.setConnected(true)
      const keys = [...this.listeners.keys()]
      if (keys.length) ws.send(JSON.stringify({ action: 'subscribe', keys }))
    }
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data)
        if (m.type === 'quote') this.listeners.get(m.key)?.forEach((l) => l(m))
      } catch {
        /* ignore malformed */
      }
    }
    ws.onclose = () => {
      this.ws = null
      this.setConnected(false)
      if (this.listeners.size) {
        const delay = Math.min(30000, 1000 * 2 ** this.retry++)
        this.timer = window.setTimeout(() => this.connect(), delay)
      }
    }
    ws.onerror = () => ws.close()
  }

  private setConnected(c: boolean) {
    this.connected = c
    this.statusListeners.forEach((l) => l(c))
  }

  onConnection(l: (c: boolean) => void) {
    this.statusListeners.add(l)
    return () => this.statusListeners.delete(l)
  }

  subscribe(key: string, l: Listener) {
    const set = this.listeners.get(key) ?? new Set()
    const isNew = set.size === 0
    set.add(l)
    this.listeners.set(key, set)
    if (this.ws?.readyState === WebSocket.OPEN) {
      if (isNew) this.ws.send(JSON.stringify({ action: 'subscribe', keys: [key] }))
    } else this.connect()
    return () => {
      set.delete(l)
      if (set.size === 0) {
        this.listeners.delete(key)
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ action: 'unsubscribe', keys: [key] }))
        if (this.listeners.size === 0) {
          window.clearTimeout(this.timer)
          this.ws?.close()
        }
      }
    }
  }
}

export const live = new LiveClient()
