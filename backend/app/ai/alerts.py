"""Alertes Bluerock AI : décisions fortes et franchissements de limites de risque.

Les alertes sont loggées (AiAlert), dédupliquées par type sur une fenêtre, et
envoyées par email si AI_ALERT_EMAILS est configuré. Aucune promesse : le texte
est construit à partir des chiffres réellement calculés.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AiAlert, AiAuditLog
from .risk_engine import check_limits, get_limits

logger = logging.getLogger(__name__)

DEDUPE_WINDOW_HOURS = 24


def _now():
    return datetime.now(timezone.utc)


def create_alert(
    db: Session,
    alert_type: str,
    severity: str,
    title: str,
    body: str,
    link: Optional[str] = None,
    payload: Optional[dict] = None,
    dedupe_hours: Optional[int] = DEDUPE_WINDOW_HOURS,
    email: bool = True,
) -> Optional[AiAlert]:
    """Crée une alerte dédupliquée (même type dans la fenêtre → ignorée)."""
    if not settings.AI_ALERTS_ENABLED:
        return None
    if dedupe_hours:
        since = _now() - timedelta(hours=dedupe_hours)
        exists = db.execute(
            select(AiAlert).where(
                AiAlert.alert_type == alert_type,
                AiAlert.created_at >= since,
            )
        ).scalars().first()
        if exists:
            return None

    alert = AiAlert(
        alert_type=alert_type,
        severity=severity,
        title=title,
        body=body,
        link=link,
        payload=payload or {},
    )
    db.add(alert)
    db.flush()
    db.refresh(alert)
    alert_id = alert.id

    if email and settings.AI_ALERT_EMAILS:
        recipients = [e.strip() for e in settings.AI_ALERT_EMAILS.split(",") if e.strip()]

        def _send():
            from ..core.email import send_ai_alert_email
            ok = False
            for to in recipients:
                if send_ai_alert_email(to, title, body, link):
                    ok = True
            if ok:
                try:
                    from ..database import SessionLocal
                    dbs = SessionLocal()
                    try:
                        dbs.query(AiAlert).filter(AiAlert.id == alert_id).update(
                            {"email_sent": True}, synchronize_session=False)
                        dbs.commit()
                    finally:
                        dbs.close()
                except Exception as e:  # pragma: no cover
                    logger.warning("email_sent update failed: %s", e)

        threading.Thread(target=_send, daemon=True).start()

    db.add(AiAuditLog(
        event_type="ALERT_CREATED",
        entity_type="ai_alerts",
        entity_id=alert.id,
        detail=f"[{severity}] {title}",
        payload={"alert_type": alert_type},
    ))
    db.commit()
    return alert


def evaluate_risk_breaches(db: Session) -> dict:
    """Crée une alerte par limite de risque franchie (dédupliquée 24 h)."""
    result = check_limits(db)
    breaches = result.get("breaches") or []
    created = 0
    for b in breaches:
        dim = b["dimension"]
        alert = create_alert(
            db,
            alert_type=f"RISK_LIMIT:{dim}",
            severity=b["severity"],
            title=f"Limite de risque franchie : {dim}",
            body=(
                f"La métrique {dim} est à {b['current'] * 100:.1f} % pour une limite de "
                f"{b['limit'] * 100:.1f} % (ratio {b['ratio']:.2f}). "
                f"Statut Risk Engine : {result.get('status')}. SIMULATION."
            ),
            link="/ai-studio/risk",
            payload={"dimension": dim, "current": b["current"], "limit": b["limit"]},
        )
        if alert:
            created += 1
    return {"status": result.get("status"), "breaches": len(breaches), "alerts_created": created}


def notify_decisions(db: Session, generated: Optional[dict] = None) -> dict:
    """Alerte digest quand le pipeline émet des signaux forts (confiance élevée)."""
    created = 0
    if generated:
        decisions = generated.get("decisions") or []
        strong = [d for d in decisions if (d.get("confidence") or 0) >= 0.85]
        if strong:
            top = sorted(strong, key=lambda d: d.get("confidence") or 0, reverse=True)[:5]
            lines = "; ".join(
                f"{d['symbol']} {d['decision_type']} ({d['confidence'] * 100:.0f} %)" for d in top
            )
            alert = create_alert(
                db,
                alert_type="DECISION",
                severity="INFO",
                title=f"{len(strong)} signal(s) fort(s) détectés",
                body=(
                    f"Le moteur a émis {len(strong)} signal(s) à confiance ≥ 85 % sur le "
                    f"dernier cycle ({len(decisions)} décisions au total). Principaux : {lines}. "
                    f"Environnement SIMULATION — aucune promesse de performance."
                ),
                link="/ai-studio/decisions",
                payload={"strong_count": len(strong), "total": len(decisions)},
            )
            if alert:
                created += 1
    return {"alerts_created": created}


def evaluate(db: Session, generated: Optional[dict] = None) -> dict:
    """Point d'entrée du pipeline : limites de risque puis signaux forts."""
    risk = evaluate_risk_breaches(db)
    dec = notify_decisions(db, generated)
    return {"risk": risk, "decisions": dec}
