"""Unified response envelope: every market-data endpoint returns {data, meta}."""
from typing import Awaitable

from app.providers.base import Out, ProviderError, ProviderUnavailable


def meta(provider: str, status: str, as_of=None, message=None, plan_required=False, reason=None) -> dict:
    """reason (only when unavailable): no_key | plan_required | rate_limited | network | provider_error | bad_response."""
    return {"provider": provider, "status": status, "as_of": as_of, "message": message, "plan_required": plan_required, "reason": reason}


def unavailable(provider: str, message: str, plan_required: bool = False, data=None, reason: str = "provider_error") -> dict:
    return {"data": data, "meta": meta(provider, "unavailable", None, message, plan_required, reason)}


def wrap(out: Out) -> dict:
    return {"data": out.data, "meta": meta(out.provider, out.status, out.as_of, out.message)}


async def respond(provider: str, aw: Awaitable[Out], empty=None) -> dict:
    """Await a provider call and convert failures into an honest 'unavailable' envelope."""
    try:
        return wrap(await aw)
    except ProviderUnavailable as exc:
        return unavailable(provider, str(exc), data=empty, reason="no_key")
    except ProviderError as exc:
        return unavailable(provider, str(exc), exc.plan_required, empty, exc.reason)
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        return unavailable(provider, f"{provider}: unexpected response shape ({exc.__class__.__name__}).", data=empty, reason="bad_response")
