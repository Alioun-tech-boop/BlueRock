"""Moteur d'exécution des ordres : ordres à prix futur (limit) et
take profit / stop loss.

Appelé périodiquement par le scheduler : vérifie les derniers prix de marché
et exécute les ordres en attente ainsi que les sorties conditionnelles
des positions.
"""
from datetime import datetime
import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.company import Company
from ..models.market import MarketData
from ..models.user import Order, Position, Portfolio
from .broker_sync import broker_ref_for, sync_broker_account

logger = logging.getLogger(__name__)


def _latest_prices(db: Session):
    """Dernier prix connu par entreprise, temps réel en priorité :
    flux BRVM live (cache mémoire, rafraîchi toutes les 30 s en séance)
    sinon dernière clôture en base.
    Retourne (cids, latest, realtime) où realtime = nb de prix live."""
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
    latest = dict(rows)
    realtime = 0
    try:
        from ..scrapers.live_feed import live_feed
        snap = live_feed.snapshot()
        for sym, info in (snap.get("prices") or {}).items():
            cid = cids.get(sym)
            px = (info or {}).get("price")
            if cid and px:
                latest[cid] = float(px)
                realtime += 1
    except Exception as e:
        logger.warning(f"Order engine: live feed unavailable ({e})")
    try:
        from ..scrapers.ngx_feed import ngx_live_feed
        snap = ngx_live_feed.snapshot()
        for sym, info in (snap.get("prices") or {}).items():
            cid = cids.get(sym)
            px = (info or {}).get("price")
            if cid and px:
                latest[cid] = float(px)
                realtime += 1
    except Exception as e:
        logger.warning(f"Order engine: ngx live feed unavailable ({e})")
    return cids, latest, realtime


def _apply(db: Session, order: Order, px: float) -> bool:
    """Exécute un ordre à px en appliquant l'effet sur la position et le solde.
    Retourne True si l'exécution a réussi, False si elle a été refusée."""
    pos = db.query(Position).filter(
        Position.user_id == order.user_id, Position.portfolio_id == order.portfolio_id,
        Position.symbol == order.symbol
    ).first()

    if order.side == "sell":
        if not pos or pos.qty < order.qty - 1e-9:
            order.status = "cancelled"
            return False
        remaining = pos.qty - order.qty
        if remaining <= 1e-9:
            db.delete(pos)
        else:
            pos.qty = remaining
        portfolio = None
        if order.portfolio_id:
            portfolio = db.query(Portfolio).filter(Portfolio.id == order.portfolio_id).first()
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) + order.qty * px
    else:
        portfolio = None
        if order.portfolio_id:
            portfolio = db.query(Portfolio).filter(Portfolio.id == order.portfolio_id).first()
        if portfolio and (portfolio.balance or 0) < order.qty * px - 1e-9:
            order.status = "cancelled"
            return False
        if not pos:
            pos = Position(user_id=order.user_id, portfolio_id=order.portfolio_id,
                           symbol=order.symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + order.qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * order.qty)) / total_qty
        pos.qty = total_qty
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) - order.qty * px

    order.status = "executed"
    order.price = px
    order.executed_at = datetime.utcnow()
    if portfolio and portfolio.broker_client_id:
        order.broker_ref = broker_ref_for(portfolio)
    return True


def run_order_engine(db: Session) -> dict:
    """Un cycle du moteur. Retourne le nombre d'exécutions."""
    cids, latest, realtime = _latest_prices(db)
    if not latest:
        return {"limit": 0, "tp_sl": 0, "cancelled": 0, "realtime": realtime}

    if realtime:
        logger.info(f"Order engine: {realtime} prix temps réel (flux BRVM)")

    n_limit = 0
    n_cancelled = 0
    touched: set[int] = set()

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
            if order.portfolio_id:
                touched.add(order.portfolio_id)
        else:
            n_cancelled += 1
    db.commit()
    for pf_id in touched:
        pf = db.query(Portfolio).filter(Portfolio.id == pf_id).first()
        sync_broker_account(db, pf)
    if touched:
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
        if pos.portfolio_id:
            touched.add(pos.portfolio_id)
        portfolio = None
        if pos.portfolio_id:
            portfolio = db.query(Portfolio).filter(Portfolio.id == pos.portfolio_id).first()
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) + qty * px
        order = Order(
            user_id=pos.user_id,
            portfolio_id=pos.portfolio_id,
            symbol=pos.symbol,
            side="sell",
            qty=qty,
            price=px,
            order_type=hit,
            status="executed",
            executed_at=datetime.utcnow(),
            broker_ref=broker_ref_for(portfolio) if portfolio and portfolio.broker_client_id else None,
        )
        db.add(order)
        db.delete(pos)
        n_tpsl += 1
    db.commit()
    for pf_id in touched:
        pf = db.query(Portfolio).filter(Portfolio.id == pf_id).first()
        sync_broker_account(db, pf)
    if touched:
        db.commit()

    return {"limit": n_limit, "tp_sl": n_tpsl, "cancelled": n_cancelled,
            "realtime": realtime}
