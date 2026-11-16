"""Background alert evaluation. Delivery: alerts are recorded in the database and shown in the UI.
No email/push channel is configured, so no external notification is ever sent."""
import asyncio
import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.models import PriceAlert
from app.services.quotes import safe_quotes
from app.websocket.hub import hub

log = logging.getLogger("alerts")


def check(alert: PriceAlert, price: Decimal) -> bool:
    t = Decimal(alert.threshold)
    if alert.condition == "above":
        return price >= t
    if alert.condition == "below":
        return price <= t
    ref = Decimal(alert.reference_price or 0)
    if not ref:
        return False
    move = (price - ref) / ref * 100
    return move >= t if alert.condition == "pct_up" else move <= -t


async def evaluate_once() -> int:
    triggered = 0
    with SessionLocal() as db:
        alerts = db.scalars(select(PriceAlert).where(PriceAlert.active.is_(True))).all()
        keys = {(a.asset_type, a.symbol) for a in alerts}
        ordered = list(keys)
        quotes = dict(zip(ordered, await safe_quotes(ordered)))  # crypto ids resolved in one batch
        now = datetime.now(timezone.utc)
        for a in alerts:
            q = quotes[(a.asset_type, a.symbol)]
            a.last_checked_at = now
            if q["status"] == "cached":  # never trigger an alert on stale prices
                a.last_error = "Latest price is cached/stale; waiting for fresh data."
                continue
            if not q["data"] or q["data"].get("price") is None:
                a.last_error = (q["message"] or "Price unavailable")[:255]
                continue
            a.last_error = None
            price = Decimal(str(q["data"]["price"]))
            if a.reference_price is None:
                a.reference_price = price
            if check(a, price):
                a.active, a.triggered_at, a.triggered_price = False, now, price
                triggered += 1
                await hub.publish_user(a.user_id, {"type": "alert", "alert_id": a.id, "symbol": a.symbol, "price": str(price), "condition": a.condition, "threshold": str(a.threshold)})
        db.commit()
    return triggered


async def alert_loop(interval: int) -> None:
    while True:
        try:
            await evaluate_once()
        except Exception:  # noqa: BLE001
            log.exception("alert evaluation failed")
        await asyncio.sleep(interval)
