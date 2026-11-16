import { useEffect, useState } from 'react'
import { live, type LiveQuote } from '@/services/live'

export function useLiveQuote(key: string | null) {
  const [q, setQ] = useState<LiveQuote | null>(null)
  useEffect(() => {
    if (!key) return
    setQ(null)
    return live.subscribe(key, setQ)
  }, [key])
  return q
}

export function useLiveConnected() {
  const [c, setC] = useState(live.connected)
  useEffect(() => {
    const off = live.onConnection(setC)
    return () => {
      off()
    }
  }, [])
  return c
}

export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
