from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.db.session import get_db
from app.models.models import PriceAlert, User
from app.schemas.schemas import AlertIn, AlertOut
from app.services.quotes import safe_quote

router = APIRouter(prefix="/alerts", tags=["alerts"])

DELIVERY_NOTE = "Alerts are evaluated server-side and shown in the app. No email/push delivery channel is configured."


@router.get("")
def list_alerts(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(PriceAlert.id.desc())).all()
    return {"delivery": DELIVERY_NOTE, "items": [AlertOut.model_validate(r) for r in rows]}


@router.post("", response_model=AlertOut, status_code=201)
async def create(body: AlertIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ref = None
    if body.condition in ("pct_up", "pct_down"):
        q = await safe_quote(body.asset_type, body.symbol)
        if not q["data"] or q["data"].get("price") is None:
            raise HTTPException(422, f"Cannot set a percentage alert: current price unavailable ({q['message']}).")
        ref = Decimal(str(q["data"]["price"]))
    alert = PriceAlert(user_id=user.id, asset_type=body.asset_type, symbol=body.symbol, name=body.name,
                       condition=body.condition, threshold=body.threshold, reference_price=ref)
    db.add(alert)
    db.commit()
    return alert


@router.post("/{aid}/reactivate", response_model=AlertOut)
def reactivate(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(PriceAlert, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    a.active, a.triggered_at, a.triggered_price, a.reference_price = True, None, None, None
    db.commit()
    return a


@router.delete("/{aid}", status_code=204)
def delete(aid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    a = db.get(PriceAlert, aid)
    if not a or a.user_id != user.id:
        raise HTTPException(404, "Alert not found")
    db.delete(a)
    db.commit()

