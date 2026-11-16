from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
REPO_ROOT = BACKEND_DIR.parent  # .../StocksApp

# Absolute paths, so it does not matter which directory the server is started from.
# Later files override earlier ones, and real OS environment variables override both.
ENV_FILES = (REPO_ROOT / ".env", BACKEND_DIR / ".env")

KEY_FIELDS = ("finnhub_api_key", "twelve_data_api_key", "fmp_api_key", "coingecko_api_key")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"  # development | production
    database_url: str = "sqlite:///./stocksapp.db"
    redis_url: str = ""  # empty -> in-process cache
    jwt_secret: str = "change-me-in-development-only-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173"

    # Provider keys: read by the backend only; never returned by any endpoint or logged.
    finnhub_api_key: str = ""
    twelve_data_api_key: str = ""
    fmp_api_key: str = ""
    coingecko_api_key: str = ""  # CoinGecko *Demo* key (sent as x-cg-demo-api-key)

    demo_mode: bool = False  # DEV ONLY: labeled sample data when providers lack keys
    alert_interval_seconds: int = 60
    rate_limit_per_minute: int = 240

    # Internal request budgets (0 = automatic default). These are conservative self-imposed limits that stop
    # the app from hitting provider limits; they are NOT the providers' official numbers. Raise them if your plan allows.
    coingecko_requests_per_minute: int = 0  # auto: 10 without a key, 25 with a Demo key
    finnhub_requests_per_minute: int = 0  # auto: 50
    twelve_data_requests_per_minute: int = 0  # auto: 7
    twelve_data_requests_per_day: int = 0  # auto: 700
    fmp_requests_per_day: int = 0  # auto: 225

    # How long (seconds) crypto market snapshots are served from the server cache before refreshing.
    crypto_markets_ttl: int = 120

    @field_validator(*KEY_FIELDS, mode="before")
    @classmethod
    def clean_key(cls, v: object) -> str:
        """Tolerate stray whitespace/quotes/'Bearer ' pasted along with a key."""
        s = str(v or "").strip().strip("\"'").strip()
        return s[7:].strip() if s.lower().startswith("bearer ") else s

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def sqlalchemy_url(self) -> str:
        url = self.database_url
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()
