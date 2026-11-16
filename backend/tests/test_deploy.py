import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.core import ratelimit
from app.core.config import DEFAULT_JWT_SECRET, REPO_ROOT, Settings, get_settings
from app.core.security import create_access_token
from app.main import app, create_app
from app.websocket.hub import hub

GOOD_PROD = dict(
    _env_file=None, app_env="production", jwt_secret="x" * 48, database_url="postgresql://u:p@db.internal:5432/stocks",
    cors_origins="https://stocksapp.vercel.app/",
)


def prod(**over) -> Settings:
    return Settings(**{**GOOD_PROD, **over})


# ---- production configuration guard ----------------------------------------------------------

def test_good_production_config_accepted_and_normalised():
    s = prod()
    assert s.is_production and s.cors_list == ["https://stocksapp.vercel.app"]  # trailing slash stripped
    assert s.sqlalchemy_url.startswith("postgresql+psycopg://")
    assert prod(database_url="postgres://u:p@h/db").sqlalchemy_url.startswith("postgresql+psycopg://")
    assert prod(app_env=" Production ").is_production


@pytest.mark.parametrize("over,needle", [
    ({"jwt_secret": DEFAULT_JWT_SECRET}, "JWT_SECRET"),
    ({"jwt_secret": "short"}, "JWT_SECRET"),
    ({"database_url": "sqlite:///./stocksapp.db"}, "PostgreSQL"),
    ({"cors_origins": "*"}, "CORS_ORIGINS"),
    ({"cors_origins": "http://localhost:5173"}, "CORS_ORIGINS"),
])
def test_unsafe_production_config_refused(over, needle):
    with pytest.raises(ValueError, match=needle):
        prod(**over)


def test_development_is_permissive():
    s = Settings(_env_file=None)
    assert not s.is_production and s.docs_enabled


# ---- docs / CORS -------------------------------------------------------------------------------

def test_docs_disabled_in_production_enabled_in_dev():
    p = TestClient(create_app(prod()))
    assert p.get("/docs").status_code == 404 and p.get("/openapi.json").status_code == 404
    d = TestClient(create_app(Settings(_env_file=None)))
    assert d.get("/docs").status_code == 200
    assert TestClient(create_app(prod(enable_docs=True))).get("/openapi.json").status_code == 200


def test_cors_allows_only_configured_origins_without_credentials():
    c = TestClient(create_app(prod(cors_origin_regex=r"https://stocksapp-[a-z0-9]+\.vercel\.app")))
    ok = c.options("/api/health", headers={"Origin": "https://stocksapp.vercel.app", "Access-Control-Request-Method": "GET"})
    assert ok.headers["access-control-allow-origin"] == "https://stocksapp.vercel.app"
    assert "access-control-allow-credentials" not in ok.headers
    preview = c.options("/api/health", headers={"Origin": "https://stocksapp-abc123.vercel.app", "Access-Control-Request-Method": "GET"})
    assert preview.headers.get("access-control-allow-origin") == "https://stocksapp-abc123.vercel.app"
    bad = c.options("/api/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


# ---- health check ------------------------------------------------------------------------------

def test_health_ok_and_never_rate_limited(monkeypatch):
    monkeypatch.setattr(get_settings(), "rate_limit_per_minute", 1)
    ratelimit.reset()
    with TestClient(app) as c:
        assert all(c.get("/api/health").status_code == 200 for _ in range(6))
        assert c.get("/api/providers").status_code == 200
        assert c.get("/api/providers").status_code == 429  # normal endpoints still limited
    ratelimit.reset()


def test_health_returns_503_when_database_down(monkeypatch):
    from app.api.routes import system

    class Broken:
        def connect(self):
            raise RuntimeError("db down")

    monkeypatch.setattr(system, "engine", Broken())
    with TestClient(app) as c:
        r = c.get("/api/health")
    assert r.status_code == 503 and r.json()["database"] is False


# ---- auth brute-force limit ----------------------------------------------------------------------

def test_login_attempts_rate_limited(monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_rate_limit_per_minute", 3)
    ratelimit.reset()
    with TestClient(app) as c:
        codes = [c.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrong-password"}).status_code for _ in range(5)]
    assert codes[:3] == [401, 401, 401] and codes[3:] == [429, 429]
    ratelimit.reset()


# ---- WebSocket auth and origin -------------------------------------------------------------------

def test_ws_auth_by_message_not_url(monkeypatch):
    ratelimit.reset()
    token = create_access_token(4242)
    with TestClient(app) as c:
        with c.websocket_connect(f"/api/ws?token={token}") as ws:  # token in URL must be ignored
            assert 4242 not in hub.users
            ws.send_json({"action": "auth", "token": token})
            assert ws.receive_json() == {"type": "auth", "authenticated": True}
            assert 4242 in hub.users
            ws.send_json({"action": "auth", "token": "not-a-jwt"})
            assert ws.receive_json()["authenticated"] is False
            assert 4242 not in hub.users
            ws.send_json({"action": "ping"})
            assert ws.receive_json() == {"type": "pong"}
        assert 4242 not in hub.users


def test_ws_rejects_foreign_origin_and_oversized_messages():
    with TestClient(app) as c:
        with pytest.raises(WebSocketDisconnect) as e:
            with c.websocket_connect("/api/ws", headers={"origin": "https://evil.example"}) as ws:
                ws.receive_json()
        assert e.value.code == 1008
        with c.websocket_connect("/api/ws", headers={"origin": "http://localhost:5173"}) as ws:
            ws.send_text("x" * 9000)
            with pytest.raises(WebSocketDisconnect) as e2:
                ws.receive_json()
            assert e2.value.code == 1009


# ---- deployment files (regression lint) ----------------------------------------------------------

def read(rel: str) -> str:
    return (REPO_ROOT / rel).read_text(encoding="utf-8")


def test_dockerignore_excludes_env_files():
    for f in ("backend/.dockerignore", "frontend/.dockerignore"):
        assert ".env" in read(f).split()


def test_dockerfile_hardening():
    d = read("backend/Dockerfile")
    assert "--proxy-headers" in d and "USER " in d and "${PORT" in d and "alembic upgrade head" in d


def test_render_blueprint_is_free_plan_and_secret_safe():
    r = read("render.yaml")
    assert r.count("plan: free") == 2 and "healthCheckPath: /api/health" in r and "generateValue: true" in r
    assert "autoDeployTrigger: off" in r
    for key in ("FINNHUB_API_KEY", "TWELVE_DATA_API_KEY", "FMP_API_KEY", "COINGECKO_API_KEY", "CORS_ORIGINS"):
        assert f"key: {key}, sync: false" in r  # prompted at setup, never stored in the repo
