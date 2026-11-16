import asyncio

from fastapi import APIRouter, Query

from app.providers.base import ProviderError, ProviderUnavailable
from app.providers.registry import coingecko, finnhub, twelve
from app.services import crypto as crypto_svc
from app.services.quotes import INDICES

router = APIRouter(tags=["search"])
PAIRS = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "USD/CAD", "AUD/USD", "USD/CNY", "USD/KZT", "EUR/GBP", "EUR/JPY", "EUR/KZT"]


async def _stocks(q: str):
    try:
        if finnhub.configured:
            return (await finnhub.search(q)).data
        if twelve.configured:
            return [r for r in (await twelve.symbol_search(q)).data][:10]
    except (ProviderError, ProviderUnavailable):
        return None
    return None


async def _crypto(q: str):
    """Local snapshot first (free); only ask CoinGecko's /search when the snapshot has few matches."""
    local = await crypto_svc.search_local(q)
    if len(local) >= 5 or len(q) < 2:
        return local
    try:
        remote = (await coingecko.search(q)).data
    except (ProviderError, ProviderUnavailable):
        return local or None
    seen = {c["id"] for c in local}
    return (local + [c for c in remote if c["id"] not in seen])[:8]


@router.get("/search")
async def search(q: str = Query(min_length=1, max_length=50)):
    ql = q.lower().strip()
    stocks, crypto = await asyncio.gather(_stocks(ql), _crypto(ql))
    indices = [{"code": c, "name": n} for c, n, _, _ in INDICES if ql in c.lower() or ql in n.lower()]
    pairs = [p for p in PAIRS if ql.replace("/", "") in p.replace("/", "").lower()]
    return {
        "query": q,
        "stocks": stocks or [], "crypto": crypto or [], "indices": indices, "forex": pairs,
        "unavailable": {"stocks": stocks is None, "crypto": crypto is None},
        "notes": ["Stock search needs FINNHUB_API_KEY or TWELVE_DATA_API_KEY."] if stocks is None else [],
    }
