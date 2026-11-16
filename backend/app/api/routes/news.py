from fastapi import APIRouter, Query

from app.providers.registry import finnhub
from app.services import envelope

router = APIRouter(prefix="/news", tags=["news"])

# Finnhub exposes four market-news feeds. Other categories are keyword filters over the general feed
# (labelled as such in the response) rather than invented classifications.
FEEDS = {"global-markets": "general", "forex": "forex", "cryptocurrency": "crypto", "companies": "merger"}
KEYWORDS = {
    "stocks": ["stock", "shares", "equity", "nasdaq", "nyse", "s&p", "dow"],
    "business": ["business", "company", "ceo", "revenue", "profit", "merger", "acquisition"],
    "technology": ["tech", "ai ", "software", "chip", "semiconductor", "cloud", "apple", "microsoft", "nvidia", "google"],
    "economy": ["economy", "inflation", "gdp", "fed", "interest rate", "unemployment", "central bank", "recession", "jobs"],
    "banking": ["bank", "lender", "jpmorgan", "goldman", "credit", "loan", "citigroup", "wells fargo"],
    "commodities": ["oil", "gold", "silver", "copper", "crude", "natural gas", "commodit", "opec", "wheat"],
}
CATEGORIES = ["global-markets", "stocks", "cryptocurrency", "forex", "business", "technology", "economy", "companies", "banking", "commodities"]


@router.get("")
async def news(category: str = "global-markets", q: str | None = None, symbol: str | None = None, page: int = Query(1, ge=1), per_page: int = Query(20, ge=1, le=50)):
    note = None
    if symbol:
        r = await envelope.respond("finnhub", finnhub.company_news(symbol.upper()), empty=[])
    else:
        feed = FEEDS.get(category, "general")
        r = await envelope.respond("finnhub", finnhub.market_news(feed), empty=[])
        if category in KEYWORDS:
            kws = KEYWORDS[category]
            r["data"] = [a for a in r["data"] or [] if any(k in f"{a['headline']} {a['summary']}".lower() for k in kws)]
            note = f"'{category}' is a keyword filter over Finnhub's general market-news feed."
    items = r["data"] or []
    if q:
        ql = q.lower()
        items = [a for a in items if ql in f"{a['headline']} {a['summary']}".lower()]
    items.sort(key=lambda a: a["published_at"] or "", reverse=True)
    total = len(items)
    r["data"] = {"items": items[(page - 1) * per_page: page * per_page], "total": total, "page": page, "per_page": per_page, "categories": CATEGORIES}
    if note and r["meta"]["status"] != "unavailable":
        r["meta"]["message"] = note
    r["meta"]["attribution"] = "Articles are provided by Finnhub and link to the original publishers. Headlines and summaries remain the property of their sources."
    return r
