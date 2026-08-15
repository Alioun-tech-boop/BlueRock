"""Webhook Didit — source fiable de vérité du parcours KYC.

Traitement :
  1. vérification HMAC (X-Signature-V2 puis X-Signature) + fenêtre de temps ;
  2. journalisation de l'événement (idempotence par provider_event_id) ;
  3. identification de l'utilisateur BlueRock (vendor_data) ;
  4. mise en file du traitement (fetch décision + application + notification)
     exécuté par le worker — la requête webhook répond immédiatement.

Réponse 2xx rapide : le traitement lourd (interrogation de l'API fournisseur,
écriture du dossier, notification) est déplacé hors du chemin de requête.
"""

import json
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..core.job_queue import enqueue
from ..database import get_db
from ..models.kyc import KycWebhookEvent
from ..models.user import User
from ..services.didit_provider import get_kyc_provider
from ..services import kyc_flow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


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
        row.processed = True
        row.processed_at = datetime.utcnow()
        db.commit()
        return {"received": True, "ignored": True}
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        logger.warning("Webhook Didit pour utilisateur inconnu (%s)", user_id)
        row.processed = True
        row.processed_at = datetime.utcnow()
        db.commit()
        return {"received": True, "ignored": True}

    # Traitement complet (fetch décision fournisseur + application du statut +
    # notification) délégué au worker : réponse immédiate au fournisseur.
    enqueue(db, "kyc_process", {
        "event_id": row.id,
        "user_id": user_id,
        "status": event.status,
        "decision": payload.get("decision"),
    })
    return {"received": True}
