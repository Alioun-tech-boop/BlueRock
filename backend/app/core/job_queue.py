"""File d'attente durable basée sur PostgreSQL.

Les tâches asynchrones (emails, traitement KYC, …) sont inscrites depuis les
handlers HTTP puis consommées par le worker (drainer APScheduler).

Propriétés multi-instance :
  - `claim_next` utilise `FOR UPDATE SKIP LOCKED` : deux workers peuvent
    puiser dans la file sans verrouiller les lignes en cours de traitement ;
  - `available_at` permet de différer / re-tenter avec backoff exponentiel ;
  - `max_attempts` borne les relances avant passage en `failed`.
"""

import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.job import BackgroundJob

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_PROCESSING = "processing"
STATUS_DONE = "done"
STATUS_FAILED = "failed"

# Délai de base du backoff (multiplié par le nombre d'essais effectués).
_BACKOFF_BASE_SECONDS = 30
_MAX_ATTEMPTS_DEFAULT = 5


def enqueue(db: Session, kind: str, payload: dict, delay_seconds: int = 0,
            max_attempts: int = _MAX_ATTEMPTS_DEFAULT) -> int:
    """Inscrit une tâche dans la file (commit inclus). Retourne son id."""
    job = BackgroundJob(
        kind=kind,
        payload=payload or {},
        max_attempts=max_attempts,
        available_at=func.now() + timedelta(seconds=max(0, delay_seconds)),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job.id


def claim_next(db: Session) -> BackgroundJob | None:
    """Réserve atomiquement la tâche la plus ancienne prête (SKIP LOCKED)."""
    job = (
        db.query(BackgroundJob)
        .filter(
            BackgroundJob.status == STATUS_PENDING,
            BackgroundJob.available_at <= func.now(),
        )
        .order_by(BackgroundJob.id)
        .with_for_update(skip_locked=True)
        .first()
    )
    if job is None:
        return None
    job.status = STATUS_PROCESSING
    job.attempts += 1
    job.processed_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def complete(db: Session, job: BackgroundJob):
    job.status = STATUS_DONE
    job.processed_at = datetime.utcnow()
    db.commit()


def fail(db: Session, job: BackgroundJob, error: str):
    """Marque la tâche en échec : relance avec backoff ou abandon définitif."""
    job.error = str(error)[:2000]
    if job.attempts >= (job.max_attempts or _MAX_ATTEMPTS_DEFAULT):
        job.status = STATUS_FAILED
        job.processed_at = datetime.utcnow()
        logger.warning("Job %s (%s) abandonné après %d essais : %s",
                       job.id, job.kind, job.attempts, error)
    else:
        backoff = _BACKOFF_BASE_SECONDS * job.attempts
        job.status = STATUS_PENDING
        job.available_at = datetime.utcnow() + timedelta(seconds=backoff)
        logger.warning("Job %s (%s) en échec, relance dans %ds : %s",
                       job.id, job.kind, backoff, error)
    db.commit()


def enqueue_email(db: Session, template: str, *, to: str, code: str | None = None,
                  ttl_minutes: int | None = None, name: str | None = None) -> int:
    """Inscrit un email dans la file (payload figé au moment de l'enqueue).

    Templates pris en charge par le worker : verify, reset, welcome, notification.
    """
    payload: dict = {"template": template, "to": to}
    if code is not None:
        payload["code"] = code
    if ttl_minutes is not None:
        payload["ttl_minutes"] = ttl_minutes
    if name is not None:
        payload["name"] = name
    return enqueue(db, "email", payload)
