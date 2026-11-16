# Development status

## Production deployment readiness audit (Render + Vercel + PostgreSQL)

**Score: 72 / 100. Ready for a first *staging* deployment; not yet for real user data.** The remaining gap is evidence, not known bugs: PostgreSQL, the Docker image, Render and Vercel were never run here, and none of the four provider keys has been exercised live.

| Area | Score | Evidence |
|---|---|---|
| Backend config and startup safety | 88 | Production guard (tests), docs off in prod, CORS exact + no credentials, hardened WebSocket (tests), real prod-mode uvicorn smoke run |
| Database / PostgreSQL | 62 | Migration compiled to PostgreSQL DDL (valid, reviewed) and runs on SQLite; code reviewed for SQLite-isms (none found); **no live PostgreSQL run** |
| Backend container / Render | 65 | Dockerfile and `render.yaml` reviewed against Render docs; **image never built (no Docker here)** |
| Frontend / Vercel | 78 | Production build, CSP/headers served by `vite preview` and exercised in a browser, SPA deep links, banner on missing API; not deployed |
| Security | 80 | No secrets committed (history scanned), keys backend-only, log redaction, auth rate limit; JWT in localStorage remains |
| External providers | 55 | Missing-key behaviour tested; keyed endpoints and plan coverage unverified |

### Critical blockers (none are code defects left open)
1. **Free Render Postgres expires after 30 days with no backups** (Render docs). Pick a paid database or an external managed Postgres before real data.
2. **PostgreSQL runtime unverified.** First deploy is the first real run of the migration and ORM on Postgres; treat it as staging and run the manual checks in `docs/DEPLOYMENT.md`.
3. **Cross-service URLs must be set correctly** (`CORS_ORIGINS` on Render, `VITE_API_URL` on Vercel) or the site cannot talk to the API. The app now shows a banner when this is wrong.

### Defects found and fixed
- Production could start with the default JWT secret or silently with ephemeral SQLite -> startup now refuses (`core/config.py`).
- `render.yaml` had no `plan`, and Render's default for new services is a paid plan; `autoDeploy` is deprecated -> `plan: free`, region, `autoDeployTrigger: off`, DB name/user/version.
- Behind Render's proxy every user would share one rate-limit IP -> `--proxy-headers`; limiter rewritten (bounded memory, health exempt, separate login/register bucket of 10/min).
- WebSocket JWT was in the URL (written to access logs) -> sent in an `auth` message; Origin check against `CORS_ORIGINS`; 8 KB message cap; client heartbeat every 25 s; re-auth on login/logout.
- `/api/health` returned 200 when the DB was down and was rate-limited -> 503 on DB failure, never limited.
- `backend/.dockerignore` did not exclude `.env` -> excluded (also frontend); container now runs as non-root with a HEALTHCHECK.
- Requirements were unpinned `>=` and shipped pytest -> exact pins (resolution for Linux/Python 3.12 checked with `pip install --dry-run`), `requirements-dev.txt` for tests.
- CORS: trailing slashes normalised, optional regex for Vercel previews, credentials disabled (Bearer auth, no cookies), methods/headers restricted.
- `vercel.json` only had an SPA fallback (so `/api` on Vercel would return `index.html`) -> API URL config (`services/config.ts`), WebSocket URL derived from it, build settings, security headers incl. CSP.
- nginx (Docker Compose) did not forward client IP -> `X-Forwarded-For` added.
- DB pool tuned for managed Postgres (`pre_ping`, recycle, size, connect timeout). Provider HTTP clients are closed on shutdown. API docs disabled in production.
- **Test isolation bug:** the test suite loaded the developer's real `.env` keys and made a real Finnhub request. Tests now force empty keys (`tests/conftest.py`). (A few Finnhub calls from earlier test runs this session may have used your quota.)

