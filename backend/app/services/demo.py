"""DEMO mode (local development only): clearly labeled static SAMPLE data.
Values are fixed illustrative numbers, NOT market data, and are never random or animated."""
import math
from datetime import date, timedelta

from app.core.config import get_settings
from app.providers.base import Out

MSG = "DEMO SAMPLE DATA - illustrative numbers, not real market data. Configure provider API keys for real data."

SAMPLE = {
    "AAPL": ("Apple Inc.", 190.0, 0.8), "MSFT": ("Microsoft Corp.", 420.0, -0.3), "NVDA": ("NVIDIA Corp.", 120.0, 1.9),
    "SPX": ("S&P 500 (sample)", 5200.0, 0.4), "IXIC": ("NASDAQ Composite (sample)", 16400.0, 0.6),
}


def enabled() -> bool:
    s = get_settings()
    return s.demo_mode and not s.is_production


def quote(symbol: str) -> Out | None:
    sym = symbol.upper()
    if not enabled() or sym not in SAMPLE:
        return None
    name, price, pct = SAMPLE[sym]
    prev = price / (1 + pct / 100)
    data = {"symbol": sym, "name": name, "price": price, "change": round(price - prev, 4), "change_pct": pct,
            "open": prev, "high": price * 1.005, "low": prev * 0.995, "prev_close": prev, "volume": None, "demo": True}
    return Out(data, "demo", "demo", None, MSG)


def candles(symbol: str, n: int = 120) -> Out | None:
    sym = symbol.upper()
    if not enabled() or sym not in SAMPLE:
        return None
    base = SAMPLE[sym][1]
    out, d = [], date.today() - timedelta(days=n)
    for i in range(n):
        c = base * (1 + 0.04 * math.sin(i / 9))  # deterministic curve, clearly illustrative
        out.append({"time": (d + timedelta(days=i)).isoformat(), "open": c * 0.998, "high": c * 1.006, "low": c * 0.994, "close": c, "volume": None})
    return Out(out, "demo", "demo", None, MSG)
