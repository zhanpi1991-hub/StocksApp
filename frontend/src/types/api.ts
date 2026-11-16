export type DataStatus = 'realtime' | 'delayed' | 'historical' | 'cached' | 'unavailable' | 'demo'

export type UnavailableReason = 'no_key' | 'plan_required' | 'rate_limited' | 'network' | 'provider_error' | 'bad_response'

export interface Meta {
  provider: string
  status: DataStatus
  as_of: string | null
  message: string | null
  plan_required?: boolean
  reason?: UnavailableReason | null
  range?: string
  interval?: string
  attribution?: string
  majors?: string[]
}

export interface Envelope<T> {
  data: T | null
  meta: Meta
}

export type AssetType = 'stock' | 'crypto' | 'forex'

export interface Quote {
  symbol: string
  name?: string
  price: number | null
  change?: number | null
  change_pct?: number | null
  open?: number | null
  high?: number | null
  low?: number | null
  prev_close?: number | null
  volume?: number | null
  currency?: string
  high_52w?: number | null
  low_52w?: number | null
  timestamp?: number | string | null
}

export interface Session {
  exchange: string
  name: string
  timezone: string
  local_time: string
  status: 'open' | 'closed'
  basis: string
  note: string
}

export interface IndexRow {
  code: string
  name: string
  exchange: string
  session: Session
  quote: Quote | null
  status: DataStatus
  reason?: UnavailableReason | null
  message: string | null
  as_of: string | null
}

export interface Mover {
  symbol: string
  name: string
  price: number | null
  change: number | null
  change_pct: number | null
  exchange?: string
}

export interface Coin {
  id: string
  symbol: string
  name: string
  image: string | null
  price: number | null
  market_cap: number | null
  rank: number | null
  volume: number | null
  high_24h: number | null
  low_24h: number | null
  change_1h: number | null
  change_24h: number | null
  change_7d: number | null
  circulating_supply: number | null
  total_supply: number | null
  max_supply: number | null
  ath: number | null
  ath_change_pct: number | null
  sparkline: number[] | null
}

export interface CoinDetail extends Partial<Coin> {
  description: string
  categories: string[]
  homepage: string | null
  genesis_date: string | null
  atl: number | null
  fdv: number | null
  change_30d: number | null
  change_1y: number | null
}

export interface CryptoGlobal {
  total_market_cap: number | null
  total_volume: number | null
  change_24h: number | null
  dominance: Record<string, number>
  active_coins: number
}

export interface Candle {
  time: number | string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface LinePoint {
  time: number | string
  value: number
}

export interface Article {
  id: string
  headline: string
  summary: string
  source: string
  url: string
  image: string | null
  published_at: string | null
  category: string | null
  related: string[]
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  per_page: number
}

export interface Profile {
  symbol: string
  name: string
  exchange: string
  industry: string
  country: string
  currency: string
  ipo: string
  market_cap: number | null
  shares_outstanding: number | null
  website: string
  logo: string
  phone: string
}

export interface Metrics {
  pe: number | null
  eps: number | null
  dividend_yield: number | null
  high_52w: number | null
  low_52w: number | null
  return_52w: number | null
  beta: number | null
  avg_volume_10d: number | null
  pb: number | null
  ps: number | null
  roe: number | null
  net_margin: number | null
}

export interface User {
  id: number
  email: string
  display_name: string
  theme: 'dark' | 'light'
  base_currency: string
}

export interface WatchlistItem {
  id: number
  asset_type: AssetType
  symbol: string
  name: string
}
export interface Watchlist {
  id: number
  name: string
  items: WatchlistItem[]
}
export interface WatchRow {
  id: number
  asset_type: AssetType
  symbol: string
  name: string
  data: { price: number | null; change_pct?: number | null; name?: string; image?: string | null } | null
  status: DataStatus
  message: string | null
}

export interface Alert {
  id: number
  asset_type: AssetType
  symbol: string
  name: string
  condition: 'above' | 'below' | 'pct_up' | 'pct_down'
  threshold: string
  reference_price: string | null
  active: boolean
  triggered_at: string | null
  triggered_price: string | null
  last_checked_at: string | null
  last_error: string | null
  created_at: string
}

export interface Holding {
  asset_type: AssetType
  symbol: string
  name: string
  quantity: string
  avg_cost: string
  cost_basis: string
  price: string | null
  market_value: string | null
  unrealized_pnl: string | null
  unrealized_pnl_pct: string | null
  realized_pnl: string
  weight_pct: string | null
  price_status: DataStatus
  price_message: string | null
}
export interface Transaction {
  id: number
  asset_type: AssetType
  symbol: string
  name: string
  side: 'buy' | 'sell'
  quantity: string
  price: string
  fee: string
  executed_at: string
  note: string
}
export interface PortfolioDetail {
  id: number
  name: string
  currency: string
  totals: { market_value: string; cost_basis: string; unrealized_pnl: string; realized_pnl: string; total_pnl: string; unpriced_holdings: number; note: string | null }
  holdings: Holding[]
  allocation: { asset_type: string; value: string; pct: string }[]
  timeline: { time: string; net_invested: string }[]
  transactions: Transaction[]
}

export interface ProviderHealth {
  state: 'not_configured' | 'rate_limited' | 'error' | 'ok' | 'idle'
  cooldown_seconds: number
  name: string
  configured: boolean
  requires_key: boolean
  key_env: string
  last_ok: string | null
  last_error: string | null
  calls: number
  errors: number
  cache_hits: number
  deduped: number
  throttled: number
  budget_per_minute: number
  calls_last_minute: number
}

export interface EconEvent {
  event: string
  country: string | null
  currency: string | null
  time: string | null
  impact: string | null
  previous: number | null
  forecast: number | null
  actual: number | null
  unit: string | null
}

export interface IpoItem {
  company: string
  symbol: string | null
  exchange: string | null
  date: string | null
  price_range: string | null
  shares: number | null
  status: string | null
  total_value: number | null
}

export interface SearchResults {
  query: string
  stocks: { symbol: string; name: string; type?: string }[]
  crypto: { id: string; symbol: string; name: string; image: string | null }[]
  indices: { code: string; name: string }[]
  forex: string[]
  unavailable: { stocks: boolean; crypto: boolean }
  notes: string[]
}

export interface CompareRow {
  symbol: string
  name: string | null
  price: number | null
  change_pct: number | null
  market_cap: number | null
  pe: number | null
  eps: number | null
  dividend_yield: number | null
  revenue: number | null
  net_income: number | null
  fiscal_year: string | null
  performance_1y: LinePoint[]
  availability: Record<string, DataStatus>
  messages: string[]
}
