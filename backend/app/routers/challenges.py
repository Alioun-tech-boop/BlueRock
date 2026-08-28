import json
import logging
import uuid
from datetime import datetime, date, time, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..services.prices import latest_prices as _latest_prices
from ..models.challenge import (
    Challenge, ChallengeEntry, ChallengePortfolio, ChallengePosition,
    ChallengeTrade, ChallengeValueSnapshot,
)
from ..models.user import User, Portfolio, UserPortfolio
from ..models.payment import DepositOrder
from ..models.community import CommunityUser
from ..models.company import Company
from ..services import stripe_http
from .auth import get_current_user, get_optional_user

router = APIRouter(prefix="/api/community/challenges", tags=["challenges"])

logger = logging.getLogger(__name__)

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


def _community_handles(db: Session, user_ids: list[int]) -> dict[int, tuple[str, str, str | None]]:
    """Handle + couleur + photo (avatar data:image) par user_id, en 3 requêtes max (bulk)."""
    if not user_ids:
        return {}
    handles: dict[int, tuple[str, str, str | None]] = {}
    cu_rows = db.query(CommunityUser).filter(CommunityUser.user_id.in_(user_ids)).all()
    cu_ids = [cu.user_id for cu in cu_rows]
    photos: dict[int, str | None] = {}
    if cu_ids:
        for u in db.query(User).filter(User.id.in_(cu_ids)).all():
            photos[u.id] = u.avatar if u.avatar and u.avatar.startswith("data:image/") else None
    for cu in cu_rows:
        handles[cu.user_id] = (cu.handle, cu.avatar_color, photos.get(cu.user_id))
    missing = [uid for uid in user_ids if uid not in handles]
    if missing:
        for u in db.query(User).filter(User.id.in_(missing)).all():
            name = u.name or (u.email or "").split("@")[0] or f"user{u.id}"
            photo = u.avatar if u.avatar and u.avatar.startswith("data:image/") else None
            handles[u.id] = (name, "#7266D9", photo)
    return handles


def _avatar_for(handle: str, color: str, photo: str | None) -> str:
    """Photo uploadée si disponible, sinon avatar généré par défaut."""
    if photo:
        return photo
    return AVATAR_URL.format(handle=handle.replace(" ", "_"), color=(color or "#7266D9").lstrip("#"))


def _cash_account(db: Session, user_id: int) -> Portfolio | None:
    """Compte de référence de l'utilisateur (lié à l'ordre de paiement des
    frais d'inscription ; les frais passent par Stripe, pas par le solde)."""
    return (
        db.query(Portfolio)
        .join(UserPortfolio, UserPortfolio.portfolio_id == Portfolio.id)
        .filter(UserPortfolio.user_id == user_id)
        .order_by(Portfolio.is_default.desc(), Portfolio.id.asc())
        .first()
    )


def _fee_checkout(db: Session, order: DepositOrder, user: User,
                  authorization: str, challenge_id: int) -> str:
    """Crée la session de checkout Stripe des frais d'inscription."""
    if not stripe_http.is_configured():
        raise HTTPException(status_code=503,
                            detail="Le paiement n'est pas configuré (Supabase/Stripe)")
    return_url = f"{settings.FRONTEND_URL}/challenges?pay=return&id={challenge_id}"
    try:
        data = stripe_http.create_checkout(
            {"order_id": order.id, "return_url": return_url},
            user_jwt=(authorization or "").removeprefix("Bearer ").strip(),
        )
    except stripe_http.StripeEdgeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not data.get("url"):
        raise HTTPException(status_code=502,
                            detail="La passerelle de paiement n'a pas retourné d'URL")
    order.meta = {**(order.meta or {}),
                  "session_id": data.get("session_id") or "",
                  "checkout_url": data["url"]}
    return data["url"]


def _entry_perf(db: Session, entry: ChallengeEntry, prices: dict[str, float]) -> dict:
    pf = entry.portfolio
    if pf is not None:
        value = _virtual_value(db, entry, prices)
        base = entry.challenge.starting_capital or 1
        return {
            "value": round(value, 2),
            "perf": round((value - base) / base * 100, 2) if base else 0.0,
            "sold_cash": 0.0,
            "base": round(base, 2),
        }
    base = entry.challenge.starting_capital or 1
    return {
        "value": round(base, 2),
        "perf": 0.0,
        "sold_cash": 0.0,
        "base": round(base, 2),
    }


