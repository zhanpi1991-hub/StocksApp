# StocksApp

A global market monitoring platform: indices, stocks, crypto, forex, news, calendars, screeners, portfolio, watchlists and alerts, on a dark financial-terminal UI.

**Data honesty rule:** every market response carries a status (`realtime`, `delayed`, `historical`, `cached`, `unavailable`, `demo`) plus provider and timestamp, shown as a badge in the UI. If a provider has no key or the endpoint needs a paid plan, the UI shows an "unavailable" state. There is no invented data and no simulated ticks.

- Frontend: React 19, TypeScript, Vite, Tailwind 4, React Router, TanStack Query, Zustand, Axios, TradingView Lightweight Charts, Recharts, React Hook Form, Zod
- Backend: Python, FastAPI, Pydantic, SQLAlchemy, Alembic, JWT (bcrypt), WebSockets, optional Redis, SQLite (zero setup) or PostgreSQL

## Quick start (no Docker, no keys)

Requires Python 3.12+ and Node 20+.

```bash
# 1. Backend  (http://localhost:8000, docs at /docs)
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows;  source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp ../.env.example .env         # optional; defaults work
uvicorn app.main:app --reload --port 8000

# 2. Frontend (http://localhost:5173, proxies /api to :8000)
cd frontend
npm install
npm run dev
```

SQLite tables are created automatically on startup. With PostgreSQL, run `alembic upgrade head` (the Docker image does this).

## Docker

```bash
docker compose up --build      # app on http://localhost:8080, API on :8000
```

Starts Postgres, Redis, the API (runs migrations first) and the nginx-served frontend. Put API keys in a root `.env` (see `.env.example`). *Note: the Docker setup and the Postgres migration path were written but not run in the environment where this was built (no Docker available).*

## Environment variables

**Setup guide: [docs/API_SETUP.md](docs/API_SETUP.md)** (where the keys go, restart commands, per-provider notes, rate-limit design). Put keys in the repo-root `.env` (copy of [.env.example](.env.example)) and restart the backend. Check them with `cd backend && python -m app.tools.check_providers`. Key ones: `DATABASE_URL`, `JWT_SECRET` (**set a long random value in production**), `CORS_ORIGINS`, `REDIS_URL`, and the provider keys below. API keys live only in the backend and are never sent to the browser.

## Providers: what needs what

| Provider | Key env | Free? | Used for |
|---|---|---|---|
| CoinGecko | `COINGECKO_API_KEY` (optional Demo key) | Works with **no key** (low rate limit; a free Demo key raises it) | Crypto markets, detail, charts, trending, dominance, categories, search |
| Frankfurter | none | Free | Forex rates, history, converter (daily reference rates, not real time; KZT supported) |
| Finnhub | `FINNHUB_API_KEY` | Free key | US stock quotes (real time), profiles, metrics, news, IPO calendar, earnings, stock search. Dividends and economic calendar may be paid |
| Twelve Data | `TWELVE_DATA_API_KEY` | Free key (8 req/min, 800/day) | Stock price history/charts, index quotes, stock quote fallback. Many indices and non-US exchanges need a paid plan |
| Financial Modeling Prep | `FMP_API_KEY` | Small free tier | Financial statements, movers, stock screener, sector heatmap, economic calendar. Availability varies by plan |

**Works with no keys:** crypto module, forex module, crypto screener, global search for crypto and pairs, accounts, watchlists (crypto/forex), portfolios (crypto/forex), alerts (crypto/forex), market-session schedule, provider status page.

**Needs keys:** stock quotes/charts/profiles (Finnhub + Twelve Data), news (Finnhub), IPO calendar (Finnhub), statements/movers/stock screener/heatmap (FMP), indices (Twelve Data).

**May need paid plans:** MOEX and KASE indices (likely not covered by Twelve Data's free plan; KASE has no known free provider and shows unavailable), economic calendar, per-stock heatmap (not implemented: needs a licensed constituent feed), non-US real-time quotes. The Data providers page in the app shows live configuration and error state per provider.

Exact provider free-tier limits change; verify against each provider's current docs before relying on them.

## Architecture notes

- `backend/app/providers/*`: one adapter per provider extending `Provider` (`base.py`): key handling server-side, TTL cache (Redis if configured), stale-on-error fallback labelled `cached`, 429 cool-down, plan-required detection, health counters.
- `backend/app/services/envelope.py`: every market endpoint returns `{data, meta:{provider,status,as_of,message}}`.
- `backend/app/services/portfolio_calc.py`: Decimal average-cost accounting (buy fees capitalised, sell fees reduce realised P/L). Positions are recomputed from the transaction log on every change.
- `backend/app/websocket/hub.py` + `/api/ws`: clients subscribe to `stock:AAPL`, `crypto:bitcoin`, `forex:EUR/USD`. One poller per unique subscription shares upstream calls; messages carry the provider's status and `mode:"polling"`. Reconnect with backoff is in `frontend/src/services/live.ts`. **No provider streaming sockets are wired up**, so nothing is labelled real-time unless the polled REST data itself is real-time (Finnhub US quotes).
- Alerts: evaluated by a background loop (`ALERT_INTERVAL_SECONDS`). Triggered alerts are stored and pushed to the user's open WebSocket. **No email/push channel exists**, and the UI says so.
- Rate limiting: in-process per-IP limiter (`RATE_LIMIT_PER_MINUTE`).

## Tests and checks

```bash
cd backend && pytest                     # 22 tests: portfolio math, alerts, providers (mocked), images, error reasons, auth
cd frontend && npm run typecheck && npm test && npm run build
```

## Deploying

- Frontend on Vercel: root `frontend/`, set `VITE_API_URL` and `VITE_WS_URL` to the backend (see `.env.example`). `vercel.json` handles SPA routing.
- Backend on Render: `render.yaml` (Docker + Postgres). Set `CORS_ORIGINS` to the frontend URL and the provider keys.
- Keep the API at **one worker/instance**: WebSocket subscriptions and the in-process rate limiter are per process.

## Known limitations

See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).
