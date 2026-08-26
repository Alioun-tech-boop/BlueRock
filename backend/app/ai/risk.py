"""Métriques de risque du portefeuille virtuel (snapshots journaliers)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AiPortfolio, AiRiskSnapshot
from .benchmark import composite_daily_returns
from .performance import performance_series
from .portfolio import get_or_seed
from .quant import (
    annualized_return,
    annualized_volatility,
    beta,
    cvar_95,
    daily_returns,
    downside_deviation,
    max_drawdown,
    risk_score,
    sharpe_ratio,
    sortino_ratio,
    var_95,
)


def compute_metrics(
    db: Session,
    portfolio: Optional[AiPortfolio] = None,
    series: Optional[list] = None,
) -> dict:
    portfolio = portfolio or get_or_seed(db)
    series = series if series is not None else performance_series(db, portfolio)
    if len(series) < 2:
        return {k: None for k in (
            "volatility", "max_drawdown", "sharpe_ratio", "sortino_ratio",
            "beta", "downside_deviation", "var_95", "cvar_95", "risk_score",
            "annualized_return",
        )}

    values = [s.value for s in series]
    dates = [s.date for s in series]
    rets = daily_returns(values)

    vol = annualized_volatility(rets)
    ann = annualized_return(rets)
    dd = max_drawdown(values)
    down = downside_deviation(rets)
    sharpe = sharpe_ratio(rets)
    sortino = sortino_ratio(rets)
    var = var_95(rets)
    cvar = cvar_95(rets)

    # bêta vs indice composite sur la même fenêtre
    b = None
    bench_rets = []
    if dates:
        start = dates[0] - timedelta(days=5)
        end = dates[-1]
        bench_rets = [r for _, r in composite_daily_returns(db, start, end) if r is not None]
        aligned = bench_rets[-len(rets):]
        if len(aligned) == len(rets):
            b = beta(rets, aligned)

    rs = risk_score(vol, b, dd)
    return {
        "volatility": vol,
        "max_drawdown": dd,
        "sharpe_ratio": sharpe,
        "sortino_ratio": sortino,
        "beta": b,
        "downside_deviation": down,
        "var_95": var,
        "cvar_95": cvar,
        "risk_score": rs,
        "annualized_return": ann,
        "observations": len(rets),
    }


def snapshot(db: Session, force: bool = False) -> dict:
    """Écrit le snapshot de risque du jour (idempotent par (portfolio, date))."""
    portfolio = get_or_seed(db)
    today = date.today()
    existing = db.execute(
        select(AiRiskSnapshot).where(
            AiRiskSnapshot.portfolio_id == portfolio.id,
            AiRiskSnapshot.date == today,
        )
    ).scalar_one_or_none()

    m = compute_metrics(db, portfolio)
    if existing is None:
        existing = AiRiskSnapshot(portfolio_id=portfolio.id, date=today)
        db.add(existing)
    existing.volatility = m["volatility"]
    existing.max_drawdown = m["max_drawdown"]
    existing.sharpe_ratio = m["sharpe_ratio"]
    existing.sortino_ratio = m["sortino_ratio"]
    existing.beta = m["beta"]
    existing.downside_deviation = m["downside_deviation"]
    existing.var_95 = m["var_95"]
    existing.cvar_95 = m["cvar_95"]
    existing.risk_score = m["risk_score"]
    db.commit()
    return m
