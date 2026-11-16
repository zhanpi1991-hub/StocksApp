from fastapi import APIRouter, Query

from app.providers.registry import fmp
from app.services import envelope

router = APIRouter(prefix="/screener", tags=["screener"])

SORTS = {"symbol", "name", "price", "market_cap", "volume", "beta", "dividend"}


@router.get("/stocks")
async def stocks(
    exchange: str | None = None, sector: str | None = None, industry: str | None = None,
    min_cap: float | None = None, max_cap: float | None = None, min_price: float | None = None, max_price: float | None = None,
    min_volume: float | None = None, min_dividend: float | None = None, q: str | None = None,
    sort: str = "market_cap", desc: bool = True, page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=100),
):
    """Server-side filters are forwarded to FMP's company-screener. Daily change, P/E, EPS, dividend yield and
    52-week performance are NOT available from this endpoint, so those filters are intentionally not offered."""
    filters = {
        "exchange": exchange, "sector": sector, "industry": industry, "marketCapMoreThan": min_cap, "marketCapLowerThan": max_cap,
        "priceMoreThan": min_price, "priceLowerThan": max_price, "volumeMoreThan": min_volume, "dividendMoreThan": min_dividend,
    }
    r = await envelope.respond("fmp", fmp.screener(filters), empty=[])
    rows = r["data"] or []
    if q:
        ql = q.lower()
        rows = [x for x in rows if ql in (x["name"] or "").lower() or ql in (x["symbol"] or "").lower()]
    k = sort if sort in SORTS else "market_cap"
    rows.sort(key=lambda x: (x[k] is None, x[k] if x[k] is not None else 0), reverse=desc)
    r["data"] = {"items": rows[(page - 1) * per_page: page * per_page], "total": len(rows), "page": page, "per_page": per_page,
                 "supported_filters": ["exchange", "sector", "industry", "market cap", "price", "volume", "dividend", "text search"]}
    return r
