from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.providers.base import ProviderError, ProviderUnavailable
from app.providers.registry import finnhub, fmp
from app.services import envelope

router = APIRouter(tags=["calendars"])


@router.get("/economic-calendar")
async def economic(start: date | None = None, view: str = Query("week", pattern="^(day|week|month)$"), country: str | None = None, impact: str | None = None):
    s = start or date.today()
    e = {"day": s, "week": s + timedelta(days=6), "month": s + timedelta(days=30)}[view]
    # Try FMP first, then Finnhub; both gate this endpoint behind plans, so report honestly.
    errors, r, plan = [], None, False
    for prov, fn in (("fmp", fmp), ("finnhub", finnhub)):
        if not fn.configured:
            errors.append(f"{prov}: key not configured")
            continue
        try:
            out = await fn.economic_calendar(s, e)
            r = envelope.wrap(out)
            break
        except (ProviderError, ProviderUnavailable) as exc:
            errors.append(str(exc))
            plan = plan or getattr(exc, "plan_required", False)
    if r is None:
        return envelope.unavailable("fmp/finnhub", "Economic calendar unavailable. " + " | ".join(errors), plan_required=plan, data=[], reason="plan_required" if plan else "no_key" if all("not configured" in e for e in errors) else "provider_error")
    items = r["data"] or []
    if country:
        items = [i for i in items if (i.get("country") or "").lower() == country.lower()]
    if impact:
        items = [i for i in items if (i.get("impact") or "").lower() == impact.lower()]
    items.sort(key=lambda i: i.get("time") or "")
    r["data"] = {"items": items, "start": s.isoformat(), "end": e.isoformat(), "view": view}
    return r


@router.get("/ipo-calendar")
async def ipo(start: date | None = None, end: date | None = None):
    s = start or (date.today() - timedelta(days=30))
    e = end or (date.today() + timedelta(days=60))
    if e < s:
        raise HTTPException(400, "end must be after start")
    r = await envelope.respond("finnhub", finnhub.ipo_calendar(s, e), empty=[])
    r["data"] = {"items": sorted(r["data"] or [], key=lambda i: i.get("date") or ""), "start": s.isoformat(), "end": e.isoformat()}
    return r
