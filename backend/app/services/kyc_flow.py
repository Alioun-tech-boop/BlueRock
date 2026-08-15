"""Logique métier du parcours KYC — indépendante du fournisseur.

Le statut KYC n'évolue qu'à partir d'événements fiables (webhooks signés) :
cette couche applique les événements normalisés et calcule l'état du dossier
(complétude du profil, prêt pour la SGI).
"""

import json
import logging
import re

from sqlalchemy.orm import Session

from ..models.kyc import UserKyc, KycVerification
from ..models.user import User
from ..models.planning import Notification

logger = logging.getLogger(__name__)

# Statuts KYC BlueRock (spec §3)
KYC_NOT_STARTED = "not_started"
KYC_IN_PROGRESS = "in_progress"
KYC_DOCUMENT_SUBMITTED = "document_submitted"
KYC_VERIFICATION_IN_PROGRESS = "verification_in_progress"
KYC_VERIFIED = "verified"
KYC_REVIEW_REQUIRED = "review_required"
KYC_REJECTED = "rejected"
KYC_RETRY_REQUIRED = "retry_required"
KYC_ERROR = "error"

KYC_STATUSES = [
    KYC_NOT_STARTED, KYC_IN_PROGRESS, KYC_DOCUMENT_SUBMITTED,
    KYC_VERIFICATION_IN_PROGRESS, KYC_VERIFIED, KYC_REVIEW_REQUIRED,
    KYC_REJECTED, KYC_RETRY_REQUIRED, KYC_ERROR,
]

# Statuts depuis lesquels une nouvelle session de vérification peut démarrer.
RESTARTABLE = {KYC_NOT_STARTED, KYC_IN_PROGRESS, KYC_DOCUMENT_SUBMITTED,
               KYC_VERIFICATION_IN_PROGRESS, KYC_RETRY_REQUIRED, KYC_ERROR}
# Statuts verrouillés (l'utilisateur ne peut plus rien relancer).
LOCKED = {KYC_VERIFIED, KYC_REVIEW_REQUIRED, KYC_REJECTED}

# Statuts fournisseur (exacts, case-sensitive) → statuts BlueRock.
DIDIT_STATUS_MAP = {
    "Not Started": KYC_IN_PROGRESS,
    "In Progress": KYC_DOCUMENT_SUBMITTED,
    "Awaiting User": KYC_IN_PROGRESS,
    "Resubmitted": KYC_VERIFICATION_IN_PROGRESS,
    "Approved": KYC_VERIFIED,
    "Declined": KYC_REJECTED,
    "In Review": KYC_REVIEW_REQUIRED,
    "Expired": KYC_RETRY_REQUIRED,
    "Abandoned": KYC_RETRY_REQUIRED,
    "Kyc Expired": KYC_RETRY_REQUIRED,
}

FINAL_BLUEROCK = {KYC_VERIFIED, KYC_REJECTED, KYC_REVIEW_REQUIRED, KYC_RETRY_REQUIRED}

# Champs obligatoires étape 1 (informations personnelles) avant de pouvoir
# lancer la vérification d'identité chez le fournisseur.
STEP1_FIELDS = [
    "account_type", "civility", "first_name", "last_name", "gender",
    "birth_date", "birth_place", "nationality", "marital_status", "country", "phone",
]

# Champs obligatoires du profil investisseur (spec §8) — remplis après vérification.
INVESTOR_FIELDS = [
    "profession", "employer", "monthly_income", "source_of_funds",
    "tax_residence", "signature_name",
    "invest_experience", "invest_objectives", "invest_knowledge",
    "risk_tolerance", "invest_horizon",
]

ALL_REQUIRED_FIELDS = STEP1_FIELDS + INVESTOR_FIELDS

# Statuts fournisseur pour lesquels la session est encore utilisable (iframe).
ACTIVE_PROVIDER_STATUSES = {"Not Started", "In Progress", "Awaiting User", "Resubmitted"}

# Statuts fournisseur pour lesquels on récupère la décision détaillée.
DECISION_STATUSES = {"Approved", "Declined", "In Review", "Abandoned"}


def _missing(kyc: UserKyc, fields: list[str]) -> list[str]:
    return [f for f in fields if not getattr(kyc, f, None)]


def step1_complete(kyc: UserKyc) -> tuple[bool, list[str]]:
    missing = _missing(kyc, STEP1_FIELDS)
    return (not missing), missing


def profile_complete(kyc: UserKyc) -> tuple[bool, list[str]]:
    """Dossier investisseur complet : identité + profil + consentement."""
    missing = _missing(kyc, ALL_REQUIRED_FIELDS)
    if not kyc.consent:
        missing.append("consent")
    return (not missing), missing


