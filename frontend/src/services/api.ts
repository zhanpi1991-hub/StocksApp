import axios from 'axios'
import { useAuth } from '@/store/auth'
import { API_BASE } from '@/services/config'
import type {
  Alert, AssetType, Candle, CompareRow, Coin, CoinDetail, CryptoGlobal, EconEvent, Envelope, IndexRow, IpoItem, LinePoint,
  Metrics, Mover, Article, Paged, PortfolioDetail, Profile, ProviderHealth, Quote, SearchResults, Session, User, Watchlist,
  WatchRow,
} from '@/types/api'

// API keys never reach the browser: all provider calls go through the backend.
export const http = axios.create({ baseURL: API_BASE, timeout: 30000 })

http.interceptors.request.use((cfg) => {
  const token = useAuth.getState().token
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})
http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && useAuth.getState().token) useAuth.getState().logout()
    return Promise.reject(err)
  },
)

const get = async <T>(url: string, params?: object) => (await http.get<T>(url, { params })).data

export const api = {
  // market
  indices: () => get<Envelope<IndexRow[]>>('/market/indices'),
  sessions: () => get<Envelope<Session[]>>('/market/sessions'),
  movers: (kind: 'gainers' | 'losers' | 'active') => get<Envelope<Mover[]>>('/market/movers', { kind }),
  heatmap: () => get<Envelope<{ sector: string; change_pct: number | null }[]>>('/market/heatmap'),
  summary: () =>
    get<Envelope<{ open_exchanges: number; total_exchanges: number; indices_with_data: number; indices_total: number; advancing: number; declining: number; avg_change_pct: number | null }>>('/market/summary'),
  // stocks
  stockOverview: (s: string) =>
    get<{ symbol: string; quote: Envelope<Quote>; profile: Envelope<Profile>; metrics: Envelope<Metrics> }>(`/stocks/${encodeURIComponent(s)}/overview`),
  stockQuote: (s: string) => get<Envelope<Quote>>(`/stocks/${encodeURIComponent(s)}/quote`),
  stockHistory: (s: string, range: string) => get<Envelope<Candle[]>>(`/stocks/${encodeURIComponent(s)}/history`, { range }),
  statements: (s: string, kind: string, period: string) => get<Envelope<Record<string, unknown>[]>>(`/stocks/${encodeURIComponent(s)}/statements/${kind}`, { period }),
  earnings: (s: string) => get<Envelope<{ period: string; actual: number | null; estimate: number | null; surprise: number | null; surprise_pct: number | null }[]>>(`/stocks/${encodeURIComponent(s)}/earnings`),
  dividends: (s: string) => get<Envelope<{ ex_date: string; pay_date: string | null; amount: number | null; currency: string | null }[]>>(`/stocks/${encodeURIComponent(s)}/dividends`),
  stockNews: (s: string) => get<Envelope<Article[]>>(`/stocks/${encodeURIComponent(s)}/news`),
  // crypto
  cryptoMarkets: (p: object) => get<Envelope<Coin[]>>('/crypto/markets', p),
  cryptoGlobal: () => get<Envelope<CryptoGlobal>>('/crypto/global'),
  cryptoTrending: () => get<Envelope<{ id: string; symbol: string; name: string; image: string | null; rank: number | null; change_24h: number | null }[]>>('/crypto/trending'),
  cryptoMovers: () => get<Envelope<{ gainers: Coin[]; losers: Coin[] }>>('/crypto/movers'),
  cryptoCategories: () => get<Envelope<{ id: string; name: string }[]>>('/crypto/categories'),
  cryptoScreener: (p: object) => get<Envelope<Paged<Coin>>>('/crypto/screener', p),
  coin: (id: string) => get<Envelope<CoinDetail>>(`/crypto/${encodeURIComponent(id)}`),
  coinChart: (id: string, range: string) => get<Envelope<LinePoint[]>>(`/crypto/${encodeURIComponent(id)}/chart`, { range }),
  // forex
  currencies: () => get<Envelope<{ code: string; name: string }[]>>('/forex/currencies'),
  fxRates: (base: string, quotes: string) =>
    get<Envelope<{ base: string; rates: Record<string, { rate: number; date: string }> }>>('/forex/rates', { base, quotes }),
  fxPair: (base: string, quote: string) =>
    get<Envelope<{ base: string; quote: string; rate: number; date: string; previous: number | null; change: number | null; change_pct: number | null }>>('/forex/pair', { base, quote }),
  fxConvert: (base: string, quote: string, amount: number) =>
    get<Envelope<{ rate: number; date: string; amount: number; result: number }>>('/forex/convert', { base, quote, amount }),
  fxHistory: (base: string, quote: string, range: string) => get<Envelope<LinePoint[]>>('/forex/history', { base, quote, range }),
  // news / calendars / screener / search / compare
  news: (p: object) => get<Envelope<Paged<Article> & { categories: string[] }>>('/news', p),
  economic: (p: object) => get<Envelope<{ items: EconEvent[]; start: string; end: string; view: string }>>('/economic-calendar', p),
  ipo: (p?: object) => get<Envelope<{ items: IpoItem[]; start: string; end: string }>>('/ipo-calendar', p),
  stockScreener: (p: object) =>
    get<Envelope<Paged<{ symbol: string; name: string; sector: string | null; industry: string | null; exchange: string | null; price: number | null; market_cap: number | null; volume: number | null; beta: number | null; dividend: number | null }> & { supported_filters: string[] }>>('/screener/stocks', p),
  search: (q: string) => get<SearchResults>('/search', { q }),
  compare: (symbols: string) => get<{ data: CompareRow[] }>('/compare', { symbols }),
  providers: () => get<{ demo_mode: boolean; providers: ProviderHealth[]; notes: Record<string, string> }>('/providers'),
  health: () => get<{ status: string; database: boolean; redis: unknown; env: string }>('/health'),
  // auth + user data
  register: async (b: { email: string; password: string; display_name?: string }) => (await http.post<{ access_token: string; user: User }>('/auth/register', b)).data,
  login: async (b: { email: string; password: string }) => (await http.post<{ access_token: string; user: User }>('/auth/login', b)).data,
  me: () => get<User>('/auth/me'),
  updateMe: async (b: Partial<User> & { password?: string; current_password?: string }) => (await http.patch<User>('/auth/me', b)).data,
  watchlists: () => get<Watchlist[]>('/watchlists'),
  createWatchlist: async (name: string) => (await http.post<Watchlist>('/watchlists', { name })).data,
  renameWatchlist: async (id: number, name: string) => (await http.patch<Watchlist>(`/watchlists/${id}`, { name })).data,
  deleteWatchlist: (id: number) => http.delete(`/watchlists/${id}`),
  addWatchItem: async (id: number, b: { asset_type: AssetType; symbol: string; name?: string }) => (await http.post<Watchlist>(`/watchlists/${id}/items`, b)).data,
  removeWatchItem: (id: number, item: number) => http.delete(`/watchlists/${id}/items/${item}`),
  watchQuotes: (id: number) => get<WatchRow[]>(`/watchlists/${id}/quotes`),
  portfolios: () => get<{ id: number; name: string; currency: string }[]>('/portfolios'),
  createPortfolio: async (b: { name: string; currency: string }) => (await http.post<{ id: number }>('/portfolios', b)).data,
  deletePortfolio: (id: number) => http.delete(`/portfolios/${id}`),
  portfolio: (id: number) => get<PortfolioDetail>(`/portfolios/${id}`),
  addTx: async (id: number, b: object) => (await http.post(`/portfolios/${id}/transactions`, b)).data,
  deleteTx: (id: number, tid: number) => http.delete(`/portfolios/${id}/transactions/${tid}`),
  alerts: () => get<{ delivery: string; items: Alert[] }>('/alerts'),
  createAlert: async (b: object) => (await http.post<Alert>('/alerts', b)).data,
  reactivateAlert: async (id: number) => (await http.post<Alert>(`/alerts/${id}/reactivate`)).data,
  deleteAlert: (id: number) => http.delete(`/alerts/${id}`),
}
