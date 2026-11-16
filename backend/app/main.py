import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import alerts, auth, calendars, compare, crypto, forex, market, news, portfolio, screener, search, stocks, system, watchlists, ws
from app.core.config import Settings, get_settings
from app.core.logging import setup_logging
from app.core.ratelimit import rate_limit
from app.db.base import Base
from app.db.session import engine
from app.providers import registry
from app.services.alerts import alert_loop

setup_logging()
log = logging.getLogger("app")

ROUTERS = [auth, watchlists, portfolio, alerts, market, stocks, crypto, forex, news, calendars, screener, search, compare, system]


def create_app(settings: Settings) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI):
        if settings.sqlalchemy_url.startswith("sqlite"):
            import app.models  # noqa: F401

            Base.metadata.create_all(engine)  # local zero-setup only; PostgreSQL schema is managed by Alembic
        task = asyncio.create_task(alert_loop(settings.alert_interval_seconds))
        log.info("StocksApp API started (env=%s, database=%s, docs=%s)", settings.app_env, engine.dialect.name, settings.docs_enabled)
        yield
        task.cancel()
        for provider in registry.ALL:
            await provider.client.aclose()

    app = FastAPI(
        title="StocksApp API", version="1.0.0", lifespan=lifespan,
        description="Market data envelope: every market endpoint returns {data, meta:{provider,status,as_of,message}}.",
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
    )
    # Authentication uses a Bearer header (no cookies), so credentialed CORS is not needed and stays off.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_list,
        allow_origin_regex=settings.cors_origin_regex or None,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.exception_handler(Exception)
    async def unhandled(request: Request, exc: Exception):
        log.exception("unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)

    for mod in ROUTERS:
        app.include_router(mod.router, prefix="/api", dependencies=[Depends(rate_limit)])
    app.include_router(ws.router, prefix="/api")
    return app


app = create_app(get_settings())
