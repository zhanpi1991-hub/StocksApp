from functools import lru_cache
from pathlib import Path

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]  # .../backend
REPO_ROOT = BACKEND_DIR.parent  # .../StocksApp

# Absolute paths, so it does not matter which directory the server is started from.
# Later files override earlier ones, and real OS environment variables override both.
ENV_FILES = (REPO_ROOT / ".env", BACKEND_DIR / ".env")

DEFAULT_JWT_SECRET = "change-me-in-development-only-0123456789abcdef"
KEY_FIELDS = ("finnhub_api_key", "twelve_data_api_key", "fmp_api_key", "coingecko_api_key")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILES, env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"  # development | production
    database_url: str = "sqlite:///./stocksapp.db"
    redis_url: str = ""  # empty -> in-process cache
    jwt_secret: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:5173"  # comma-separated exact origins, no trailing slash, e.g. https://stocksapp.vercel.app
    cors_origin_regex: str = ""  # optional, e.g. https://stocksapp-.*\.vercel\.app to allow Vercel preview deployments
    enable_docs: bool | None = None  # /docs and /openapi.json; default: on in development, off in production
    allow_sqlite_in_production: bool = False  # escape hatch; SQLite on Render's ephemeral disk loses data on every restart
    auth_rate_limit_per_minute: int = 10  # login/register attempts per IP per minute

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

    @field_validator("app_env", mode="before")
    @classmethod
    def norm_env(cls, v: object) -> str:
        return str(v or "development").strip().lower()

    @field_validator(*KEY_FIELDS, mode="before")
    @classmethod
    def clean_key(cls, v: object) -> str:
        """Tolerate stray whitespace/quotes/'Bearer ' pasted along with a key."""
        s = str(v or "").strip().strip("\"'").strip()
        return s[7:].strip() if s.lower().startswith("bearer ") else s

    @model_validator(mode="after")
    def production_guard(self) -> "Settings":
        """Fail fast (at startup/migration time) on configurations that are unsafe in production."""
        if self.app_env != "production":
            return self
        problems = []
        if self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET must be set to a random value of at least 32 characters")
        if self.sqlalchemy_url.startswith("sqlite") and not self.allow_sqlite_in_production:
            problems.append("DATABASE_URL must point to PostgreSQL (SQLite on an ephemeral disk loses all data on restart)")
        if "*" in self.cors_list:
            problems.append("CORS_ORIGINS must list exact origins, not '*'")
        if not self.cors_list or self.cors_list == ["http://localhost:5173"]:
            if not self.cors_origin_regex:
                problems.append("CORS_ORIGINS must be set to your frontend origin (e.g. https://your-app.vercel.app)")
        if problems:
            raise ValueError("Unsafe production configuration: " + "; ".join(problems))
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.cors_origins.split(",") if o.strip()]

    @property
    def docs_enabled(self) -> bool:
        return self.enable_docs if self.enable_docs is not None else not self.is_production

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
