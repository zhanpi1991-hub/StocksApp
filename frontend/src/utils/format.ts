const NA = '—'

export function fmtPrice(v: number | null | undefined, max = 2): string {
  if (v == null || Number.isNaN(v)) return NA
  const digits = Math.abs(v) >= 1 ? max : Math.abs(v) >= 0.01 ? 4 : 8
  return v.toLocaleString('en-US', { minimumFractionDigits: Math.min(2, digits), maximumFractionDigits: digits })
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || Number.isNaN(v)) return NA
  return v.toLocaleString('en-US', { maximumFractionDigits: digits })
}

export function fmtCompact(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NA
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(v)
}

export function fmtMoney(v: number | null | undefined, currency = 'USD'): string {
  if (v == null || Number.isNaN(v)) return NA
  return `${currency === 'USD' ? '$' : ''}${fmtCompact(v)}${currency === 'USD' ? '' : ' ' + currency}`
}

export function fmtPct(v: number | null | undefined, digits = 2, sign = true): string {
  if (v == null || Number.isNaN(v)) return NA
  return `${sign && v > 0 ? '+' : ''}${v.toFixed(digits)}%`
}

export function fmtChange(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return NA
  return `${v > 0 ? '+' : ''}${fmtPrice(v)}`
}

export function dec(v: string | null | undefined, digits = 2): string {
  if (v == null) return NA
  const n = Number(v)
  return Number.isNaN(n) ? NA : n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function tone(v: number | null | undefined): string {
  if (v == null || v === 0) return 'text-muted'
  return v > 0 ? 'text-up' : 'text-down'
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return NA
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return NA
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

export function errMsg(e: unknown): string {
  const anyE = e as { response?: { status?: number; data?: { detail?: unknown } }; message?: string; code?: string }
  if (anyE && 'code' in anyE && !anyE.response && (anyE.code === 'ERR_NETWORK' || anyE.code === 'ECONNABORTED'))
    return 'Cannot reach the StocksApp API (network error or timeout). Check that the backend is running, then retry.'
  if (anyE?.response?.status === 429) return 'Too many requests. Please wait a moment and retry.'
  if ((anyE?.response?.status ?? 0) >= 500) return 'The server hit an error. Please retry shortly.'
  const d = anyE?.response?.data?.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x: { msg?: string }) => x.msg).filter(Boolean).join('; ')
  return anyE?.message ?? 'Something went wrong'
}
