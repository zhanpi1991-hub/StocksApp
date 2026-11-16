import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

from app.core.config import get_settings

_hits: dict[str, deque] = defaultdict(deque)


async def rate_limit(request: Request) -> None:
    limit = get_settings().rate_limit_per_minute
    ip = request.client.host if request.client else "unknown"
    q = _hits[ip]
    now = time.time()
    while q and q[0] < now - 60:
        q.popleft()
    if len(q) >= limit:
        raise HTTPException(429, "Rate limit exceeded", headers={"Retry-After": "30"})
    q.append(now)
