import os

os.environ["DATABASE_URL"] = "sqlite:///./test_stocksapp.db"
os.environ["DEMO_MODE"] = "false"

import asyncio  # noqa: E402
import json  # noqa: E402
import logging  # noqa: E402
import time  # noqa: E402
from email.utils import format_datetime  # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402

import httpx  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.core import cache  # noqa: E402
from app.core.config import ENV_FILES, REPO_ROOT, BACKEND_DIR, Settings  # noqa: E402
from app.core.logging import redact, setup_logging  # noqa: E402
from app.main import app  # noqa: E402
from app.providers import registry  # noqa: E402
from app.providers.base import ProviderError, parse_retry_after  # noqa: E402
from app.providers.coingecko import CoinGecko  # noqa: E402
from app.services import crypto  # noqa: E402


def coins(n: int, start: int = 1) -> list[dict]:
    return [{"id": f"coin{i}", "symbol": f"c{i}", "name": f"Coin {i}", "image": f"https://img/{i}.png", "current_price": float(i),
             "market_cap": 1000 - i, "market_cap_rank": i, "total_volume": 5, "price_change_percentage_24h": i % 7 - 3} for i in range(start, start + n)]


class Upstream:
    """Counts and records requests to a mocked CoinGecko."""

    def __init__(self, handler=None):
        self.requests: list[httpx.Request] = []
        self.handler = handler or self.default

    def default(self, req: httpx.Request) -> httpx.Response:
        q = req.url.params
        if q.get("ids"):
            return httpx.Response(200, json=coins_by_ids(q["ids"].split(",")))
        return httpx.Response(200, json=coins(int(q.get("per_page", 250))))

    def __call__(self, req):
        self.requests.append(req)
        return self.handler(req)


def coins_by_ids(ids):
    return [{"id": i, "symbol": i[:3], "name": i.title(), "image": f"https://img/{i}.png", "current_price": 1.0, "market_cap": 1, "market_cap_rank": 999,
             "total_volume": 1, "price_change_percentage_24h": 0.5} for i in ids if i.startswith("rare")]


@pytest.fixture
def cg(monkeypatch):
    cache.clear()
    p = registry.coingecko
    up = Upstream()
    monkeypatch.setattr(p, "client", httpx.AsyncClient(transport=httpx.MockTransport(up)))
    monkeypatch.setattr(p, "cooldown_until", 0.0)
    monkeypatch.setattr(p, "_window", __import__("collections").deque())
    monkeypatch.setattr(p, "_inflight", {})
    monkeypatch.setattr(p, "api_key", lambda: "")
    p.up = up  # type: ignore[attr-defined]
    yield p
    cache.clear()


def run(c):
    return asyncio.run(c)


def test_demo_key_sent_only_as_header(monkeypatch, cg):
    monkeypatch.setattr(cg, "api_key", lambda: "CG-SECRET-123")
    run(crypto.snapshot())
    req = cg.up.requests[0]
    assert req.headers["x-cg-demo-api-key"] == "CG-SECRET-123"
    assert "CG-SECRET-123" not in str(req.url)
    assert req.url.host == "api.coingecko.com"  # Demo plan host (Pro uses pro-api.*)


def test_no_header_without_key(cg):
    run(crypto.snapshot())
    assert "x-cg-demo-api-key" not in cg.up.requests[0].headers


def test_all_crypto_views_share_one_upstream_call(cg):
    async def go():
        await crypto.markets_page(1, 50)
        await crypto.markets_page(2, 50)
        await crypto.markets_page(1, 100)
        await crypto.markets_page(3, 25)
        await crypto.snapshot()  # movers/screener/dashboard top-6 use this
        await crypto.markets_page(1, 6)
        r = await crypto.quotes(["coin3", "coin200"])
        return r

    res = run(go())
    assert len(cg.up.requests) == 1
    assert res["coin3"].data["price"] == 3.0 and res["coin200"].data["id"] == "coin200"


def test_markets_page_slicing_and_second_chunk(cg):
    out = run(crypto.markets_page(1, 50))
    assert [c["rank"] for c in out.data] == list(range(1, 51))
    out = run(crypto.markets_page(3, 100))  # rows 200-299 span chunk 1 and chunk 2
    assert out.data[0]["rank"] == 201 - 250 + 250  # first row of the slice is overall row 201
    assert len(out.data) == 100
    assert {r.url.params["page"] for r in cg.up.requests} == {"1", "2"}
    assert all(r.url.params["per_page"] == "250" for r in cg.up.requests)


def test_concurrent_identical_requests_single_flight(cg):
    async def slow(req):
        await asyncio.sleep(0.05)
        return httpx.Response(200, json=coins(250))

    async def go():
        cg.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: (cg.up.requests.append(r), httpx.Response(200, json=coins(250)))[1]))
        return await asyncio.gather(*(crypto.snapshot() for _ in range(8)))

    res = run(go())
    assert len(res) == 8 and len(cg.up.requests) == 1


def test_batched_ids_single_call_then_per_coin_cache(cg):
    run(crypto.quotes(["rare1", "rare2", "rare3"]))
    ids_calls = [r for r in cg.up.requests if r.url.params.get("ids")]
    assert len(ids_calls) == 1 and set(ids_calls[0].url.params["ids"].split(",")) == {"rare1", "rare2", "rare3"}
    before = len(cg.up.requests)
    res = run(crypto.quotes(["rare2", "rare3"]))
    assert len(cg.up.requests) == before and res["rare2"].data["id"] == "rare2"


def test_unknown_coin_is_404_not_invented(cg):
    res = run(crypto.quotes(["definitely-not-real"]))
    assert isinstance(res["definitely-not-real"], ProviderError) and res["definitely-not-real"].code == 404