### Verified vs not verified
- **Verified by running:** backend `pytest` 56 passed (new: production guards, CORS, health 503, health exempt from limiter, login limiter, WebSocket auth/origin/size, deployment-file lint); frontend `tsc` clean, `vitest` 20 passed, `vite build`; Alembic `upgrade head` on SQLite and `--sql` compile for PostgreSQL; a production-mode uvicorn run with the Dockerfile's flags: docs 404, health 200, no `Server` header, CORS allowed/foreign, per-client rate limiting via `X-Forwarded-For` (10 allowed then 429, a different client unaffected), WebSocket ping/subscribe through the proxy; the production build served with the Vercel security headers loaded `/status`, `/crypto`, `/crypto/bitcoin` deep links with no CSP violations; the banner appears when the API is down.
- **Not verified:** live PostgreSQL (I tried to run an embedded Postgres from a PyPI wheel for this audit; the environment's permission system declined running the extracted binaries, so I deleted them and used the offline DDL compile instead); the Docker image; Render and Vercel behaviour (WebSocket idle timeouts, forwarded-IP header format, cold starts); any keyed provider call; Redis.
- **Git:** one commit exists, 130 files tracked; no `.env`, `.db`, `node_modules`, `dist` or key-like strings in the tracked files or history (pattern scan). Your local `.env` is ignored and untouched.

### Provider requirements (summary)
`COINGECKO_API_KEY` (Demo, optional), `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`, `FMP_API_KEY`, all optional: a missing key yields an explained "unavailable" state and the rest of the app keeps working. Free-tier limits that affect functionality: indices and non-US symbols often need a paid Twelve Data plan; Finnhub free has no stock candles, index quotes or economic calendar; FMP's free quota is small (about 250 calls/day, and movers/screener/statements depend on plan); CoinGecko keyless is heavily throttled. Details: `docs/API_SETUP.md`.

### Remaining risks
- JWT is kept in `localStorage` (mitigated by a strict CSP and HTML sanitising; no httpOnly cookie). Tokens last 12 h and cannot be revoked server-side.
- One instance only: the WebSocket hub, rate limiter and alert loop are in-process. On the free plan the service sleeps and alerts stop evaluating while asleep.
- `/api/providers` is public and shows provider state and sanitised error text; restrict it if that is not desired.
- Alembic runs at container start; fine for one instance.

---

## API configuration and CoinGecko rate-limit pass

### Configuration audit
- `.env` location: `StocksApp/.env` (repo root) is the one file to use; `StocksApp/backend/.env` is also read and overrides it. Before this pass the paths were `.env` and `../.env` relative to the *current directory*, so starting the server from the repo root would have read a `.env` in the parent of the repo. They are now absolute (`app/core/config.py`) and verified from a different working directory. Real OS environment variables override both. Settings are read once at startup and `--reload` does not watch `.env`, so restart after editing.
- Keys are read only in `app/core/config.py` and used only inside provider adapters. No frontend code, `VITE_` variable, API response, or built bundle contains a key value (bundle scanned; the only hit is the variable *name* in help text). `/api/providers` returns `configured: true/false`, never values; a test sets fake keys and checks that none leaks through `/api/providers`, `/api/health`, or the stock/news/index endpoints.
- **Found and fixed a log leak:** `httpx` logs every request URL at INFO, and Twelve Data/FMP take the key as `?apikey=`. The `httpx`/`httpcore` loggers are now WARNING-level and a redaction filter masks `apikey=`, `x-cg-*-api-key`, `token`, `authorization` in all log output. Error messages contain only the exception class, never the URL.
- Git: `.gitignore` already excluded `.env` and `.env.*` (verified with `git check-ignore`); no env file or key-like string is in the repo. `.env.example` contains placeholders only.
- CoinGecko Demo auth confirmed against CoinGecko's Demo authentication docs: host `https://api.coingecko.com/api/v3`, header `x-cg-demo-api-key`. The key is sent as a header only (tested: not in the URL). Pro keys (different host/header) are not supported.

### Why CoinGecko returned so many 429s (audit)
Each crypto view made its own upstream call with different parameters (directory page, top-6 dashboard card, movers at 250, screener at 250, a call per watchlist/alert/portfolio coin each minute, one per WebSocket subscription, one per search keystroke); identical concurrent requests were not de-duplicated; cache keys changed with page size; the browser refetched after 30 s; and after a 429 nothing stopped the next request. Opening `/crypto` alone cost about 5 calls.

### What changed
- `services/crypto.py` (new): `/coins/markets` fetched in 250-row chunks per (order, category) and sliced for every page size, top-6 card, movers and screener. Coins outside the chunk are fetched in **one batched `ids=` call** (the endpoint accepts up to 250 comma-separated ids per CoinGecko docs), cached per coin. Watchlists, portfolios, alerts, WebSocket and search all go through it.
- `providers/base.py`: single-flight de-duplication; cool-down using `Retry-After` (seconds or HTTP date, clamped 5 s to 15 min, 60 s default for CoinGecko); local per-minute and per-day request budgets that refuse requests before the provider does; stale data served as CACHED during cool-down/budget pause/outage; throttled requests no longer counted as provider errors.
- `core/cache.py`: stale entries are now retained for 6 h (Redis previously dropped them at expiry, so CACHED could never appear there).
- TTLs: markets 120 s (`CRYPTO_MARKETS_TTL`), global 5 min, trending 15 min, coin detail 5 min, categories 24 h, charts 5 min to 6 h by range.
- Alerts skip stale prices (never trigger on CACHED data).
- Frontend: crypto queries use `staleTime` matching the server TTLs (`services/cacheTimes.ts`), 15 min cache retention, no refetch on revisit. The Data providers page shows sent / cached / shared / paused counts.
- Setup guide `docs/API_SETUP.md`; `python -m app.tools.check_providers` (checks which keys/env files loaded, one request per configured provider, never prints keys).
- Data-status wording: removed the unverified claim that CoinGecko data refreshes "every 1-2 minutes"; the message now says aggregated and server-cached, not tick-level real time. Nothing new is labelled real-time.

### Measured
- Live, with no CoinGecko key: 10 crypto-related API requests (3 page sizes/pages, top-6, movers, screener, 2 searches, global, trending) caused 4 upstream calls and 7 cache hits.
- Browser pane: 21 in-app navigations between crypto list, coin pages, News and Overview added 5 upstream calls (first coin and chart loads plus one TTL refresh), 0 errors, no 429s.

### Tests executed (actual results)
- Backend `pytest`: **39 passed** (22 earlier + 17 new: header-only auth and Demo host, chunk sharing across all views, second chunk slicing, single-flight with 8 concurrent calls, batched ids + per-coin cache, unknown coin 404, Retry-After parsing, 429 cool-down serving CACHED without upstream calls, local budget, stale retention, absolute env paths, key cleaning, log redaction, no key value in any API response, no key in error messages).
- Frontend: `tsc` clean, `vitest` **15 passed**, `vite build` succeeds.

### Not verified
- **No real keys were used for any provider** (none exist in this environment). Keyed behaviour, plan coverage, and Finnhub/Twelve Data/FMP response shapes are still unverified live. After you add keys, run `python -m app.tools.check_providers`.
- CoinGecko's Demo rate limit: the docs I could read disagree (one page says 100 calls/minute, another gives no number). The default budgets (10/min keyless, 25/min with a Demo key; Finnhub 50/min; Twelve Data 7/min and 700/day; FMP 225/day) are conservative self-imposed values, configurable in `.env`, not official limits.
- Redis stale-retention path and Docker are untested. FMP only takes the key as a query parameter, so redaction is what protects it; Twelve Data may support an Authorization header, which was not verified.

---

## Bug-fix pass: crypto/news crash, images, provider status

### Root cause of `Failed to execute 'replaceWith' on 'Element': Only one element on document allowed`
`sanitize()` in `frontend/src/pages/CryptoDetail.tsx` parsed the CoinGecko description with `DOMParser` and then ran `doc.querySelectorAll('*').forEach(el => el.replaceWith(...el.childNodes))`. `querySelectorAll('*')` on a document includes the document's own `<html>` and `<head>` elements; only `<body>` was excluded. Calling `replaceWith` on `<html>` tries to insert its children into the `Document`, which throws that exception. Every coin detail page with a description crashed, and React's `ErrorBoundary` rendered "Could not load data".

**Why News looked broken too:** the error boundary kept its error state forever. After a crash, navigating to News (or anywhere) kept showing the same error screen, because the boundary never reset on route change. News itself had no `replaceWith` code.

**Fix:** new `utils/sanitize.ts` only visits descendants of `<body>`, uses an allow-list (`a p br strong em b i ul ol li`), removes scripts/styles, strips all attributes, and keeps only `http(s)` links with `rel="noreferrer noopener"`. The error boundary now takes a `resetKey`, and routed content is wrapped in `RouteBoundary` (keyed by pathname) inside `AppShell`, so one page failing no longer poisons navigation and the shell stays usable. Other places checked: no other `replaceWith`/`dangerouslySetInnerHTML` usage; single `createRoot`; StrictMode double-effects are safe (chart effect creates and removes its chart in cleanup); lightweight-charts only touches its own container.

A regression test reproduces the original failure mode in jsdom (the DOM throws on `<html>.replaceWith`; jsdom words the message differently from Chrome) and a render test mounts `CryptoDetail` with an HTML description.

### Files changed
- Frontend: `utils/sanitize.ts` (new), `utils/images.ts` (new), `components/ui/RemoteImage.tsx` (new), `components/layout/guards.tsx`, `components/layout/AppShell.tsx`, `components/layout/SearchBox.tsx`, `components/market/bits.tsx`, `components/market/ArticleList.tsx`, `components/ui/DataState.tsx`, `pages/CryptoDetail.tsx`, `pages/Crypto.tsx`, `pages/Watchlists.tsx`, `pages/Dashboard.tsx`, `pages/Status.tsx`, `types/api.ts`, `utils/format.ts`, `vite.config.ts`, `tsconfig.json`, `package.json`, tests in `src/test/*`.
- Backend: `providers/base.py` (error reasons, provider state/cool-down in health), `services/envelope.py` (`meta.reason`), `services/quotes.py` (image in crypto quotes), `api/routes/market.py`, `api/routes/calendars.py`, `api/routes/auth.py` (default display name), `tests/test_providers.py` (new).

### Cryptocurrency images
- The backend always preserved CoinGecko URLs: `image` in markets, `image.large` in coin detail, `thumb` in search, `small` in trending. The one gap was watchlist quotes, which dropped `image`; fixed.
- Frontend used a bare `<img>` with no error handling. Now `Logo` uses `RemoteImage`: provider URL first, then the same path on `assets.coingecko.com`, then initials in a circle. No broken-image icons, and no URL is invented.
- Logos now appear in the crypto list, trending/gainers/losers, dashboard snapshot, search results, watchlist rows and coin detail.
- **What I found testing in the browser pane:** from this machine, `coin-images.coingecko.com` stalls during TLS (never errors), while `assets.coingecko.com` serves the same files (HTTP 200, `image/png`). A hanging host never fires `onError`, so each attempt now has a 6 s deadline before trying the next source. Verified in the pane: 64 of 64 logos loaded on `/crypto` via the alternate host. The console shows `ERR_CONNECTION_CLOSED/RESET` resource errors for the blocked first host; those are network noise, not app exceptions. On networks where the primary host works, logos load directly with no delay.
- Images no longer use native lazy loading (it conflicts with the per-image deadline); up to ~100 logos per page load eagerly.

### News images
- Finnhub `image` is passed through (`""` becomes `null`) by the adapter and the `/api/news` endpoint (covered by a mocked-provider test). Thumbnails render when present; otherwise, or on failure/timeout, a neutral tile (icon + source name) is shown. A failing image cannot break the page.
- **Not verified live:** no Finnhub key was available, so real article images and Finnhub's hot-linking behaviour were not seen. Some publishers' CDNs may reject hot-linking; those fall back to the tile.

### Provider integration status (what is actually known)
- Why Overview showed many UNAVAILABLE: no Twelve Data/Finnhub/FMP keys were configured. Verified by test and by running the API: every index row reports `reason: no_key`. This is expected, not a parsing bug.
- New: every unavailable response carries `meta.reason` (`no_key`, `plan_required`, `rate_limited`, `network`, `bad_response`, `provider_error`). The UI shows a tailored title, a clear explanation and a Retry button only where retrying makes sense (not for missing key / paid plan). The Overview index card now has a banner saying why indices are missing. Each dashboard panel is its own query, so one failing provider never blanks the others.
- Provider status page now has a status legend, a per-provider state (`Working`, `Ready`, `No API key`, `Rate limited` with cool-down seconds, `Last request failed`), what each provider powers, and how to fix it.
- HTTP 429 sets a provider cool-down (honours `Retry-After`, default 30 s) and blocks further upstream calls until it ends (tested). Provider failures return HTTP 200 envelopes, so React Query does not retry them automatically; users retry manually.
- Verified against real services: CoinGecko (crypto lists, detail, charts, global) and Frankfurter (forex, KZT).
- **Not verified with real keys:** Finnhub, Twelve Data, FMP. Their parsing is covered only by mocked responses shaped like the documented payloads, so field names (notably FMP `stable` endpoints and Twelve Data index symbols `KS11`/`IMOEX`/`KASE`) may need adjusting once you run with keys.

### Default display name
Origin: `backend/app/api/routes/auth.py` defaulted a blank display name to the email's local part (`email.split("@")[0]`), which showed an arbitrary string in the header. It is now `User`. Existing accounts keep whatever name they have; custom names are preserved (tested). No seed data or demo accounts exist in the repo.

### Tests executed (actual results)
- Backend `pytest`: **22 passed** (7 original + 15 new: image propagation for markets/detail/search/watchlist quotes, missing image stays `null`, Finnhub news image and quote parsing, empty quote is unavailable, missing key reason, plan-required via 200 body and via HTTP 403, 429 cool-down and no hammering, network failure, stale cache labelled `cached` not realtime, endpoint reasons with no keys, display-name defaults).
- Frontend `vitest`: **15 passed** (sanitizer, `RemoteImage`/`Logo` fallbacks and timeout, alternate host, article thumbnails, error-boundary reset, unavailable-state reasons, `CryptoDetail` render with HTML description).
- Frontend `tsc` type-check: clean. `vite build`: succeeds.
- Browser (built-in pane, no provider keys): loaded `/crypto/bitcoin`, `/crypto`, `/news`; ran 18 in-app route transitions between coin pages, News and Crypto, with no error state shown. No JavaScript exceptions logged; only the network resource errors described above. Signed-in pages, mobile layout and light theme were not re-checked.

### Remaining limitations
- Keyed providers unverified live (see above); Docker, Postgres, Redis, deploys still unverified.
- CoinGecko's keyless tier rate-limits quickly; set `COINGECKO_API_KEY` for steady use.
- If both CoinGecko image hosts are blocked, logos show initials.
- Earlier limitations still apply: polling-based live updates, single-process WebSocket/rate limiter, weekday-only session schedule, sector-level heatmap, screener filters limited to provider fields, no email/push alerts, JWT in localStorage.
