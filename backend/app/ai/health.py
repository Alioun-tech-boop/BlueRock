"""Santé du système et qualité des données (snapshots journaliers/horaires)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..models import (
    AiDataQuality,
    AiDecision,
    AiHealthSnapshot,
    AiModelVersion,
    AiOrder,
    FinancialRatio,
)
from .portfolio import get_or_seed
from .risk import compute_metrics

DATA_SOURCES = {
    "BRVM_PRICES": "Cours de marché BRVM",
    "BRVM_FINANCIALS": "Ratios financiers BRVM",
}


def run_data_quality(db: Session) -> list[dict]:
    """Fraîcheur, complétude et statut des sources (écrit AiDataQuality).

    Les métriques sont calculées sur l'univers réellement consommé par le
    moteur : les sociétés BRVM qui ont des ratios financiers (47).
    """
    today = date.today()
    cutoff = today - timedelta(days=10)

    universe = db.execute(
        select(FinancialRatio.company_id).distinct()
    ).scalars().all()
    total = len(universe)
    if total == 0:
        return []

    rows = []

    # — Cours BRVM sur l'univers du moteur
    price_companies = db.execute(
        text(
            "SELECT count(DISTINCT md.company_id) FROM market_data md "
            "JOIN financial_ratios fr ON fr.company_id = md.company_id"
        )
    ).scalar() or 0
    fresh_count = db.execute(
        text(
            "SELECT count(DISTINCT md.company_id) FROM market_data md "
            "JOIN financial_ratios fr ON fr.company_id = md.company_id "
            "WHERE md.date >= :cutoff"
        ),
        {"cutoff": cutoff},
    ).scalar() or 0
    freshness = (fresh_count / price_companies) if price_companies else None
    last_date = db.execute(text("SELECT max(date) FROM market_data")).scalar()

    status = "OK" if (freshness is not None and freshness >= 0.9) else (
        "WARN" if freshness is not None and freshness >= 0.5 else "CRITICAL"
    )
    row = AiDataQuality(
        source="BRVM_PRICES",
        check_date=today,
        freshness=freshness,
        completeness=(price_companies / total) if total else None,
        status=status,
        details={
            "univers": total,
            "sociétés avec cours récents (10 j)": fresh_count,
            "sociétés avec cours": price_companies,
            "dernier jour de cote": str(last_date),
        },
    )
    db.add(row)
    rows.append(_dq_dict(row))

    # — Ratios financiers sur l'univers du moteur
    fr_total = db.execute(select(func.count()).select_from(FinancialRatio)).scalar() or 0
    recent_cov = db.execute(
        text(
            "SELECT count(DISTINCT company_id) FROM financial_ratios "
            "WHERE fiscal_year >= :y - 1"
        ),
        {"y": today.year},
    ).scalar() or 0
    covered = db.execute(
        text(
            "SELECT count(DISTINCT company_id) FROM financial_ratios "
            "WHERE fiscal_year >= :y - 2"
        ),
        {"y": today.year},
    ).scalar() or 0
    fr_status = "OK" if recent_cov / total >= 0.8 else (
        "WARN" if recent_cov / total >= 0.5 else "CRITICAL"
    )
    row2 = AiDataQuality(
        source="BRVM_FINANCIALS",
        check_date=today,
        freshness=(recent_cov / total) if total else None,
        completeness=(covered / total) if total else None,
        status=fr_status,
        details={
            "univers": total,
            "sociétés avec ratio N/N-1": recent_cov,
            "sociétés couvertes N-2..N": covered,
            "ratios au total": fr_total,
        },
    )
    db.add(row2)
    rows.append(_dq_dict(row2))

    db.commit()
    return rows


def _dq_dict(row: AiDataQuality) -> dict:
    return {
        "source": row.source,
        "check_date": row.check_date.isoformat() if row.check_date else None,
        "freshness": row.freshness,
        "completeness": row.completeness,
        "status": row.status,
        "details": row.details,
    }


def run_health_check(db: Session) -> dict:
    """Évalue les 5 dimensions de santé et écrit un snapshot."""
    dq_rows = db.execute(
        select(AiDataQuality).order_by(AiDataQuality.check_date.desc()).limit(5)
    ).scalars().all()
    if not dq_rows:
        run_data_quality(db)
        dq_rows = db.execute(
            select(AiDataQuality).order_by(AiDataQuality.check_date.desc()).limit(5)
        ).scalars().all()

    # data_health : moyenne des fraîcheur × complétude par source
    scores = []
    for dq in dq_rows:
        if dq.freshness is not None:
            scores.append(dq.freshness * 100)
        if dq.completeness is not None:
            scores.append(dq.completeness * 100)
    data_health = round(sum(scores) / len(scores), 1) if scores else None

    # model_health
    mh: list[float] = []
    version = db.execute(
        select(AiModelVersion).where(AiModelVersion.status == "PRODUCTION")
    ).scalars().first()
    if version is not None:
        mh.append(100.0 if version.promoted_at else 80.0)
    dec_total = db.execute(select(func.count()).select_from(AiDecision)).scalar() or 0
    dec_eval = db.execute(select(func.count()).select_from(AiDecision).where(AiDecision.evaluated.is_(True))).scalar() or 0
    if dec_total:
        mh.append(60 + 40 * (dec_eval / dec_total))
    model_health = round(sum(mh) / len(mh), 1) if mh else None

    # risk_health
    portfolio = get_or_seed(db)
    rm = compute_metrics(db, portfolio)
    risk_health = None
    if rm.get("risk_score") is not None:
        risk_health = round(max(0.0, 100 - rm["risk_score"]), 1)
    elif rm.get("volatility") is not None:
        risk_health = round(max(0.0, 100 - min(100, (rm["volatility"] / 0.5) * 100)), 1)

    # execution_health
    total_orders = db.execute(select(func.count()).select_from(AiOrder)).scalar() or 0
    filled = db.execute(select(func.count()).select_from(AiOrder).where(AiOrder.status == "FILLED")).scalar() or 0
    execution_health = (filled / total_orders) * 100 if total_orders else 80.0

    # system_health (base OK = 100 ; dégradé si aucune donnée récente)
    if data_health is not None:
        system_health = round(min(100.0, data_health + (10 if total_orders else 0)), 1)
    else:
        system_health = 70.0

    dims = {
        "data": data_health,
        "model": model_health,
        "risk": risk_health,
        "execution": round(execution_health, 1),
        "system": system_health,
    }
    present = [v for v in dims.values() if v is not None]
    global_status = "OPERATIONAL" if present and min(present) >= 70 else (
        "DEGRADED" if present and min(present) >= 40 else "DEGRADED"
    )

    row = AiHealthSnapshot(
        date=datetime.now(timezone.utc),
        data_health=dims["data"],
        model_health=dims["model"],
        risk_health=dims["risk"],
        execution_health=dims["execution"],
        system_health=dims["system"],
        global_status=global_status,
        details={"decision_count": dec_total, "order_count": total_orders},
    )
    db.add(row)
    db.commit()
    return {"global_status": global_status, "dims": dims}
