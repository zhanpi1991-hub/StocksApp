from datetime import date

from app.core.config import get_settings
from app.providers.base import Out, Provider, num


class FMP(Provider):
    """Financial Modeling Prep (stable API). Free plan is small (about 250 calls/day, US symbols);
    movers, screener, statements and economic calendar availability depends on your plan."""

    name = "fmp"
    key_env = "FMP_API_KEY"
    base_url = "https://financialmodelingprep.com/stable"

    def api_key(self) -> str:
        return get_settings().fmp_api_key

    def budget_per_day(self) -> int:
        return get_settings().fmp_requests_per_day or 225

    def auth(self, params, headers):
        params["apikey"] = self.api_key()

    def detect_error(self, data):
        if isinstance(data, dict) and (data.get("Error Message") or data.get("error")):
            msg = str(data.get("Error Message") or data.get("error"))
            return (f"fmp: {msg[:220]}", "subscription" in msg.lower() or "plan" in msg.lower() or "premium" in msg.lower() or "upgrade" in msg.lower())
        return None

    @staticmethod
    def _mover(r: dict) -> dict:
        return {"symbol": r.get("symbol"), "name": r.get("name"), "price": num(r.get("price")), "change": num(r.get("change")),
                "change_pct": num(r.get("changesPercentage")), "exchange": r.get("exchange")}

    async def movers(self, kind: str) -> Out:
        path = {"gainers": "/biggest-gainers", "losers": "/biggest-losers", "active": "/most-actives"}[kind]
        f = await self.get(path, ttl=120)
        return self.out(f, [self._mover(r) for r in (f.data or [])[:25]], "delayed", "FMP movers are delayed; exact latency depends on plan.")

    async def statement(self, kind: str, symbol: str, period: str = "annual") -> Out:
        path = {"income": "/income-statement", "balance": "/balance-sheet-statement", "cashflow": "/cash-flow-statement"}[kind]
        f = await self.get(path, {"symbol": symbol, "period": "FY" if period == "annual" else "quarter", "limit": 5 if period == "annual" else 8}, ttl=21600)
        rows = []
        for r in f.data or []:
            row = {k: v for k, v in r.items() if k not in ("symbol", "cik", "link", "finalLink", "acceptedDate", "fillingDate")}
            rows.append(row)
        return self.out(f, rows, "historical")

    async def economic_calendar(self, start: date, end: date) -> Out:
        f = await self.get("/economic-calendar", {"from": start.isoformat(), "to": end.isoformat()}, ttl=900)
        items = [{
            "event": e.get("event"), "country": e.get("country"), "currency": e.get("currency"), "time": e.get("date"),
            "impact": (e.get("impact") or "").lower() or None, "previous": num(e.get("previous")), "forecast": num(e.get("estimate")),
            "actual": num(e.get("actual")), "unit": e.get("unit"),
        } for e in (f.data or [])]
        return self.out(f, items, "delayed")

    async def screener(self, filters: dict) -> Out:
        f = await self.get("/company-screener", {**filters, "isEtf": "false", "isFund": "false", "isActivelyTrading": "true", "limit": 1000}, ttl=600)
        rows = [{
            "symbol": r.get("symbol"), "name": r.get("companyName"), "sector": r.get("sector"), "industry": r.get("industry"),
            "exchange": r.get("exchangeShortName") or r.get("exchange"), "country": r.get("country"), "price": num(r.get("price")),
            "market_cap": num(r.get("marketCap")), "volume": num(r.get("volume")), "beta": num(r.get("beta")),
            "dividend": num(r.get("lastAnnualDividend")),
        } for r in (f.data or [])]
        return self.out(f, rows, "delayed", "FMP screener data; P/E, EPS and period performance filters are not exposed by this endpoint.")

    async def sector_performance(self) -> Out:
        f = await self.get("/sector-performance-snapshot", {"date": date.today().isoformat()}, ttl=900)
        rows = [{"sector": r.get("sector"), "change_pct": num(r.get("averageChange"))} for r in (f.data or [])]
        return self.out(f, rows, "delayed")