def _entries_perf_bulk(db: Session, entries: list[ChallengeEntry], prices: dict[str, float]) -> dict[int, dict]:
    """Perf de toutes les entrées en requêtes groupées (évite le N+1 lazy)."""
    if not entries:
        return {}
    result: dict[int, dict] = {}
    virtual = [e for e in entries if e.portfolio is not None]
    legacy = [e for e in entries if e.portfolio is None]

    if virtual:
        pfs = db.query(ChallengePortfolio).filter(
            ChallengePortfolio.entry_id.in_([e.id for e in virtual])
        ).all()
        pf_by_entry = {pf.entry_id: pf for pf in pfs}
        pf_ids = [pf.id for pf in pfs]
        pos_by_pf: dict[int, list] = {}
        if pf_ids:
            for p in db.query(ChallengePosition).filter(ChallengePosition.portfolio_id.in_(pf_ids)).all():
                pos_by_pf.setdefault(p.portfolio_id, []).append(p)
        trades_count_by_pf: dict[int, int] = {}
        if pf_ids:
            from sqlalchemy import func as sqla_func
            for row in db.query(
                ChallengeTrade.portfolio_id, sqla_func.count(ChallengeTrade.id)
            ).filter(ChallengeTrade.portfolio_id.in_(pf_ids)).group_by(ChallengeTrade.portfolio_id).all():
                trades_count_by_pf[row[0]] = row[1]
        for e in virtual:
            pf = pf_by_entry[e.id]
            total = pf.cash or 0.0
            for p in pos_by_pf.get(pf.id, []):
                if p.qty <= 0:
                    continue
                px = prices.get(p.symbol)
                total += p.qty * (px if px else (p.current_price or (p.avg_price or 0)))
            base = e.challenge.starting_capital or 1
            result[e.id] = {
                "value": round(total, 2),
                "perf": round((total - base) / base * 100, 2) if base else 0.0,
                "sold_cash": 0.0,
                "base": round(base, 2),
                "cash": round(pf.cash or 0, 2),
                "trades_count": trades_count_by_pf.get(pf.id, 0),
                "virtual": True,
            }
    for e in legacy:
        perf = _entry_perf(db, e, prices)
        result[e.id] = {**perf, "cash": None, "trades_count": 0, "virtual": False}
    return result


def _virtual_value(db: Session, entry: ChallengeEntry, prices: dict[str, float]) -> float:
    """Valeur du portefeuille virtuel dédié au défi : liquidités + positions au cours."""
    pf = entry.portfolio
    if pf is None:
        return 0.0
    total = pf.cash or 0.0
    for p in pf.positions:
        if p.qty <= 0:
            continue
        px = prices.get(p.symbol)
        total += p.qty * (px if px else (p.current_price or (p.avg_price or 0)))
    return total


def _price_of(db: Session, symbol: str) -> float | None:
    """Cours de référence pour le trading virtuel : même source que la valorisation
    (flux live BRVM, sinon dernière clôture), via le cache partagé latest_prices."""
    from ..services.prices import latest_prices
    return latest_prices(db).get(symbol)


def sync_challenge_portfolios(db: Session) -> dict:
    """Synchronise les portefeuilles de défis actifs avec les valeurs réelles du
    marché : marque chaque position à son dernier cours (live BRVM, sinon clôture)
    et actualise le snapshot de valeur du jour (sparkline). Appelé par le
    scheduler du serveur."""
    from ..services.prices import latest_prices
    from ..models.challenge import Challenge
    try:
        prices = latest_prices(db)
    except Exception as e:
        logger.warning(f"Challenge sync: prices indisponibles ({e})")
        return {"entries": 0, "priced": 0, "snapshots": 0}
    today = datetime.combine(date.today(), time.min)
    entries = (db.query(ChallengeEntry)
               .join(Challenge)
               .filter(Challenge.status.in_(("open", "live")))
               .all())
    priced = 0
    snapshots = 0
    for e in entries:
        pf = e.portfolio
        if pf is None:
            continue
        stale = True
        for p in pf.positions:
            if p.qty <= 0:
                continue
            px = prices.get(p.symbol)
            if px:
                p.current_price = px
                stale = False
        value = _virtual_value(db, e, prices)
        snap = db.query(ChallengeValueSnapshot).filter(
            ChallengeValueSnapshot.entry_id == e.id,
            ChallengeValueSnapshot.day == today,
        ).first()
        if snap:
            snap.value = round(value, 2)
        else:
            db.add(ChallengeValueSnapshot(entry_id=e.id, day=today, value=round(value, 2)))
        snapshots += 1
        if not stale:
            priced += 1
    db.commit()
    if priced:
        logger.info("Challenge sync: %d comptes marqués aux cours du marché, %d snapshots mis à jour",
                    priced, snapshots)
    return {"entries": len(entries), "priced": priced, "snapshots": snapshots}


