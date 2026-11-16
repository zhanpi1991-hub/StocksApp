# API setup guide

All four provider keys live **only on the backend**. The browser talks to your own API (`/api/...`) and never receives, stores, or sends a provider key. Keys are not logged, not returned by any endpoint (the status page only says *configured: yes/no*), and are excluded from Git.

## 1. Where to put the keys

Create **one file**: `.env` in the repository root, next to `docker-compose.yml`:

```
C:\Users\zhanp\StocksApp\.env
```

```bash
cp .env.example .env        # macOS/Linux/Git Bash
copy .env.example .env      # Windows cmd / PowerShell
```

Then edit it:

```
COINGECKO_API_KEY=your-coingecko-demo-key
FINNHUB_API_KEY=your-finnhub-key
TWELVE_DATA_API_KEY=your-twelve-data-key
FMP_API_KEY=your-fmp-key
```

Rules: no quotes, no spaces around `=`, one key per line, no trailing text. (Stray quotes/spaces/`Bearer ` are stripped defensively anyway.)

How the backend finds it (`backend/app/core/config.py`): it reads `StocksApp/.env` and then `StocksApp/backend/.env`, using absolute paths, so it works from any directory. If both define a variable, `backend/.env` wins. A real OS environment variable of the same name (e.g. set in Windows System settings) overrides both. Docker Compose reads the root `.env` too. `.gitignore` excludes `.env` and `.env.*` (only `.env.example` is tracked).

**Settings are read once at startup, and uvicorn's `--reload` only watches `.py` files, so always restart the backend after editing `.env`.**

## 2. Restart the backend (Windows PowerShell)

Stop the running server with Ctrl+C in its terminal (or, if you lost it: `Get-NetTCPConnection -LocalPort 8000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`), then:

```powershell
cd C:\Users\zhanp\StocksApp\backend
.\.venv\Scripts\Activate.ps1
python -m app.tools.check_providers        # optional: confirms which keys loaded and tests each with one call
uvicorn app.main:app --reload --port 8000
```

Docker users: `docker compose up --build -d backend`. The frontend does not need a restart. Then open **Data providers** (`/status`) in the app: each provider should read *Working* or *Ready*.

## 3. Provider by provider

| Provider | Env var | Get a key | Sent as | Free-tier notes (verify on the provider site; they change) |
|---|---|---|---|---|
| CoinGecko **Demo** | `COINGECKO_API_KEY` | Sign up at coingecko.com/en/api, create a *Demo* key | Header `x-cg-demo-api-key` to `https://api.coingecko.com/api/v3` | Works without a key but keyless limits are low and shared by IP. Demo has a monthly call credit cap. A *Pro* key needs a different host and header and is **not** supported. |
| Finnhub | `FINNHUB_API_KEY` | finnhub.io/register | Header `X-Finnhub-Token` | Free: US quotes, profiles, metrics, news, IPO calendar, earnings. Stock candles, index quotes and the economic calendar are premium. |
| Twelve Data | `TWELVE_DATA_API_KEY` | twelvedata.com (free Basic plan) | Query parameter `apikey` (redacted from logs) | Small per-minute and daily credit limits. Indices and non-US exchanges often need a paid plan, which is why index rows may stay unavailable (the row says "plan required"). |
| Financial Modeling Prep | `FMP_API_KEY` | financialmodelingprep.com developer docs | Query parameter `apikey` (redacted from logs) | Small free daily quota. Statements, movers, screener, sector snapshot and economic calendar availability depends on your plan. |

After adding keys, expect: stock quotes/news/IPOs (Finnhub), stock charts and index quotes (Twelve Data), statements/movers/screener (FMP), higher crypto limits (CoinGecko Demo). Anything a plan does not include shows *Requires a paid provider plan* instead of fake data.

Provider attribution is unchanged, and no data is labelled real-time unless the provider says so (today only Finnhub US stock quotes).

## 4. How the app avoids rate limits (CoinGecko in particular)

What caused the 429s: every crypto view made its own upstream calls with slightly different parameters (directory page, top-6 dashboard card, movers, screener, a call per watchlist/alert/portfolio coin, one per WebSocket subscription, one per search keystroke), nothing de-duplicated identical concurrent requests, cache keys differed per page size, the browser refetched after 30 s, and a 429 gave no protection against the next request.

What it does now:

- **Chunked batching.** `/coins/markets` is fetched in 250-row chunks and cached; every page size/page, top-6 card, movers and screener view is a slice of the same chunk (one upstream call serves them all).
- **Batched ids.** Coins outside the chunk (watchlists, alerts, portfolios, WebSocket) are fetched together in one call using the comma-separated `ids` parameter, then cached per coin.
- **Single-flight.** Identical concurrent requests share one upstream call.
- **Longer TTLs.** Markets 120 s (configurable), global 5 min, trending 15 min, coin detail 5 min, categories 24 h, charts 5 min to 6 h depending on range. Search checks the cached top-250 first.
- **Client cache.** The browser keeps crypto data fresh for the same windows and keeps pages cached for 15 minutes, so going between pages does not refetch.
- **Cool-down.** A 429 starts a pause using `Retry-After` (seconds or HTTP date; clamped 5 s to 15 min; 60 s default for CoinGecko). During it nothing is sent upstream.
- **Self-imposed budgets** (per minute, and per day for Twelve Data/FMP) refuse requests locally before the provider has to. Tunable in `.env`; they are conservative internal values, not the providers' official limits.
- **Stale data is labelled.** During a cool-down, budget pause or outage the last good data is shown with an amber **CACHED** badge and its original timestamp. Alerts never fire on stale prices.

## 5. Troubleshooting

- *No API key configured* in the app after editing `.env`: you did not restart the backend, or the file is not at the path above. Run `python -m app.tools.check_providers`; it prints which env files it found.
- *Requires a paid provider plan*: the key works but the plan does not include that endpoint.
- *Rate limit reached*: wait out the cool-down shown on the Data providers page, or add a CoinGecko Demo key.
- Never paste keys into chat, issues, screenshots or the frontend `.env.local`. If one leaks, revoke it at the provider and create a new one.
