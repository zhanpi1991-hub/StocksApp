import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import alerts, auth, calendars, compare, crypto, forex, market, news, portfolio, screener, search, stocks, system, watchlists, ws
from app.core.config import get_settings
from app.core.logging import setup_logging
from app.core.ratelimit import rate_limit
from app.db.base import Base
from app.db.session import engine
from app.services.alerts import alert_loop

setup_logging()
log = logging.getLogger("app")
settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.database_url.startswith("sqlite"):
        import app.models  # noqa: F401

        Base.metadata.create_all(engine)  # local zero-setup only; Postgres uses Alembic migrations
    task = asyncio.create_task(alert_loop(settings.alert_interval_seconds))
    log.info("StocksApp API started (env=%s, demo=%s)", settings.app_env, settings.demo_mode)
    yield
    task.cancel()


app = FastAPI(title="StocksApp API", version="1.0.0", lifespan=lifespan,
              description="Market data envelope: every market endpoint returns {data, meta:{provider,status,as_of,message}}.")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_list, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse({"detail": "Internal server error"}, status_code=500)


api = [auth, watchlists, portfolio, alerts, market, stocks, crypto, forex, news, calendars, screener, search, compare, system]
for mod in api:
    app.include_router(mod.router, prefix="/api", dependencies=[Depends(rate_limit)])
app.include_router(ws.router, prefix="/api")
