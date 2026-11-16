import asyncio
from datetime import date

from fastapi import APIRouter, HTTPException, Query

from app.providers.base import Out, ProviderError, ProviderUnavailable
from app.providers.registry import finnhub, fmp, twelve
from app.services import demo, envelope
from app.services.quotes import stock_quote

router = APIRouter(prefix="/stocks", tags=["stocks"])

# range -> (interval, outputsize or None for since-Jan-1 computation)
RANGES = {
    "1D": ("5min", 78), "5D": ("30min", 65), "1M": ("1day", 22), "3M": ("1day", 66), "6M": ("1day", 132),
    "YTD": ("1day", None), "1Y": ("1day", 252), "5Y": ("1week", 260), "MAX": ("1month", 600),
}


@router.get("/{symbol}/quote")
async def quote(symbol: str):
    return await envelope.respond("stocks", stock_quote(symbol))


@router.get("/{symbol}/overview")
async def overview(symbol: str):
    """Quote + profile + metrics in one call; each part reports its own availability."""
    async def part(name, aw):
        r = await envelope.respond(name, aw)
        return r

    q, p, m = await asyncio.gather(part("quote", stock_quote(symbol)), part("finnhub", finnhub.profile(symbol)), part("finnhub", finnhub.metrics(symbol)))
    return {"symbol": symbol.upper(), "quote": q, "profile": p, "metrics": m}


@router.get("/{symbol}/history")
async def history(symbol: str, range: str = Query("1Y")):
    rng = range.upper()
    if rng not in RANGES:
        raise HTTPException(400, f"Unsupported range. Supported: {', '.join(RANGES)}")
    interval, size = RANGES[rng]
    if size is None:
        size = max(5, (date.today() - date(date.today().year, 1, 1)).days * 5 // 7 + 2)
    d = demo.candles(symbol) if not twelve.configured else None
    if d:
        return envelope.wrap(d)
    r = await envelope.respond("twelve_data", twelve.time_series(symbol.upper(), interval, size), empty=[])
    if r["meta"]["status"] == "unavailable" and not twelve.configured:
        r["meta"]["message"] += " Stock price history is provided by Twelve Data."
    r["meta"]["range"], r["meta"]["interval"] = rng, interval
    return r


@router.get("/{symbol}/statements/{kind}")
async def statements(symbol: str, kind: str, period: str = Query("annual", pattern="^(annual|quarter)$")):
    if kind not in ("income", "balance", "cashflow"):
        raise HTTPException(400, "kind must be income, balance or cashflow")
    return await envelope.respond("fmp", fmp.statement(kind, symbol.upper(), period), empty=[])


@router.get("/{symbol}/earnings")
async def earnings(symbol: str):
    return await envelope.respond("finnhub", finnhub.earnings(symbol.upper()), empty=[])


@router.get("/{symbol}/dividends")
async def dividends(symbol: str):
    return await envelope.respond("finnhub", finnhub.dividends(symbol.upper()), empty=[])


@router.get("/{symbol}/news")
async def news(symbol: str):
    return await envelope.respond("finnhub", finnhub.company_news(symbol.upper()), empty=[])


_ = (Out, ProviderError, ProviderUnavailable)
