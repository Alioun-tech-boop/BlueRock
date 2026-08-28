"""KYC — dossier de vérification d'identité unique (moteur externe : Didit).

Parcours :
  1. informations personnelles (PUT /profile)
  2. « Vérifier mon identité » → POST /didit/start crée une session chez le
     fournisseur ; l'utilisateur la complète dans un widget embarqué (iframe).
  3. le webhook signé du fournisseur fait évoluer le statut (aucune confiance
     accordée au navigateur).
  4. une fois verified → profil investisseur → dossier prêt pour la SGI.

Le statut KYC et le statut du dossier SGI restent strictement indépendants.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.kyc import UserKyc, KycVerification
from ..models.user import User
from .auth import get_current_user
from ..services.didit_provider import get_kyc_provider
from ..services.kyc_provider import KycProvider, KycSession
from ..services import kyc_flow
from ..services.kyc_flow import (
    KYC_STATUSES, LOCKED, ACTIVE_PROVIDER_STATUSES,
    step1_complete, profile_complete, can_start_verification,
    vendor_data_for, notify_kyc,
)


def _require_kyc_enabled():
    """Interrupteur : le parcours KYC est temporairement indisponible en dev uniquement."""
    if not settings.kyc_effectively_enabled:
        raise HTTPException(
            status_code=503,
            detail="La vérification d'identité (KYC) est indisponible pour le moment.",
        )


router = APIRouter(prefix="/api/kyc", tags=["kyc"],
                   dependencies=[Depends(_require_kyc_enabled)])

# Champs « identité » figés une fois la vérification aboutie (verified) :
# le profil investisseur, lui, reste complétable après la vérification.
IDENTITY_FIELDS = set(kyc_flow.STEP1_FIELDS) | {
    "full_name", "id_type", "id_number", "id_issue_date", "id_expiry_date",
    "nif", "company_name", "company_rc", "company_nif", "address", "city",
}


def _split_full_name(full_name: str) -> tuple[str | None, str | None]:
    """Découpe « nom prénom(s) » legacy → (last_name, first_name)."""
    parts = (full_name or "").strip().split(maxsplit=1)
    if not parts or not parts[0]:
        return None, None
    return parts[0], (parts[1].strip() if len(parts) > 1 else None)


def _verification_out(v: KycVerification | None) -> dict | None:
    if v is None:
        return None
    active = (v.session_status or "") in ACTIVE_PROVIDER_STATUSES
    return {
        "id": v.id,
        "provider": v.provider,
        "provider_session_id": v.provider_session_id,
        "session_status": v.session_status,
        "verification_url": v.verification_url if active else None,
        "created_at": v.created_at.isoformat() if v.created_at else None,
    }


def _kyc_out(k: UserKyc | None, verification: KycVerification | None = None) -> dict:
    if k is None:
        return {"status": kyc_flow.KYC_NOT_STARTED, "ready_for_sgi": False, "verification": None}
    complete, _missing = profile_complete(k)
    first_name, last_name = k.first_name, k.last_name
    if not first_name and not last_name and k.full_name:
        last_name, first_name = _split_full_name(k.full_name)
    return {
        "id": k.id,
        "status": k.status,
        "submitted_at": k.submitted_at.isoformat() if k.submitted_at else None,
        "reviewed_at": k.reviewed_at.isoformat() if k.reviewed_at else None,
        "verified_at": k.verified_at.isoformat() if k.verified_at else None,
        "review_note": k.review_note,
        "ready_for_sgi": k.status == kyc_flow.KYC_VERIFIED and complete,
        "profile_complete": complete,
        "account_type": k.account_type,
        "civility": k.civility, "first_name": first_name, "last_name": last_name,
        "full_name": k.full_name, "gender": k.gender,
        "birth_date": k.birth_date, "birth_place": k.birth_place,
        "nationality": k.nationality, "marital_status": k.marital_status,
        "nif": k.nif, "company_name": k.company_name, "company_rc": k.company_rc,
        "company_nif": k.company_nif,
        "id_type": k.id_type, "id_number": k.id_number,
        "id_issue_date": k.id_issue_date, "id_expiry_date": k.id_expiry_date,
        "address": k.address, "city": k.city, "country": k.country, "phone": k.phone,
        "profession": k.profession, "employer": k.employer,
        "monthly_income": k.monthly_income, "source_of_funds": k.source_of_funds,
        "is_pep": k.is_pep, "tax_residence": k.tax_residence,
        "invest_experience": k.invest_experience, "invest_objectives": k.invest_objectives,
        "invest_knowledge": k.invest_knowledge, "risk_tolerance": k.risk_tolerance,
        "invest_horizon": k.invest_horizon,
        "signature_name": k.signature_name, "consent": k.consent,
        "verification": _verification_out(verification or (k.verifications[-1] if k.verifications else None)),
    }


def _get_or_create_kyc(db: Session, user_id: int) -> UserKyc:
    kyc = db.query(UserKyc).filter(UserKyc.user_id == user_id).first()
    if kyc is None:
        kyc = UserKyc(user_id=user_id)
        db.add(kyc)
        db.flush()
    return kyc


def _latest_verification(db: Session, kyc_id: int) -> KycVerification | None:
    return db.query(KycVerification).filter(KycVerification.kyc_id == kyc_id) \
        .order_by(KycVerification.id.desc()).first()


class KycProfileRequest(BaseModel):
    account_type: str | None = None
    civility: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    full_name: str | None = None  # legacy — découpé si first/last absents
    gender: str | None = None
    birth_date: str | None = None
    birth_place: str | None = None
    nationality: str | None = None
    marital_status: str | None = None
    nif: str | None = None
    company_name: str | None = None
    company_rc: str | None = None
    company_nif: str | None = None
    id_type: str | None = None
    id_number: str | None = None
    id_issue_date: str | None = None
    id_expiry_date: str | None = None
    address: str | None = None
    city: str | None = None
    country: str | None = None
    phone: str | None = None
    profession: str | None = None
    employer: str | None = None
    monthly_income: str | None = None
    source_of_funds: str | None = None
    is_pep: bool | None = None
    tax_residence: str | None = None
    invest_experience: str | None = None
    invest_objectives: str | None = None
    invest_knowledge: str | None = None
    risk_tolerance: str | None = None
    invest_horizon: str | None = None
    signature_name: str | None = None
    consent: bool | None = None


@router.get("/status")
def kyc_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kyc = db.query(UserKyc).filter(UserKyc.user_id == user.id).first()
    verification = _latest_verification(db, kyc.id) if kyc else None
    return _kyc_out(kyc, verification)


@router.put("/profile")
def kyc_profile(req: KycProfileRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    kyc = _get_or_create_kyc(db, user.id)
    data = req.model_dump(exclude_unset=True)
    if kyc.status in LOCKED:
        if kyc.status == kyc_flow.KYC_VERIFIED:
            blocked = [f for f in data if f in IDENTITY_FIELDS]
            if blocked:
                raise HTTPException(
                    status_code=409,
                    detail="Votre identité est vérifiée : ces informations ne peuvent plus être modifiées.",
                )
        else:
            raise HTTPException(status_code=409, detail="Votre dossier est verrouillé (statut définitif).")
    if "consent" in data and not data["consent"]:
        data["consent"] = False
    first_name = data.get("first_name")
    last_name = data.get("last_name")
    if "full_name" in data and not first_name and not last_name:
        last_name, first_name = _split_full_name(data["full_name"])
        data["first_name"] = first_name
        data["last_name"] = last_name
    elif first_name is not None or last_name is not None:
        data["full_name"] = " ".join(
            part for part in (
                data.get("last_name", kyc.last_name),
                data.get("first_name", kyc.first_name),
            ) if part
        ).strip() or None
    for field, value in data.items():
        setattr(kyc, field, value)
    db.commit()
    verification = _latest_verification(db, kyc.id)
    return _kyc_out(kyc, verification)


def _start_session(
    db: Session,
    user: User,
    provider: KycProvider,
    language: str = "fr",
    force: bool = False,
) -> KycSession:
    kyc = _get_or_create_kyc(db, user.id)
    if not force:
        allowed, reason = can_start_verification(kyc)
        if not allowed:
            raise HTTPException(status_code=409, detail=reason)
        complete, missing = step1_complete(kyc)
        if not complete:
            raise HTTPException(
                status_code=422,
                detail=f"Complétez d'abord vos informations personnelles : {', '.join(missing)}",
            )
    try:
        session = provider.create_session(vendor_data_for(user), language)
    except RuntimeError as e:
        logger = __import__("logging").getLogger(__name__)
        logger.error("Didit create_session failed: %s", e)
        raise HTTPException(
            status_code=503,
            detail="La vérification d'identité n'est pas disponible pour le moment. Réessayez dans quelques instants.",
        )
    verification = KycVerification(
        kyc_id=kyc.id,
        user_id=user.id,
        provider=provider.name,
        provider_session_id=session.provider_session_id,
        vendor_data=session.vendor_data,
        session_status="Not Started",
        verification_url=session.verification_url,
    )
    db.add(verification)
    if kyc.status not in (kyc_flow.KYC_DOCUMENT_SUBMITTED, kyc_flow.KYC_VERIFICATION_IN_PROGRESS):
        kyc.status = kyc_flow.KYC_IN_PROGRESS
    db.commit()
    return session


@router.post("/didit/start")
def kyc_didit_start(
    language: str = "fr",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crée (ou réutilise) la session de vérification d'identité chez Didit."""
    provider = get_kyc_provider()
    if not provider.configured:
        raise HTTPException(status_code=503, detail="La vérification d'identité n'est pas disponible pour le moment.")
    kyc = db.query(UserKyc).filter(UserKyc.user_id == user.id).first()
    existing = _latest_verification(db, kyc.id) if kyc else None
    if existing and (existing.session_status or "") in ACTIVE_PROVIDER_STATUSES:
        return {
            "ok": True,
            "reused": True,
            "verification": _verification_out(existing),
            "kyc": _kyc_out(kyc, existing),
        }
    session = _start_session(db, user, provider, language)
    db.refresh(kyc)
    verification = _latest_verification(db, kyc.id)
    return {
        "ok": True,
        "reused": False,
        "verification": _verification_out(verification),
        "kyc": _kyc_out(kyc, verification),
    }


@router.post("/retry")
def kyc_retry(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Relance la vérification après expiration / abandon / erreur."""
    kyc = _get_or_create_kyc(db, user.id)
    if kyc.status not in (kyc_flow.KYC_RETRY_REQUIRED, kyc_flow.KYC_ERROR):
        raise HTTPException(status_code=409, detail="Aucune nouvelle vérification nécessaire.")
    provider = get_kyc_provider()
    if not provider.configured:
        raise HTTPException(status_code=503, detail="La vérification d'identité n'est pas disponible pour le moment.")
    session = _start_session(db, user, provider, force=True)
    verification = _latest_verification(db, kyc.id)
    return {"ok": True, "verification": _verification_out(verification), "kyc": _kyc_out(kyc, verification)}
