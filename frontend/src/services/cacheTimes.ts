/**
 * Client-side freshness windows. They match or exceed the backend cache TTLs so that navigating between
 * crypto pages reuses data instead of re-requesting it (and the backend then rarely calls CoinGecko).
 */
export const STALE = {
  cryptoList: 120_000,
  cryptoGlobal: 300_000,
  trending: 600_000,
  categories: 24 * 3600_000,
  coin: 120_000,
  chart: 300_000,
} as const
export const REFRESH = { cryptoList: 180_000, cryptoGlobal: 300_000 } as const