def can_start_verification(kyc: UserKyc | None) -> tuple[bool, str | None]:
    if kyc is None:
        return True, None
    if kyc.status in LOCKED:
        return False, f"Le statut actuel ({kyc.status}) ne permet pas de relancer une vérification."
    return True, None


def kyc_verified(db, user_id: int) -> bool:
    """Vrai si l'identité de l'utilisateur a été validée (bloque la création
    de titres tant que le KYC n'est pas terminé)."""
    from ..models.kyc import UserKyc
    kyc = db.query(UserKyc).filter(UserKyc.user_id == user_id).first()
    return kyc is not None and kyc.status == KYC_VERIFIED


def vendor_data_for(user: User) -> str:
    return f"br_{user.id}"


def parse_vendor_data(vendor_data: str) -> int | None:
    m = re.fullmatch(r"br_(\d+)", vendor_data or "")
    return int(m.group(1)) if m else None


def map_didit_status(didit_status: str) -> str:
    """Statut exact du fournisseur → statut BlueRock (statuts inconnus → error)."""
    return DIDIT_STATUS_MAP.get(didit_status or "", KYC_ERROR)


def _communicable_reason(decision: dict | None) -> str | None:
    """Raison refus/revue communicable à l'utilisateur, si disponible."""
    if not decision:
        return None
    for key in ("decline_reason", "reason", "review_reason"):
        val = decision.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:500]
    for feature in ("id_verifications", "liveness_checks", "face_matches"):
        items = decision.get(feature) or []
        for item in items:
            if isinstance(item, dict):
                val = item.get("failure_reason") or item.get("status")
                if isinstance(val, str) and val and val.lower() not in ("verified", "passed", "success"):
                    return f"{feature}: {val}"[:500]
    return None


def notify_kyc(db: Session, user_id: int, title: str, body: str):
    db.add(Notification(user_id=user_id, type="system", title=title, body=body, link="/kyc"))


def notify_for_status(db: Session, user: User, kyc: UserKyc, status: str, note: str | None):
    """Notifications utilisateur selon le statut BlueRock appliqué."""
    if status == KYC_VERIFIED:
        complete, _ = profile_complete(kyc)
        if complete:
            body = "Votre identité est vérifiée et votre profil investisseur est complet : votre dossier est prêt pour la transmission à la SGI."
        else:
            body = "Votre identité est vérifiée. Complétez maintenant votre profil investisseur."
        notify_kyc(db, user.id, "Identité vérifiée", body)
    elif status == KYC_REJECTED:
        body = "Votre vérification d'identité a été refusée."
        if note:
            body += f" Motif : {note}"
        notify_kyc(db, user.id, "Vérification refusée", body)
    elif status == KYC_REVIEW_REQUIRED:
        notify_kyc(db, user.id, "Vérification supplémentaire nécessaire",
                   "Votre dossier nécessite une vérification supplémentaire. Vous serez notifié du résultat.")
    elif status == KYC_RETRY_REQUIRED:
        notify_kyc(db, user.id, "Vérification à relancer",
                   "Votre session de vérification a expiré. Vous pouvez relancer la vérification.")
    elif status == KYC_ERROR:
        notify_kyc(db, user.id, "Erreur de vérification",
                   "Une erreur technique est survenue pendant la vérification. Vous pouvez réessayer.")


def apply_verification_event(db: Session, provider_name: str, provider_session_id: str,
                             provider_status: str, decision: dict | None) -> dict:
    """Applique un événement fournisseur au dossier KYC (idempotent côté appelant).

    Retourne un dict de synthèse pour journalisation / notification.
    """
    from datetime import datetime

    bluerock_status = map_didit_status(provider_status)
    verification = db.query(KycVerification).filter(
        KycVerification.provider_session_id == provider_session_id
    ).first()
    if verification is None:
        logger.warning("Événement pour une session inconnue (%s)", provider_session_id)
        return {"applied": False, "reason": "unknown_session"}

    kyc = db.query(UserKyc).filter(UserKyc.id == verification.kyc_id).first()
    if kyc is None:
        logger.warning("Événement sans dossier KYC (%s)", provider_session_id)
        return {"applied": False, "reason": "no_kyc"}

    verification.session_status = provider_status
    if decision is not None:
        verification.decision = json.dumps(decision, ensure_ascii=False)

    now = datetime.utcnow()
    kyc.status = bluerock_status
    kyc.reviewed_at = now

    note = None
    if bluerock_status in (KYC_REJECTED, KYC_REVIEW_REQUIRED):
        note = _communicable_reason(decision)
        kyc.review_note = note
    if bluerock_status == KYC_VERIFIED:
        kyc.verified_at = now
        kyc.submitted_at = now
        kyc.review_note = None

    db.flush()
    return {
        "applied": True,
        "kyc_id": kyc.id,
        "user_id": kyc.user_id,
        "provider_status": provider_status,
        "status": bluerock_status,
        "note": note,
    }
