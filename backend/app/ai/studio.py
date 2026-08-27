from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    AiAlert,
    AiAuditLog,
    AiBacktest,
    AiBacktestResult,
    AiBenchmark,
    AiDataQuality,
    AiDecision,
    AiEvolutionEvent,
    AiHealthSnapshot,
    AiModel,
    AiModelVersion,
    AiPerformanceSnapshot,
    AiPosition,
    AiPortfolio,
    AiRiskSnapshot,
    AiStrategy,
)
from .benchmark import benchmark_regime
from .decision_engine import generate
from .evolution import activity, evolution
from .execution import approve_and_execute
from .health import run_data_quality, run_health_check
from .performance import aggregate as performance_aggregate
from .performance import performance_series, snapshot as performance_snapshot
from .portfolio import get_or_seed, mark, reconcile
from .registry import get_features, get_registry, seed_features
from .risk import snapshot as risk_snapshot
from .risk_engine import risk_analysis

MODEL_NAME = "BLUEROCK AI CORE"
STRATEGY_NAME = "Adaptive Multi-Factor"
INITIAL_VERSION = "v1.0.0"


def _now():
    return datetime.now(timezone.utc)


def _seed_core(db: Session):
    """Crée (idempotent) le modèle initial BLUEROCK AI CORE, sa stratégie,
    sa première version PRODUCTION et son benchmark de référence."""
    strategy = db.execute(
        select(AiStrategy).where(AiStrategy.name == STRATEGY_NAME)
    ).scalar_one_or_none()
    if strategy is None:
        strategy = AiStrategy(
            name=STRATEGY_NAME,
            status="ACTIVE",
            description=(
                "Stratégie quantitative adaptative multi-facteurs : fondamentaux, "
                "momentum, qualité, valorisation et risque, pilotée par le Risk Engine."
            ),
            parameters={
                "regime_detection": True,
                "rebalance": "quarterly",
                "cash_buffer": 0.05,
            },
        )
        db.add(strategy)
        db.flush()

    model = db.execute(
        select(AiModel).where(AiModel.name == MODEL_NAME)
    ).scalar_one_or_none()
    if model is None:
        model = AiModel(
            name=MODEL_NAME,
            model_type="quant",
            strategy_id=strategy.id,
            status="ACTIVE",
            description="Cœur quantitatif de Bluerock AI : scores par dimension, "
            "décisions explicables, portefeuille en simulation.",
        )
        db.add(model)
        db.flush()

    version = db.execute(
        select(AiModelVersion).where(
            AiModelVersion.model_id == model.id,
            AiModelVersion.status == "PRODUCTION",
        )
    ).scalar_one_or_none()
    if version is None:
        version = AiModelVersion(
            model_id=model.id,
            version=INITIAL_VERSION,
            status="PRODUCTION",
            strategy_id=strategy.id,
            parameters={
                "confidence_threshold": 0.65,
                "max_position_pct": 0.10,
                "max_sector_pct": 0.25,
                "transaction_fee_pct": 0.002,
                "slippage_bps": 10,
            },
            features=[
                "fundamental",
                "technical",
                "quality",
                "momentum",
                "valuation",
                "risk",
            ],
            training_period="",
            dataset="BRVM real data (initial)",
            algorithms=["quant_score", "rule_engine"],
            validation={"walk_forward": False},
            change_reason="Initial model",
            notes="Modèle initial : moteur quantitatif déterministe. "
            "Aucune décision ne peut être générée sans validation du Risk Engine.",
            created_at=_now(),
            promoted_at=_now(),
        )
        db.add(version)
        db.flush()
        db.add(
            AiEvolutionEvent(
                event_type="MODEL_PROMOTED",
                version_from=None,
                version_to=INITIAL_VERSION,
                detail="Initial model promoted to production.",
            )
        )
        db.add(
            AiAuditLog(
                event_type="MODEL_CREATED",
                entity_type="ai_model_version",
                entity_id=version.id,
                detail=f"Version {INITIAL_VERSION} of {MODEL_NAME} created and promoted.",
            )
        )

    bench = db.execute(
        select(AiBenchmark).where(AiBenchmark.code == "BRVM_COMPOSITE")
    ).scalar_one_or_none()
    if bench is None:
        bench = AiBenchmark(
            name="BRVM Composite",
            code="BRVM_COMPOSITE",
            description="Indice de référence BRVM Composite (marché principal).",
        )
        db.add(bench)

    db.commit()
    return model, version, strategy, bench


