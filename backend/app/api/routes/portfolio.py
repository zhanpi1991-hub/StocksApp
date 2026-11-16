from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.db.session import get_db
from app.models.models import Portfolio, PortfolioHolding, PortfolioTransaction, User
from app.schemas.schemas import PortfolioIn, TransactionIn, TransactionOut
from app.services.portfolio_calc import replay, tx_key, valuation
from app.services.quotes import safe_quotes

router = APIRouter(prefix="/portfolios", tags=["portfolio"])


def owned(db: Session, user: User, pid: int) -> Portfolio:
    p = db.get(Portfolio, pid)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Portfolio not found")
    return p


def rebuild(db: Session, p: Portfolio) -> None:
    """Recompute materialised holdings from the full transaction log."""
    txs = sorted(p.transactions, key=tx_key)
    book = replay(txs)
    for h in list(p.holdings):
        db.delete(h)
    db.flush()
    for pos in book.values():
        db.add(PortfolioHolding(portfolio_id=p.id, asset_type=pos.asset_type, symbol=pos.symbol, name=pos.name,
                                quantity=pos.quantity, avg_cost=pos.avg_cost, realized_pnl=pos.realized_pnl))


@router.get("")
def list_portfolios(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Portfolio).where(Portfolio.user_id == user.id).order_by(Portfolio.id)).all()
    return [{"id": p.id, "name": p.name, "currency": p.currency} for p in rows]


@router.post("", status_code=201)
def create(body: PortfolioIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Portfolio(user_id=user.id, name=body.name.strip(), currency=body.currency.upper())
    db.add(p)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A portfolio with that name already exists.")
    return {"id": p.id, "name": p.name, "currency": p.currency}


@router.delete("/{pid}", status_code=204)
def delete(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, user, pid))
    db.commit()


@router.post("/{pid}/transactions", response_model=TransactionOut, status_code=201)
def add_tx(pid: int, body: TransactionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, user, pid)
    tx = PortfolioTransaction(portfolio_id=p.id, asset_type=body.asset_type, symbol=body.symbol.strip(), name=body.name, side=body.side,
                              quantity=body.quantity, price=body.price, fee=body.fee, note=body.note,
                              executed_at=body.executed_at or datetime.now(timezone.utc))
    p.transactions.append(tx)
    try:
        rebuild(db, p)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(422, str(exc))
    db.commit()
    return tx


@router.delete("/{pid}/transactions/{tid}", status_code=204)
def delete_tx(pid: int, tid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, user, pid)
    tx = db.get(PortfolioTransaction, tid)
    if not tx or tx.portfolio_id != p.id:
        raise HTTPException(404, "Transaction not found")
    p.transactions.remove(tx)
    try:
        rebuild(db, p)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(422, f"Deleting this transaction would make later sells invalid: {exc}")
    db.commit()


@router.get("/{pid}")
async def detail(pid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = owned(db, user, pid)
    book = replay(sorted(p.transactions, key=tx_key))
    open_pos = [pos for pos in book.values() if pos.quantity > 0]
    quotes = await safe_quotes([(pos.asset_type, pos.symbol) for pos in open_pos])
    holdings, tot_value, tot_cost, unpriced = [], Decimal(0), Decimal(0), 0
    for pos, q in zip(open_pos, quotes):
        price = Decimal(str(q["data"]["price"])) if q["data"] and q["data"].get("price") is not None else None
        v = valuation(pos, price)
        v.update(price_status=q["status"], price_message=q["message"], price_as_of=q["as_of"])
        holdings.append(v)
        tot_cost += pos.quantity * pos.avg_cost
        if price is None:
            unpriced += 1
        else:
            tot_value += pos.quantity * price
    realized = sum((pos.realized_pnl for pos in book.values()), Decimal(0))
    priced_cost = sum((Decimal(h["cost_basis"]) for h in holdings if h["market_value"] is not None), Decimal(0))
    unreal = tot_value - priced_cost
    for h in holdings:
        h["weight_pct"] = str((Decimal(h["market_value"]) / tot_value * 100).quantize(Decimal("0.01"))) if h["market_value"] and tot_value else None
    allocation: dict[str, Decimal] = {}
    for h in holdings:
        if h["market_value"]:
            allocation[h["asset_type"]] = allocation.get(h["asset_type"], Decimal(0)) + Decimal(h["market_value"])
    # cost-basis timeline built from actual transactions (not market history)
    running, timeline = Decimal(0), []
    book2: dict = {}
    for t in sorted(p.transactions, key=tx_key):
        sign = 1 if t.side == "buy" else -1
        key = (t.asset_type, t.symbol)
        book2[key] = book2.get(key, Decimal(0)) + sign * t.quantity
        running += sign * (t.quantity * t.price)
        timeline.append({"time": t.executed_at.isoformat(), "net_invested": str(running)})
    return {
        "id": p.id, "name": p.name, "currency": p.currency,
        "totals": {
            "market_value": str(tot_value), "cost_basis": str(tot_cost), "unrealized_pnl": str(unreal), "realized_pnl": str(realized),
            "total_pnl": str(unreal + realized), "unpriced_holdings": unpriced,
            "note": "Market values use current provider quotes in each instrument's quote currency (no FX conversion applied)." if holdings else None,
        },
        "holdings": holdings,
        "allocation": [{"asset_type": k, "value": str(v), "pct": str((v / tot_value * 100).quantize(Decimal("0.01"))) if tot_value else "0"} for k, v in allocation.items()],
        "timeline": timeline,
        "transactions": [TransactionOut.model_validate(t).model_dump(mode="json") for t in sorted(p.transactions, key=tx_key, reverse=True)],
    }
