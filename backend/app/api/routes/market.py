import asyncio

from fastapi import APIRouter, Query

from app.providers.base import Out, ProviderError, ProviderUnavailable
from app.providers.registry import fmp, twelve
from app.services import demo, envelope
from app.services.quotes import INDICES
from app.services.sessions import all_sessions, session_status

router = APIRouter(prefix="/market", tags=["market"])


async def _index(code: str, name: str, td_symbol: str, exch: str) -> dict:
    base = {"code": code, "name": name, "exchange": exch, "session": session_status(exch)}
    d = demo.quote(code)
    try:
        if d and not twelve.configured:
            out = d
        else:
            out = await twelve.quote(td_symbol)
        return {**base, "quote": out.data, "status": out.status, "message": out.message, "as_of": out.as_of}
    except ProviderUnavailable as e:
        return {**base, "quote": None, "status": "unavailable", "reason": "no_key", "message": str(e), "as_of": None}
    except ProviderError as e:
        msg = str(e)
        if e.plan_required:
            msg += f" Index {td_symbol} may require a paid Twelve Data plan or may not be covered."
        return {**base, "quote": None, "status": "unavailable", "reason": e.reason, "message": msg, "as_of": None}
    except (KeyError, TypeError, ValueError):
        return {**base, "quote": None, "status": "unavailable", "reason": "bad_response", "message": "Unexpected provider response.", "as_of": None}


@router.get("/indices")
async def indices():
    rows = await asyncio.gather(*(_index(*i) for i in INDICES))
    return {"data": rows, "meta": envelope.meta("twelve_data", "delayed", None, "Index data via Twelve Data; availability depends on plan and symbol coverage. Per-index status shown individually.")}


@router.get("/sessions")
def sessions():
    return {"data": all_sessions(), "meta": envelope.meta("local-schedule", "delayed", None, "Scheduled regular hours only; holidays not reflected.")}


@router.get("/movers")
async def movers(kind: str = Query("gainers", pattern="^(gainers|losers|active)$")):
    return await envelope.respond("fmp", fmp.movers(kind), empty=[])


@router.get("/heatmap")
async def heatmap():
    """Sector performance snapshot (FMP). Per-stock heatmaps need a licensed constituent feed."""
    return await envelope.respond("fmp", fmp.sector_performance(), empty=[])


@router.get("/summary")
async def summary():
    """Global summary: counts of open sessions plus index breadth (only from indices that returned data)."""
    sess = all_sessions()
    rows = await asyncio.gather(*(_index(*i) for i in INDICES))
    ok = [r for r in rows if r["quote"] and r["quote"].get("change_pct") is not None]
    data = {
        "open_exchanges": sum(1 for s in sess if s["status"] == "open"), "total_exchanges": len(sess),
        "indices_with_data": len(ok), "indices_total": len(rows),
        "advancing": sum(1 for r in ok if r["quote"]["change_pct"] > 0), "declining": sum(1 for r in ok if r["quote"]["change_pct"] < 0),
        "avg_change_pct": (sum(r["quote"]["change_pct"] for r in ok) / len(ok)) if ok else None,
    }
    return {"data": data, "meta": envelope.meta("twelve_data", "delayed" if ok else "unavailable", None, None if ok else "No index data available; configure TWELVE_DATA_API_KEY.")}


_ = Out
