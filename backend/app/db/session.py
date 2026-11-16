from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings

_url = get_settings().sqlalchemy_url
if _url.startswith("sqlite"):
    _kwargs: dict = {"connect_args": {"check_same_thread": False}}
else:
    _kwargs = {
        "pool_pre_ping": True,  # managed Postgres drops idle connections; revalidate before use
        "pool_recycle": 300,
        "pool_size": 5,
        "max_overflow": 5,
        "connect_args": {"connect_timeout": 10},
    }
engine = create_engine(_url, **_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
