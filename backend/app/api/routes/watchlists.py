from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.db.session import get_db
from app.models.models import User, Watchlist, WatchlistItem
from app.schemas.schemas import WatchlistIn, WatchlistItemIn, WatchlistOut
from app.services.quotes import safe_quotes

router = APIRouter(prefix="/watchlists", tags=["watchlists"])


def owned(db: Session, user: User, wid: int) -> Watchlist:
    wl = db.get(Watchlist, wid)
    if not wl or wl.user_id != user.id:
        raise HTTPException(404, "Watchlist not found")
    return wl


@router.get("", response_model=list[WatchlistOut])
def list_watchlists(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(Watchlist).where(Watchlist.user_id == user.id).order_by(Watchlist.id)).all()


@router.post("", response_model=WatchlistOut, status_code=201)
def create(body: WatchlistIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    wl = Watchlist(user_id=user.id, name=body.name.strip())
    db.add(wl)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A watchlist with that name already exists.")
    return wl


@router.patch("/{wid}", response_model=WatchlistOut)
def rename(wid: int, body: WatchlistIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    wl = owned(db, user, wid)
    wl.name = body.name.strip()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A watchlist with that name already exists.")
    return wl


@router.delete("/{wid}", status_code=204)
def delete(wid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(owned(db, user, wid))
    db.commit()


@router.post("/{wid}/items", response_model=WatchlistOut, status_code=201)
def add_item(wid: int, body: WatchlistItemIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    wl = owned(db, user, wid)
    db.add(WatchlistItem(watchlist_id=wl.id, asset_type=body.asset_type, symbol=body.symbol, name=body.name))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Instrument already in this watchlist.")
    db.refresh(wl)
    return wl


@router.delete("/{wid}/items/{item_id}", status_code=204)
def remove_item(wid: int, item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    wl = owned(db, user, wid)
    item = db.get(WatchlistItem, item_id)
    if not item or item.watchlist_id != wl.id:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.commit()


@router.get("/{wid}/quotes")
async def quotes(wid: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    wl = owned(db, user, wid)
    items = [(i.asset_type, i.symbol) for i in wl.items]
    rows = await safe_quotes(items)
    return [{"id": i.id, "asset_type": i.asset_type, "name": i.name, **r} for i, r in zip(wl.items, rows)]
