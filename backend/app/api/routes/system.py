from fastapi import APIRouter
from sqlalchemy import text

from app.core import cache
from app.core.config import get_settings
from app.db.session import engine
from app.providers import registry

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    db_ok = True
    try:
        with engine.connect() as c:
            c.execute(text("select 1"))
    except Exception:  # noqa: BLE001
        db_ok = False
    s = get_settings()
    return {"status": "ok" if db_ok else "degraded", "database": db_ok, "redis": bool(cache._client()) if s.redis_url else "not configured", "env": s.app_env}


@router.get("/providers")
def providers():
    s = get_settings()
    return {"demo_mode": s.demo_mode and not s.is_production, "providers": registry.health(), "notes": {
        "finnhub": "Free: US quotes, profiles, metrics, news, IPO calendar, earnings. Paid: stock candles, index quotes, economic calendar (varies).",
        "twelve_data": "Free: 8 req/min, 800/day, history for many US stocks. Indices and non-US exchanges often need a paid plan.",
        "fmp": "Free plan is small; movers, screener, statements and economic calendar availability depends on plan.",
        "coingecko": "Works without a key (low rate limit). Optional Demo key raises limits.",
        "frankfurter": "No key. Daily reference rates, not real time.",
    }}
