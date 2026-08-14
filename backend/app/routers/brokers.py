from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, BrokerAccount
from ..models.kyc import UserKyc
from ..models.planning import Notification
from ..config import settings
from ..core.security import require_admin
from .auth import get_current_user, BROKERS, BROKERS_BY_COUNTRY

router = APIRouter(prefix="/api/brokers", tags=["brokers"])

ID_TYPES = ("cni", "passeport", "ninea", "npi")

# Cycle de vie du dossier SGI :
#   transmitted → under_review | info_requested | refused
#   approved → account_opening → account_open
DossierStatus = (
    "transmitted", "under_review", "info_requested", "approved",
    "account_opening", "account_open", "refused",
)


class AccountRequest(BaseModel):
    broker_name: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(min_length=6, max_length=30)
    id_type: str
    id_number: str = Field(min_length=3, max_length=60)

    @field_validator("id_type")
    @classmethod
    def _check_id_type(cls, v: str) -> str:
        v = v.strip().lower()
        if v not in ID_TYPES:
            raise ValueError(f"id_type invalide : attendu l'un de {', '.join(ID_TYPES)}")
        return v

    @field_validator("phone")
    @classmethod
    def _check_phone(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 6 or len(v) > 30:
            raise ValueError("numéro de téléphone invalide (6 à 30 caractères)")
        if not all(c.isdigit() or c in " +().-" for c in v):
            raise ValueError("numéro de téléphone invalide : caractères non autorisés")
        digits = "".join(c for c in v if c.isdigit())
        if not 6 <= len(digits) <= 15:
            raise ValueError("numéro de téléphone invalide (6 à 15 chiffres)")
        return v


class ReviewRequest(BaseModel):
    decision: str  # approved | info_requested | refused
    note: str | None = None


class RespondRequest(BaseModel):
    response: str = Field(min_length=3, max_length=2000)


class ProgressRequest(BaseModel):
    stage: str  # account_opening | account_open


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
        "kyc_id": a.kyc_id,
        "status": a.status,
        "sgi_note": a.sgi_note,
        "user_response": a.user_response,
        "transmitted_at": a.transmitted_at.isoformat() if a.transmitted_at else None,
        "reviewed_at": a.reviewed_at.isoformat() if a.reviewed_at else None,
        "account_opened_at": a.account_opened_at.isoformat() if a.account_opened_at else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _notify(db: Session, user_id: int, title: str, body: str, link: str | None = None):
    db.add(Notification(user_id=user_id, type="system", title=title, body=body, link=link))


def _get_own_account(db: Session, user: User, account_id: int) -> BrokerAccount:
    a = db.query(BrokerAccount).filter(BrokerAccount.id == account_id).first()
    if not a or a.user_id != user.id:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    return a


@router.post("/accounts")
def open_account(req: AccountRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Transmission du dossier KYC vérifié + profil investisseur complet à la SGI choisie."""
    if not settings.FEATURE_BROKER_ACCOUNTS_ENABLED:
        raise HTTPException(
            status_code=503,
            detail="L'ouverture de compte-titre réel est indisponible pour le moment.",
        )
    kyc = db.query(UserKyc).filter(UserKyc.user_id == user.id).first()
    ready = kyc is not None and kyc.status == "verified"
    profile_ok = True
    if ready:
        from ..services.kyc_flow import profile_complete
        profile_ok, missing = profile_complete(kyc)
        if not profile_ok:
            ready = False
    if not ready:
        raise HTTPException(
            status_code=409,
            detail="Votre identité doit être vérifiée et votre profil investisseur complété "
                   "avant de transmettre votre dossier à une SGI. Complétez la page Vérification (KYC)."
        )
    account = BrokerAccount(
        user_id=user.id,
        broker_name=req.broker_name,
        broker_category=_broker_category(req.broker_name),
        full_name=req.full_name,
        phone=req.phone,
        id_type=req.id_type,
        id_number=req.id_number,
        kyc_id=kyc.id,
        status="transmitted",
        transmitted_at=datetime.utcnow(),
    )
    db.add(account)
    db.commit()
    return {"ok": True, "account": _account_out(account)}


@router.get("/accounts")
def my_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    accounts = db.query(BrokerAccount).filter(
        BrokerAccount.user_id == user.id
    ).order_by(BrokerAccount.created_at.desc()).all()
    return {"accounts": [_account_out(a) for a in accounts]}


@router.post("/{account_id}/review")
def review_dossier(
    account_id: int,
    req: ReviewRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Examen SGI du dossier : approved | info_requested | refused."""
    a = db.query(BrokerAccount).filter(BrokerAccount.id == account_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if req.decision not in ("approved", "info_requested", "refused"):
        raise HTTPException(status_code=422, detail="Décision invalide")
    if a.status not in ("transmitted", "under_review", "info_requested"):
        raise HTTPException(status_code=409, detail="Ce dossier n'est pas en attente d'examen")
    a.status = req.decision
    a.sgi_note = req.note
    a.reviewed_at = datetime.utcnow()
    db.commit()
    _notify(db, a.user_id, "Dossier SGI mis à jour",
            f"Votre dossier chez {a.broker_name} : {req.decision.replace('_', ' ')}."
            + (f" — {req.note}" if req.note else ""), link="/compte-titre")
    db.commit()
    return {"ok": True, "account": _account_out(a)}


@router.post("/{account_id}/respond")
def respond_dossier(
    account_id: int,
    req: RespondRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """L'utilisateur fournit les informations supplémentaires demandées par la SGI."""
    a = _get_own_account(db, user, account_id)
    if a.status != "info_requested":
        raise HTTPException(status_code=409, detail="Aucune information supplémentaire demandée")
    a.user_response = req.response
    a.status = "under_review"
    a.reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "account": _account_out(a)}


@router.post("/{account_id}/progress")
def progress_dossier(
    account_id: int,
    req: ProgressRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Progression après approbation : approved → account_opening → account_open."""
    a = db.query(BrokerAccount).filter(BrokerAccount.id == account_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if req.stage == "account_opening":
        if a.status != "approved":
            raise HTTPException(status_code=409, detail="Le dossier doit d'abord être approuvé")
        a.status = "account_opening"
    elif req.stage == "account_open":
        if a.status != "account_opening":
            raise HTTPException(status_code=409, detail="L'ouverture doit d'abord être engagée")
        a.status = "account_open"
        a.account_opened_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=422, detail="Étape invalide")
    db.commit()
    _notify(db, a.user_id, "Compte-titres",
            f"Compte chez {a.broker_name} : "
            + ("ouverture en cours" if a.status == "account_opening" else "compte ouvert et activé."),
            link="/compte-titre")
    db.commit()
    return {"ok": True, "account": _account_out(a)}
