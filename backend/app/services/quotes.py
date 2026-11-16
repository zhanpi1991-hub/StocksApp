"""Instrument-level quote dispatch shared by watchlists, portfolios, alerts, comparison and WebSocket."""
import asyncio

from app.providers.base import Out, ProviderError, ProviderUnavailable
from app.providers.registry import coingecko, finnhub, frankfurter, twelve
from app.services import crypto, demo

INDICES = [
    # code, name, Twelve Data symbol, session exchange
    ("SPX", "S&P 500", "SPX", "US"), ("IXIC", "NASDAQ Composite", "IXIC", "US"), ("DJI", "Dow Jones Industrial Average", "DJI", "US"),
    ("FTSE", "FTSE 100", "FTSE", "UK"), ("DAX", "DAX", "DAX", "DE"), ("N225", "Nikkei 225", "N225", "JP"),
    ("HSI", "Hang Seng", "HSI", "HK"), ("KOSPI", "KOSPI", "KS11", "KR"), ("MOEX", "MOEX Russia Index", "IMOEX", "RU"),
    ("KASE", "KASE Index", "KASE", "KZ"),
]


async def stock_quote(symbol: str) -> Out:
    sym = symbol.upper()
    last: Exception | None = None
    if finnhub.configured:
        try:
            out = await finnhub.quote(sym)
            if out.data:
                return out
            last = ProviderError(out.message or "no quote")
        except ProviderError as e:
            last = e
    if twelve.configured:
        try:
            return await twelve.quote(sym)
        except ProviderError as e:
            last = e
    d = demo.quote(sym)
    if d:
        return d
    if last:
        raise last
    raise ProviderUnavailable("No stock data provider configured (set FINNHUB_API_KEY or TWELVE_DATA_API_KEY).")


def _crypto_out(res: Out) -> Out:
    c = res.data
    data = {"symbol": c["id"], "name": c["name"], "image": c["image"], "price": c["price"], "change_pct": c["change_24h"], "volume": c["volume"], "market_cap": c["market_cap"]}
    return Out(data, res.status, res.provider, res.as_of, res.message)


async def crypto_quote(coin_id: str) -> Out:
    res = (await crypto.quotes([coin_id]))[coin_id.strip().lower()]
    if isinstance(res, Exception):
        raise res
    return _crypto_out(res)


async def forex_quote(pair: str) -> Out:
    base, _, quote = pair.upper().replace("-", "/").partition("/")
    out = await frankfurter.change(base, quote)
    if out.data:
        d = out.data
        out.data = {"symbol": f"{base}/{quote}", "name": f"{base}/{quote}", "price": d["rate"], "change": d["change"], "change_pct": d["change_pct"], "date": d["date"]}
    return out


async def get_quote(asset_type: str, symbol: str) -> Out:
    if asset_type == "stock":
        return await stock_quote(symbol)
    if asset_type == "crypto":
        return await crypto_quote(symbol)
    if asset_type == "forex":
        return await forex_quote(symbol)
    raise ProviderError(f"Unsupported asset type {asset_type}", 400)


async def safe_quote(asset_type: str, symbol: str) -> dict:
    """Never raises: returns a dict with data/status/message for table rows."""
    try:
        out = await get_quote(asset_type, symbol)
        return {"symbol": symbol, "data": out.data, "status": out.status, "message": out.message, "as_of": out.as_of}
    except (ProviderError, ProviderUnavailable) as exc:
        return {"symbol": symbol, "data": None, "status": "unavailable", "message": str(exc), "as_of": None}
    except (KeyError, TypeError, ValueError, IndexError):
        return {"symbol": symbol, "data": None, "status": "unavailable", "message": "Unexpected provider response.", "as_of": None}


async def safe_quotes(items: list[tuple[str, str]]) -> list[dict]:
    """Quotes for many instruments. Crypto ids are resolved together (snapshot + one batched ids call)."""
    coin_ids = [sym for t, sym in items if t == "crypto"]
    batch = await crypto.quotes(coin_ids) if coin_ids else {}

    async def one(t: str, sym: str) -> dict:
        if t != "crypto":
            return await safe_quote(t, sym)
        res = batch.get(sym.strip().lower())
        if isinstance(res, Out):
            o = _crypto_out(res)
            return {"symbol": sym, "data": o.data, "status": o.status, "message": o.message, "as_of": o.as_of}
        return {"symbol": sym, "data": None, "status": "unavailable", "message": str(res) if res else "Price unavailable.", "as_of": None}

    return list(await asyncio.gather(*(one(t, s) for t, s in items)))
