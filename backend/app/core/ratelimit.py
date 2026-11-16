"""In-process sliding-window rate limiting per client IP.

Behind a reverse proxy (Render) the real client IP comes from X-Forwarded-For; uvicorn must run with
--proxy-headers (see backend/Dockerfile) for request.client.host to be that IP. State is per process."""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import get_settings

_buckets: dict[str, dict[str, deque]] = defaultdict(lambda: defaultdict(deque))
_EXEMPT_SUFFIXES = ("/health",)  # platform health checks must never be throttled


def _hit(bucket: str, ip: str, limit: int) -> None:
    hits = _buckets[bucket]
    q = hits[ip]
    now = time.time()
    while q and q[0] < now - 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Rate limit exceeded", headers={"Retry-After": "30"})
    q.append(now)
    if len(hits) > 20_000:  # bound memory: drop idle clients
        for k in [k for k, v in hits.items() if not v or v[-1] < now - 60][:5000]:
            hits.pop(k, None)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def rate_limit(request: Request) -> None:
    if request.url.path.endswith(_EXEMPT_SUFFIXES):
        return
    _hit("api", client_ip(request), get_settings().rate_limit_per_minute)


async def auth_rate_limit(request: Request) -> None:
    """Stricter bucket for login/register to slow password guessing."""
    _hit("auth", client_ip(request), get_settings().auth_rate_limit_per_minute)


def reset() -> None:
    _buckets.clear()
