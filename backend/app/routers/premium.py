import json
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, Portfolio, UserPortfolio
from ..models.planning import PremiumPlan, PremiumSnapshot, Notification
from ..schemas.premium import PremiumPlanRequest, RISK_LEVELS, PLAN_TYPES
from ..services.premium import PremiumService
from ..services.premium_tracking import track_plan, coverage_of, _notify
from ..services.rebalancer import rebalance_portfolio
from ..core.security import hash_pin, verify_pin
from ..core.shared_store import store
from ..routers.portfolio import _portfolio_by_id, _default_portfolio
from .auth import get_current_user

router = APIRouter(prefix="/api/premium", tags=["premium"])

EMITTED_FIELDS = [
    "amount", "monthly", "horizon_years", "risk_level", "invested", "cash_buffer",
    "expected_return", "projected_final", "total_contributions", "gain", "gain_pct",
    "schedule", "allocation", "advice", "sell_triggers", "universe",
    "ai_used", "ai_type", "highlights",
]


class LinkPlanRequest(BaseModel):
    account_id: int | None = None
    name: str | None = None
    pin: str | None = None


class PinRequest(BaseModel):
    pin: str = ""
    current_pin: str | None = None


class PinGuardRequest(BaseModel):
    pin: str | None = None


# ---- Protection anti brute-force du code de sécurité (partagée) ----
MAX_PIN_FAILS = 5
PIN_LOCK_SECONDS = 300


def _pin_key(user_id: int) -> str:
    return f"pinfail:{user_id}"


def _pin_entry(user_id: int) -> dict | None:
    raw = store.get(_pin_key(user_id))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        store.delete(_pin_key(user_id))
        return None


def _require_pin(plan: PremiumPlan, pin: str | None) -> None:
    """L'action de gestion d'un plan protégé exige le code de sécurité.
    5 échecs consécutifs bloquent le code 5 minutes."""
    key = _pin_key(plan.user_id)
    entry = _pin_entry(plan.user_id)
    if entry and entry.get("until") and time.time() < entry["until"]:
        raise HTTPException(status_code=423,
                            detail="Code de sécurité bloqué : 5 tentatives échouées. Réessayez dans 5 minutes.")
    if plan.pin_hash:
        if not pin or not verify_pin(pin, plan.pin_hash):
            if entry is None:
                entry = {"fails": 0, "until": None}
            entry["fails"] += 1
            if entry["fails"] >= MAX_PIN_FAILS:
                entry["until"] = time.time() + PIN_LOCK_SECONDS
                entry["fails"] = 0
                store.set(key, json.dumps(entry), ttl=PIN_LOCK_SECONDS)
                raise HTTPException(status_code=423,
                                    detail="Code de sécurité bloqué : 5 tentatives échouées. Réessayez dans 5 minutes.")
            store.set(key, json.dumps(entry), ttl=PIN_LOCK_SECONDS)
            raise HTTPException(status_code=422,
                                detail="Code de sécurité requis pour cette action (6 chiffres)")
    store.delete(key)


def _latest_plan(db: Session, user_id: int, plan_type: str | None = None) -> PremiumPlan | None:
    q = db.query(PremiumPlan).filter(PremiumPlan.user_id == user_id)
    if plan_type:
        q = q.filter(PremiumPlan.plan_type == plan_type)
    return q.order_by(PremiumPlan.id.desc()).first()


def _active_plan(db: Session, user_id: int, plan_type: str | None = None) -> PremiumPlan | None:
    q = db.query(PremiumPlan).filter(PremiumPlan.user_id == user_id, PremiumPlan.status == "active")
    if plan_type:
        q = q.filter(PremiumPlan.plan_type == plan_type)
    return q.order_by(PremiumPlan.id.desc()).first()


