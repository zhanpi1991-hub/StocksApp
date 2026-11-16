"""TTL cache with optional Redis backing.

Entries have a freshness deadline (`ttl`) and are *retained* much longer so they can be served as
stale (status CACHED) when a provider is rate limited, down, or in cool-down."""
import json
import logging
import time
from typing import Any

from app.core.config import get_settings

log = logging.getLogger("cache")
RETAIN_SECONDS = 6 * 3600  # how long past expiry an entry stays available as stale
_mem: dict[str, tuple[float, float, Any]] = {}  # key -> (fresh_until, stored_at, value)
_redis = None
_redis_tried = False


def _client():
    global _redis, _redis_tried
    if _redis_tried:
        return _redis
    _redis_tried = True
    url = get_settings().redis_url
    if url:
        try:
            import redis

            _redis = redis.Redis.from_url(url, socket_timeout=1, decode_responses=True)
            _redis.ping()
        except Exception as exc:  # noqa: BLE001
            log.warning("Redis unavailable (%s); using in-process cache", exc.__class__.__name__)
            _redis = None
    return _redis


def get(key: str, allow_stale: bool = False) -> tuple[Any, float] | None:
    """Returns (value, stored_at). Expired entries are only returned when allow_stale=True."""
    now = time.time()
    item = _mem.get(key)
    if item and (item[0] > now or allow_stale):
        return item[2], item[1]
    r = _client()
    if r:
        try:
            raw = r.get(f"cache:{key}")
            if raw:
                d = json.loads(raw)
                if d["e"] > now or allow_stale:
                    return d["v"], d["t"]
        except Exception:  # noqa: BLE001
            pass
    return None


def set(key: str, value: Any, ttl: int) -> None:  # noqa: A001
    now = time.time()
    _mem[key] = (now + ttl, now, value)
    if len(_mem) > 5000:
        for k in [k for k, v in _mem.items() if v[0] + RETAIN_SECONDS < now][:1000]:
            _mem.pop(k, None)
    r = _client()
    if r:
        try:
            r.setex(f"cache:{key}", ttl + RETAIN_SECONDS, json.dumps({"v": value, "t": now, "e": now + ttl}, default=str))
        except Exception:  # noqa: BLE001
            pass


def clear() -> None:
    _mem.clear()