def test_retry_after_seconds_and_http_date():
    assert parse_retry_after("120", 30) == 120
    assert parse_retry_after("1", 30) == 5  # clamped minimum
    assert parse_retry_after("999999", 30) == 900  # clamped maximum
    assert parse_retry_after(None, 60) == 60
    date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=90), usegmt=True)
    assert 80 <= parse_retry_after(date, 30) <= 91
    assert parse_retry_after("garbage", 45) == 45


def test_429_honours_retry_after_and_serves_cached(cg):
    run(crypto.snapshot())  # warm the cache
    for k, (exp, stored, v) in list(cache._mem.items()):
        cache._mem[k] = (time.time() - 1, stored, v)  # expire (still retained as stale)
    cg.client = httpx.AsyncClient(transport=httpx.MockTransport(lambda r: (cg.up.requests.append(r), httpx.Response(429, headers={"retry-after": "120"}))[1]))
    n = len(cg.up.requests)
    out = run(crypto.snapshot())
    assert out.status == "cached" and len(cg.up.requests) == n + 1
    assert 100 <= cg.cooldown_until - time.time() <= 121
    out2 = run(crypto.snapshot())  # cool-down: must NOT call upstream again
    assert out2.status == "cached" and len(cg.up.requests) == n + 1
    assert cg.state() == "rate_limited" and cg.health()["cooldown_seconds"] > 90


def test_local_budget_blocks_before_upstream(monkeypatch, cg):
    monkeypatch.setattr(cg, "budget_per_minute", lambda: 2)
    before = cg.throttled
    run(cg.markets(page=1))
    run(cg.markets(page=2))
    with pytest.raises(ProviderError) as e:
        run(cg.markets(page=3))
    assert e.value.reason == "rate_limited" and len(cg.up.requests) == 2 and cg.throttled == before + 1


def test_cache_retains_stale_entries():
    cache.clear()
    cache.set("k", {"a": 1}, ttl=1)
    cache._mem["k"] = (time.time() - 5, cache._mem["k"][1], {"a": 1})
    assert cache.get("k") is None
    assert cache.get("k", allow_stale=True)[0] == {"a": 1}


# ---- configuration and secrecy -------------------------------------------------------------------

def test_env_files_are_absolute_and_not_cwd_relative():
    assert ENV_FILES == (REPO_ROOT / ".env", BACKEND_DIR / ".env")
    assert all(p.is_absolute() for p in ENV_FILES)


def test_keys_cleaned_of_quotes_whitespace_bearer():
    s = Settings(_env_file=None, finnhub_api_key='  "abc123"  ', fmp_api_key="Bearer xyz", coingecko_api_key="'CG-1' ", twelve_data_api_key="")
    assert (s.finnhub_api_key, s.fmp_api_key, s.coingecko_api_key, s.twelve_data_api_key) == ("abc123", "xyz", "CG-1", "")


def test_log_redaction():
    assert "SECRET" not in redact("GET https://api.twelvedata.com/quote?symbol=AAPL&apikey=SECRET HTTP/1.1")
    assert "SECRET" not in redact("params {'apikey': 'SECRET'}")
    assert "SECRET" not in redact("x-cg-demo-api-key: SECRET")
    setup_logging()
    assert logging.getLogger("httpx").level >= logging.WARNING


def test_api_never_returns_key_values(monkeypatch):
    from app.core.config import get_settings

    s = get_settings()
    monkeypatch.setattr(s, "finnhub_api_key", "FH-SECRET-VALUE")
    monkeypatch.setattr(s, "twelve_data_api_key", "TD-SECRET-VALUE")
    monkeypatch.setattr(s, "fmp_api_key", "FMP-SECRET-VALUE")
    monkeypatch.setattr(s, "coingecko_api_key", "CG-SECRET-VALUE")
    cache.clear()
    for p in registry.ALL:  # no network: every provider answers 403 from a mock transport
        monkeypatch.setattr(p, "client", httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(403))))
        monkeypatch.setattr(p, "cooldown_until", 0.0)
    with TestClient(app) as c:
        for path in ("/api/providers", "/api/health", "/api/stocks/AAPL/quote", "/api/market/indices", "/api/news"):
            body = c.get(path).text
            for secret in ("FH-SECRET-VALUE", "TD-SECRET-VALUE", "FMP-SECRET-VALUE", "CG-SECRET-VALUE"):
                assert secret not in body, f"{secret} leaked via {path}"
        prov = {p["name"]: p for p in c.get("/api/providers").json()["providers"]}
        assert prov["finnhub"]["configured"] is True and "key" not in json.dumps(list(prov["finnhub"].keys())).replace("key_env", "").replace("requires_key", "")


def test_error_messages_do_not_contain_url_or_key(monkeypatch):
    from app.providers.twelve_data import TwelveData

    td = TwelveData()
    monkeypatch.setattr(td, "api_key", lambda: "TD-SECRET")

    def boom(req):
        raise httpx.ConnectError("failed connecting to " + str(req.url))

    td.client = httpx.AsyncClient(transport=httpx.MockTransport(boom))
    with pytest.raises(ProviderError) as e:
        run(td.quote("AAPL"))
    assert "TD-SECRET" not in str(e.value) and td.last_error and "TD-SECRET" not in td.last_error


def test_coingecko_class_header_name():
    c = CoinGecko()
    c.api_key = lambda: "k"  # type: ignore[method-assign]
    h: dict = {}
    c.auth({}, h)
    assert h == {"x-cg-demo-api-key": "k"}
