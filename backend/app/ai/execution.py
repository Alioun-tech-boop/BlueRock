"""Simulation d'exécution des décisions (ordres + exécutions, SIMULATION).

Chaque décision approuvée devient un ordre, exécuté au dernier cours connu avec
un slippage et des frais fixes déterministes. Le portefeuille virtuel est
modifié en conséquence. Aucune exécution réelle n'a lieu.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import (
    AiAuditLog,
    AiDecision,
    AiExecution,
    AiOrder,
    AiPortfolio,
    AiPosition,
)
from .market import latest_prices_by_id
from .portfolio import get_or_seed, reconcile

FEE_PCT = 0.002    # 20 bps (cf. transaction_fee_pct v1.0.0)
SLIPPAGE = 0.001   # 10 bps (cf. slippage_bps v1.0.0)


def _now():
    return datetime.now(timezone.utc)


def approve_and_execute(db: Session) -> dict:
    """Approuve et exécute les décisions PROPOSED restées sans ordre."""
    portfolio = get_or_seed(db)
    decisions = db.execute(
        select(AiDecision)
        .where(AiDecision.status == "PROPOSED")
        .order_by(AiDecision.created_at.asc())
        .limit(60)
    ).scalars().all()
    if not decisions:
        return {"executed": 0, "orders": 0}

    ids = [d.company_id for d in decisions if d.company_id]
    prices = latest_prices_by_id(db, ids) if ids else {}

    orders_created = 0
    executed = 0
    skipped = 0
    for decision in decisions:
        decision.status = "APPROVED"
        db.flush()
        price = prices.get(decision.company_id) if decision.company_id else None
        if price is None:
            decision.status = "EXECUTED"  # pas de prix → pas d'action possible
            executed += 1
            continue

        side = "BUY" if decision.decision_type == "BUY" else (
            "SELL" if decision.decision_type == "SELL" else None
        )
        if side is None:
            decision.status = "EXECUTED"  # HOLD : aucune action
            executed += 1
            continue

        quantity = 0
        limit_price = price
        if side == "BUY":
            budget = (decision.allocation_target or 0.0) * float(portfolio.cash or 0.0)
            unit_cost = price * (1 + SLIPPAGE) * (1 + FEE_PCT)
            quantity = int(budget / unit_cost) if unit_cost > 0 else 0
            if quantity <= 0:
                decision.status = "REJECTED"
                skipped += 1
                continue
            if unit_cost * quantity > float(portfolio.cash or 0.0):
                quantity = int(float(portfolio.cash or 0.0) / unit_cost)
                if quantity <= 0:
                    decision.status = "REJECTED"
                    skipped += 1
                    continue
        else:
            position = db.execute(
                select(AiPosition).where(
                    AiPosition.portfolio_id == portfolio.id,
                    AiPosition.company_id == decision.company_id,
                    AiPosition.status == "OPEN",
                )
            ).scalar_one_or_none()
            if position is None or position.quantity <= 0:
                decision.status = "EXECUTED"  # rien à vendre
                executed += 1
                continue
            quantity = int(position.quantity)

        order = AiOrder(
            portfolio_id=portfolio.id,
            decision_id=decision.id,
            company_id=decision.company_id,
            side=side,
            symbol=decision.company.symbol if decision.company else "?",
            quantity=quantity,
            limit_price=round(limit_price, 2),
            status="FILLED",
            environment="SIMULATION",
            reason=f"Exécution de la décision {decision.decision_type} "
                   f"(confiance {decision.confidence:.0f} %).",
        )
        db.add(order)
        db.flush()

        exec_price = price * (1 + SLIPPAGE) if side == "BUY" else price * (1 - SLIPPAGE)
        fee = exec_price * quantity * FEE_PCT
        db.add(
            AiExecution(
                order_id=order.id,
                price=round(exec_price, 4),
                quantity=quantity,
                fee=round(fee, 2),
                slippage=round(abs(exec_price - price), 4),
            )
        )

        if side == "BUY":
            cost = exec_price * quantity + fee
            portfolio.cash = float(portfolio.cash or 0.0) - cost
            pos = db.execute(
                select(AiPosition).where(
                    AiPosition.portfolio_id == portfolio.id,
                    AiPosition.company_id == decision.company_id,
                )
            ).scalar_one_or_none()
            if pos is None:
                pos = AiPosition(
                    portfolio_id=portfolio.id,
                    company_id=decision.company_id,
                    symbol=decision.company.symbol if decision.company else "?",
                    quantity=quantity,
                    avg_price=exec_price,
                    current_price=exec_price,
                    sector=decision.company.sector.value if decision.company and decision.company.sector else None,
                    status="OPEN",
                )
                db.add(pos)
            else:
                total_qty = pos.quantity + quantity
                pos.avg_price = (
                    (pos.avg_price * pos.quantity + exec_price * quantity) / total_qty
                    if total_qty else exec_price
                )
                pos.quantity = total_qty
                pos.status = "OPEN"
                pos.exit_date = None
                pos.current_price = exec_price
        else:
            proceeds = exec_price * quantity - fee
            portfolio.cash = float(portfolio.cash or 0.0) + proceeds
            pos = db.execute(
                select(AiPosition).where(
                    AiPosition.portfolio_id == portfolio.id,
                    AiPosition.company_id == decision.company_id,
                    AiPosition.status == "OPEN",
                )
            ).scalar_one_or_none()
            if pos is not None:
                pos.quantity = max(0, pos.quantity - quantity)
                pos.status = "CLOSED" if pos.quantity <= 0 else pos.status
                pos.exit_date = _now() if pos.quantity <= 0 else pos.exit_date

        decision.status = "EXECUTED"
        orders_created += 1
        executed += 1
        db.flush()

    reconcile(db, portfolio)
    db.add(
        AiAuditLog(
            event_type="ORDERS_EXECUTED",
            entity_type="ai_orders",
            detail=f"{orders_created} ordres exécutés, {skipped} rejetés.",
        )
    )
    db.commit()
    return {"executed": executed, "orders": orders_created, "skipped": skipped}
