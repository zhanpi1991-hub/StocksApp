from fastapi import APIRouter, HTTPException, Query

from app.providers.registry import coingecko
from app.services import crypto as crypto_svc, envelope

router = APIRouter(prefix="/crypto", tags=["crypto"])

DAYS = {"1D": "1", "7D": "7", "1M": "30", "3M": "90", "1Y": "365", "MAX": "max"}
ORDERS = {"market_cap_desc", "market_cap_asc", "volume_desc", "volume_asc", "id_asc", "id_desc"}


@router.get("/markets")
async def markets(page: int = Query(1, ge=1, le=200), per_page: int = Query(50, ge=1, le=250), order: str = "market_cap_desc", category: str | None = None):
    if order not in ORDERS:
        raise HTTPException(400, "invalid order")
    # Served from shared 250-row chunks: switching page size or page does not cost extra upstream calls.
    return await envelope.respond("coingecko", crypto_svc.markets_page(page, per_page, order, category), empty=[])


@router.get("/trending")
async def trending():
    return await envelope.respond("coingecko", coingecko.trending(), empty=[])


@router.get("/global")
async def global_data():
    return await envelope.respond("coingecko", coingecko.global_data())


@router.get("/categories")
async def categories():
    return await envelope.respond("coingecko", coingecko.categories(), empty=[])


@router.get("/movers")
async def movers():
    """Top gainers/losers by 24h change among the top-250 coins by market cap."""
    r = await envelope.respond("coingecko", crypto_svc.snapshot(), empty=[])
    coins = [c for c in (r["data"] or []) if c["change_24h"] is not None]
    coins.sort(key=lambda c: c["change_24h"], reverse=True)
    r["data"] = {"gainers": coins[:10], "losers": coins[::-1][:10]}
    r["meta"]["message"] = "Ranked among the top 250 coins by market cap."
    return r


@router.get("/screener")
async def screener(
    q: str | None = None, min_cap: float | None = None, max_cap: float | None = None, min_price: float | None = None,
    max_price: float | None = None, min_volume: float | None = None, min_change: float | None = None, max_change: float | None = None,
    max_rank: int | None = None, category: str | None = None, sort: str = "rank", desc: bool = False,
    page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100),
):
    r = await envelope.respond("coingecko", crypto_svc.chunk(1, "market_cap_desc", category), empty=[])
    rows = r["data"] or []

    def ok(c):
        checks = [
            (q is None or q.lower() in (c["name"] or "").lower() or q.lower() in (c["symbol"] or "").lower()),
            (min_cap is None or (c["market_cap"] or 0) >= min_cap), (max_cap is None or (c["market_cap"] or 0) <= max_cap),
            (min_price is None or (c["price"] or 0) >= min_price), (max_price is None or (c["price"] or 0) <= max_price),
            (min_volume is None or (c["volume"] or 0) >= min_volume),
            (min_change is None or (c["change_24h"] is not None and c["change_24h"] >= min_change)),
            (max_change is None or (c["change_24h"] is not None and c["change_24h"] <= max_change)),
            (max_rank is None or (c["rank"] or 10**9) <= max_rank),
        ]
        return all(checks)

    rows = [c for c in rows if ok(c)]
    keymap = {"rank": "rank", "price": "price", "market_cap": "market_cap", "volume": "volume", "change_24h": "change_24h", "change_7d": "change_7d", "name": "name"}
    k = keymap.get(sort, "rank")
    rows.sort(key=lambda c: (c[k] is None, c[k] if c[k] is not None else 0), reverse=desc)
    total = len(rows)
    r["data"] = {"items": rows[(page - 1) * per_page: page * per_page], "total": total, "page": page, "per_page": per_page}
    r["meta"]["message"] = (r["meta"].get("message") or "") + " Screener covers the top 250 coins by market cap."
    return r


@router.get("/{coin_id}")
async def coin(coin_id: str):
    return await envelope.respond("coingecko", coingecko.coin(coin_id))


@router.get("/{coin_id}/chart")
async def chart(coin_id: str, range: str = Query("1M")):
    rng = range.upper()
    if rng not in DAYS:
        raise HTTPException(400, f"Unsupported range. Supported: {', '.join(DAYS)}")
    r = await envelope.respond("coingecko", coingecko.chart(coin_id, DAYS[rng]), empty=[])
    r["meta"]["range"] = rng
    return r