def _record_snapshot(db: Session, entry: ChallengeEntry, value: float) -> None:
    today = datetime.combine(date.today(), time.min)
    snap = db.query(ChallengeValueSnapshot).filter(
        ChallengeValueSnapshot.entry_id == entry.id,
        ChallengeValueSnapshot.day == today,
    ).first()
    if snap:
        snap.value = round(value, 2)
    else:
        db.add(ChallengeValueSnapshot(entry_id=entry.id, day=today, value=round(value, 2)))
    db.flush()


def _position_out(p: ChallengePosition, prices: dict[str, float]) -> dict:
    px = prices.get(p.symbol)
    live = px if px else (p.current_price or (p.avg_price or 0))
    return {
        "symbol": p.symbol,
        "qty": round(p.qty, 4),
        "avg_price": round(p.avg_price or 0, 2),
        "price": round(live, 2),
        "current_price": round(live, 2),
        "value": round(p.qty * live, 2),
        "pnl": round(p.qty * (live - (p.avg_price or 0)), 2),
        "pnl_pct": round((live - (p.avg_price or 0)) / (p.avg_price or 1) * 100, 2),
    }


def _trade_out(t: ChallengeTrade) -> dict:
    return {
        "id": t.id,
        "symbol": t.symbol,
        "side": t.side,
        "qty": round(t.qty, 4),
        "price": round(t.price, 2),
        "total": round(t.total, 2),
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def _portfolio_out(db: Session, entry: ChallengeEntry, prices: dict[str, float]) -> dict | None:
    pf = entry.portfolio
    if pf is None:
        return None
    positions = [_position_out(p, prices) for p in pf.positions if p.qty > 0]
    invested = sum(p["value"] for p in positions)
    value = (pf.cash or 0) + invested
    base = entry.challenge.starting_capital or 1
    return {
        "cash": round(pf.cash or 0, 2),
        "invested": round(invested, 2),
        "value": round(value, 2),
        "perf": round((value - base) / base * 100, 2) if base else 0.0,
        "base": round(base, 2),
        "positions": positions,
        "trades": [_trade_out(t) for t in pf.trades[-30:][::-1]],
        "trades_count": len(pf.trades),
    }


def _sparkline(db: Session, entry: ChallengeEntry, prices: dict[str, float], limit: int = 30) -> list[dict]:
    snaps = db.query(ChallengeValueSnapshot).filter(
        ChallengeValueSnapshot.entry_id == entry.id
    ).order_by(ChallengeValueSnapshot.day.desc()).limit(limit).all()
    points = [{"day": s.day.date().isoformat(), "value": s.value} for s in reversed(snaps)]
    if not points:
        value = _virtual_value(db, entry, prices)
        points = [{"day": date.today().isoformat(), "value": round(value, 2)}]
    return points


class ChallengeOrderRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=20, pattern=r"^[A-Za-z0-9._\-]+$")
    side: str = Field(..., pattern="^(buy|sell)$")
    qty: float = Field(..., gt=0, le=1_000_000)


def _challenge_out(db: Session, c: Challenge, current: User | None = None, now: datetime | None = None) -> dict:
    now = now or datetime.now()
    status = _status_of(c, now)
    joined = False
    my_entry = None
    if current:
        my_entry = db.query(ChallengeEntry).filter(
            ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == current.id
        ).first()
        joined = my_entry is not None and (my_entry.status or "paid") == "paid"
    registration_open = status != "ended" and (
        c.registration_end is None or now <= c.registration_end
    )
    # Interrupteur : défis à inscription payante temporairement indisponibles.
    registration_available = registration_open and not (
        (c.entry_fee or 0) > 0 and not settings.FEATURE_PAID_CHALLENGES_ENABLED
    )
    # Comptage en 1 requête (et non len(c.entries) qui matérialise tout) :
    # seules les inscriptions payées (effectives) comptent.
    participants_count = (
        db.query(ChallengeEntry.id).filter(
            ChallengeEntry.challenge_id == c.id,
            ChallengeEntry.status == "paid",
        ).count()
    )
    my_perf = None
    if my_entry and joined:
        prices = _latest_prices(db)
        my_perf = _entries_perf_bulk(db, [my_entry], prices)[my_entry.id]["perf"]
    return {
        "id": c.id,
        "name": c.name,
        "tagline": c.tagline,
        "description": c.description,
        "status": status,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "registration_end": c.registration_end.isoformat() if c.registration_end else None,
        "registration_open": registration_open,
        "registration_available": registration_available,
        "entry_fee": c.entry_fee or 0,
        "prize_pool": c.prize_pool,
        "prizes": _parse_prizes(c),
        "rules": _parse_rules(c),
        "max_participants": c.max_participants,
        "starting_capital": c.starting_capital,
        "participants_count": participants_count,
        "is_featured": c.is_featured,
        "joined": joined,
        "payment_pending": bool(my_entry and (my_entry.status or "paid") == "pending"),
        "payment_order_id": (my_entry.order_id
                             if my_entry and (my_entry.status or "paid") == "pending"
                             else None),
        "winners": _parse_winners(c),
        "my_perf": my_perf,
        "virtual": bool(my_entry and my_entry.portfolio is not None),
    }


