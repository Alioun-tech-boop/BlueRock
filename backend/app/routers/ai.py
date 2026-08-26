from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..ai.benchmark import benchmark_regime
from ..ai.decision_engine import decision_detail
from ..ai.evolution import activity, evolution
from ..ai.portfolio import get_or_seed, mark, reconcile
from ..ai.registry import get_features, get_registry
from ..ai.studio import get_status, get_studio
from ..database import get_db
from ..models import (
    AiAlert,
    AiBacktest,
    AiBacktestResult,
    AiDataQuality,
    AiDecision,
    AiHealthSnapshot,
    User,
)
from ..services.tier import is_pro
from .auth import get_current_user

router = APIRouter(prefix="/api/ai", tags=["ai"])

_AI_PRO_MSG = "Le module AI Studio est réservé à l'offre Pro (4 900 FCFA/mois)."

_STUDIO_CACHE: dict = {"t": 0.0, "payload": None}
_STUDIO_TTL = 30.0


def require_ai_pro(
    authorization: str = Header(default=""),
    db: Session = Depends(get_db),
) -> User:
    """Gating du module AI Studio : requiert un compte Pro."""
    user = get_current_user(authorization, db)
    if not is_pro(user):
        raise HTTPException(
            status_code=403,
            detail=_AI_PRO_MSG,
            headers={"X-BlueRock-Code": "plan_required"},
        )
    return user


