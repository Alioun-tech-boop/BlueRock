"""Moteur d'exécution des ordres : ordres à prix futur (limit) et
take profit / stop loss.

Appelé périodiquement par le scheduler : vérifie les derniers prix de marché
et exécute les ordres en attente ainsi que les sorties conditionnelles
des positions.
"""
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.company import Company
from ..models.market import MarketData
from ..models.user import Order, Position


def _latest_prices(db: Session):
    """Dernière clôture connue par entreprise + mapping symbole → company_id."""
    cids = {sym: cid for cid, sym in db.query(Company.id, Company.symbol).all()}
    sub = (
        db.query(MarketData.company_id, func.max(MarketData.date).label("maxd"))
        .group_by(MarketData.company_id)
        .subquery()
    )
    rows = (
        db.query(MarketData.company_id, MarketData.close_price)
        .join(sub, (sub.c.company_id == MarketData.company_id) & (sub.c.maxd == MarketData.date))
        .all()
    )
    return cids, dict(rows)


def _apply(db: Session, order: Order, px: float) -> bool:
    """Exécute un ordre à px en appliquant l'effet sur la position.
    Retourne True si l'exécution a réussi, False si elle a été refusée."""
    pos = db.query(Position).filter(Position.user_id == order.user_id, Position.symbol == order.symbol).first()

    if order.side == "sell":
        if not pos or pos.qty < order.qty - 1e-9:
            order.status = "cancelled"
            return False
        remaining = pos.qty - order.qty
        if remaining <= 1e-9:
            db.delete(pos)
        else:
            pos.qty = remaining
    else:
        if not pos:
            pos = Position(user_id=order.user_id, symbol=order.symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + order.qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * order.qty)) / total_qty
        pos.qty = total_qty

    order.status = "executed"
    order.price = px
    order.executed_at = datetime.utcnow()
    return True


def run_order_engine(db: Session) -> dict:
    """Un cycle du moteur. Retourne le nombre d'exécutions."""
    cids, latest = _latest_prices(db)
    if not latest:
        return {"limit": 0, "tp_sl": 0, "cancelled": 0}

    n_limit = 0
    n_cancelled = 0

    pending = db.query(Order).filter(Order.status == "pending").all()
    for order in pending:
        cid = cids.get(order.symbol)
        px = latest.get(cid)
        if px is None:
            continue
        triggered = (
            (order.side == "buy" and px <= order.limit_price)
            or (order.side == "sell" and px >= order.limit_price)
        )
        if not triggered:
            continue
        if _apply(db, order, px):
            n_limit += 1
        else:
            n_cancelled += 1
    db.commit()

    n_tpsl = 0
    for pos in db.query(Position).filter(Position.qty > 0).all():
        cid = cids.get(pos.symbol)
        px = latest.get(cid)
        if px is None:
            continue
        hit = None
        if pos.stop_loss is not None and px <= pos.stop_loss:
            hit = "stop_loss"
        elif pos.take_profit is not None and px >= pos.take_profit:
            hit = "take_profit"
        if not hit:
            continue
        qty = pos.qty
        db.add(Order(
            user_id=pos.user_id,
            symbol=pos.symbol,
            side="sell",
            qty=qty,
            price=px,
            order_type=hit,
            status="executed",
            executed_at=datetime.utcnow(),
        ))
        db.delete(pos)
        n_tpsl += 1
    db.commit()

    return {"limit": n_limit, "tp_sl": n_tpsl, "cancelled": n_cancelled}