def get_status(db: Session) -> dict:
    """Statut courant de Bluerock AI : identité, version, stratégie, santé."""
    _, version, strategy, bench = _seed_core(db)
    launch = version.promoted_at or version.created_at
    return {
        "name": MODEL_NAME,
        "status": "ACTIVE",
        "environment": "SIMULATION",
        "version": version.version,
        "strategy": strategy.name,
        "market": "BRVM",
        "launch_date": launch.isoformat() if launch else None,
        "last_update": _now().isoformat(),
        "benchmark": {"code": bench.code, "name": bench.name},
        "health": {
            "global_status": "OPERATIONAL",
            "data": None,
            "model": None,
            "risk": None,
            "execution": None,
            "system": None,
        },
    }


def _factors_with_contributions(factors) -> list[dict]:
    """Facteurs d'une décision enrichis de la contribution au score composite."""
    items = [
        {"factor": f.factor, "score": f.score, "weight": f.weight, "direction": f.direction}
        for f in factors
    ]
    total_w = sum(i["weight"] or 0 for i in items)
    score_total = 0.0
    for i in items:
        if i["score"] is None or not i["weight"]:
            i["contribution"] = None
            i["share_pct"] = None
            continue
        c = ((i["score"] - 50) / 50) * (i["weight"] / total_w) * 100 if total_w else 0.0
        score_total += c
        i["contribution"] = round(c, 2)
    for i in items:
        if i.get("contribution") is not None and score_total:
            i["share_pct"] = round(abs(i["contribution"]) / abs(score_total) * 100, 1)
        else:
            i["share_pct"] = None
    return sorted(items, key=lambda x: abs(x["contribution"] or 0), reverse=True)


def get_studio(db: Session) -> dict:
    """Agrégat complet du dashboard AI Studio (lecture seule)."""
    portfolio = get_or_seed(db)
    mkt = mark(db, portfolio)
    series = performance_series(db, portfolio)

    latest_health = db.execute(
        select(AiHealthSnapshot).order_by(AiHealthSnapshot.date.desc()).limit(1)
    ).scalar_one_or_none()
    latest_dq = db.execute(
        select(AiDataQuality).order_by(AiDataQuality.check_date.desc()).limit(3)
    ).scalars().all()

    latest_backtest = db.execute(
        select(AiBacktestResult).order_by(AiBacktestResult.created_at.desc()).limit(1)
    ).scalar_one_or_none()

    decisions = db.execute(
        select(AiDecision)
        .options(selectinload(AiDecision.company), selectinload(AiDecision.factors))
        .order_by(AiDecision.created_at.desc()).limit(20)
    ).scalars().all()

    positions = db.execute(
        select(AiPosition)
        .options(selectinload(AiPosition.company))
        .where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        ).order_by(AiPosition.allocation_pct.desc().nulls_last())
    ).scalars().all()

    versions = db.execute(
        select(AiModelVersion).order_by(AiModelVersion.created_at.asc())
    ).scalars().all()

    return {
        "status": get_status(db),
        "registry": get_registry(db),
        "performance": performance_aggregate(db, portfolio, series),
        "risk": _risk_payload(db, portfolio, series),
        "portfolio": {
            "name": portfolio.name,
            "currency": portfolio.currency,
            "initial_value": portfolio.initial_value,
            "value": mkt["value"],
            "cash": mkt["cash"],
            "invested": mkt["invested"],
            "exposure": mkt["exposure"],
            "positions_count": mkt["positions_count"],
            "positions": [
                {
                    "symbol": p.symbol,
                    "company_name": p.company.name if p.company else None,
                    "sector": p.sector,
                    "quantity": p.quantity,
                    "avg_price": p.avg_price,
                    "current_price": p.current_price,
                    "allocation_pct": p.allocation_pct,
                    "entry_date": p.entry_date.isoformat() if p.entry_date else None,
                    "status": p.status,
                }
                for p in positions
            ],
        },
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
            for d in decisions
        ],
        "alerts": [
            {
                "id": a.id,
                "alert_type": a.alert_type,
                "severity": a.severity,
                "title": a.title,
                "body": a.body,
                "link": a.link,
                "read": a.read,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in db.execute(
                select(AiAlert).order_by(AiAlert.created_at.desc()).limit(10)
            ).scalars().all()
        ],
        "evolution": {
            "versions": [
                {
                    "version": v.version,
                    "status": v.status,
                    "promoted_at": v.promoted_at.isoformat() if v.promoted_at else None,
                    "created_at": v.created_at.isoformat() if v.created_at else None,
                }
                for v in versions
            ],
            "events": evolution(db, 15),
        },
        "activity": activity(db, 30),
        "health": {
            "global_status": latest_health.global_status if latest_health else "OPERATIONAL",
            "dimensions": {
                "data": latest_health.data_health if latest_health else None,
                "model": latest_health.model_health if latest_health else None,
                "risk": latest_health.risk_health if latest_health else None,
                "execution": latest_health.execution_health if latest_health else None,
                "system": latest_health.system_health if latest_health else None,
            },
            "checked_at": latest_health.date.isoformat() if latest_health else None,
            "data_quality": [_dq_dict(q) for q in latest_dq],
        },
        "backtest": (
            {
                "metrics": latest_backtest.metrics,
                "benchmark": latest_backtest.benchmark_name,
                "completed_at": latest_backtest.created_at.isoformat() if latest_backtest.created_at else None,
            }
            if latest_backtest
            else None
        ),
    }


