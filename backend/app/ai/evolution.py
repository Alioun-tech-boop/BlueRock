"""Journal d'évolution et fil d'activité de Bluerock AI."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    AiAuditLog,
    AiBacktest,
    AiDecision,
    AiExecution,
    AiEvolutionEvent,
    AiModelVersion,
    AiOrder,
    AiPerformanceSnapshot,
)


def record(
    db: Session,
    event_type: str,
    version_from: Optional[str] = None,
    version_to: Optional[str] = None,
    detail: Optional[str] = None,
    payload: Optional[dict] = None,
) -> AiEvolutionEvent:
    ev = AiEvolutionEvent(
        event_type=event_type,
        version_from=version_from,
        version_to=version_to,
        detail=detail,
        payload=payload,
    )
    db.add(ev)
    db.commit()
    return ev


def activity(db: Session, limit: int = 30) -> list[dict]:
    """Fil d'activité mixte, trié du plus récent au plus ancien."""
    items: list[dict] = []

    for d in db.execute(
        select(AiDecision)
        .options(selectinload(AiDecision.company))
        .order_by(AiDecision.created_at.desc())
        .limit(20)
    ).scalars():
        items.append(
            {
                "ts": d.created_at,
                "kind": "decision",
                "label": f"Décision {d.decision_type} · {d.company.symbol if d.company else '?'}",
                "detail": f"Confiance {d.confidence * 100:.0f} % · {d.risk_level} · {d.regime}",
                "status": d.status,
            }
        )

    for o in db.execute(
        select(AiOrder).order_by(AiOrder.created_at.desc()).limit(20)
    ).scalars():
        items.append(
            {
                "ts": o.created_at,
                "kind": "order",
                "label": f"Ordre {o.side} · {o.symbol}",
                "detail": f"{int(o.quantity)} titres · {o.status}",
                "status": o.status,
            }
        )

    for e in db.execute(
        select(AiExecution)
        .options(selectinload(AiExecution.order))
        .order_by(AiExecution.executed_at.desc())
        .limit(20)
    ).scalars():
        items.append(
            {
                "ts": e.executed_at,
                "kind": "execution",
                "label": f"Exécution · {e.order.symbol if e.order else '?'}",
                "detail": f"{int(e.quantity)} titres @ {e.price:.0f} XOF (frais {e.fee:.0f})",
                "status": "FILLED",
            }
        )

    for b in db.execute(
        select(AiBacktest).order_by(AiBacktest.created_at.desc()).limit(10)
    ).scalars():
        items.append(
            {
                "ts": b.created_at,
                "kind": "backtest",
                "label": f"Backtest {b.period_start} → {b.period_end}",
                "detail": b.status,
                "status": b.status,
            }
        )

    for v in db.execute(
        select(AiModelVersion).order_by(AiModelVersion.created_at.desc()).limit(10)
    ).scalars():
        items.append(
            {
                "ts": v.promoted_at or v.created_at,
                "kind": "version",
                "label": f"Version {v.version} · {v.status}",
                "detail": v.change_reason or "—",
                "status": v.status,
            }
        )

    for s in db.execute(
        select(AiPerformanceSnapshot).order_by(AiPerformanceSnapshot.date.desc()).limit(10)
    ).scalars():
        items.append(
            {
                "ts": datetime.combine(s.date, datetime.min.time()).replace(tzinfo=timezone.utc),
                "kind": "snapshot",
                "label": f"Snapshot de performance · {s.date}",
                "detail": f"Valeur {s.value:,.0f} XOF",
                "status": "OK",
            }
        )

    for a in db.execute(
        select(AiAuditLog).order_by(AiAuditLog.created_at.desc()).limit(10)
    ).scalars():
        items.append(
            {
                "ts": a.created_at,
                "kind": "audit",
                "label": a.event_type.replace("_", " ").title(),
                "detail": a.detail or "—",
                "status": "AUDIT",
            }
        )

    items.sort(key=lambda x: x["ts"] or datetime.min, reverse=True)
    out = []
    for it in items[:limit]:
        out.append(
            {
                "kind": it["kind"],
                "label": it["label"],
                "detail": it["detail"],
                "status": it["status"],
                "ts": it["ts"].isoformat() if it["ts"] else None,
            }
        )
    return out


def evolution(db: Session, limit: int = 30) -> list[dict]:
    events = db.execute(
        select(AiEvolutionEvent).order_by(AiEvolutionEvent.created_at.desc()).limit(limit)
    ).scalars().all()
    return [
        {
            "event_type": e.event_type,
            "version_from": e.version_from,
            "version_to": e.version_to,
            "detail": e.detail,
            "payload": e.payload,
            "created_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in events
    ]
