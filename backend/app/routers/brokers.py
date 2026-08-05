from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, BrokerAccount
from .auth import get_current_user, BROKERS, BROKERS_BY_COUNTRY

router = APIRouter(prefix="/api/brokers", tags=["brokers"])

ID_TYPES = ("cni", "passeport", "ninea", "npi")


class AccountRequest(BaseModel):
    broker_name: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=30)
    id_type: str
    id_number: str = Field(min_length=3, max_length=60)


def _broker_category(broker_name: str) -> str:
    for cats in BROKERS_BY_COUNTRY.values():
        for category, names in cats.items():
            if broker_name in names:
                return category
    return "SGI"


def _account_out(a: BrokerAccount):
    return {
        "id": a.id,
        "broker_name": a.broker_name,
        "broker_category": a.broker_category,
        "full_name": a.full_name,
        "phone": a.phone,
        "id_type": a.id_type,
        "id_number": a.id_number,
        "status": a.status,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


@router.post("/accounts")
def open_account(req: AccountRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.broker_name not in BROKERS:
        raise HTTPException(status_code=422, detail="Courtier inconnu")
    if req.id_type not in ID_TYPES:
        raise HTTPException(status_code=422, detail="Type de pièce d'identité invalide")

    account = BrokerAccount(
        user_id=user.id,
        broker_name=req.broker_name,
        broker_category=_broker_category(req.broker_name),
        full_name=req.full_name.strip(),
        phone=req.phone.strip(),
        id_type=req.id_type,
        id_number=req.id_number.strip(),
        status="sent",
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return {"ok": True, "account": _account_out(account)}


@router.get("/accounts")
def my_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    accounts = db.query(BrokerAccount).filter(
        BrokerAccount.user_id == user.id
    ).order_by(BrokerAccount.created_at.desc()).all()
    return {"accounts": [_account_out(a) for a in accounts]}
