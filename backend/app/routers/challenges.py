import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.challenge import Challenge, ChallengeEntry
from ..models.user import User, Position, Order
from ..models.community import CommunityUser
from ..models.market import MarketData
from ..models.company import Company
from .auth import get_current_user, get_optional_user

router = APIRouter(prefix="/api/community/challenges", tags=["challenges"])

AVATAR_URL = "https://ui-avatars.com/api/?name={handle}&background={color}&color=fff&size=96"


def _status_of(c: Challenge, now: datetime | None = None) -> str:
    now = now or datetime.now()
    if c.status == "ended":
        return "ended"
    if c.start_date and now < c.start_date:
        return "upcoming"
    if c.end_date and now > c.end_date:
        return "ended"
    if c.start_date and c.start_date <= now <= (c.end_date or now):
        return "live"
    return c.status  # open | upcoming


def _parse_prizes(c: Challenge) -> list:
    try:
        data = json.loads(c.prizes or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _parse_rules(c: Challenge) -> list:
    try:
        data = json.loads(c.rules or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _parse_winners(c: Challenge) -> list:
    try:
        data = json.loads(c.winners or "[]")
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _latest_prices(db: Session) -> dict[str, float]:
    """Dernier cours par symbole, en 1 requête (DISTINCT ON company_id)."""
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT DISTINCT ON (md.company_id) co.symbol, md.close_price "
        "FROM market_data md JOIN companies co ON co.id = md.company_id "
        "WHERE md.close_price IS NOT NULL "
        "ORDER BY md.company_id, md.date DESC"
    )).all()
    return {r[0]: float(r[1]) for r in rows}


def _community_handle(db: Session, user_id: int) -> tuple[str, str]:
    cu = db.query(CommunityUser).filter(CommunityUser.user_id == user_id).first()
    if cu:
        return cu.handle, cu.avatar_color
    u = db.query(User).filter(User.id == user_id).first()
    name = (u.name or u.email.split("@")[0]) if u else f"user{user_id}"
    return name, "#7266D9"


def _portfolio_value(db: Session, user_id: int, prices: dict[str, float]) -> float:
    positions = db.query(Position).filter(Position.user_id == user_id).all()
    total = 0.0
    for p in positions:
        if p.qty <= 0:
            continue
        px = prices.get(p.symbol)
        total += p.qty * (px if px else (p.avg_price or 0))
    return total


def _sold_cash(db: Session, user_id: int, since: datetime) -> float:
    orders = db.query(Order).filter(
        Order.user_id == user_id,
        Order.side == "sell",
        Order.status == "executed",
    ).all()
    total = 0.0
    for o in orders:
        if o.executed_at and o.executed_at >= since:
            total += o.qty * (o.price or 0)
    return total


def _entry_perf(db: Session, entry: ChallengeEntry, prices: dict[str, float]) -> dict:
    base_snapshot = 0.0
    try:
        snap = json.loads(entry.snapshot or "{}")
        for data in snap.values():
            base_snapshot += (data.get("qty") or 0) * (data.get("avg_price") or 0)
    except Exception:
        snap = {}
    sold = _sold_cash(db, entry.user_id, entry.joined_at)
    value = _portfolio_value(db, entry.user_id, prices) + sold
    base = base_snapshot if base_snapshot > 0 else entry.challenge.starting_capital or 1
    perf = (value - base) / base * 100 if base else 0.0
    return {
        "value": round(value, 2),
        "perf": round(perf, 2),
        "sold_cash": round(sold, 2),
        "base": round(base, 2),
    }


def _challenge_out(db: Session, c: Challenge, current: User | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    status = _status_of(c, now)
    joined = False
    my_entry = None
    if current:
        my_entry = db.query(ChallengeEntry).filter(
            ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == current.id
        ).first()
        joined = my_entry is not None
    return {
        "id": c.id,
        "name": c.name,
        "tagline": c.tagline,
        "description": c.description,
        "status": status,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "prize_pool": c.prize_pool,
        "prizes": _parse_prizes(c),
        "rules": _parse_rules(c),
        "max_participants": c.max_participants,
        "starting_capital": c.starting_capital,
        "participants_count": len(c.entries),
        "is_featured": c.is_featured,
        "joined": joined,
        "winners": _parse_winners(c),
        "my_perf": _entry_perf(db, my_entry, _latest_prices(db))["perf"] if my_entry else None,
    }


@router.get("")
def list_challenges(
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    challenges = db.query(Challenge).order_by(Challenge.is_featured.desc(), Challenge.start_date.desc()).all()
    return {"challenges": [_challenge_out(db, c, user) for c in challenges]}


@router.get("/{challenge_id}/leaderboard")
def leaderboard(
    challenge_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    prices = _latest_prices(db)
    rows = []
    for entry in c.entries:
        handle, color = _community_handle(db, entry.user_id)
        perf = _entry_perf(db, entry, prices)
        rows.append({
            "user_id": entry.user_id,
            "handle": handle,
            "avatar": AVATAR_URL.format(handle=handle.replace(" ", "_"), color=color.lstrip("#")),
            "perf": perf["perf"],
            "value": perf["value"],
            "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
            "is_me": bool(user and user.id == entry.user_id),
        })
    rows.sort(key=lambda r: r["perf"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    return {"challenge_id": c.id, "name": c.name, "leaderboard": rows[:50]}


@router.post("/{challenge_id}/join")
def join_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    status = _status_of(c)
    if status in ("ended", "upcoming"):
        raise HTTPException(status_code=409, detail="Ce défi n'accepte pas d'inscriptions pour le moment")
    existing = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if existing:
        return {"ok": True, "joined": True, "message": "Déjà inscrit"}
    if c.max_participants and len(c.entries) >= c.max_participants:
        raise HTTPException(status_code=409, detail="Défi complet")

    positions = db.query(Position).filter(Position.user_id == user.id).all()
    snapshot = {
        p.symbol: {"qty": p.qty, "avg_price": p.avg_price}
        for p in positions if p.qty and p.qty > 0
    }
    entry = ChallengeEntry(
        challenge_id=c.id,
        user_id=user.id,
        snapshot=json.dumps(snapshot),
    )
    db.add(entry)
    db.commit()
    return {"ok": True, "joined": True, "message": "Inscription confirmée"}


@router.delete("/{challenge_id}/join")
def leave_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    entry = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à ce défi")
    db.delete(entry)
    db.commit()
    return {"ok": True, "joined": False}
