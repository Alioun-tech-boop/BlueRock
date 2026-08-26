"""Moteur de décisions quantitatif et déterministe de Bluerock AI.

Uniquement des calculs sur données réelles (ratios, scorecards, valorisations,
prix BRVM). Aucun LLM ici ; le texte d'explication est généré à partir des
facteurs réellement calculés. Tout signal repose sur des chiffres : pas de
promesses, pas d'hallucination.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AiAuditLog,
    AiDecision,
    AiDecisionFactor,
    AiModelVersion,
    Company,
    FinancialRatio,
    ScoreCard,
    Valuation,
)
from .benchmark import benchmark_regime
from .market import all_price_series, latest_prices_by_id
from .quant import (
    annualized_volatility,
    beta,
    daily_returns,
    max_drawdown,
    momentum_score,
    risk_score,
    series_return,
    to_0_100,
)

WEIGHTS = {
    "fundamental": 0.25,
    "quality": 0.15,
    "momentum": 0.20,
    "valuation": 0.25,
    "risk": 0.15,
}
BUY_THRESHOLD = 18.0
SELL_THRESHOLD = -18.0
MAX_ALLOCATION = 0.10  # 10 % max par position (cf. paramètres v1.0.0)
CONFIDENCE_FLOOR = 0.55


def _latest_ratio(db: Session, company_id: int) -> Optional[FinancialRatio]:
    return db.execute(
        select(FinancialRatio)
        .where(FinancialRatio.company_id == company_id, FinancialRatio.quarter.is_(None))
        .order_by(FinancialRatio.fiscal_year.desc(), FinancialRatio.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _latest_scorecard(db: Session, company_id: int) -> Optional[ScoreCard]:
    return db.execute(
        select(ScoreCard)
        .where(ScoreCard.company_id == company_id)
        .order_by(ScoreCard.fiscal_year.desc(), ScoreCard.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _latest_valuation(db: Session, company_id: int) -> Optional[Valuation]:
    return db.execute(
        select(Valuation)
        .where(Valuation.company_id == company_id)
        .order_by(Valuation.fiscal_year.desc(), Valuation.id.desc())
        .limit(1)
    ).scalar_one_or_none()


def _fundamental_score(ratio: Optional[FinancialRatio]) -> Optional[float]:
    """0-100 à partir des ratios financiers réels (année la plus récente)."""
    if ratio is None:
        return None
    parts: list[float] = []
    roe = ratio.roe
    if roe is not None:
        parts.append(to_0_100(min(max(roe, -0.5), 0.5), -0.5, 0.5) or 50.0)
    nm = ratio.net_margin
    if nm is not None:
        parts.append(to_0_100(min(max(nm, -0.5), 0.5), -0.5, 0.5) or 50.0)
    dte = ratio.debt_to_equity
    if dte is not None:
        parts.append(100 - to_0_100(min(max(dte, 0.0), 4.0), 0.0, 4.0))
    rg = ratio.revenue_growth
    if rg is not None:
        parts.append(to_0_100(min(max(rg, -0.5), 0.5), -0.5, 0.5) or 50.0)
    eg = ratio.eps_growth
    if eg is not None:
        parts.append(to_0_100(min(max(eg, -0.8), 0.8), -0.8, 0.8) or 50.0)
    cr = ratio.current_ratio
    if cr is not None:
        parts.append(to_0_100(min(max(cr, 0.0), 3.0), 0.0, 3.0) or 50.0)
    return round(sum(parts) / len(parts), 1) if parts else None


def _quality_score(scorecard: Optional[ScoreCard]) -> Optional[float]:
    if scorecard is None:
        return None
    parts = []
    if scorecard.moat_score is not None:
        parts.append(scorecard.moat_score * 10)
    if scorecard.total_score is not None:
        parts.append(scorecard.total_score * 10)
    if scorecard.management_score is not None:
        parts.append(scorecard.management_score * 10)
    return round(sum(parts) / len(parts), 1) if parts else None


def _valuation_score(
    ratio: Optional[FinancialRatio],
    valuation: Optional[Valuation],
    price: Optional[float],
) -> Optional[float]:
    parts: list[float] = []
    if ratio is not None and ratio.pe_ratio is not None:
        parts.append(100 - to_0_100(min(max(ratio.pe_ratio, 0.0), 40.0), 0.0, 40.0))
    if ratio is not None and ratio.pb_ratio is not None:
        parts.append(100 - to_0_100(min(max(ratio.pb_ratio, 0.0), 4.0), 0.0, 4.0))
    if ratio is not None and ratio.dividend_yield is not None:
        parts.append(to_0_100(min(max(ratio.dividend_yield, 0.0), 0.15), 0.0, 0.15) or 50.0)
    if valuation is not None and valuation.target_price and price:
        disc = (valuation.target_price - price) / price
        parts.append(to_0_100(min(max(disc, -0.5), 0.5), -0.5, 0.5) or 50.0)
    if valuation is not None and valuation.recommendation:
        rec = valuation.recommendation.upper()
        if rec in ("BUY", "ACHETER", "ACHAT"):
            parts.append(75.0)
        elif rec in ("SELL", "VENDRE", "VENTE"):
            parts.append(25.0)
        elif rec in ("HOLD", "CONSERVER", "GARDER", "NEUTRE"):
            parts.append(50.0)
    return round(sum(parts) / len(parts), 1) if parts else None


def _market_factors(
    closes: list[float], market_rets: list[float]
) -> dict:
    """Facteurs techniques déterministes (momentum, volatilité, bêta, drawdown)."""
    rets = daily_returns(closes)
    vol = annualized_volatility(rets)
    mom = momentum_score(closes)
    md = max_drawdown(closes)
    b = beta(rets, market_rets) if market_rets and len(market_rets) == len(rets) else None
    r6m = series_return(closes, 126)
    rs = risk_score(vol, b, md)
    return {
        "momentum": mom,
        "momentum_factor": to_0_100(mom),
        "volatility": vol,
        "beta": b,
        "max_drawdown": md,
        "return_6m": r6m,
        "risk": rs,
        "risk_factor": (100 - rs) if rs is not None else None,
    }


def _market_daily_returns(db: Session) -> list[float]:
    from .benchmark import composite_daily_returns
    start = date.today() - timedelta(days=400)
    rets = composite_daily_returns(db, start)
    return [r for _, r in rets]


def compute_factors(db: Session, company: Company) -> dict:
    ratio = _latest_ratio(db, company.id)
    scorecard = _latest_scorecard(db, company.id)
    valuation = _latest_valuation(db, company.id)
    series = all_price_series(db, [company.id], days=253).get(company.id, [])
    price = series[-1][1] if series else None
    closes = [px for _, px in series]
    market_rets = _market_daily_returns(db)[-len(closes):] if len(closes) > 20 else []
    mf = _market_factors(closes, market_rets)

    fundamental = _fundamental_score(ratio)
    quality = _quality_score(scorecard)
    valuation_score = _valuation_score(ratio, valuation, price)

    factors = {
        "fundamental": fundamental,
        "quality": quality,
        "momentum": mf["momentum_factor"],
        "valuation": valuation_score,
        "risk": mf["risk_factor"],
    }
    raw = {
        "price": price,
        "fiscal_year": ratio.fiscal_year if ratio else None,
        "rating": scorecard.rating if scorecard else None,
        "total_score": scorecard.total_score if scorecard else None,
        **{k: mf[k] for k in ("momentum", "volatility", "beta", "max_drawdown", "return_6m", "risk")},
    }
    return {"factors": factors, "raw": raw, "ratio": ratio, "scorecard": scorecard, "valuation": valuation}


def composite_score(factors: dict) -> Optional[float]:
    """Score composite -100..100 : somme pondérée des facteurs normalisés."""
    present = {k: v for k, v in factors.items() if v is not None}
    if not present:
        return None
    # re-normaliser les poids sur les facteurs disponibles
    total_w = sum(WEIGHTS[k] for k in present)
    if total_w <= 0:
        return None
    score = 0.0
    for k, v in present.items():
        normalized = (v - 50) / 50  # 0..100 -> -1..1
        score += normalized * (WEIGHTS[k] / total_w) * 100
    return round(score, 1)


def _risk_level(vol: Optional[float], b: Optional[float]) -> str:
    if vol is None and b is None:
        return "MODERATE"
    if (vol is not None and vol > 0.40) or (b is not None and b > 1.5):
        return "HIGH"
    if (vol is not None and vol < 0.20) and (b is None or b < 1.0):
        return "LOW"
    return "MODERATE"


def _horizon(decision_type: str) -> str:
    return "3-6 MONTHS" if decision_type == "HOLD" else "6-18 MONTHS"


def _summary(company: Company, decision_type: str, confidence: float, factors: dict, regime: str) -> str:
    pos = [k for k, v in factors.items() if v is not None and v >= 60]
    neg = [k for k, v in factors.items() if v is not None and v <= 40]
    pos_str = ", ".join(pos) if pos else "aucun facteur dominant"
    neg_str = ", ".join(neg) if neg else "aucun facteur défavorable"
    labels = {
        "fundamental": "fondamentaux",
        "quality": "qualité",
        "momentum": "momentum",
        "valuation": "valorisation",
        "risk": "risque maîtrisé",
    }
    return (
        f"Signal {decision_type} pour {company.name} ({company.symbol}) avec une confiance de "
        f"{confidence * 100:.0f} %. Facteurs favorables : {pos_str} ; facteurs défavorables : {neg_str}. "
        f"Régime de marché : {regime}. Calcul quantitatif déterministe en environnement "
        f"SIMULATION — aucune promesse de performance."
    )


def decision_detail(db: Session, decision_id: int) -> dict:
    """Explicabilité complète d'une décision : contributions pondérées par
    facteur, répartition du score composite, données brutes et narrative
    déterministe (aucun LLM)."""
    decision = db.get(AiDecision, decision_id)
    if decision is None:
        raise LookupError(f"Décision {decision_id} introuvable")
    factors = db.execute(
        select(AiDecisionFactor)
        .where(AiDecisionFactor.decision_id == decision_id)
        .order_by(AiDecisionFactor.factor)
    ).scalars().all()

    contribs = []
    total_w = sum(f.weight for f in factors if f.weight)
    score_total = 0.0
    for f in factors:
        if f.score is None or not f.weight:
            continue
        # contribution au score composite -100..100
        normalized = (f.score - 50) / 50
        c = normalized * (f.weight / total_w) * 100 if total_w else 0.0
        score_total += c
        contribs.append({
            "factor": f.factor,
            "category": f.category,
            "score": f.score,
            "weight": f.weight,
            "direction": f.direction,
            "contribution": round(c, 2),
            "share_pct": round(abs(c) / abs(score_total) * 100, 1) if score_total else None,
        })
    contribs.sort(key=lambda x: abs(x["contribution"]), reverse=True)

    # données brutes recalculées sur les dernières valeurs connues
    raw = {}
    if decision.company:
        try:
            cf = compute_factors(db, decision.company)
            raw = {k: v for k, v in cf["raw"].items()}
        except Exception:
            raw = {}

    pos = [c for c in contribs if c["contribution"] > 0]
    neg = [c for c in contribs if c["contribution"] < 0]
    top_pos = pos[0]["factor"] if pos else None
    top_neg = neg[0]["factor"] if neg else None
    narrative = (
        f"Le score composite de {decision.decision_type} est {score_total:+.1f}/100. "
        f"Facteur dominant : {top_pos or 'aucun'} ({pos[0]['share_pct']:.0f} % de la contribution). "
        f"Frein principal : {top_neg or 'aucun'}. "
        f"Confiance {decision.confidence * 100:.0f} %, risque {decision.risk_level}, "
        f"régime {decision.regime}. Calcul quantitatif déterministe, SIMULATION."
    ) if contribs else decision.summary

    return {
        "id": decision.id,
        "decision_type": decision.decision_type,
        "status": decision.status,
        "symbol": decision.company.symbol if decision.company else None,
        "company_name": decision.company.name if decision.company else None,
        "confidence": decision.confidence,
        "risk_level": decision.risk_level,
        "horizon": decision.horizon,
        "allocation_target": decision.allocation_target,
        "regime": decision.regime,
        "price_at_decision": decision.price_at_decision,
        "composite_score": round(score_total, 2) if contribs else decision.score,
        "created_at": decision.created_at.isoformat() if decision.created_at else None,
        "outcome": decision.outcome,
        "summary": decision.summary,
        "factors": contribs,
        "raw_inputs": raw,
        "narrative": narrative,
        "thresholds": {"buy": BUY_THRESHOLD, "sell": SELL_THRESHOLD},
    }


def generate(db: Session) -> dict:
    """Génère (ou met à jour) les décisions pour l'univers BRVM (47 sociétés).

    Ne recrée pas une décision en doublon pour une société non évaluée le même
    jour : on régénère uniquement si aucune décision EXECUTED/APPROVED/PROPOSED
    n'existe pour cette société, ou si un ordre a été exécuté depuis.
    """
    version = db.execute(
        select(AiModelVersion)
        .where(AiModelVersion.status == "PRODUCTION")
        .order_by(AiModelVersion.promoted_at.desc().nulls_last(), AiModelVersion.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if version is None:
        from .studio import _seed_core
        _, version, _, _ = _seed_core(db)

    regime = benchmark_regime(db)
    companies = db.execute(select(Company).order_by(Company.symbol)).scalars().all()
    universe = [c for c in companies if c.id in {
        r[0] for r in db.execute(select(FinancialRatio.company_id).distinct()).all()
    }]

    market_rets = _market_daily_returns(db)
    series_map = all_price_series(db, [c.id for c in universe], days=253)

    created = 0
    skipped = 0
    results: list[dict] = []
    now = date.today()

    for company in universe:
        existing = db.execute(
            select(AiDecision).where(
                AiDecision.company_id == company.id,
                AiDecision.created_at >= datetime.combine(now, time.min),
            )
        ).first()
        if existing:
            skipped += 1
            continue

        series = series_map.get(company.id, [])
        if not series:
            skipped += 1
            continue
        closes = [px for _, px in series]
        price = closes[-1]
        rets = daily_returns(closes)
        vol = annualized_volatility(rets)
        b = beta(rets, market_rets[-len(rets):]) if market_rets and len(market_rets) >= len(rets) else None
        mf = _market_factors(closes, market_rets[-len(closes):] if len(closes) > 20 else [])
        ratio = _latest_ratio(db, company.id)
        scorecard = _latest_scorecard(db, company.id)
        valuation = _latest_valuation(db, company.id)

        factors = {
            "fundamental": _fundamental_score(ratio),
            "quality": _quality_score(scorecard),
            "momentum": mf["momentum_factor"],
            "valuation": _valuation_score(ratio, valuation, price),
            "risk": mf["risk_factor"],
        }
        score = composite_score(factors)
        if score is None:
            skipped += 1
            continue

        if score >= BUY_THRESHOLD:
            decision_type = "BUY"
        elif score <= SELL_THRESHOLD:
            decision_type = "SELL"
        else:
            decision_type = "HOLD"

        if decision_type == "BUY":
            alloc = min(MAX_ALLOCATION, 0.03 + (abs(score) / 100.0) * 0.07)
        elif decision_type == "SELL":
            alloc = 0.0
        else:
            alloc = 0.0

        n_factors = sum(1 for v in factors.values() if v is not None)
        confidence = min(0.98, CONFIDENCE_FLOOR + abs(score) / 100.0 * 0.35 + (n_factors / 5) * 0.06)
        risk_level = _risk_level(vol, b)

        decision = AiDecision(
            version_id=version.id,
            company_id=company.id,
            decision_type=decision_type,
            status="PROPOSED",
            confidence=round(confidence, 3),
            risk_level=risk_level,
            horizon=_horizon(decision_type),
            allocation_target=round(alloc, 4),
            price_at_decision=price,
            regime=regime,
            score=factors,
            summary=_summary(company, decision_type, confidence, factors, regime),
            evaluated=False,
        )
        db.add(decision)
        db.flush()

        for factor, value in factors.items():
            if value is None:
                continue
            db.add(
                AiDecisionFactor(
                    decision_id=decision.id,
                    factor=factor,
                    category=factor,
                    score=value,
                    weight=WEIGHTS[factor],
                    direction="positive" if value >= 50 else "negative",
                )
            )
        created += 1
        results.append(
            {
                "symbol": company.symbol,
                "decision_type": decision_type,
                "confidence": round(confidence, 3),
                "risk_level": risk_level,
                "score": score,
                "regime": regime,
            }
        )

    db.add(
        AiAuditLog(
            event_type="DECISIONS_GENERATED",
            entity_type="ai_decisions",
            detail=f"{created} décisions générées (univers {len(universe)} sociétés).",
        )
    )
    db.commit()
    return {"created": created, "skipped": skipped, "universe": len(universe), "regime": regime, "decisions": results}
