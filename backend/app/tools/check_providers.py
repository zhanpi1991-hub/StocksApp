"""Check which provider keys are loaded and make ONE small request per configured provider.

    cd backend
    python -m app.tools.check_providers

Prints only configured yes/no and the result. Key values are never printed. Costs about one API call
(Twelve Data: ~1 credit) per configured provider."""
import asyncio

from app.core.config import ENV_FILES, get_settings
from app.providers import registry
from app.providers.base import ProviderError, ProviderUnavailable

CHECKS = [
    (registry.coingecko, "/simple/price", {"ids": "bitcoin", "vs_currencies": "usd"}),
    (registry.finnhub, "/quote", {"symbol": "AAPL"}),
    (registry.twelve, "/quote", {"symbol": "AAPL"}),
    (registry.fmp, "/quote", {"symbol": "AAPL"}),
]


async def main() -> int:
    s = get_settings()
    print("Env files (later overrides earlier; real OS environment variables override both):")
    for p in ENV_FILES:
        print(f"  {'FOUND  ' if p.exists() else 'missing'}  {p}")
    print(f"\nCoinGecko plan assumed: {'Demo key (x-cg-demo-api-key)' if s.coingecko_api_key else 'no key (public, heavily limited)'}\n")
    bad = 0
    for prov, path, params in CHECKS:
        label = f"{prov.name:<12}"
        if not prov.configured:
            print(f"{label} NOT CONFIGURED  (set {prov.key_env})")
            continue
        try:
            fetched = await prov.get(path, params, ttl=1)
            note = " (served from stale cache)" if fetched.stale else ""
            print(f"{label} OK{note}")
        except ProviderUnavailable as exc:
            print(f"{label} NOT CONFIGURED  {exc}")
        except ProviderError as exc:
            bad += 1
            print(f"{label} FAILED  [{exc.reason}] {exc}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
