import os

os.environ["DATABASE_URL"] = "sqlite:///./test_stocksapp.db"
os.environ["DEMO_MODE"] = "false"

import asyncio  # noqa: E402
import time  # noqa: E402
from datetime import datetime  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import cache  # noqa: E402
from app.main import app  # noqa: E402
from app.providers.coingecko import CoinGecko  # noqa: E402
from app.providers.finnhub import Finnhub  # noqa: E402
from app.providers.twelve_data import TwelveData  # noqa: E402
from app.services import envelope  # noqa: E402


@pytest.fixture(autouse=True)
def clean_cache():
    cache._mem.clear()
    yield
    cache._mem.clear()


def keyed(provider, handler):
    """Give an adapter a fake key and a mocked HTTP transport (no network)."""
    provider.api_key = lambda: "test-key"  # type: ignore[method-assign]
    provider.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return provider


def run(coro):
    return asyncio.run(coro)


COIN = {
    "id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "image": "https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png",
    "current_price": 100.0, "market_cap": 1000, "market_cap_rank": 1, "total_volume": 10, "price_change_percentage_24h": 1.5,
    "sparkline_in_7d": {"price": [1, 2, 3]},
}


def test_coingecko_keeps_image_urls():
    cg = CoinGecko()
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[COIN])))
    out = run(cg.markets(per_page=1))
    assert out.data[0]["image"] == COIN["image"]
    assert out.data[0]["symbol"] == "BTC" and out.data[0]["rank"] == 1


def test_coingecko_detail_and_search_images():
    def handler(req: httpx.Request):
        if req.url.path.endswith("/search"):
            return httpx.Response(200, json={"coins": [{"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "thumb": "https://t/btc.png", "market_cap_rank": 1}]})
        return httpx.Response(200, json={"id": "bitcoin", "symbol": "btc", "name": "Bitcoin", "image": {"large": "https://l/btc.png"}, "description": {"en": "x"}, "market_data": {}})

    cg = CoinGecko()
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    assert run(cg.coin("bitcoin")).data["image"] == "https://l/btc.png"
    assert run(cg.search("btc")).data[0]["image"] == "https://t/btc.png"


def test_coin_missing_image_is_none_not_invented():
    cg = CoinGecko()
    c = {**COIN}
    c.pop("image")
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[c])))
    assert run(cg.markets(per_page=1)).data[0]["image"] is None


def test_crypto_quote_exposes_image_for_watchlists(monkeypatch):
    from app.providers import registry
    from app.services import quotes

    cg = registry.coingecko
    monkeypatch.setattr(cg, "client", httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[COIN]))))
    out = run(quotes.crypto_quote("bitcoin"))
    assert out.data["image"] == COIN["image"]


def test_finnhub_news_image_propagation():
    news = [
        {"id": 1, "headline": "With image", "summary": "s", "source": "A", "url": "https://a/1", "image": "https://a/1.jpg", "datetime": 1700000000, "related": "AAPL,MSFT", "category": "general"},
        {"id": 2, "headline": "No image", "summary": "", "source": "B", "url": "https://b/2", "image": "", "datetime": 1700000100, "related": "", "category": "general"},
    ]
    fh = keyed(Finnhub(), lambda r: httpx.Response(200, json=news))
    items = run(fh.market_news("general")).data
    assert items[0]["image"] == "https://a/1.jpg" and items[0]["related"] == ["AAPL", "MSFT"]
    assert items[1]["image"] is None


def test_finnhub_quote_parsing_and_realtime_label():
    fh = keyed(Finnhub(), lambda r: httpx.Response(200, json={"c": 190.5, "d": 1.5, "dp": 0.79, "h": 191, "l": 188, "o": 189, "pc": 189, "t": 1700000000}))
    out = run(fh.quote("AAPL"))
    assert out.status == "realtime" and out.data["price"] == 190.5 and out.data["prev_close"] == 189


