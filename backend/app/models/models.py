from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    profile: Mapped["UserProfile"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    preferences: Mapped["UserPreference"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")


class UserProfile(Base, TimestampMixin):
    __tablename__ = "user_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    display_name: Mapped[str] = mapped_column(String(80), default="")
    user: Mapped[User] = relationship(back_populates="profile")


class UserPreference(Base, TimestampMixin):
    __tablename__ = "user_preferences"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    theme: Mapped[str] = mapped_column(String(10), default="dark")
    base_currency: Mapped[str] = mapped_column(String(3), default="USD")
    user: Mapped[User] = relationship(back_populates="preferences")


class Watchlist(Base, TimestampMixin):
    __tablename__ = "watchlists"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_watchlist_user_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    items: Mapped[list["WatchlistItem"]] = relationship(back_populates="watchlist", cascade="all, delete-orphan", order_by="WatchlistItem.id")


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("watchlist_id", "asset_type", "symbol", name="uq_watchlist_item"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    watchlist_id: Mapped[int] = mapped_column(ForeignKey("watchlists.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(10))  # stock | crypto | forex
    symbol: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    watchlist: Mapped[Watchlist] = relationship(back_populates="items")


class Portfolio(Base, TimestampMixin):
    __tablename__ = "portfolios"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_portfolio_user_name"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    transactions: Mapped[list["PortfolioTransaction"]] = relationship(back_populates="portfolio", cascade="all, delete-orphan", order_by="PortfolioTransaction.executed_at, PortfolioTransaction.id")
    holdings: Mapped[list["PortfolioHolding"]] = relationship(back_populates="portfolio", cascade="all, delete-orphan")


class PortfolioHolding(Base):
    """Materialised position, recomputed from transactions on every change."""
    __tablename__ = "portfolio_holdings"
    __table_args__ = (UniqueConstraint("portfolio_id", "asset_type", "symbol", name="uq_holding"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(10))
    symbol: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160), default="")
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 10), default=Decimal(0))
    avg_cost: Mapped[Decimal] = mapped_column(Numeric(28, 10), default=Decimal(0))
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 10), default=Decimal(0))
    portfolio: Mapped[Portfolio] = relationship(back_populates="holdings")


class PortfolioTransaction(Base):
    __tablename__ = "portfolio_transactions"
    __table_args__ = (Index("ix_tx_portfolio_symbol", "portfolio_id", "asset_type", "symbol"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(10))
    symbol: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160), default="")
    side: Mapped[str] = mapped_column(String(4))  # buy | sell
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 10))
    price: Mapped[Decimal] = mapped_column(Numeric(28, 10))
    fee: Mapped[Decimal] = mapped_column(Numeric(28, 10), default=Decimal(0))
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    note: Mapped[str] = mapped_column(Text, default="")
    portfolio: Mapped[Portfolio] = relationship(back_populates="transactions")


class PriceAlert(Base, TimestampMixin):
    __tablename__ = "price_alerts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(10))
    symbol: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(160), default="")
    condition: Mapped[str] = mapped_column(String(20))  # above | below | pct_up | pct_down
    threshold: Mapped[Decimal] = mapped_column(Numeric(28, 10))
    reference_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    triggered_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 10), nullable=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(String(255), nullable=True)
