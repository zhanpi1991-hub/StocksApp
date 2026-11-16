import os
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "sqlite:///./test_stocksapp.db"
os.environ["DEMO_MODE"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.alerts import check  # noqa: E402
from app.services.portfolio_calc import replay  # noqa: E402
from app.services.sessions import session_status  # noqa: E402


def tx(side, q, p, fee="0", sym="AAPL"):
    return SimpleNamespace(asset_type="stock", symbol=sym, name="", side=side, quantity=Decimal(q), price=Decimal(p), fee=Decimal(fee))


def test_average_cost_and_realized():
    book = replay([tx("buy", "10", "100"), tx("buy", "10", "120"), tx("sell", "5", "130", "1")])
    pos = book[("stock", "AAPL")]
    assert pos.quantity == Decimal(15)
    assert pos.avg_cost == Decimal(110)
    assert pos.realized_pnl == Decimal(5) * Decimal(20) - 1


def test_oversell_rejected():
    with pytest.raises(ValueError):
        replay([tx("buy", "1", "10"), tx("sell", "2", "10")])


def test_decimal_precision():
    book = replay([tx("buy", "0.1", "0.1"), tx("buy", "0.2", "0.1")])
    assert book[("stock", "AAPL")].quantity == Decimal("0.3")


def test_alert_conditions():
    a = SimpleNamespace(condition="above", threshold=Decimal(100), reference_price=None)
    assert check(a, Decimal(100)) and not check(a, Decimal(99))
    p = SimpleNamespace(condition="pct_down", threshold=Decimal(5), reference_price=Decimal(100))
    assert check(p, Decimal(94)) and not check(p, Decimal(96))


def test_session_weekend_closed():
    sat = datetime(2026, 11, 14, 15, 0, tzinfo=timezone.utc)
    assert session_status("US", sat)["status"] == "closed"
    wed = datetime(2026, 11, 18, 15, 0, tzinfo=timezone.utc)
    assert session_status("US", wed)["status"] == "open"


def test_auth_watchlist_flow():
    with TestClient(app) as c:
        email = f"t{datetime.now().timestamp()}@example.com"
        r = c.post("/api/auth/register", json={"email": email, "password": "supersecret1"})
        assert r.status_code == 201
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert c.get("/api/auth/me").status_code == 401
        assert c.get("/api/auth/me", headers=h).json()["email"] == email
        assert c.post("/api/auth/login", json={"email": email, "password": "wrong-pass"}).status_code == 401
        wl = c.get("/api/watchlists", headers=h).json()[0]
        assert c.post(f"/api/watchlists/{wl['id']}/items", headers=h, json={"asset_type": "crypto", "symbol": "bitcoin"}).status_code == 201
        assert c.post(f"/api/watchlists/{wl['id']}/items", headers=h, json={"asset_type": "crypto", "symbol": "bitcoin"}).status_code == 409
        pf = c.post("/api/portfolios", headers=h, json={"name": "Main"}).json()
        t = {"asset_type": "stock", "symbol": "AAPL", "side": "buy", "quantity": "2", "price": "100"}
        assert c.post(f"/api/portfolios/{pf['id']}/transactions", headers=h, json=t).status_code == 201
        assert c.post(f"/api/portfolios/{pf['id']}/transactions", headers=h, json={**t, "side": "sell", "quantity": "3"}).status_code == 422


def test_unconfigured_provider_is_honest():
    with TestClient(app) as c:
        j = c.get("/api/stocks/AAPL/quote").json()
        assert j["meta"]["status"] == "unavailable" and j["data"] is None
        assert c.get("/api/health").json()["database"] is True