def test_finnhub_empty_quote_is_unavailable_not_zero():
    fh = keyed(Finnhub(), lambda r: httpx.Response(200, json={"c": 0, "d": None, "dp": None, "h": 0, "l": 0, "o": 0, "pc": 0, "t": 0}))
    out = run(fh.quote("ZZZZ"))
    assert out.status == "unavailable" and out.data is None


def test_missing_key_reason_no_key():
    fh = Finnhub()
    fh.api_key = lambda: ""  # type: ignore[method-assign]
    env = run(envelope.respond("finnhub", fh.quote("AAPL")))
    assert env["meta"]["status"] == "unavailable" and env["meta"]["reason"] == "no_key"
    assert "FINNHUB_API_KEY" in env["meta"]["message"] and env["data"] is None
    assert fh.state() == "not_configured"


def test_plan_required_detected_from_200_error_body():
    td = keyed(TwelveData(), lambda r: httpx.Response(200, json={"status": "error", "code": 403, "message": "This symbol is available with the Grow or Venture plan"}))
    env = run(envelope.respond("twelve_data", td.quote("SPX")))
    assert env["meta"]["reason"] == "plan_required" and env["meta"]["plan_required"] is True


def test_http_403_is_plan_required():
    fh = keyed(Finnhub(), lambda r: httpx.Response(403, json={"error": "You don't have access to this resource."}))
    env = run(envelope.respond("finnhub", fh.profile("AAPL")))
    assert env["meta"]["reason"] == "plan_required"


def test_rate_limit_sets_cooldown_and_stops_hammering():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(429, headers={"retry-after": "30"})

    cg = CoinGecko()
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    env1 = run(envelope.respond("coingecko", cg.coin("bitcoin")))
    env2 = run(envelope.respond("coingecko", cg.coin("ethereum")))
    assert env1["meta"]["reason"] == "rate_limited" and env2["meta"]["reason"] == "rate_limited"
    assert calls["n"] == 1  # second request was blocked by the cool-down, not sent upstream
    assert cg.state() == "rate_limited" and cg.health()["cooldown_seconds"] > 0


def test_network_failure_reason():
    def handler(req):
        raise httpx.ConnectError("down")

    cg = CoinGecko()
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    env = run(envelope.respond("coingecko", cg.global_data()))
    assert env["meta"]["reason"] == "network" and cg.state() == "error"


def test_stale_cache_served_as_cached_never_realtime():
    state = {"fail": False}

    def handler(req):
        return httpx.Response(500) if state["fail"] else httpx.Response(200, json={"c": 10, "d": 1, "dp": 1, "h": 1, "l": 1, "o": 1, "pc": 9, "t": 1})

    fh = keyed(Finnhub(), handler)
    assert run(fh.quote("AAPL")).status == "realtime"
    # expire the fresh entry but keep it available as stale
    for k, (exp, stored, v) in list(cache._mem.items()):
        cache._mem[k] = (time.time() - 1, stored, v)
    state["fail"] = True
    out = run(fh.quote("AAPL"))
    assert out.status == "cached" and out.data["price"] == 10.0


def test_endpoint_reports_reason_without_keys():
    with TestClient(app) as c:
        j = c.get("/api/stocks/AAPL/quote").json()
        assert j["meta"]["status"] == "unavailable" and j["meta"]["reason"] == "no_key"
        idx = c.get("/api/market/indices").json()["data"]
        assert all(r["status"] == "unavailable" and r["reason"] == "no_key" for r in idx)  # no key => every row explains itself
        provs = c.get("/api/providers").json()["providers"]
        assert {p["name"]: p["state"] for p in provs}["finnhub"] == "not_configured"


def test_default_display_name_is_neutral_and_custom_preserved():
    with TestClient(app) as c:
        ts = datetime.now().timestamp()
        a = c.post("/api/auth/register", json={"email": f"a{ts}@example.com", "password": "supersecret1"}).json()
        assert a["user"]["display_name"] == "User"
        b = c.post("/api/auth/register", json={"email": f"b{ts}@example.com", "password": "supersecret1", "display_name": "Alex"}).json()
        assert b["user"]["display_name"] == "Alex"
