"""Virtual portfolio accounting using Decimal and the average-cost method.

Buy fees are capitalised into cost basis; sell fees reduce realised P/L.
This is a tracking tool only; no orders are ever executed."""
from dataclasses import dataclass
from decimal import Decimal

ZERO = Decimal(0)


@dataclass
class Position:
    asset_type: str
    symbol: str
    name: str = ""
    quantity: Decimal = ZERO
    avg_cost: Decimal = ZERO
    realized_pnl: Decimal = ZERO


def replay(transactions) -> dict[tuple[str, str], Position]:
    """transactions: iterable of objects with asset_type, symbol, name, side, quantity, price, fee (chronological)."""
    book: dict[tuple[str, str], Position] = {}
    for t in transactions:
        key = (t.asset_type, t.symbol)
        pos = book.setdefault(key, Position(t.asset_type, t.symbol, t.name or ""))
        if t.name:
            pos.name = t.name
        q, p, fee = Decimal(t.quantity), Decimal(t.price), Decimal(t.fee or 0)
        if t.side == "buy":
            cost = pos.quantity * pos.avg_cost + q * p + fee
            pos.quantity += q
            pos.avg_cost = cost / pos.quantity
        else:
            if q > pos.quantity:
                raise ValueError(f"Cannot sell {q} {t.symbol}: only {pos.quantity} held at that point in time.")
            pos.realized_pnl += q * (p - pos.avg_cost) - fee
            pos.quantity -= q
            if pos.quantity == 0:
                pos.avg_cost = ZERO
    return book


def valuation(pos: Position, price: Decimal | None) -> dict:
    cost_basis = pos.quantity * pos.avg_cost
    value = pos.quantity * price if price is not None else None
    unreal = value - cost_basis if value is not None else None
    return {
        "asset_type": pos.asset_type, "symbol": pos.symbol, "name": pos.name,
        "quantity": str(pos.quantity), "avg_cost": str(pos.avg_cost), "cost_basis": str(cost_basis),
        "price": str(price) if price is not None else None,
        "market_value": str(value) if value is not None else None,
        "unrealized_pnl": str(unreal) if unreal is not None else None,
        "unrealized_pnl_pct": str((unreal / cost_basis * 100).quantize(Decimal("0.0001"))) if unreal is not None and cost_basis else None,
        "realized_pnl": str(pos.realized_pnl),
    }


def tx_key(t):
    """Chronological sort key tolerant of naive datetimes (SQLite) and aware ones (Postgres)."""
    from datetime import timezone

    dt = t.executed_at
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return (dt, t.id or 0)
