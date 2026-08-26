from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.backtest import run_backtest, run_walk_forward
from ..ai.evolution import record
from ..ai.studio import run_pipeline
from ..core.security import require_admin
from ..database import get_db
from ..models import AiAuditLog

router = APIRouter(prefix="/api/ai/admin", tags=["ai-admin"])


class BacktestRequest(BaseModel):
    period_start: date
    period_end: date
    rebalance_days: int = 63
    top_k: int = 8


class WalkForwardRequest(BaseModel):
    period_start: date
    period_end: date
    folds: int = 4
    rebalance_days: int = 63
    top_k: int = 8


class RiskConfigRequest(BaseModel):
    limits: dict


@router.post("/run-pipeline", dependencies=[Depends(require_admin)])
def admin_run_pipeline(
    steps: Optional[list[str]] = Query(None),
    db: Session = Depends(get_db),
):
    """Exécute tout (ou une partie) du pipeline d'observation."""
    try:
        result = run_pipeline(db, steps)
    except Exception as exc:  # pragma: no cover
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.add(
        AiAuditLog(
            event_type="PIPELINE_RUN",
            actor="admin",
            detail=f"Pipeline exécuté : {steps or 'toutes étapes'}.",
        )
    )
    db.commit()
    return result


@router.post("/decisions", dependencies=[Depends(require_admin)])
def admin_generate_decisions(db: Session = Depends(get_db)):
    from ..ai.decision_engine import generate
    try:
        result = generate(db)
    except Exception as exc:  # pragma: no cover
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.post("/execute", dependencies=[Depends(require_admin)])
def admin_execute(db: Session = Depends(get_db)):
    from ..ai.execution import approve_and_execute
    return approve_and_execute(db)


@router.post("/snapshot", dependencies=[Depends(require_admin)])
def admin_snapshot(db: Session = Depends(get_db)):
    from ..ai.performance import snapshot as perf_snapshot
    from ..ai.risk import snapshot as risk_snapshot
    perf = perf_snapshot(db)
    risk = risk_snapshot(db)
    return {"performance": perf, "risk": risk}


@router.post("/backtest", dependencies=[Depends(require_admin)])
def admin_backtest(body: BacktestRequest, db: Session = Depends(get_db)):
    try:
        metrics = run_backtest(
            db,
            body.period_start,
            body.period_end,
            rebalance_days=body.rebalance_days,
            top_k=body.top_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return metrics


@router.post("/walk-forward", dependencies=[Depends(require_admin)])
def admin_walk_forward(body: WalkForwardRequest, db: Session = Depends(get_db)):
    """Évaluation hors-échantillon sur plis consécutifs + risque de surapprentissage."""
    try:
        return run_walk_forward(
            db,
            body.period_start,
            body.period_end,
            folds=body.folds,
            rebalance_days=body.rebalance_days,
            top_k=body.top_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/risk-config", dependencies=[Depends(require_admin)])
def admin_risk_config_get(db: Session = Depends(get_db)):
    from ..ai.risk_engine import get_limits
    return {"limits": get_limits(db)}


@router.post("/risk-config", dependencies=[Depends(require_admin)])
def admin_risk_config_set(body: RiskConfigRequest, db: Session = Depends(get_db)):
    from ..ai.risk_engine import set_limits
    limits = set_limits(db, body.limits)
    db.add(AiAuditLog(
        event_type="RISK_CONFIG_UPDATED",
        actor="admin",
        entity_type="ai_risk_configs",
        detail="Limites de risque mises à jour.",
        payload={"limits": limits},
    ))
    db.commit()
    return {"limits": limits}


@router.post("/stress-test", dependencies=[Depends(require_admin)])
def admin_stress_test(db: Session = Depends(get_db)):
    """Exécute et journalise les stress tests du Risk Engine."""
    from ..ai.risk_engine import run_stress_tests
    result = run_stress_tests(db, persist=True)
    db.add(AiAuditLog(
        event_type="STRESS_TEST_RUN",
        actor="admin",
        entity_type="ai_stress_tests",
        detail="Stress tests exécutés.",
        payload={"scenarios": len(result["scenarios"])},
    ))
    db.commit()
    return result


@router.post("/alerts/evaluate", dependencies=[Depends(require_admin)])
def admin_alerts_evaluate(db: Session = Depends(get_db)):
    """Déclenche manuellement l'évaluation des alertes (limites + signaux forts)."""
    from ..ai.alerts import evaluate
    return evaluate(db)


@router.post("/health", dependencies=[Depends(require_admin)])
def admin_health(db: Session = Depends(get_db)):
    from ..ai.health import run_data_quality, run_health_check
    run_data_quality(db)
    return run_health_check(db)


@router.post("/event", dependencies=[Depends(require_admin)])
def admin_event(
    event_type: str,
    version_to: Optional[str] = None,
    detail: Optional[str] = None,
    db: Session = Depends(get_db),
):
    ev = record(db, event_type, version_to=version_to, detail=detail)
    db.add(
        AiAuditLog(
            event_type="EVENT_RECORDED",
            actor="admin",
            entity_type="ai_evolution_events",
            entity_id=ev.id,
            detail=detail or event_type,
        )
    )
    db.commit()
    return {"id": ev.id, "event_type": ev.event_type}


@router.get("/audit", dependencies=[Depends(require_admin)])
def admin_audit(limit: int = Query(50, le=200), db: Session = Depends(get_db)):
    rows = db.execute(
        select(AiAuditLog).order_by(AiAuditLog.created_at.desc()).limit(limit)
    ).scalars().all()
    return {
        "audit": [
            {
                "event_type": a.event_type,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "actor": a.actor,
                "detail": a.detail,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in rows
        ]
    }
