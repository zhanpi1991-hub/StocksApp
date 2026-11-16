from datetime import datetime, timezone

from app.core.config import get_settings
from app.providers.base import Out, Provider, num

INTERVAL_MAP = {"1min": "1min", "5min": "5min", "15min": "15min", "30min": "30min", "1h": "1h", "1day": "1day", "1week": "1week", "1month": "1month"}


class TwelveData(Provider):
    """Twelve Data: historical OHLCV for stocks/indices/forex and index quotes.
    Free plan: 8 requests/minute, 800 credits/day; many index and non-US symbols need a paid plan."""

    name = "twelve_data"
    key_env = "TWELVE_DATA_API_KEY"
    base_url = "https://api.twelvedata.com"

    def api_key(self) -> str:
        return get_settings().twelve_data_api_key

    def budget_per_minute(self) -> int:
        return get_settings().twelve_data_requests_per_minute or 7

    def budget_per_day(self) -> int:
        return get_settings().twelve_data_requests_per_day or 700

    def auth(self, params, headers):
        params["apikey"] = self.api_key()

    def detect_error(self, data):
        if isinstance(data, dict) and data.get("status") == "error":
            msg = data.get("message", "error")
            code = data.get("code")
            plan = code in (401, 403) or "plan" in msg.lower() or "upgrade" in msg.lower() or "grow" in msg.lower()
            return (f"twelve_data: {msg[:220]}", plan)
        return None

    async def quote(self, symbol: str) -> Out:
        f = await self.get("/quote", {"symbol": symbol}, ttl=30)
        d = f.data
        data = {
            "symbol": d.get("symbol"), "name": d.get("name"), "exchange": d.get("exchange"), "currency": d.get("currency"),
            "price": num(d.get("close")), "change": num(d.get("change")), "change_pct": num(d.get("percent_change")),
            "open": num(d.get("open")), "high": num(d.get("high")), "low": num(d.get("low")), "prev_close": num(d.get("previous_close")),
            "volume": num(d.get("volume")), "is_open": d.get("is_market_open"),
            "high_52w": num((d.get("fifty_two_week") or {}).get("high")), "low_52w": num((d.get("fifty_two_week") or {}).get("low")),
            "timestamp": d.get("timestamp"),
        }
        return self.out(f, data, "delayed", "Twelve Data latency depends on your plan; treated as delayed.")

    async def time_series(self, symbol: str, interval: str, outputsize: int = 500) -> Out:
        f = await self.get("/time_series", {"symbol": symbol, "interval": interval, "outputsize": outputsize, "order": "ASC"}, ttl=300 if "min" in interval or interval == "1h" else 1800)
        candles = []
        for v in f.data.get("values", []):
            dt = v["datetime"]
            fmt = "%Y-%m-%d %H:%M:%S" if " " in dt else "%Y-%m-%d"
            t = datetime.strptime(dt, fmt).replace(tzinfo=timezone.utc)
            candles.append({
                "time": int(t.timestamp()) if " " in dt else dt, "open": num(v["open"]), "high": num(v["high"]),
                "low": num(v["low"]), "close": num(v["close"]), "volume": num(v.get("volume")),
            })
        return self.out(f, candles, "historical", "Timestamps for intraday bars are exchange-local values displayed as UTC.")

    async def symbol_search(self, q: str) -> Out:
        f = await self.get("/symbol_search", {"symbol": q, "outputsize": 10}, ttl=600)
        return self.out(f, [{"symbol": r["symbol"], "name": r.get("instrument_name"), "exchange": r.get("exchange"), "type": r.get("instrument_type"), "country": r.get("country")} for r in f.data.get("data", [])], "delayed")
