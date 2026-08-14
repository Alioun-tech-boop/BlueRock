"""Webhook Didit — source fiable de vérité du parcours KYC.

Traitement :
  1. vérification HMAC (X-Signature-V2 puis X-Signature) + fenêtre de temps ;
  2. journalisation de l'événement (idempotence par provider_event_id) ;
  3. identification de l'utilisateur BlueRock (vendor_data) ;
  4. récupération du résultat officiel (décision fournisseur) ;
  5. mise à jour du dossier KYC (statut BlueRock uniquement) ;
  6. notification + déclenchement de la suite du parcours.

Réponse 2xx rapide : la charge utile est traitée de façon synchrone mais
légère (la décision est déjà dans le payload signé ; l'API n'est interrogée
qu'en complément).
"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.kyc import UserKyc, KycWebhookEvent
from ..models.user import User
from ..services.didit_provider import get_kyc_provider
from ..services import kyc_flow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Statuts fournisseur pour lesquels on récupère la décision détaillée.
_DECISION_STATUSES = {"Approved", "Declined", "In Review", "Abandoned"}


def _notify_for_status(db: Session, user: User, kyc, status: str, note: str | None):
    if status == kyc_flow.KYC_VERIFIED:
        complete, _ = kyc_flow.profile_complete(kyc)
        if complete:
            body = "Votre identité est vérifiée et votre profil investisseur est complet : votre dossier est prêt pour la transmission à la SGI."
        else:
            body = "Votre identité est vérifiée. Complétez maintenant votre profil investisseur."
        kyc_flow.notify_kyc(db, user.id, "Identité vérifiée", body)
    elif status == kyc_flow.KYC_REJECTED:
        body = "Votre vérification d'identité a été refusée."
        if note:
            body += f" Motif : {note}"
        kyc_flow.notify_kyc(db, user.id, "Vérification refusée", body)
    elif status == kyc_flow.KYC_REVIEW_REQUIRED:
        kyc_flow.notify_kyc(db, user.id, "Vérification supplémentaire nécessaire",
                            "Votre dossier nécessite une vérification supplémentaire. Vous serez notifié du résultat.")
    elif status == kyc_flow.KYC_RETRY_REQUIRED:
        kyc_flow.notify_kyc(db, user.id, "Vérification à relancer",
                            "Votre session de vérification a expiré. Vous pouvez relancer la vérification.")
    elif status == kyc_flow.KYC_ERROR:
        kyc_flow.notify_kyc(db, user.id, "Erreur de vérification",
                            "Une erreur technique est survenue pendant la vérification. Vous pouvez réessayer.")


@router.post("/didit")
async def didit_webhook(request: Request, db: Session = Depends(get_db)):
    provider = get_kyc_provider()
    if not provider.configured:
        raise HTTPException(status_code=503, detail="Webhook Didit non configuré")

    raw = await request.body()
    headers = dict(request.headers)
    if not provider.verify_webhook(headers, raw):
        raise HTTPException(status_code=401, detail="Signature invalide")

    try:
        payload = json.loads(raw.decode("utf-8"))
        event = provider.parse_event(payload)
    except (ValueError, KeyError) as e:
        logger.warning("Webhook Didit malformé : %s", e)
        raise HTTPException(status_code=400, detail="Payload invalide")

    # Idempotence : un même event_id ne doit être traité qu'une seule fois
    # (retries, fan-out). On enregistre AVANT traitement.
    existing = db.query(KycWebhookEvent).filter(
        KycWebhookEvent.provider_event_id == event.provider_event_id
    ).first()
    if existing:
        return {"received": True, "duplicate": True}

    row = KycWebhookEvent(
        provider=provider.name,
        provider_event_id=event.provider_event_id,
        provider_session_id=event.provider_session_id,
        vendor_data=event.vendor_data or None,
        webhook_type=payload.get("webhook_type") or None,
        status=event.status or None,
        payload=json.dumps(payload, ensure_ascii=False),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"received": True, "duplicate": True}

    # Identification de l'utilisateur BlueRock (vendor_data = br_<id>).
    user_id = kyc_flow.parse_vendor_data(event.vendor_data)
    if user_id is None:
        logger.warning("Webhook Didit sans vendor_data BlueRock (%s)", event.vendor_data)
        return {"received": True, "ignored": True}
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.warning("Webhook Didit pour utilisateur inconnu (%s)", user_id)
        return {"received": True, "ignored": True}

    # Décision officielle (en complément du payload signé).
    decision = None
    if event.status in _DECISION_STATUSES:
        decision = provider.fetch_decision(event.provider_session_id)
        if decision is None:
            decision = payload.get("decision")

    result = kyc_flow.apply_verification_event(
        db, provider.name, event.provider_session_id, event.status, decision,
    )

    if result.get("applied"):
        kyc = db.query(UserKyc).filter(UserKyc.id == result["kyc_id"]).first()
        _notify_for_status(db, user, kyc, result["status"], result.get("note"))
        logger.info(
            "KYC webhook %s → %s (user=%s, session=%s)",
            event.status, result["status"], user_id, event.provider_session_id,
        )

    row.processed = True
    row.processed_at = datetime.utcnow()
    db.commit()
    return {"received": True}
