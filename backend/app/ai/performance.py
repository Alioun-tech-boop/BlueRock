"""Snapshots de performance journaliers du portefeuille virtuel."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AiPerformanceSnapshot, AiPortfolio
from .benchmark import composite_index
from .portfolio import get_or_seed, mark
from .quant import max_drawdown, pct_change, series_return


def performance_series(db: Session, portfolio: Optional[AiPortfolio] = None) -> list[AiPerformanceSnapshot]:
    portfolio = portfolio or get_or_seed(db)
    return db.execute(
        select(AiPerformanceSnapshot)
        .where(AiPerformanceSnapshot.portfolio_id == portfolio.id)
        .order_by(AiPerformanceSnapshot.date.asc())
    ).scalars().all()


def benchmark_normalized(
    db: Session, start: date, base_value: float
) -> list[tuple[date, float]]:
    """Indice composite normalisé : vaut base_value à la date `start`.

    Le marché ne cote pas tous les jours : on prend la dernière valeur de
    l'indice strictement antérieure ou égale à `start` comme base, puis on
    renormalise les points suivants.
    """
    buffered = start - timedelta(days=45)
    idx = composite_index(db, buffered)
    base_level = None
    anchor_date = None
    for d, v in idx:
        if d <= start:
            anchor_date = d
            base_level = v
        else:
            break
    if base_level is None or base_level <= 0 or anchor_date is None:
        return []
    out = [(anchor_date, round(base_value, 2))]
    for d, v in idx:
        if d > anchor_date:
            out.append((d, round(base_value * v / base_level, 2)))
    return out


def snapshot(db: Session, force: bool = False) -> dict:
    """Crée ou met à jour le snapshot du jour (idempotent par (portfolio, date))."""
    portfolio = get_or_seed(db)
    today = date.today()
    existing = db.execute(
        select(AiPerformanceSnapshot).where(
            AiPerformanceSnapshot.portfolio_id == portfolio.id,
            AiPerformanceSnapshot.date == today,
        )
    ).scalar_one_or_none()

    mkt = mark(db, portfolio)
    value = mkt["value"]
    cash = mkt["cash"]
    invested = mkt["invested"]

    series = performance_series(db, portfolio)
    values = [s.value for s in series] + [value]
    prev_value = series[-1].value if series else None
    return_1d = pct_change(prev_value, value) if prev_value else None
    return_launch = pct_change(portfolio.initial_value or 0.0, value)
    dd = max_drawdown(values)

    launch = series[0].date if series else (portfolio.created_at.date() if portfolio.created_at else today)
    if isinstance(launch, datetime):
        launch = launch.date()
    bench_series = benchmark_normalized(db, launch, portfolio.initial_value or 0.0)
    bench_value = bench_series[-1][1] if bench_series else None

    if existing is None:
        row = AiPerformanceSnapshot(
            portfolio_id=portfolio.id,
            date=today,
            value=round(value, 2),
            cash=round(cash, 2),
            invested=round(invested, 2),
            benchmark_value=round(bench_value, 2) if bench_value else None,
            return_1d=round(return_1d, 6) if return_1d is not None else None,
            return_since_launch=round(return_launch, 6) if return_launch is not None else None,
            drawdown=round(dd, 6) if dd is not None else None,
        )
        db.add(row)
    else:
        existing.value = round(value, 2)
        existing.cash = round(cash, 2)
        existing.invested = round(invested, 2)
        existing.benchmark_value = round(bench_value, 2) if bench_value else None
        existing.return_1d = round(return_1d, 6) if return_1d is not None else None
        existing.return_since_launch = round(return_launch, 6) if return_launch is not None else None
        existing.drawdown = round(dd, 6) if dd is not None else None
    db.commit()
    return {
        "date": today.isoformat(),
        "value": round(value, 2),
        "cash": round(cash, 2),
        "invested": round(invested, 2),
        "benchmark_value": round(bench_value, 2) if bench_value else None,
        "return_1d": return_1d,
        "return_since_launch": return_launch,
        "drawdown": dd,
        "benchmark_return": (
            series_return([v for _, v in bench_series]) if bench_series else None
        ),
    }


def aggregate(
    db: Session, portfolio: Optional[AiPortfolio] = None, series: Optional[list[AiPerformanceSnapshot]] = None
) -> dict:
    """Synthèse de performance exposée à l'API (None = N/A)."""
    portfolio = portfolio or get_or_seed(db)
    series = series if series is not None else performance_series(db, portfolio)
    if not series:
        return {
            "since_launch": None, "return_1d": None, "return_1w": None,
            "return_1m": None, "return_3m": None, "return_6m": None,
            "return_ytd": None, "return_1y": None, "return_annualized": None,
            "current_value": None, "points": [],
        }
    last = series[-1]
    points = [
        {"date": s.date.isoformat(), "value": s.value, "benchmark": s.benchmark_value}
        for s in series
    ]
    values = [s.value for s in series]
    dates = [s.date for s in series]

    def ret(days):
        target = dates[-1] - timedelta(days=days)
        idx = next((i for i, d in enumerate(dates) if d >= target), 0)
        return pct_change(values[idx], values[-1]) if values[idx] else None

    def ret_since(target_date):
        idx = next((i for i, d in enumerate(dates) if d >= target_date), 0)
        return pct_change(values[idx], values[-1]) if values[idx] else None

    jan1 = dates[-1].replace(month=1, day=1)
    return {
        "since_launch": last.return_since_launch,
        "return_1d": last.return_1d,
        "return_1w": ret(7),
        "return_1m": ret(30),
        "return_3m": ret(90),
        "return_6m": ret(180),
        "return_ytd": ret_since(jan1),
        "return_1y": ret(365),
        "return_annualized": (
            (1 + last.return_since_launch) ** (365.25 / max(1, (dates[-1] - dates[0]).days)) - 1
            if last.return_since_launch is not None and (dates[-1] - dates[0]).days > 0
            else None
        ),
        "current_value": last.value,
        "points": points[-120:],
    }
