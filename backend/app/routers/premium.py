import json
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.planning import PremiumPlan, PremiumSnapshot, Notification
from ..schemas.premium import PremiumPlanRequest, RISK_LEVELS, PLAN_TYPES
from ..services.premium import PremiumService
from ..services.premium_tracking import track_plan, coverage_of, _notify
from .auth import get_current_user

router = APIRouter(prefix="/api/premium", tags=["premium"])

EMITTED_FIELDS = [
    "amount", "monthly", "horizon_years", "risk_level", "invested", "cash_buffer",
    "expected_return", "projected_final", "total_contributions", "gain", "gain_pct",
    "schedule", "allocation", "advice", "sell_triggers", "universe",
    "ai_used", "ai_type", "highlights",
]


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
    payload = {"id": plan.id, "plan_type": plan.plan_type, "status": plan.status, "issued_at": plan.issued_at,
               "matured_at": plan.matured_at, "cancelled_at": plan.cancelled_at,
               "completed_at": plan.completed_at,
               "start_value": plan.start_value, "last_value": plan.last_value,
               "last_pnl_pct": plan.last_pnl_pct, "last_day_change_pct": plan.last_day_change_pct,
               "last_tracked_at": plan.last_tracked_at,
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
    plan = _latest_plan(db, user.id)
    if not plan:
        return {"plan": None}
    if plan.status == "active":
        last = (db.query(PremiumSnapshot)
                .filter(PremiumSnapshot.plan_id == plan.id)
                .order_by(PremiumSnapshot.date.desc()).first())
        if not last or last.date.strftime("%Y-%m-%d") < datetime.now().strftime("%Y-%m-%d"):
            track_plan(db, plan)
            db.refresh(plan)
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
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Un plan actif du même type ne peut pas être remplacé silencieusement
    previous = _active_plan(db, user.id, req.plan_type)
    if previous and previous.id:
        previous.status = "cancelled"
        previous.cancelled_at = datetime.now()
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
        start_value=built.get("invested", 0),
        last_value=built.get("invested", 0),
        last_pnl_pct=0.0,
        last_tracked_at=datetime.now(),
    )
    db.add(plan)
    db.flush()
    db.add(PremiumSnapshot(
        plan_id=plan.id, date=datetime.now(),
        value=built.get("invested", 0), invested=built.get("invested", 0),
        pnl_pct=0.0, day_change_pct=None,
    ))
    _notify(db, plan, "plan_issued", "Plan patrimonial émis 🚀",
            f"Votre plan {req.amount:,.0f} FCFA / {req.horizon_years} ans est en vigueur. "
            f"Suivi quotidien activé automatiquement.", None)
    db.commit()
    db.refresh(plan)
    return {"plan": _plan_payload(db, plan, service)}


@router.post("/plan/{plan_id}/cancel")
def cancel_plan(plan_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(
        PremiumPlan.id == plan_id, PremiumPlan.user_id == user.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan introuvable")
    if plan.status != "active":
        raise HTTPException(status_code=409, detail="Plan déjà inactif")
    plan.status = "cancelled"
    plan.cancelled_at = datetime.now()
    _notify(db, plan, "plan_cancelled", "Plan patrimonial annulé",
            "Votre plan a été annulé explicitement. Vous pouvez en émettre un nouveau à tout moment.",
            None)
    db.commit()
    db.refresh(plan)
    return {"plan": _plan_payload(db, plan, PremiumService(db))}


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