def _plan_payload(db: Session, plan: PremiumPlan, service: PremiumService) -> dict:
    """Plan persisté + dernière valorisation + suivi + alignement portefeuille."""
    emitted = {}
    try:
        emitted = json.loads(plan.allocation_snapshot or "{}")
    except Exception:
        emitted = {}
    acc = None
    if plan.managed_portfolio_id:
        acc = db.query(Portfolio).filter(
            Portfolio.id == plan.managed_portfolio_id, Portfolio.id.in_(
                [up.portfolio_id for up in db.query(UserPortfolio)
                 .filter(UserPortfolio.user_id == plan.user_id).all()]
            )
        ).first()
    managed = None
    if acc:
        managed = {
            "id": acc.id,
            "name": acc.name,
            "type": acc.type,
            "balance": round(acc.balance or 0, 2),
        }
    payload = {"id": plan.id, "plan_type": plan.plan_type, "status": plan.status, "issued_at": plan.issued_at,
               "matured_at": plan.matured_at, "cancelled_at": plan.cancelled_at,
               "completed_at": plan.completed_at,
               "start_value": plan.start_value, "last_value": plan.last_value,
               "last_pnl_pct": plan.last_pnl_pct, "last_day_change_pct": plan.last_day_change_pct,
               "last_tracked_at": plan.last_tracked_at,
               "linked_to_portfolio": plan.linked_to_portfolio, "linked_at": plan.linked_at,
               "managed_account": managed, "has_pin": bool(plan.pin_hash),
               "snapshots": [], "coverage": None, "alerts": [], "positions": []}
    for f in EMITTED_FIELDS:
        payload[f] = emitted.get(f)
    if plan.status == "active":
        payload["coverage"] = coverage_of(db, plan)
        payload["positions"] = service.live_positions(plan.user, plan.horizon_years or 5)
        snaps = (db.query(PremiumSnapshot)
                 .filter(PremiumSnapshot.plan_id == plan.id)
                 .order_by(PremiumSnapshot.date.asc())
                 .limit(400).all())
        payload["snapshots"] = [{
            "date": s.date.strftime("%Y-%m-%d"),
            "value": s.value, "invested": s.invested, "pnl_pct": s.pnl_pct,
            "day_change_pct": s.day_change_pct,
        } for s in snaps]
        alerts = (db.query(Notification)
                  .filter(Notification.user_id == plan.user_id,
                          Notification.type.like("plan%"))
                  .order_by(Notification.created_at.desc())
                  .limit(12).all())
        payload["alerts"] = [{
            "type": a.type, "title": a.title, "body": a.body, "link": a.link,
            "created_at": a.created_at.strftime("%Y-%m-%d %H:%M"),
            "read": a.read,
        } for a in alerts]
    return payload


@router.get("/plan")
def get_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # GET sans effet de bord : la valorisation est mise à jour par le job
    # planifié (toutes les 3 h) ou via POST /plan/{id}/track.
    plan = _latest_plan(db, user.id)
    if not plan:
        return {"plan": None}
    return {"plan": _plan_payload(db, plan, PremiumService(db))}


