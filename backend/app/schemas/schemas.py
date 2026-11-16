from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

AssetType = Literal["stock", "crypto", "forex"]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(default="", max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str = ""
    theme: str = "dark"
    base_currency: str = "USD"


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=80)
    theme: Literal["dark", "light"] | None = None
    base_currency: str | None = Field(default=None, min_length=3, max_length=3)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    current_password: str | None = None


class WatchlistIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class WatchlistItemIn(BaseModel):
    asset_type: AssetType
    symbol: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=160)

    @field_validator("symbol")
    @classmethod
    def norm(cls, v: str) -> str:
        return v.strip().upper() if "/" in v else v.strip()


class WatchlistItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_type: str
    symbol: str
    name: str


class WatchlistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    items: list[WatchlistItemOut] = []


class PortfolioIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    currency: str = Field(default="USD", min_length=3, max_length=3)


class TransactionIn(BaseModel):
    asset_type: AssetType
    symbol: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=160)
    side: Literal["buy", "sell"]
    quantity: Decimal = Field(gt=0, max_digits=28, decimal_places=10)
    price: Decimal = Field(ge=0, max_digits=28, decimal_places=10)
    fee: Decimal = Field(default=Decimal(0), ge=0, max_digits=28, decimal_places=10)
    executed_at: datetime | None = None
    note: str = Field(default="", max_length=500)


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_type: str
    symbol: str
    name: str
    side: str
    quantity: Decimal
    price: Decimal
    fee: Decimal
    executed_at: datetime
    note: str


class AlertIn(BaseModel):
    asset_type: AssetType
    symbol: str = Field(min_length=1, max_length=40)
    name: str = Field(default="", max_length=160)
    condition: Literal["above", "below", "pct_up", "pct_down"]
    threshold: Decimal = Field(gt=0, max_digits=28, decimal_places=10)


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    asset_type: str
    symbol: str
    name: str
    condition: str
    threshold: Decimal
    reference_price: Decimal | None
    active: bool
    triggered_at: datetime | None
    triggered_price: Decimal | None
    last_checked_at: datetime | None
    last_error: str | None
    created_at: datetime
