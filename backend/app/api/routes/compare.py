import asyncio

from fastapi import APIRouter, HTTPException, Query

from app.providers.registry import finnhub, fmp, twelve
from app.services import envelope
from app.services.quotes import stock_quote

router = APIRouter(prefix="/compare", tags=["compare"])


async def _one(symbol: str) -> dict:
    quote, profile, metrics, income, hist = await asyncio.gather(
        envelope.respond("quote", stock_quote(symbol)),
        envelope.respond("finnhub", finnhub.profile(symbol)),
        envelope.respond("finnhub", finnhub.metrics(symbol)),
        envelope.respond("fmp", fmp.statement("income", symbol, "annual")),
        envelope.respond("twelve_data", twelve.time_series(symbol, "1day", 252), empty=[]),
    )
    latest = (income["data"] or [None])[0] if income["data"] else None
    q, p, m = quote["data"] or {}, profile["data"] or {}, metrics["data"] or {}
    closes = [c for c in (hist["data"] or []) if c.get("close")]
    perf = [{"time": c["time"], "value": c["close"] / closes[0]["close"] * 100} for c in closes] if closes else []
    return {
        "symbol": symbol,
        "name": p.get("name"),
        "price": q.get("price"), "change_pct": q.get("change_pct"), "market_cap": p.get("market_cap"),
        "pe": m.get("pe"), "eps": m.get("eps"), "dividend_yield": m.get("dividend_yield"),
        "revenue": latest.get("revenue") if latest else None, "net_income": latest.get("netIncome") if latest else None,
        "fiscal_year": latest.get("fiscalYear") or latest.get("date") if latest else None,
        "performance_1y": perf,
        "availability": {"quote": quote["meta"]["status"], "profile": profile["meta"]["status"], "metrics": metrics["meta"]["status"],
                         "financials": income["meta"]["status"], "history": hist["meta"]["status"]},
        "messages": [x["meta"]["message"] for x in (quote, profile, metrics, income, hist) if x["meta"]["status"] == "unavailable" and x["meta"]["message"]][:3],
    }


@router.get("")
async def compare(symbols: str = Query(description="Comma separated, 2-5 symbols")):
    syms = list(dict.fromkeys(s.strip().upper() for s in symbols.split(",") if s.strip()))
    if not 2 <= len(syms) <= 5:
        raise HTTPException(400, "Provide between 2 and 5 distinct symbols")
    return {"data": await asyncio.gather(*(_one(s) for s in syms))}
