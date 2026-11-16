"""Provider abstraction: every adapter extends Provider and returns Out objects.

Request pipeline in `Provider.get`:
  fresh cache hit -> return it
  identical request already in flight -> await it (single-flight, no duplicate upstream call)
  provider cool-down active or local request budget exhausted -> serve stale (CACHED) or fail, WITHOUT calling upstream
  otherwise one upstream call; 429 starts a cool-down using Retry-After."""
import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from app.core import cache

log = logging.getLogger("providers")

STATUSES = ("realtime", "delayed", "historical", "cached", "unavailable", "demo")
MIN_COOLDOWN, MAX_COOLDOWN = 5.0, 900.0


class ProviderUnavailable(Exception):
    """Provider has no API key / feature not configured."""


class ProviderError(Exception):
    def __init__(self, message: str, code: int = 502, plan_required: bool = False):
        super().__init__(message)
        self.code = code
        self.plan_required = plan_required

    @property
    def reason(self) -> str:
        if self.plan_required:
            return "plan_required"
        if self.code == 429:
            return "rate_limited"
        if self.code == 503:
            return "network"
        return "provider_error"


@dataclass
class Fetched:
    data: Any
    stale: bool = False
    fetched_at: float = field(default_factory=time.time)


@dataclass
class Out:
    """Provider result in the internal format; routes wrap this into an Envelope."""

    data: Any
    status: str = "delayed"
    provider: str = ""
    as_of: str | None = None
    message: str | None = None


