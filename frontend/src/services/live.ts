import type { DataStatus } from '@/types/api'
import { useAuth } from '@/store/auth'
import { wsUrl } from '@/services/config'

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

const HEARTBEAT_MS = 25_000 // keeps idle connections from being closed by proxies

/**
 * Singleton WebSocket client: reference-counted subscriptions, exponential-backoff reconnect, heartbeat.
 * The JWT is sent in an "auth" message after connecting, never in the URL (URLs end up in server logs).
 */
class LiveClient {
  private ws: WebSocket | null = null
  private listeners = new Map<string, Set<Listener>>()
  private retry = 0
  private timer: number | undefined
  private heartbeat: number | undefined
  connected = false
  private statusListeners = new Set<(c: boolean) => void>()

  constructor() {
    // Logging in/out while connected re-associates the socket with the right user.
    useAuth.subscribe((s, prev) => {
      if (s.token !== prev.token) this.sendAuth()
    })
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg))
  }

  private sendAuth() {
    this.send({ action: 'auth', token: useAuth.getState().token })
  }

  private connect() {
    if (this.ws || this.listeners.size === 0) return
    const ws = new WebSocket(wsUrl())
    this.ws = ws
    ws.onopen = () => {
      this.retry = 0
      this.setConnected(true)
      if (useAuth.getState().token) this.sendAuth()
      const keys = [...this.listeners.keys()]
      if (keys.length) this.send({ action: 'subscribe', keys })
      window.clearInterval(this.heartbeat)
      this.heartbeat = window.setInterval(() => this.send({ action: 'ping' }), HEARTBEAT_MS)
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
      window.clearInterval(this.heartbeat)
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
      if (isNew) this.send({ action: 'subscribe', keys: [key] })
    } else this.connect()
    return () => {
      set.delete(l)
      if (set.size === 0) {
        this.listeners.delete(key)
        this.send({ action: 'unsubscribe', keys: [key] })
        if (this.listeners.size === 0) {
          window.clearTimeout(this.timer)
          window.clearInterval(this.heartbeat)
          this.ws?.close()
        }
      }
    }
  }
}

export const live = new LiveClient()