@router.get("/{challenge_id}")
def challenge_detail(
    challenge_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    return _challenge_out(db, c, user)


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
    entries = [e for e in c.entries if (e.status or "paid") == "paid"]
    perfs = _entries_perf_bulk(db, entries, prices)
    handles = _community_handles(db, [e.user_id for e in entries])
    rows = []
    for entry in entries:
        perf = perfs[entry.id]
        handle, color, photo = handles.get(entry.user_id, (f"user{entry.user_id}", "#7266D9", None))
        rows.append({
            "user_id": entry.user_id,
            "handle": handle,
            "avatar": _avatar_for(handle, color, photo),
            "perf": perf["perf"],
            "value": perf["value"],
            "cash": perf["cash"],
            "trades_count": perf["trades_count"],
            "virtual": perf["virtual"],
            "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
            "is_me": bool(user and user.id == entry.user_id),
        })
    rows.sort(key=lambda r: r["perf"], reverse=True)
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    # Snapshots quotidiens : uniquement pour le top affiché (pas un INSERT
    # par participant à chaque vue du classement).
    for r in rows[:50]:
        e = next((x for x in entries if x.user_id == r["user_id"]), None)
        if e:
            _record_snapshot(db, e, r["value"])
    db.commit()
    return {"challenge_id": c.id, "name": c.name, "leaderboard": rows[:50]}


@router.post("/{challenge_id}/join")
def join_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
    authorization: str = Header(default=""),
):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 inscriptions/désinscriptions / min / IP
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    fee = c.entry_fee or 0
    if fee > 0 and not settings.FEATURE_PAID_CHALLENGES_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="Les défis à inscription payante sont indisponibles pour le moment.",
        )
    status = _status_of(c)
    if status == "ended":
        raise HTTPException(status_code=409, detail="Ce défi est terminé")
    if status == "upcoming" and not (
        c.registration_end and datetime.now() <= c.registration_end
    ):
        raise HTTPException(status_code=409, detail="Ce défi n'accepte pas d'inscriptions pour le moment")
    existing = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if existing:
        if (existing.status or "paid") == "paid":
            return {"ok": True, "joined": True, "message": "Déjà inscrit"}
        # Inscription en attente de paiement : on renvoie une nouvelle
        # session de checkout sur l'ordre existant (jamais de double entrée).
        order = db.query(DepositOrder).filter(DepositOrder.id == existing.order_id).first()
        if order is None:
            db.delete(existing)
            db.commit()
        else:
            url = _fee_checkout(db, order, user, authorization, challenge_id=c.id)
            db.commit()
            return {"ok": True, "joined": False, "requires_payment": True,
                    "payment_url": url, "order_id": order.id,
                    "message": "Paiement requis avant l'inscription effective"}
    if c.max_participants and db.query(ChallengeEntry.id).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.status == "paid"
    ).count() >= c.max_participants:
        raise HTTPException(status_code=409, detail="Défi complet")

    fee = c.entry_fee or 0
    if fee <= 0:
        entry = ChallengeEntry(
            challenge_id=c.id,
            user_id=user.id,
            status="paid",
        )
        db.add(entry)
        db.flush()
        portfolio = ChallengePortfolio(entry_id=entry.id, cash=c.starting_capital or 0)
        db.add(portfolio)
        db.commit()
        return {"ok": True, "joined": True, "message": "Inscription confirmée"}

    # Défi payant : le paiement (Stripe) DOIT être confirmé avant que
    # l'inscription ne devienne effective. Aucun portefeuille n'est créé
    # tant que le webhook n'a pas marqué l'entrée "paid".
    acc = _cash_account(db, user.id)
    if acc is None:
        raise HTTPException(status_code=402,
                            detail="Créez d'abord un portefeuille pour participer à ce défi")
    txn = f"DF{uuid.uuid4().hex[:20]}".upper()
    order = DepositOrder(
        user_id=user.id,
        portfolio_id=acc.id,
        amount=fee,
        currency="XOF",
        provider="stripe",
        provider_transaction_id=txn,
        purpose="challenge_fee",
        meta={"purpose": "challenge_fee", "challenge_id": c.id},
        status="pending",
    )
    db.add(order)
    db.flush()
    entry = ChallengeEntry(
        challenge_id=c.id,
        user_id=user.id,
        status="pending",
        order_id=order.id,
    )
    db.add(entry)
    db.flush()
    order.meta = {**(order.meta or {}), "challenge_entry_id": entry.id}
    try:
        url = _fee_checkout(db, order, user, authorization, challenge_id=c.id)
    except HTTPException:
        db.rollback()
        raise
    db.commit()
    logger.info("Défi %s : inscription en attente de paiement (user=%s order=%s)",
                c.id, user.id, order.id)
    return {"ok": True, "joined": False, "requires_payment": True,
            "payment_url": url, "order_id": order.id,
            "message": "Paiement requis avant l'inscription effective"}