def iso(ts: float | int | None) -> str | None:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def num(v: Any) -> float | None:
    try:
        if v is None or v == "":
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_retry_after(value: str | None, default: float) -> float:
    """Retry-After is either delta-seconds or an HTTP date. Clamped to a sane range."""
    secs = default
    if value:
        try:
            secs = float(value)
        except ValueError:
            try:
                secs = (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds()
            except (TypeError, ValueError):
                secs = default
    return min(MAX_COOLDOWN, max(MIN_COOLDOWN, secs))


class Provider:
    name = "base"
    base_url = ""
    key_env = ""  # documentation only
    default_cooldown = 30.0  # used when a 429 carries no Retry-After

    def __init__(self) -> None:
        self.client = httpx.AsyncClient(timeout=15, headers={"User-Agent": "StocksApp/1.0"})
        self.last_ok: float | None = None
        self.last_error: str | None = None
        self.calls = 0  # upstream requests actually sent
        self.errors = 0
        self.cache_hits = 0
        self.deduped = 0
        self.throttled = 0  # requests refused locally by cool-down / budget (no upstream call)
        self.cooldown_until = 0.0
        self.last_error_at = 0.0
        self._window: deque[float] = deque()  # upstream request timestamps, last 60 s
        self._day = ""
        self._day_calls = 0
        self._inflight: dict[str, asyncio.Future] = {}

    # --- configuration ---------------------------------------------------
    def api_key(self) -> str:
        return ""

    def budget_per_minute(self) -> int:
        return 0  # 0 = no local cap

    def budget_per_day(self) -> int:
        return 0

    @property
    def requires_key(self) -> bool:
        return True

    @property
    def configured(self) -> bool:
        return (not self.requires_key) or bool(self.api_key())

    def require(self) -> None:
        if not self.configured:
            raise ProviderUnavailable(f"{self.name} API key not configured (set {self.key_env}).")

    def auth(self, params: dict, headers: dict) -> None:
        """Adapters add credentials here (server side only)."""

    def detect_error(self, data: Any) -> tuple[str, bool] | None:
        """Return (message, plan_required) if a 200 response carries an error body."""
        return None

    # --- local limiting ------------------------------------------------------
    def _budget_wait(self) -> float:
        """Seconds until a request may be sent under the local budget (0 = go now)."""
        now = time.time()
        while self._window and self._window[0] < now - 60:
            self._window.popleft()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._day:
            self._day, self._day_calls = today, 0
        per_day = self.budget_per_day()
        if per_day and self._day_calls >= per_day:
            return 3600.0
        per_min = self.budget_per_minute()
        if per_min and len(self._window) >= per_min:
            return max(1.0, self._window[0] + 60 - now)
        return 0.0

    def _count_request(self) -> None:
        self._window.append(time.time())
        self._day_calls += 1
        self.calls += 1

    # --- http --------------------------------------------------------------
    async def get(self, path: str, params: dict | None = None, ttl: int = 60) -> Fetched:
        self.require()
        params = {k: v for k, v in (params or {}).items() if v is not None}
        key = f"{self.name}:{path}:{sorted(params.items())}"
        hit = cache.get(key)
        if hit:
            self.cache_hits += 1
            return Fetched(hit[0], False, hit[1])
        pending = self._inflight.get(key)
        if pending is not None:
            self.deduped += 1
            return await asyncio.shield(pending)
        fut = asyncio.ensure_future(self._request(key, path, params, ttl))
        self._inflight[key] = fut
        fut.add_done_callback(lambda _f, k=key: self._inflight.pop(k, None))
        return await asyncio.shield(fut)

    async def _request(self, key: str, path: str, params: dict, ttl: int) -> Fetched:
        now = time.time()
        if now < self.cooldown_until:
            return self._blocked(key, f"{self.name}: rate limit reached; pausing requests for about {int(self.cooldown_until - now) + 1}s.", 429)
        wait = self._budget_wait()
        if wait:
            return self._blocked(key, f"{self.name}: local request budget used up (to protect your plan limits); retry in about {int(wait)}s.", 429)
        headers: dict = {}
        send = dict(params)
        self.auth(send, headers)
        self._count_request()
        try:
            r = await self.client.get(self.base_url + path, params=send, headers=headers)
        except httpx.HTTPError as exc:
            return self._fail(key, f"{self.name} unreachable ({exc.__class__.__name__}).", 503)
        if r.status_code in (401, 403):
            return self._fail(key, f"{self.name}: access denied (HTTP {r.status_code}); key invalid or endpoint needs a paid plan.", r.status_code, True)
        if r.status_code == 402:
            return self._fail(key, f"{self.name}: endpoint requires a paid plan.", 402, True)
        if r.status_code == 429:
            wait_s = parse_retry_after(r.headers.get("retry-after"), self.default_cooldown)
            self.cooldown_until = time.time() + wait_s
            return self._fail(key, f"{self.name}: rate limit reached; pausing requests for about {int(wait_s)}s.", 429)
        if r.status_code >= 400:
            return self._fail(key, f"{self.name}: HTTP {r.status_code}.", r.status_code)
        try:
            data = r.json()
        except ValueError:
            return self._fail(key, f"{self.name}: invalid JSON response.", 502)
        err = self.detect_error(data)
        if err:
            return self._fail(key, err[0], 402 if err[1] else 502, err[1])
        self.last_ok, self.last_error = time.time(), None
        cache.set(key, data, ttl)
        return Fetched(data)

    def _blocked(self, key: str, msg: str, code: int) -> Fetched:
        """Refused locally (cool-down/budget): no upstream call, not counted as a provider error."""
        self.throttled += 1
        stale = cache.get(key, allow_stale=True)
        if stale:
            self.last_error = msg
            return Fetched(stale[0], True, stale[1])
        raise ProviderError(msg, code)

    def _fail(self, key: str, msg: str, code: int, plan: bool = False) -> Fetched:
        self.errors += 1
        self.last_error = msg
        self.last_error_at = time.time()
        log.warning(msg)
        stale = cache.get(key, allow_stale=True)
        if stale:
            return Fetched(stale[0], True, stale[1])
        raise ProviderError(msg, code, plan)

    # --- health / output -----------------------------------------------------
    def state(self) -> str:
        """not_configured | rate_limited | error | ok | idle (configured, not used yet)."""
        if not self.configured:
            return "not_configured"
        if time.time() < self.cooldown_until or self._budget_wait():
            return "rate_limited"
        if self.last_error and (self.last_ok is None or self.last_error_at > self.last_ok):
            return "error"
        return "ok" if self.last_ok else "idle"

    def health(self) -> dict:
        now = time.time()
        return {
            "state": self.state(),
            "cooldown_seconds": max(0, int(max(self.cooldown_until - now, self._budget_wait()))),
            "name": self.name,
            "configured": self.configured,
            "requires_key": self.requires_key,
            "key_env": self.key_env,
            "last_ok": iso(self.last_ok),
            "last_error": self.last_error,
            "calls": self.calls,
            "errors": self.errors,
            "cache_hits": self.cache_hits,
            "deduped": self.deduped,
            "throttled": self.throttled,
            "budget_per_minute": self.budget_per_minute(),
            "calls_last_minute": len(self._window),
        }

    def out(self, f: Fetched, data: Any, status: str = "delayed", message: str | None = None) -> Out:
        if f.stale:
            return Out(data, "cached", self.name, iso(f.fetched_at), f"{self.last_error} Showing last cached data.")
        return Out(data, status, self.name, iso(f.fetched_at), message)
