import re
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from app.providers.registry import frankfurter
from app.services import envelope

router = APIRouter(prefix="/forex", tags=["forex"])

MAJORS = ["USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "CNY", "KZT"]
RANGES = {"1M": 30, "3M": 90, "6M": 182, "1Y": 365, "5Y": 365 * 5}
CODE = re.compile(r"^[A-Z]{3}$")


def code(v: str) -> str:
    v = v.upper()
    if not CODE.match(v):
        raise HTTPException(400, "Currency codes must be 3 letters")
    return v


@router.get("/currencies")
async def currencies():
    r = await envelope.respond("frankfurter", frankfurter.currencies(), empty=[])
    r["meta"]["majors"] = MAJORS
    return r


@router.get("/rates")
async def rates(base: str = "USD", quotes: str = ",".join(MAJORS)):
    b = code(base)
    qs = [code(x) for x in quotes.split(",") if x and x.upper() != b][:40]
    return await envelope.respond("frankfurter", frankfurter.latest(b, qs), empty={"base": b, "rates": {}})


@router.get("/pair")
async def pair(base: str, quote: str):
    return await envelope.respond("frankfurter", frankfurter.change(code(base), code(quote)))


@router.get("/convert")
async def convert(base: str, quote: str, amount: float = Query(1, gt=0)):
    r = await envelope.respond("frankfurter", frankfurter.change(code(base), code(quote)))
    if r["data"]:
        r["data"]["amount"] = amount
        r["data"]["result"] = amount * r["data"]["rate"]
    return r


@router.get("/history")
async def history(base: str, quote: str, range: str = Query("3M")):
    rng = range.upper()
    if rng not in RANGES:
        raise HTTPException(400, f"Unsupported range. Supported: {', '.join(RANGES)}")
    end = date.today()
    r = await envelope.respond("frankfurter", frankfurter.history(code(base), code(quote), end - timedelta(days=RANGES[rng]), end), empty=[])
    r["meta"]["range"] = rng
    return r
