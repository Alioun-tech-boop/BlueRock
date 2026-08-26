"""Risk Engine étendu : stress tests, corrélation, concentration, limites.

Tout est calculé sur données réelles, de façon déterministe et documentée.
Les limites de risque sont configurables (AiRiskConfig) et servent au déclencheur
d'alertes. Aucune valeur n'est inventée : un indicateur non calculable est None.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AiPosition,
    AiRiskConfig,
    AiStressTest,
    AiPortfolio,
)
from .market import all_price_series
from .portfolio import get_or_seed, mark
from .quant import correlation, herfindahl
from .risk import compute_metrics

DEFAULT_LIMITS = {
    "max_position_pct": 0.10,
    "max_sector_pct": 0.25,
    "max_volatility": 0.40,
    "max_var_95": 0.30,
    "max_cvar_95": 0.45,
    "max_drawdown": 0.35,
    "max_beta": 1.50,
    "max_concentration_hhi": 0.35,
    "max_correlation": 0.80,
}

# Scénarios de stress documentés (mouvements de marché plausibles pour la BRVM).
STRESS_SCENARIOS = [
    {
        "code": "MARKET_CRASH",
        "name": "Krach de marché",
        "market_move": -0.25,
        "vol_multiplier": 1.0,
        "description": "Chute généralisée de l'indice BRVM (-25 %), équivalent des pires corrections historiques.",
    },
    {
        "code": "GLOBAL_SELLOFF",
        "name": "Vente généralisée",
        "market_move": -0.15,
        "vol_multiplier": 1.5,
        "description": "Sortie de capitaux mondiaux : -15 % sur le marché et volatilité ×1,5.",
    },
    {
        "code": "RATES_HIKE",
        "name": "Hausse des taux",
        "market_move": -0.08,
        "vol_multiplier": 1.2,
        "description": "Remontée des taux BCEAO (+300 pbs) pénalisant les valorisations à fort rendement.",
    },
    {
        "code": "REGIONAL_SHOCK",
        "name": "Choc sous-régional",
        "market_move": -0.30,
        "vol_multiplier": 1.5,
        "description": "Choc économique sous-régional (sécurité, matières premières) : indice à -30 %.",
    },
    {
        "code": "LIQUIDITY_CRUNCH",
        "name": "Crise de liquidité",
        "market_move": -0.10,
        "vol_multiplier": 2.0,
        "description": "Volumes asséchés : décote de sortie sur les positions concentrées.",
    },
]


def _now():
    return datetime.now(timezone.utc)


def get_limits(db: Session) -> dict:
    cfg = db.execute(
        select(AiRiskConfig)
        .where(AiRiskConfig.active.is_(True))
        .order_by(AiRiskConfig.updated_at.desc())
    ).scalars().first()
    if cfg is None:
        cfg = AiRiskConfig(name="DEFAULT", limits=dict(DEFAULT_LIMITS), active=True)
        db.add(cfg)
        db.commit()
        return dict(DEFAULT_LIMITS)
    return {**DEFAULT_LIMITS, **(cfg.limits or {})}


def set_limits(db: Session, limits: dict) -> dict:
    cfg = db.execute(
        select(AiRiskConfig)
        .where(AiRiskConfig.active.is_(True))
        .order_by(AiRiskConfig.updated_at.desc())
    ).scalars().first()
    merged = {**DEFAULT_LIMITS, **limits}
    merged = {k: v for k, v in merged.items() if isinstance(v, (int, float))}
    if cfg is None:
        cfg = AiRiskConfig(name="DEFAULT", limits=merged, active=True)
        db.add(cfg)
    else:
        cfg.limits = merged
        cfg.updated_at = _now()
    db.commit()
    return merged


def sector_exposure(db: Session, portfolio: Optional[AiPortfolio] = None) -> dict:
    """Poids par secteur des positions ouvertes + concentration (HHI)."""
    portfolio = portfolio or get_or_seed(db)
    positions = db.execute(
        select(AiPosition).where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        )
    ).scalars().all()
    if not positions:
        return {"sectors": [], "hhi": None, "top_sector": None, "n_positions": 0}
    by_sector: dict[str, float] = {}
    for p in positions:
        w = p.allocation_pct or 0.0
        if p.sector:
            by_sector[p.sector] = by_sector.get(p.sector, 0.0) + w
    rows = [
        {"sector": s, "weight": round(w, 4)}
        for s, w in sorted(by_sector.items(), key=lambda x: x[1], reverse=True)
    ]
    hhi = herfindahl([w for _, w in by_sector.items()])
    return {
        "sectors": rows,
        "hhi": hhi,
        "top_sector": rows[0]["sector"] if rows else None,
        "top_sector_weight": rows[0]["weight"] if rows else None,
        "n_positions": len(positions),
    }


def _position_price_series(db: Session, portfolio: AiPortfolio) -> dict[int, list[tuple[date, float]]]:
    cids = [
        p.company_id for p in db.execute(
            select(AiPosition).where(
                AiPosition.portfolio_id == portfolio.id,
                AiPosition.status == "OPEN",
            )
        ).scalars()
        if p.company_id
    ]
    if not cids:
        return {}
    return all_price_series(db, cids, days=126)


def correlation_summary(db: Session, portfolio: Optional[AiPortfolio] = None) -> dict:
    """Corrélation moyenne et paire extrême entre positions (126 derniers jours)."""
    portfolio = portfolio or get_or_seed(db)
    series = _position_price_series(db, portfolio)
    if len(series) < 2:
        return {"avg_correlation": None, "max_pair": None, "n_series": len(series), "observations": 0}

    # rendements alignés sur dates communes
    date_sets = [set(d for d, _ in s) for s in series.values()]
    common = set.intersection(*date_sets) if date_sets else set()
    common = sorted(common)
    if len(common) < 20:
        return {"avg_correlation": None, "max_pair": None, "n_series": len(series), "observations": len(common)}

    rets: dict[int, dict[date, float]] = {}
    for cid, s in series.items():
        prev = None
        for d, px in s:
            if d in common and prev is not None and px and prev[1]:
                rets.setdefault(cid, {})[d] = (px - prev[1]) / prev[1]
            prev = (d, px)

    ids = list(series.keys())
    pairs: list[tuple[float, str]] = []
    total = 0.0
    n = 0
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a = [rets[ids[i]].get(d) for d in common if d in rets[ids[i]] and d in rets[ids[j]]]
            b = [rets[ids[j]].get(d) for d in common if d in rets[ids[i]] and d in rets[ids[j]]]
            if len(a) < 20:
                continue
            c = correlation(a, b)
            if c is not None:
                pairs.append((c, f"{ids[i]}:{ids[j]}"))
                total += c
                n += 1
    if not pairs:
        return {"avg_correlation": None, "max_pair": None, "n_series": len(series), "observations": len(common)}
    worst = max(pairs, key=lambda x: abs(x[0]))
    return {
        "avg_correlation": round(total / n, 4),
        "max_pair": {"pair": worst[1], "correlation": round(worst[0], 4)},
        "n_pairs": n,
        "n_series": len(series),
        "observations": len(common),
    }


def run_stress_tests(
    db: Session, portfolio: Optional[AiPortfolio] = None, persist: bool = True,
    metrics: Optional[dict] = None, expo: Optional[dict] = None,
) -> dict:
    """Impact estimé du portefeuille sous chaque scénario.

    Méthode (documentée, déterministe) :
    - impact marché = exposition investie × mouvement du scénario × bêta (ou 1 si absent) ;
    - majoration de volatilité : la VaR journalière du portefeuille est portée au
      multiplicateur du scénario ;
    - majoration de liquidité : si la concentration (HHI) est forte, une décote
      de sortie s'ajoute au scénario LIQUIDITY_CRUNCH.
    """
    portfolio = portfolio or get_or_seed(db)
    mkt = mark(db, portfolio)
    value = mkt["value"]
    exposure = mkt["exposure"] or 0.0

    metrics = metrics if metrics is not None else compute_metrics(db, portfolio)
    beta_p = metrics.get("beta") or 1.0
    var_p = metrics.get("var_95") or 0.0
    expo = expo if expo is not None else sector_exposure(db, portfolio)
    hhi = expo.get("hhi") or 0.0

    results = []
    for sc in STRESS_SCENARIOS:
        vol_mult = sc["vol_multiplier"]
        impact_pct = exposure * sc["market_move"] * beta_p
        if sc["code"] == "LIQUIDITY_CRUNCH" and hhi and hhi > 0.3:
            impact_pct -= 0.05 * (hhi - 0.3) * 5  # décote de liquidité croissante
        impact_pct = round(impact_pct, 4)
        var_scenario = round(var_p * vol_mult, 4) if var_p else None
        results.append({
            "code": sc["code"],
            "name": sc["name"],
            "description": sc["description"],
            "market_move": sc["market_move"],
            "vol_multiplier": vol_mult,
            "impact_pct": impact_pct,
            "impact_amount": round(value * impact_pct, 2),
            "var_95_scenario": var_scenario,
            "severity": "CRITICAL" if impact_pct <= -0.20 else ("WARNING" if impact_pct <= -0.10 else "INFO"),
        })
        if persist:
            db.add(AiStressTest(
                scenario=sc["code"],
                date=date.today(),
                impact_pct=impact_pct,
                impact_amount=round(value * impact_pct, 2),
                metrics={"beta": beta_p, "var_95": var_p, "exposure": exposure, "vol_multiplier": vol_mult},
            ))
    if persist:
        db.commit()
    return {"as_of": date.today().isoformat(), "value": value, "scenarios": results}


def check_limits(
    db: Session, portfolio: Optional[AiPortfolio] = None,
    metrics: Optional[dict] = None, expo: Optional[dict] = None,
    corr: Optional[dict] = None,
) -> dict:
    """Compare les métriques courantes aux limites configurées."""
    portfolio = portfolio or get_or_seed(db)
    limits = get_limits(db)
    m = metrics if metrics is not None else compute_metrics(db, portfolio)
    expo = expo if expo is not None else sector_exposure(db, portfolio)
    corr = corr if corr is not None else correlation_summary(db, portfolio)

    positions = db.execute(
        select(AiPosition).where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        )
    ).scalars().all()
    max_pos = max((p.allocation_pct or 0.0 for p in positions), default=None)

    current = {
        "max_position_pct": max_pos,
        "max_sector_pct": expo.get("top_sector_weight"),
        "max_volatility": m.get("volatility"),
        "max_var_95": m.get("var_95"),
        "max_cvar_95": m.get("cvar_95"),
        "max_drawdown": abs(m.get("max_drawdown")) if m.get("max_drawdown") is not None else None,
        "max_beta": m.get("beta"),
        "max_concentration_hhi": expo.get("hhi"),
        "max_correlation": corr.get("avg_correlation"),
    }

    breaches = []
    for dim, limit in limits.items():
        cur = current.get(dim)
        if cur is None:
            continue
        if cur > limit:
            ratio = cur / limit
            severity = "CRITICAL" if ratio >= 1.5 else "WARNING"
            breaches.append({
                "dimension": dim,
                "limit": limit,
                "current": cur,
                "ratio": round(ratio, 2),
                "severity": severity,
            })
    status = "BREACH" if any(b["severity"] == "CRITICAL" for b in breaches) else (
        "WARNING" if breaches else "OK"
    )
    return {
        "status": status,
        "limits": limits,
        "current": current,
        "breaches": breaches,
        "as_of": date.today().isoformat(),
    }


def risk_analysis(
    db: Session,
    portfolio: Optional[AiPortfolio] = None,
    series: Optional[list] = None,
) -> dict:
    """Agrégat complet du Risk Engine (métriques + stress + concentration + limites)."""
    from .risk import compute_metrics
    portfolio = portfolio or get_or_seed(db)
    metrics = compute_metrics(db, portfolio, series)
    expo = sector_exposure(db, portfolio)
    corr = correlation_summary(db, portfolio)
    return {
        **metrics,
        "stress_tests": run_stress_tests(db, portfolio, persist=False, metrics=metrics, expo=expo)["scenarios"],
        "sector_exposure": expo,
        "correlation": corr,
        "limits": check_limits(db, portfolio, metrics=metrics, expo=expo, corr=corr),
        "as_of": date.today().isoformat(),
    }
