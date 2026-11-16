from datetime import date, datetime, timedelta, timezone

from app.core.config import get_settings
from app.providers.base import Out, Provider, num


class Finnhub(Provider):
    """Finnhub REST. Free tier: US stock quotes (real time), profiles, metrics, news, IPO calendar.
    Stock candles, index quotes and the economic calendar are paid on Finnhub (surfaced as plan-required)."""

    name = "finnhub"
    key_env = "FINNHUB_API_KEY"
    base_url = "https://finnhub.io/api/v1"

    def api_key(self) -> str:
        return get_settings().finnhub_api_key

    def budget_per_minute(self) -> int:
        return get_settings().finnhub_requests_per_minute or 50  # conservative vs. the free tier's per-minute cap

    def auth(self, params, headers):
        headers["X-Finnhub-Token"] = self.api_key()

    def detect_error(self, data):
        if isinstance(data, dict) and data.get("error"):
            msg = str(data["error"])
            return (f"finnhub: {msg}", "access" in msg.lower() or "plan" in msg.lower())
        return None

    async def quote(self, symbol: str) -> Out:
        f = await self.get("/quote", {"symbol": symbol}, ttl=15)
        d = f.data
        if not d or not d.get("c"):
            return Out(None, "unavailable", self.name, None, f"No quote available for {symbol}.")
        data = {
            "symbol": symbol.upper(), "price": num(d["c"]), "change": num(d.get("d")), "change_pct": num(d.get("dp")),
            "high": num(d.get("h")), "low": num(d.get("l")), "open": num(d.get("o")), "prev_close": num(d.get("pc")),
            "timestamp": d.get("t"),
        }
        return self.out(f, data, "realtime", "Finnhub US quotes are real time; non-US listings may be unsupported on the free plan.")

    async def profile(self, symbol: str) -> Out:
        f = await self.get("/stock/profile2", {"symbol": symbol}, ttl=3600)
        d = f.data
        if not d:
            return Out(None, "unavailable", self.name, None, f"No company profile for {symbol}.")
        mc = num(d.get("marketCapitalization"))
        data = {
            "symbol": d.get("ticker") or symbol.upper(), "name": d.get("name"), "exchange": d.get("exchange"),
            "industry": d.get("finnhubIndustry"), "country": d.get("country"), "currency": d.get("currency"),
            "ipo": d.get("ipo"), "market_cap": mc * 1_000_000 if mc else None, "shares_outstanding": (num(d.get("shareOutstanding")) or 0) * 1_000_000 or None,
            "website": d.get("weburl"), "logo": d.get("logo"), "phone": d.get("phone"),
        }
        return self.out(f, data, "delayed")

    async def metrics(self, symbol: str) -> Out:
        f = await self.get("/stock/metric", {"symbol": symbol, "metric": "all"}, ttl=3600)
        m = (f.data or {}).get("metric") or {}
        data = {
            "pe": num(m.get("peTTM") or m.get("peBasicExclExtraTTM")), "eps": num(m.get("epsTTM") or m.get("epsBasicExclExtraItemsTTM")),
            "dividend_yield": num(m.get("currentDividendYieldTTM") or m.get("dividendYieldIndicatedAnnual")),
            "high_52w": num(m.get("52WeekHigh")), "low_52w": num(m.get("52WeekLow")),
            "return_52w": num(m.get("52WeekPriceReturnDaily")), "beta": num(m.get("beta")),
            "avg_volume_10d": (num(m.get("10DayAverageTradingVolume")) or 0) * 1_000_000 or None,
            "revenue_ttm_per_share": num(m.get("revenuePerShareTTM")), "net_margin": num(m.get("netProfitMarginTTM")),
            "roe": num(m.get("roeTTM")), "pb": num(m.get("pbQuarterly")), "ps": num(m.get("psTTM")),
        }
        return self.out(f, data, "delayed", "Fundamental metrics are updated periodically, not intraday.")

    async def search(self, q: str) -> Out:
        f = await self.get("/search", {"q": q}, ttl=300)
        res = [
            {"symbol": r["symbol"], "name": r.get("description"), "type": r.get("type")}
            for r in (f.data or {}).get("result", [])
            if r.get("type") in ("Common Stock", "ETP", "ADR", "REIT", "") and "." not in r.get("symbol", "")
        ][:10]
        return self.out(f, res, "delayed")

    async def company_news(self, symbol: str, days: int = 14) -> Out:
        to = date.today()
        f = await self.get("/company-news", {"symbol": symbol, "from": (to - timedelta(days=days)).isoformat(), "to": to.isoformat()}, ttl=300)
        return self.out(f, [self._article(a, symbol) for a in (f.data or [])[:60]], "delayed")

    async def market_news(self, category: str = "general") -> Out:
        f = await self.get("/news", {"category": category}, ttl=300)
        return self.out(f, [self._article(a) for a in (f.data or [])[:100]], "delayed")

    @staticmethod
    def _article(a: dict, symbol: str | None = None) -> dict:
        related = [s for s in (a.get("related") or "").split(",") if s] or ([symbol] if symbol else [])
        ts = a.get("datetime")
        return {
            "id": str(a.get("id")), "headline": a.get("headline"), "summary": a.get("summary") or "",
            "source": a.get("source"), "url": a.get("url"), "image": a.get("image") or None,
            "published_at": datetime.fromtimestamp(ts, tz=timezone.utc).isoformat() if ts else None,
            "category": a.get("category"), "related": related[:6],
        }

    async def ipo_calendar(self, start: date, end: date) -> Out:
        f = await self.get("/calendar/ipo", {"from": start.isoformat(), "to": end.isoformat()}, ttl=1800)
        items = [{
            "company": i.get("name"), "symbol": i.get("symbol"), "exchange": i.get("exchange"), "date": i.get("date"),
            "price_range": i.get("price"), "shares": i.get("numberOfShares"), "status": i.get("status"),
            "total_value": num(i.get("totalSharesValue")),
        } for i in (f.data or {}).get("ipoCalendar", [])]
        return self.out(f, items, "delayed")

    async def earnings(self, symbol: str) -> Out:
        f = await self.get("/stock/earnings", {"symbol": symbol, "limit": 12}, ttl=3600)
        items = [{
            "period": e.get("period"), "quarter": e.get("quarter"), "year": e.get("year"),
            "actual": num(e.get("actual")), "estimate": num(e.get("estimate")), "surprise": num(e.get("surprise")),
            "surprise_pct": num(e.get("surprisePercent")),
        } for e in (f.data or [])]
        return self.out(f, items, "historical")

    async def dividends(self, symbol: str) -> Out:
        to = date.today()
        f = await self.get("/stock/dividend", {"symbol": symbol, "from": (to - timedelta(days=365 * 6)).isoformat(), "to": to.isoformat()}, ttl=3600)
        items = [{"ex_date": d.get("date"), "pay_date": d.get("payDate"), "amount": num(d.get("amount")), "currency": d.get("currency")} for d in (f.data or [])]
        return self.out(f, sorted(items, key=lambda x: x["ex_date"] or "", reverse=True), "historical")

    async def economic_calendar(self, start: date, end: date) -> Out:
        f = await self.get("/calendar/economic", {"from": start.isoformat(), "to": end.isoformat()}, ttl=900)
        items = [{
            "event": e.get("event"), "country": e.get("country"), "currency": e.get("unit") if len(e.get("unit") or "") == 3 else None,
            "time": e.get("time"), "impact": e.get("impact"), "previous": num(e.get("prev")), "forecast": num(e.get("estimate")),
            "actual": num(e.get("actual")), "unit": e.get("unit"),
        } for e in (f.data or {}).get("economicCalendar", [])]
        return self.out(f, items, "delayed")

    async def market_status(self, exchange: str = "US") -> Out:
        f = await self.get("/stock/market-status", {"exchange": exchange}, ttl=60)
        d = f.data or {}
        return self.out(f, {"exchange": exchange, "is_open": d.get("isOpen"), "session": d.get("session"), "holiday": d.get("holiday"), "timezone": d.get("t")}, "realtime")
