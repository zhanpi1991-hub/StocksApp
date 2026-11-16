"""Hermetic test environment.

Runs before any test module imports the app. Real OS environment variables override .env files, so
setting the provider keys to empty strings guarantees tests never load a developer's real keys from
`.env` (which would make live API calls and use up quota)."""
import os

for name in ("FINNHUB_API_KEY", "TWELVE_DATA_API_KEY", "FMP_API_KEY", "COINGECKO_API_KEY", "REDIS_URL"):
    os.environ[name] = ""
os.environ["APP_ENV"] = "development"
os.environ["DEMO_MODE"] = "false"
os.environ["DATABASE_URL"] = "sqlite:///./test_stocksapp.db"
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["CORS_ORIGIN_REGEX"] = ""
os.environ.pop("ENABLE_DOCS", None)
os.environ["AUTH_RATE_LIMIT_PER_MINUTE"] = "1000"  # individual tests lower it explicitly