def _risk_payload(db: Session, portfolio, series=None) -> dict:
    """Métriques de risque + stress tests + concentration + limites."""
    try:
        analysis = risk_analysis(db, portfolio, series=series)
    except Exception:
        analysis = {}
    latest = db.execute(
        select(AiRiskSnapshot)
        .where(AiRiskSnapshot.portfolio_id == portfolio.id)
        .order_by(AiRiskSnapshot.date.desc())
        .limit(1)
    ).scalar_one_or_none()
    base = {
        "volatility": None, "max_drawdown": None, "sharpe_ratio": None,
        "sortino_ratio": None, "beta": None, "downside_deviation": None,
        "var_95": None, "cvar_95": None, "risk_score": None,
        "as_of": None,
    }
    if latest is not None:
        base = {
            "volatility": latest.volatility,
            "max_drawdown": latest.max_drawdown,
            "sharpe_ratio": latest.sharpe_ratio,
            "sortino_ratio": latest.sortino_ratio,
            "beta": latest.beta,
            "downside_deviation": latest.downside_deviation,
            "var_95": latest.var_95,
            "cvar_95": latest.cvar_95,
            "risk_score": latest.risk_score,
            "as_of": latest.date.isoformat() if latest.date else None,
        }
    base["stress_tests"] = analysis.get("stress_tests", [])
    base["sector_exposure"] = analysis.get("sector_exposure", {})
    base["correlation"] = analysis.get("correlation", {})
    base["limits"] = analysis.get("limits", {})
    return base


def _dq_dict(q: AiDataQuality) -> dict:
    return {
        "source": q.source,
        "check_date": q.check_date.isoformat() if q.check_date else None,
        "freshness": q.freshness,
        "completeness": q.completeness,
        "status": q.status,
        "details": q.details,
    }


def run_pipeline(db: Session, steps: list[str] | None = None) -> dict:
    """Pipeline complet du système d'observation (exécuté par le scheduler).

    steps : ["seed", "decisions", "execute", "performance", "risk", "health", "alerts"]
    """
    steps = steps or ["seed", "decisions", "execute", "performance", "risk", "health", "alerts"]
    out: dict = {}
    _seed_core(db)
    seed_features(db)
    get_or_seed(db)

    generated = None
    if "decisions" in steps:
        generated = generate(db)
        out["decisions"] = generated
    if "execute" in steps:
        out["executions"] = approve_and_execute(db)
        reconcile(db)
    if "performance" in steps:
        out["performance"] = performance_snapshot(db)
    if "risk" in steps:
        out["risk"] = risk_snapshot(db)
    if "health" in steps:
        run_data_quality(db)
        out["health"] = run_health_check(db)
    if "alerts" in steps:
        from .alerts import evaluate as evaluate_alerts
        out["alerts"] = evaluate_alerts(db, generated)
    out["regime"] = benchmark_regime(db)
    return out