@router.delete("/{challenge_id}/join")
def leave_challenge(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 inscriptions/désinscriptions / min / IP
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    entry = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à ce défi")

    fee = c.entry_fee or 0
    if (entry.status or "paid") == "pending":
        # Jamais payé : on purge l'ordre de paiement en attente.
        if entry.order_id:
            pending = db.query(DepositOrder).filter(
                DepositOrder.id == entry.order_id,
                DepositOrder.status == "pending",
            ).first()
            if pending:
                db.delete(pending)
    elif fee > 0 and entry.order_id:
        # Inscription payée : remboursement Stripe avant suppression.
        try:
            stripe_http.refund_order(entry.order_id)
        except stripe_http.StripeEdgeError as e:
            raise HTTPException(status_code=502,
                                detail=f"Le remboursement a échoué : {str(e)[:160]}")
        db.query(DepositOrder).filter(
            DepositOrder.id == entry.order_id
        ).update({"status": "refunded"})
        logger.info("Défi %s : frais remboursés (user=%s order=%s)",
                    c.id, user.id, entry.order_id)

    db.query(ChallengeValueSnapshot).filter(ChallengeValueSnapshot.entry_id == entry.id).delete()
    if entry.portfolio:
        db.query(ChallengeTrade).filter(
            ChallengeTrade.portfolio_id == entry.portfolio.id).delete()
        db.query(ChallengePosition).filter(
            ChallengePosition.portfolio_id == entry.portfolio.id).delete()
        db.delete(entry.portfolio)
    db.flush()
    db.delete(entry)
    db.commit()
    return {"ok": True, "joined": False}


@router.get("/{challenge_id}/portfolio")
def my_challenge_portfolio(
    challenge_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    status = _status_of(c)
    if status == "upcoming":
        raise HTTPException(status_code=409, detail="Le défi n'a pas encore ouvert : le portefeuille sera disponible à la date de début")
    entry = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à ce défi")
    if (entry.status or "paid") != "paid":
        raise HTTPException(status_code=409,
                            detail="Votre inscription attend la confirmation du paiement")
    prices = _latest_prices(db)
    out = _portfolio_out(db, entry, prices) or {}
    _record_snapshot(db, entry, out.get("value", 0))
    db.commit()
    return {
        "challenge_id": c.id,
        "name": c.name,
        "starting_capital": c.starting_capital,
        "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
        "sparkline": _sparkline(db, entry, prices),
        **out,
    }


@router.post("/{challenge_id}/portfolio/orders")
def place_challenge_order(
    challenge_id: int,
    req: ChallengeOrderRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=30, window_seconds=60)  # 30 ordres / min / IP
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    status = _status_of(c)
    if status == "ended":
        raise HTTPException(status_code=409, detail="Le défi est terminé")
    if status == "upcoming":
        raise HTTPException(status_code=409, detail="Le défi n'a pas encore ouvert : trading indisponible avant le début")
    if status not in ("open", "live"):
        raise HTTPException(status_code=409, detail="Le défi n'est pas ouvert au trading")
    entry = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == user.id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Vous n'êtes pas inscrit à ce défi")
    if (entry.status or "paid") != "paid":
        raise HTTPException(status_code=409,
                            detail="Votre inscription attend la confirmation du paiement")
    if entry.portfolio is None:
        entry.portfolio = ChallengePortfolio(entry_id=entry.id, cash=c.starting_capital or 0)
        db.flush()
    pf = entry.portfolio

    company = db.query(Company).filter(Company.symbol == req.symbol.upper()).first()
    if not company:
        raise HTTPException(status_code=404, detail="Symbole inconnu")
    px = _price_of(db, req.symbol.upper())
    if not px or px <= 0:
        raise HTTPException(status_code=409, detail="Cours indisponible pour ce titre")
    qty = req.qty
    total = round(qty * px, 2)
    side = req.side

    if side == "buy":
        from ..services.kyc_flow import kyc_verified
        # KYC required for challenges (cannot be disabled in production)
        if settings.kyc_effectively_enabled and not kyc_verified(db, user.id):
            raise HTTPException(
                status_code=403,
                detail="Votre identité n'est pas encore vérifiée. Terminez la vérification KYC "
                       "(page Vérification) avant d'acheter des titres."
            )
        if (pf.cash or 0) < total - 1e-9:
            raise HTTPException(status_code=409, detail="Liquidités insuffisantes dans le portefeuille du défi")
    else:
        pos = db.query(ChallengePosition).filter(
            ChallengePosition.portfolio_id == pf.id, ChallengePosition.symbol == req.symbol.upper()
        ).first()
        if not pos or pos.qty < qty - 1e-9:
            raise HTTPException(status_code=409, detail="Quantité insuffisante en portefeuille")

    pos = db.query(ChallengePosition).filter(
        ChallengePosition.portfolio_id == pf.id, ChallengePosition.symbol == req.symbol.upper()
    ).first()
    if side == "buy":
        if not pos:
            pos = ChallengePosition(portfolio_id=pf.id, symbol=req.symbol.upper(), qty=0, avg_price=0)
            db.add(pos)
        new_qty = pos.qty + qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * qty)) / new_qty
        pos.qty = new_qty
        pf.cash = (pf.cash or 0) - total
    else:
        remaining = pos.qty - qty
        if remaining <= 1e-9:
            db.delete(pos)
        else:
            pos.qty = remaining
        pf.cash = (pf.cash or 0) + total

    trade = ChallengeTrade(portfolio_id=pf.id, symbol=req.symbol.upper(), side=side,
                           qty=round(qty, 4), price=round(px, 2), total=total)
    db.add(trade)
    db.flush()

    prices = _latest_prices(db)
    out = _portfolio_out(db, entry, prices) or {}
    _record_snapshot(db, entry, out.get("value", 0))
    db.commit()
    return {
        "ok": True,
        "trade": _trade_out(trade),
        "price": round(px, 2),
        "portfolio": out,
        "sparkline": _sparkline(db, entry, prices),
    }


