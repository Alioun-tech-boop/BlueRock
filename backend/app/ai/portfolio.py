"""Portefeuille virtuel de Bluerock AI (SIMULATION uniquement).

Le portefeuille appartient au système : l'utilisateur est observateur.
La trésorerie initiale est fixe et déterministe ; aucune modification ne peut
être initiée depuis l'extérieur de l'engine.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import AiPortfolio, AiPosition
from .market import latest_prices_by_id

PORTFOLIO_NAME = "BLUEROCK AI CORE · Portefeuille"
PORTFOLIO_CURRENCY = "XOF"
INITIAL_VALUE = 25_000_000.0  # trésorerie initiale de la simulation
CASH_BUFFER = 0.05            # réserve de trésorerie cible


def _now():
    return datetime.now(timezone.utc)


def get_or_seed(db: Session) -> AiPortfolio:
    portfolio = db.execute(
        select(AiPortfolio).order_by(AiPortfolio.created_at.asc()).limit(1)
    ).scalar_one_or_none()
    if portfolio is None:
        portfolio = AiPortfolio(
            name=PORTFOLIO_NAME,
            currency=PORTFOLIO_CURRENCY,
            cash=INITIAL_VALUE,
            initial_value=INITIAL_VALUE,
        )
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    return portfolio


def mark(db: Session, portfolio: Optional[AiPortfolio] = None) -> dict:
    """Valorisation courante du portefeuille (cours réels les plus récents)."""
    portfolio = portfolio or get_or_seed(db)
    positions = db.execute(
        select(AiPosition).where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        )
    ).scalars().all()

    ids = [p.company_id for p in positions if p.company_id]
    prices = latest_prices_by_id(db, ids) if ids else {}

    invested = 0.0
    exposed = 0.0
    for p in positions:
        price = prices.get(p.company_id) or p.current_price or p.avg_price
        value = price * p.quantity
        invested += value
        if price:
            exposed += value

    cash = float(portfolio.cash or 0.0)
    value = cash + invested
    return {
        "portfolio_id": portfolio.id,
        "value": round(value, 2),
        "cash": round(cash, 2),
        "invested": round(invested, 2),
        "exposure": round((invested / value) if value else 0.0, 4),
        "positions_count": len(positions),
        "prices": prices,
    }


def reconcile(db: Session, portfolio: Optional[AiPortfolio] = None) -> None:
    """Met à jour cours courant et allocation des positions ouvertes."""
    portfolio = portfolio or get_or_seed(db)
    positions = db.execute(
        select(AiPosition).where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        )
    ).scalars().all()
    if not positions:
        return
    ids = [p.company_id for p in positions if p.company_id]
    prices = latest_prices_by_id(db, ids) if ids else {}
    total = sum(
        (prices.get(p.company_id) or p.current_price or p.avg_price or 0.0) * p.quantity
        for p in positions
    ) + float(portfolio.cash or 0.0)
    for p in positions:
        price = prices.get(p.company_id) or p.current_price or p.avg_price
        if price:
            p.current_price = price
            p.allocation_pct = round((price * p.quantity) / total, 4) if total else 0.0
    db.commit()


def apply_drift(db: Session, portfolio: Optional[AiPortfolio] = None) -> dict:
    """Clôture les positions hors cible (dérive > +50 % ou < -25 % depuis l'entrée)."""
    portfolio = portfolio or get_or_seed(db)
    positions = db.execute(
        select(AiPosition).where(
            AiPosition.portfolio_id == portfolio.id,
            AiPosition.status == "OPEN",
        )
    ).scalars().all()
    if not positions:
        return {"closed": 0}
    ids = [p.company_id for p in positions if p.company_id]
    prices = latest_prices_by_id(db, ids) if ids else {}
    closed = 0
    for p in positions:
        price = prices.get(p.company_id) or p.current_price or p.avg_price
        if not price or not p.avg_price:
            continue
        drift = (price - p.avg_price) / p.avg_price
        if drift > 0.50 or drift < -0.25:
            p.status = "CLOSED"
            p.exit_date = _now()
            portfolio.cash = (portfolio.cash or 0) + price * p.quantity
            closed += 1
    db.commit()
    return {"closed": closed}
