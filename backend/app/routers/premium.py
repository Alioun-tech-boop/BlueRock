from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User
from ..models.premium import PremiumPlan
from ..schemas.premium import PremiumPlanRequest, RISK_LEVELS
from ..services.premium import PremiumService
from .auth import get_current_user

router = APIRouter(prefix="/api/premium", tags=["premium"])


def _build(user: User, db: Session, plan: PremiumPlan) -> dict:
    try:
        service = PremiumService(db)
        return service.build_plan(
            user,
            amount=plan.amount,
            monthly=plan.monthly or 0,
            horizon_years=plan.horizon_years,
            risk_level=plan.risk_level,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/plan")
def get_plan(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = db.query(PremiumPlan).filter(PremiumPlan.user_id == user.id).first()
    if not plan:
        return {"plan": None}
    return {"plan": _build(user, db, plan)}


@router.post("/plan")
def save_plan(req: PremiumPlanRequest, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    if req.risk_level not in RISK_LEVELS:
        raise HTTPException(status_code=422, detail="risk_level doit être conservative, balanced ou growth")
    plan = db.query(PremiumPlan).filter(PremiumPlan.user_id == user.id).first()
    if not plan:
        plan = PremiumPlan(user_id=user.id)
        db.add(plan)
    plan.amount = req.amount
    plan.monthly = req.monthly
    plan.horizon_years = req.horizon_years
    plan.risk_level = req.risk_level
    db.commit()
    db.refresh(plan)
    return {"plan": _build(user, db, plan)}