@router.post("/plan")
def emit_plan(req: PremiumPlanRequest, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    if req.risk_level not in RISK_LEVELS:
        raise HTTPException(status_code=422,
                            detail="risk_level doit être conservative, balanced ou growth")
    if req.plan_type not in PLAN_TYPES:
        raise HTTPException(status_code=422,
                            detail="plan_type doit être epargne, retraite, etudes ou succession")
    service = PremiumService(db)
    try:
        built = service.build_plan(user, amount=req.amount, monthly=req.monthly,
                                   horizon_years=req.horizon_years,
                                   risk_level=req.risk_level)
    except ValueError:
        raise HTTPException(status_code=422, detail="no-valuations")

    # Un plan actif du même type ne peut pas être remplacé silencieusement
    previous = _active_plan(db, user.id, req.plan_type)
    inherit_link = False
    inherit_portfolio = None
    inherit_pin = None
    if previous and previous.id:
        inherit_link = previous.linked_to_portfolio
        inherit_portfolio = previous.managed_portfolio_id
        inherit_pin = previous.pin_hash
        previous.status = "cancelled"
        previous.cancelled_at = datetime.now()
        previous.linked_to_portfolio = False
        _notify(db, previous, "plan_replaced", "Plan précédent remplacé",
                "Un nouveau plan patrimonial a été émis : l'ancien est annulé.", None)
    emitted = {f: built.get(f) for f in EMITTED_FIELDS if f in built}
    plan = PremiumPlan(
        user_id=user.id,
        amount=req.amount,
        monthly=req.monthly or 0,
        horizon_years=req.horizon_years,
        risk_level=req.risk_level,
        plan_type=req.plan_type,
        status="active",
        issued_at=datetime.now(),
        matured_at=datetime.now() + timedelta(days=365 * req.horizon_years),
        allocation_snapshot=json.dumps(emitted, ensure_ascii=False, default=str),
        start_value=built.get("amount", req.amount),
        last_value=built.get("amount", req.amount),
        last_pnl_pct=0.0,
        last_tracked_at=datetime.now(),
        linked_to_portfolio=inherit_link,
        linked_at=datetime.now() if inherit_link else None,
        managed_portfolio_id=inherit_portfolio,
        pin_hash=inherit_pin,
    )
    db.add(plan)
    db.flush()
    # Snapshot initial sur le capital total (réserve de liquidité comprise) :
    # la valorisation suivie par track_plan inclut la réserve, sinon le premier
    # day_change_pct afficherait un gain fantôme de ~10-15 %.
    db.add(PremiumSnapshot(
        plan_id=plan.id, date=datetime.now(),
        value=built.get("amount", req.amount), invested=built.get("amount", req.amount),
        pnl_pct=0.0, day_change_pct=None,
    ))
    _notify(db, plan, "plan_issued", "Plan patrimonial émis 🚀",
            f"Votre plan {req.amount:,.0f} FCFA / {req.horizon_years} ans est en vigueur. "
            f"Suivi quotidien activé automatiquement.", None)
    db.commit()
    db.refresh(plan)
    return {"plan": _plan_payload(db, plan, service)}


@router.post("/plan/{plan_id}/cancel")
def cancel_plan(plan_id: int, req: PinGuardRequest, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.status != "active":
        raise HTTPException(status_code=409, detail="Plan déjà inactif")
    # Le code de sécurité protège aussi l'annulation (comme link/unlink/rebalance)
    _require_pin(plan, req.pin)
    plan.status = "cancelled"
    plan.cancelled_at = datetime.now()
    if plan.linked_to_portfolio:
        plan.linked_to_portfolio = False
    plan.managed_portfolio_id = None
    plan.pin_hash = None
    _notify(db, plan, "plan_cancelled", "Plan patrimonial annulé",
            "Votre plan a été annulé explicitement. Vous pouvez en émettre un nouveau à tout moment.",
            None)
    db.commit()
    db.refresh(plan)
    return {"plan": _plan_payload(db, plan, PremiumService(db))}


@router.post("/plan/{plan_id}/link")
def link_plan(plan_id: int, req: LinkPlanRequest, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    """Relie le portefeuille au plan : gestion automatique jusqu'à échéance
    ou annulation manuelle. Un seul plan gère le portefeuille à la fois.

    - account_id : sous-portefeuille géré (défaut : compte par défaut).
    - name : renomme le sous-portefeuille choisi.
    - pin : code de sécurité optionnel (6 chiffres) qui conditionnera les
      actions de gestion (rééquilibrage, déliaison).
    """
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.status != "active":
        raise HTTPException(status_code=409, detail="Seul un plan actif peut gérer le portefeuille")
    _require_pin(plan, req.pin)

    # Un seul gestionnaire : les autres liens actifs sont rompus
    others = db.query(PremiumPlan).filter(
        PremiumPlan.user_id == user.id,
        PremiumPlan.id != plan.id,
        PremiumPlan.linked_to_portfolio.is_(True),
    ).all()
    for o in others:
        o.linked_to_portfolio = False
        o.managed_portfolio_id = None

    account = _portfolio_by_id(db, user.id, req.account_id) if req.account_id else _default_portfolio(db, user.id)
    if not account:
        raise HTTPException(
            status_code=422,
            detail="Créez un compte démo avant de lier le plan à un portefeuille",
        )
    # La gestion automatique n'est possible que sur un portefeuille virtuel (démo)
    if account.type == "real":
        raise HTTPException(
            status_code=422,
            detail="La gestion automatique par le plan patrimonial n'est possible que sur un portefeuille virtuel",
        )
    if req.name and req.name.strip():
        account.name = req.name.strip()

    if req.pin is not None:
        p = req.pin.strip()
        if not p:
            plan.pin_hash = None
        else:
            if not (p.isdigit() and len(p) == 6):
                raise HTTPException(status_code=422,
                                    detail="Le code de sécurité doit contenir exactement 6 chiffres")
            plan.pin_hash = hash_pin(p)

    plan.linked_to_portfolio = True
    plan.linked_at = datetime.now()
    plan.managed_portfolio_id = account.id
    db.commit()
    db.refresh(plan)

    # Mise sous commande immédiate : premier rééquilibrage complet
    rebalance = rebalance_portfolio(db, plan, force=True)
    db.refresh(plan)
    return {
        "plan": _plan_payload(db, plan, PremiumService(db)),
        "rebalance": rebalance,
    }


@router.post("/plan/{plan_id}/unlink")
def unlink_plan(plan_id: int, req: PinGuardRequest, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.status != "active":
        raise HTTPException(status_code=409, detail="Seul un plan actif peut être délié du portefeuille")
    _require_pin(plan, req.pin)
    plan.linked_to_portfolio = False
    plan.managed_portfolio_id = None
    _notify(db, plan, "plan_unlinked", "Gestion automatique désactivée",
            "Votre portefeuille n'est plus géré automatiquement par le plan patrimonial.",
            6)
    db.commit()
    db.refresh(plan)
    return {"ok": True, "plan": {
        "id": plan.id, "status": plan.status,
        "linked_to_portfolio": plan.linked_to_portfolio,
    }}


@router.post("/plan/{plan_id}/rebalance")
def trigger_rebalance(plan_id: int, req: PinGuardRequest, user: User = Depends(get_current_user),
                      db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.status != "active":
        raise HTTPException(status_code=409, detail="Seul un plan actif peut être rééquilibré")
    _require_pin(plan, req.pin)
    result = rebalance_portfolio(db, plan, force=True)
    db.refresh(plan)
    return {
        "plan": _plan_payload(db, plan, PremiumService(db)),
        "rebalance": result,
    }


@router.post("/plan/{plan_id}/pin")
def set_plan_pin(plan_id: int, req: PinRequest, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """Définit, modifie ou retire le code de sécurité du plan (optionnel).
    La modification/le retrait exige le code actuel. Un code vide le retire."""
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.pin_hash:
        if not req.current_pin or not verify_pin(req.current_pin, plan.pin_hash):
            raise HTTPException(status_code=422, detail="Code de sécurité actuel incorrect")
    p = (req.pin or "").strip()
    if p and not (p.isdigit() and len(p) == 6):
        raise HTTPException(status_code=422,
                            detail="Le code de sécurité doit contenir exactement 6 chiffres")
    plan.pin_hash = hash_pin(p) if p else None
    db.commit()
    db.refresh(plan)
    return {"ok": True, "plan": {
        "id": plan.id, "status": plan.status,
        "has_pin": bool(plan.pin_hash),
    }}


@router.post("/plan/{plan_id}/track")
def trigger_track(plan_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    result = track_plan(db, plan)
    db.refresh(plan)
    return {"plan": _plan_payload(db, plan, PremiumService(db)), "track": result}


@router.get("/plans")
def list_plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plans = (db.query(PremiumPlan)
             .filter(PremiumPlan.user_id == user.id)
             .order_by(PremiumPlan.id.desc())
             .limit(50).all())
    service = PremiumService(db)
    return {"plans": [_plan_payload(db, p, service) for p in plans]}


@router.get("/plans-lite")
def list_plans_lite(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Vue légère des plans pour la page portefeuille et le hub patrimoine
    (sans snapshots ni positions). Tous les statuts : le hub affiche les
    cartes « annulé / nouveau » selon l'historique."""
    plans = (db.query(PremiumPlan)
             .filter(PremiumPlan.user_id == user.id)
             .order_by(PremiumPlan.id.desc())
             .limit(50).all())
    out = []
    for p in plans:
        cov = coverage_of(db, p) if p.status == "active" else None
        acc = db.query(Portfolio).filter(
            Portfolio.id == p.managed_portfolio_id,
            Portfolio.id.in_([up.portfolio_id for up in db.query(UserPortfolio)
                              .filter(UserPortfolio.user_id == user.id).all()])
        ).first() if p.managed_portfolio_id else None
        out.append({
            "id": p.id,
            "plan_type": p.plan_type,
            "status": p.status,
            "amount": p.amount,
            "monthly": p.monthly or 0,
            "horizon_years": p.horizon_years,
            "risk_level": p.risk_level,
            "issued_at": p.issued_at,
            "last_value": p.last_value,
            "last_pnl_pct": p.last_pnl_pct,
            "linked_to_portfolio": p.linked_to_portfolio,
            "linked_at": p.linked_at,
            "matured_at": p.matured_at,
            "coverage_pct": (cov or {}).get("coverage_pct"),
            "managed_account_id": p.managed_portfolio_id,
            "managed_account_name": acc.name if acc else None,
            "has_pin": bool(p.pin_hash),
        })
    return {"plans": out}
