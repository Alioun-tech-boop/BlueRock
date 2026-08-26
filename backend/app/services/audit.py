"""Helpers d'écriture du journal d'audit (ne lèvent jamais d'exception)."""
import logging

from sqlalchemy.orm import Session

from ..models.audit_log import AuditLog

logger = logging.getLogger(__name__)


def audit(db: Session, action: str, resource_type: str, resource_id=None,
          user_id: int | None = None, actor_role: str | None = None,
          ip: str | None = None, user_agent: str | None = None,
          meta: dict | None = None) -> None:
    """Append-only. Échec = log warning, jamais d'impact sur le flux métier."""
    try:
        db.add(AuditLog(
            user_id=user_id,
            actor_role=actor_role,
            action=action,
            resource_type=resource_type,
            resource_id=str(resource_id) if resource_id is not None else None,
            ip=(ip or "")[:64],
            user_agent=(user_agent or "")[:256],
            meta={k: v for k, v in (meta or {}).items() if k not in ("password", "token", "pin", "authorization")},
        ))
        db.flush()
    except Exception:
        logger.warning("audit write failed (action=%s)", action, exc_info=True)


def audit_actor(user, db: Session) -> dict:
    return {
        "user_id": getattr(user, "id", None),
        "actor_role": getattr(user, "role", None) or "user",
    }