@router.get("/status")
def ai_status(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    """Identité et statut courant de Bluerock AI (lecture seule)."""
    return get_status(db)


@router.get("/studio")
def ai_studio(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    """Agrégat de lecture pour le dashboard AI Studio."""
    import time as _t

    now = _t.time()
    if _STUDIO_CACHE["payload"] is None or now - _STUDIO_CACHE["t"] > _STUDIO_TTL:
        _STUDIO_CACHE["payload"] = get_studio(db)
        _STUDIO_CACHE["t"] = now
    return _STUDIO_CACHE["payload"]


@router.get("/models")
def ai_models(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    return get_registry(db)


@router.get("/features")
def ai_features(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    return {"features": get_features(db)}


@router.get("/decisions")
def ai_decisions(
    decision_type: Optional[str] = Query(None, pattern="^(BUY|SELL|HOLD|REBALANCE|CASH)$"),
    status: Optional[str] = Query(None),
    limit: int = Query(30, le=100),
    db: Session = Depends(get_db),
    _=Depends(require_ai_pro),
):
    q = select(AiDecision).options(
        selectinload(AiDecision.company),
        selectinload(AiDecision.factors),
    ).order_by(AiDecision.created_at.desc()).limit(limit)
    if decision_type:
        q = q.where(AiDecision.decision_type == decision_type)
    if status:
        q = q.where(AiDecision.status == status)
    rows = db.execute(q).scalars().all()
    from ..ai.studio import _factors_with_contributions
    return {
        "decisions": [
            {
                "id": d.id,
                "decision_type": d.decision_type,
                "status": d.status,
                "symbol": (d.company.symbol if d.company else None),
                "company_name": (d.company.name if d.company else None),
                "confidence": d.confidence,
                "risk_level": d.risk_level,
                "horizon": d.horizon,
                "allocation_target": d.allocation_target,
                "regime": d.regime,
                "score": d.score,
                "summary": d.summary,
                "price_at_decision": d.price_at_decision,
                "created_at": d.created_at.isoformat() if d.created_at else None,
                "factors": _factors_with_contributions(d.factors),
            }
            for d in rows
        ]
    }


@router.get("/decisions/{decision_id}")
def ai_decision_detail(decision_id: int, db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    """Explicabilité complète d'une décision (facteurs, contributions, données brutes)."""
    try:
        return decision_detail(db, decision_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/portfolio")
def ai_portfolio(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    portfolio = get_or_seed(db)
    reconcile(db, portfolio)
    return {"portfolio": mark(db, portfolio)}


@router.get("/performance")
def ai_performance(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    from ..ai.performance import aggregate, performance_series
    portfolio = get_or_seed(db)
    return {"performance": aggregate(db, portfolio)}


@router.get("/risk")
def ai_risk(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    from ..ai.risk import compute_metrics
    portfolio = get_or_seed(db)
    return {"risk": compute_metrics(db, portfolio)}


@router.get("/risk/analysis")
def ai_risk_analysis(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    """Risk Engine complet : métriques + stress tests + concentration + limites."""
    from ..ai.risk_engine import risk_analysis
    portfolio = get_or_seed(db)
    return {"risk": risk_analysis(db, portfolio)}


@router.get("/alerts")
def ai_alerts(limit: int = Query(30, le=100), db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    rows = db.execute(
        select(AiAlert).order_by(AiAlert.created_at.desc()).limit(limit)
    ).scalars().all()
    return {
        "alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "title": a.title,
                "body": a.body,
                "link": a.link,
                "email_sent": a.email_sent,
                "read": a.read,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in rows
        ]
    }


@router.get("/export/decisions")
def ai_export_decisions(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    limit: int = Query(200, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_ai_pro),
):
    from ..ai.export import decisions_csv, decisions_pdf
    if format == "csv":
        content = decisions_csv(db, limit)
        return Response(
            content=content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": "attachment; filename=bluerock-ai-decisions.csv"},
        )
    data = decisions_pdf(db, min(limit, 100))
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=bluerock-ai-decisions.pdf"},
    )


@router.get("/export/audit")
def ai_export_audit(
    limit: int = Query(200, le=500),
    db: Session = Depends(get_db),
    _=Depends(require_ai_pro),
):
    from ..ai.export import audit_csv
    return Response(
        content=audit_csv(db, limit),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=bluerock-ai-audit.csv"},
    )


@router.get("/export/report")
def ai_export_report(
    month: str = Query(..., pattern="^\\d{4}-\\d{2}$"),
    db: Session = Depends(get_db),
    _=Depends(require_ai_pro),
):
    """Rapport mensuel PDF (performance, risque, décisions du mois)."""
    from ..ai.export import monthly_report_pdf
    try:
        data = monthly_report_pdf(db, month)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=bluerock-ai-report-{month}.pdf"},
    )


@router.get("/backtests")
def ai_backtests(limit: int = Query(10, le=50), db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    results = db.execute(
        select(AiBacktestResult)
        .join(AiBacktest, AiBacktestResult.backtest_id == AiBacktest.id)
        .order_by(AiBacktestResult.created_at.desc())
        .limit(limit)
    ).scalars().all()
    return {
        "backtests": [
            {
                "backtest_id": r.backtest_id,
                "metrics": r.metrics,
                "benchmark": r.benchmark_name,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in results
        ]
    }


@router.get("/evolution")
def ai_evolution(limit: int = Query(30, le=100), db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    return {"events": evolution(db, limit), "activity": activity(db, limit)}


@router.get("/health")
def ai_health(db: Session = Depends(get_db), _=Depends(require_ai_pro)):
    latest = db.execute(
        select(AiHealthSnapshot).order_by(AiHealthSnapshot.date.desc()).limit(1)
    ).scalar_one_or_none()
    dq = db.execute(
        select(AiDataQuality).order_by(AiDataQuality.check_date.desc()).limit(5)
    ).scalars().all()
    return {
        "global_status": latest.global_status if latest else "OPERATIONAL",
        "dimensions": {
            "data": latest.data_health if latest else None,
            "model": latest.model_health if latest else None,
            "risk": latest.risk_health if latest else None,
            "execution": latest.execution_health if latest else None,
            "system": latest.system_health if latest else None,
        },
        "checked_at": latest.date.isoformat() if latest else None,
        "data_quality": [
            {
                "source": q.source,
                "check_date": q.check_date.isoformat() if q.check_date else None,
                "freshness": q.freshness,
                "completeness": q.completeness,
                "status": q.status,
            }
            for q in dq
        ],
        "regime": benchmark_regime(db),
    }
