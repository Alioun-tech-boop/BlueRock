"""Worker de la file PostgreSQL — exécution des tâches en arrière-plan.

Le drainer est déclenché par un job APScheduler (verrou distribué via
SharedStore) : il consomme jusqu'à `MAX_PER_TICK` tâches puis s'arrête.

Chaque tâche est traitée avec sa propre session SQLAlchemy ; un échec
relance la tâche (backoff) ou l'abandonne après `max_attempts` essais.
"""

import logging
from datetime import datetime

from sqlalchemy.orm import Session

from ..core import job_queue, metrics
from ..database import SessionLocal

logger = logging.getLogger(__name__)

MAX_PER_TICK = 10


def _handle_email(db: Session, job):
    from ..core.email import send_verify_email, send_reset_email, send_welcome_email, send_notification_email

    payload = job.payload or {}
    template = payload.get("template", "verify")
    to = payload.get("to", "")
    if not to:
        logger.warning("Job email %s sans destinataire", job.id)
        return

    if template == "verify":
        ok = send_verify_email(to, payload.get("code", ""), payload.get("ttl_minutes", 10))
    elif template == "reset":
        ok = send_reset_email(to, payload.get("code", ""), payload.get("ttl_minutes", 10))
    elif template == "welcome":
        ok = send_welcome_email(to, payload.get("name", ""))
    elif template == "notification":
        ok = send_notification_email(to, payload.get("title", ""), payload.get("body", ""))
    else:
        logger.warning("Template email inconnu : %s", template)
        return

    if not ok:
        raise RuntimeError(f"Envoi email {template} échoué -> {to}")
    metrics.email_sent()


def _handle_kyc_process(db: Session, job):
    from ..models.kyc import UserKyc, KycWebhookEvent
    from ..models.user import User
    from ..services import kyc_flow
    from ..services.didit_provider import get_kyc_provider

    payload = job.payload or {}
    event_id = payload.get("event_id")
    event = db.query(KycWebhookEvent).filter(KycWebhookEvent.id == event_id).first()
    if event is None or event.processed:
        return

    user = db.query(User).filter(User.id == payload.get("user_id")).first()
    if user is None:
        logger.warning("KYC job %s : utilisateur inconnu (%s)", event_id, payload.get("user_id"))
        return

    provider = get_kyc_provider()
    decision = None
    if event.status in kyc_flow.DECISION_STATUSES:
        decision = provider.fetch_decision(event.provider_session_id)
        if decision is None:
            decision = payload.get("decision")

    result = kyc_flow.apply_verification_event(
        db, provider.name, event.provider_session_id, event.status, decision,
    )

    if result.get("applied"):
        kyc = db.query(UserKyc).filter(UserKyc.id == result["kyc_id"]).first()
        kyc_flow.notify_for_status(db, user, kyc, result["status"], result.get("note"))
        logger.info(
            "KYC processed %s → %s (user=%s, session=%s)",
            event.status, result["status"], payload.get("user_id"), event.provider_session_id,
        )

    event.processed = True
    event.processed_at = datetime.utcnow()
    db.commit()


_HANDLERS = {
    "email": _handle_email,
    "kyc_process": _handle_kyc_process,
}


def _process(db: Session, job) -> bool:
    """Exécute une tâche. Retourne False si le traitement est un non-op."""
    handler = _HANDLERS.get(job.kind)
    if handler is None:
        logger.warning("Kind de job inconnu : %s", job.kind)
        return False
    handler(db, job)
    return True


def drain_once() -> int:
    """Consomme jusqu'à MAX_PER_TICK tâches prêtes. Retourne le nombre exécuté."""
    processed_count = 0
    for _ in range(MAX_PER_TICK):
        db = SessionLocal()
        try:
            job = job_queue.claim_next(db)
            if job is None:
                return processed_count
            try:
                _process(db, job)
                job_queue.complete(db, job)
                metrics.job_succeeded()
            except Exception as e:
                db.rollback()
                job_queue.fail(db, job, repr(e))
                metrics.job_failed()
            processed_count += 1
        finally:
            db.close()
    return processed_count
