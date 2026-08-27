from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..models.watchlist import WatchlistItem
from ..models.user import User
from .auth import get_current_user

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


@router.get("")
def list_watchlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).order_by(WatchlistItem.created_at.asc()).all()
    return {"symbols": [i.symbol for i in items]}


@router.post("/{symbol}")
def add_watchlist(symbol: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sym = symbol.strip().upper()
    if not sym or len(sym) > 20:
        raise HTTPException(status_code=422, detail="Symbole invalide")
    exists = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id, WatchlistItem.symbol == sym).first()
    if exists:
        return {"ok": True, "symbol": sym, "already": True}
    # limite 100 pour éviter abus
    cnt = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).count()
    if cnt >= 100:
        raise HTTPException(status_code=422, detail="Watchlist pleine (100 max)")
    item = WatchlistItem(user_id=user.id, symbol=sym)
    db.add(item)
    db.commit()
    return {"ok": True, "symbol": sym}


@router.delete("/{symbol}")
def remove_watchlist(symbol: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    sym = symbol.strip().upper()
    item = db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id, WatchlistItem.symbol == sym).first()
    if not item:
        return {"ok": True, "not_found": True}
    db.delete(item)
    db.commit()
    return {"ok": True, "symbol": sym}


@router.put("")
def replace_watchlist(payload: dict, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    symbols = payload.get("symbols", [])
    if not isinstance(symbols, list):
        raise HTTPException(status_code=422, detail="symbols doit être une liste")
    # normaliser, dédupliquer, limiter
    cleaned = []
    seen = set()
    for s in symbols:
        if not isinstance(s, str):
            continue
        sym = s.strip().upper()
        if not sym or len(sym) > 20 or sym in seen:
            continue
        seen.add(sym)
        cleaned.append(sym)
        if len(cleaned) >= 100:
            break
    # remplacer atomiquement : supprimer ceux non désirés, ajouter les nouveaux
    existing = {i.symbol: i for i in db.query(WatchlistItem).filter(WatchlistItem.user_id == user.id).all()}
    to_delete = [v for k, v in existing.items() if k not in seen]
    to_add = [s for s in cleaned if s not in existing]
    for item in to_delete:
        db.delete(item)
    for sym in to_add:
        db.add(WatchlistItem(user_id=user.id, symbol=sym))
    db.commit()
    return {"ok": True, "symbols": cleaned}
