"""Crypto market access layer.

Every crypto list/quote surface (directory pages, dashboard snapshot, movers, screener, watchlists,
portfolios, alerts, WebSocket polling, search) is derived from a small number of CoinGecko
`/coins/markets` calls instead of one call per view:

* Rows are fetched in fixed chunks of 250 (the endpoint maximum) per (order, category), cached on the
  server, and sliced into whatever page size a caller wants. Page 1 of "50 per page", the dashboard's top 6,
  movers and the screener all share the same single upstream call.
* Coins outside the cached chunk are fetched in ONE batched call using the comma-separated `ids`
  parameter (up to 250 ids), then cached per coin.
* Identical concurrent requests are collapsed by the provider's single-flight, and cool-down/budget logic
  in `Provider.get` serves stale (CACHED) data instead of calling a throttled upstream.
"""
from app.core import cache
from app.core.config import get_settings
from app.providers.base import Out, ProviderError, ProviderUnavailable, iso
from app.providers.coingecko import DELAY_MSG
from app.providers.registry import coingecko

CHUNK = 250


def _combine(outs: list[Out], data) -> Out:
    """Merge metadata of several upstream results: any cached part makes the whole result CACHED."""
    first = outs[0]
    stale = next((o for o in outs if o.status == "cached"), None)
    return Out(data, "cached" if stale else first.status, first.provider, min((o.as_of for o in outs if o.as_of), default=first.as_of), (stale or first).message)


async def chunk(index: int = 1, order: str = "market_cap_desc", category: str | None = None) -> Out:
    """Rows [(index-1)*250, index*250) for an ordering/category. One cached upstream call."""
    return await coingecko.markets(page=index, per_page=CHUNK, order=order, category=category)


async def snapshot() -> Out:
    """Top 250 coins by market cap."""
    return await chunk(1)


async def markets_page(page: int, per_page: int, order: str = "market_cap_desc", category: str | None = None) -> Out:
    start, end = (page - 1) * per_page, page * per_page
    first, last = start // CHUNK + 1, (end - 1) // CHUNK + 1
    outs = [await chunk(i, order, category) for i in range(first, last + 1)]
    rows = [c for o in outs for c in o.data]
    off = start - (first - 1) * CHUNK
    return _combine(outs, rows[off:off + per_page])


def _store(coin: dict) -> None:
    cache.set(f"crypto:coin:{coin['id']}", coin, get_settings().crypto_markets_ttl)


async def quotes(ids: list[str]) -> dict[str, Out | ProviderError | ProviderUnavailable]:
    """Resolve many coin ids with as few upstream calls as possible. Never raises; failures are per id."""
    want = list(dict.fromkeys(i.strip().lower() for i in ids if i and i.strip()))
    result: dict[str, Out | ProviderError | ProviderUnavailable] = {}
    snap: Out | None = None
    try:
        snap = await snapshot()
    except (ProviderError, ProviderUnavailable):
        pass  # fall through to per-coin cache and one batched ids call
    by_id = {c["id"]: c for c in snap.data} if snap else {}
    missing: list[str] = []
    for i in want:
        if i in by_id and snap:
            result[i] = Out(by_id[i], snap.status, snap.provider, snap.as_of, snap.message)
            continue
        hit = cache.get(f"crypto:coin:{i}")
        if hit:
            result[i] = Out(hit[0], "delayed", "coingecko", iso(hit[1]), DELAY_MSG)
        else:
            missing.append(i)
    for n in range(0, len(missing), CHUNK):
        batch = missing[n:n + CHUNK]
        try:
            out = await coingecko.markets(ids=",".join(sorted(batch)), per_page=CHUNK)
        except (ProviderError, ProviderUnavailable) as exc:
            for i in batch:
                stale = cache.get(f"crypto:coin:{i}", allow_stale=True)
                result[i] = Out(stale[0], "cached", "coingecko", iso(stale[1]), f"{exc} Showing last cached data.") if stale else exc
            continue
        found = {c["id"]: c for c in out.data}
        for i in batch:
            if i in found:
                if out.status != "cached":
                    _store(found[i])
                result[i] = Out(found[i], out.status, out.provider, out.as_of, out.message)
            else:
                result[i] = ProviderError(f"Unknown cryptocurrency '{i}'.", 404)
    return result


async def search_local(q: str, limit: int = 8) -> list[dict]:
    """Search the cached top-250 snapshot (zero upstream cost). Empty if the snapshot is unavailable."""
    try:
        snap = await snapshot()
    except (ProviderError, ProviderUnavailable):
        return []
    ql = q.lower()
    hits = [c for c in snap.data if ql in (c["name"] or "").lower() or ql == (c["symbol"] or "").lower() or (c["symbol"] or "").lower().startswith(ql)]
    hits.sort(key=lambda c: c["rank"] or 10**9)
    return [{"id": c["id"], "symbol": c["symbol"], "name": c["name"], "image": c["image"], "rank": c["rank"]} for c in hits[:limit]]
