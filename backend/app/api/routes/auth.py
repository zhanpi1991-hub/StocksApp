from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import current_user
from app.core.ratelimit import auth_rate_limit
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.models import User, UserPreference, UserProfile, Watchlist
from app.schemas.schemas import LoginIn, ProfileUpdate, RegisterIn, TokenOut, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def to_out(u: User) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.profile.display_name if u.profile else "",
                   theme=u.preferences.theme if u.preferences else "dark", base_currency=u.preferences.base_currency if u.preferences else "USD")


@router.post("/register", response_model=TokenOut, status_code=201, dependencies=[Depends(auth_rate_limit)])
def register(body: RegisterIn, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    user = User(email=email, password_hash=hash_password(body.password))
    user.profile = UserProfile(display_name=body.display_name.strip() or "User")
    user.preferences = UserPreference()
    db.add(user)
    db.flush()
    db.add(Watchlist(user_id=user.id, name="My Watchlist"))
    db.commit()
    return TokenOut(access_token=create_access_token(user.id), user=to_out(user))


@router.post("/login", response_model=TokenOut, dependencies=[Depends(auth_rate_limit)])
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password.")
    return TokenOut(access_token=create_access_token(user.id), user=to_out(user))


@router.post("/logout", status_code=204)
def logout(_: User = Depends(current_user)):
    """JWTs are stateless; the client discards the token. Endpoint exists for symmetry/audit."""
    return None


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return to_out(user)


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.display_name is not None:
        user.profile.display_name = body.display_name
    if body.theme:
        user.preferences.theme = body.theme
    if body.base_currency:
        user.preferences.base_currency = body.base_currency.upper()
    if body.password:
        if not body.current_password or not verify_password(body.current_password, user.password_hash):
            raise HTTPException(400, "Current password is incorrect.")
        user.password_hash = hash_password(body.password)
    db.commit()
    return to_out(user)