@router.get("/{challenge_id}/users/{target_user_id}")
def challenge_user_profile(
    challenge_id: int,
    target_user_id: int,
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    c = db.query(Challenge).filter(Challenge.id == challenge_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    entry = db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == c.id, ChallengeEntry.user_id == target_user_id
    ).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ce participant n'est pas inscrit au défi")
    prices = _latest_prices(db)
    handle, color, photo = _community_handles(db, [target_user_id])[target_user_id]
    perf = _entry_perf(db, entry, prices)
    _record_snapshot(db, entry, perf["value"])
    db.commit()

    pf_out = _portfolio_out(db, entry, prices) or {}
    rank = None
    entries = list(c.entries)
    perfs = _entries_perf_bulk(db, entries, prices)
    ranked = sorted(
        ((perfs[eid]["perf"], eid) for eid in perfs),
        key=lambda x: x[0], reverse=True,
    )
    for i, (_, eid) in enumerate(ranked):
        if eid == entry.id:
            rank = i + 1
            break
    return {
        "user_id": target_user_id,
        "handle": handle,
        "avatar": _avatar_for(handle, color, photo),
        "joined_at": entry.joined_at.isoformat() if entry.joined_at else None,
        "rank": rank,
        "is_me": bool(user and user.id == target_user_id),
        "perf": perf,
        "sparkline": _sparkline(db, entry, prices),
        **pf_out,
    }
