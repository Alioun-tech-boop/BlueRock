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
from ..scrapers.live_feed import live_feed
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
    Verrouille les lignes (FOR UPDATE) + journalise au ledger."""
    # Verrou position + portefeuille pour éviter lost update concurrent
    pos = db.query(Position).filter(
        Position.user_id == order.user_id, Position.portfolio_id == order.portfolio_id,
        Position.symbol == order.symbol
    ).with_for_update().first()

    portfolio = None
    if order.portfolio_id:
        portfolio = db.query(Portfolio).filter(Portfolio.id == order.portfolio_id).with_for_update().first()

    if order.side == "sell":
        if not pos or pos.qty < order.qty - 1e-9:
            order.status = "cancelled"
            return False
        remaining = pos.qty - order.qty
        if remaining <= 1e-9:
            db.delete(pos)
        else:
            pos.qty = remaining
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) + order.qty * px
            # Journal ledger vente
            try:
                from .ledger import journal_investment
                journal_investment(db, order.user_id, order.portfolio_id, order.symbol, "sell", order.qty, px, order.id or 0, currency=portfolio.currency or "XOF")
            except Exception as e:
                logger.warning(f"Ledger sell failed for order {order.id}: {e}")
    else:
        if portfolio and (portfolio.balance or 0) < order.qty * px - 1e-9:
            order.status = "cancelled"
            return False
        if not pos:
            pos = Position(user_id=order.user_id, portfolio_id=order.portfolio_id,
                           symbol=order.symbol, qty=0, avg_price=0)
            db.add(pos)
            db.flush()
        total_qty = pos.qty + order.qty
        # Évite division par zéro si pos créée vide
        if total_qty > 0:
            pos.avg_price = ((pos.avg_price * pos.qty) + (px * order.qty)) / total_qty
        pos.qty = total_qty
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) - order.qty * px
            try:
                from .ledger import journal_investment
                journal_investment(db, order.user_id, order.portfolio_id, order.symbol, "buy", order.qty, px, order.id or 0, currency=portfolio.currency or "XOF")
            except Exception as e:
                logger.warning(f"Ledger buy failed for order {order.id}: {e}")

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

    market_open = live_feed.in_market_hours()
    now = datetime.utcnow()

    # Pagination: limite 500 ordres par cycle pour éviter OOM si backlog
    pending = db.query(Order).filter(Order.status == "pending").order_by(Order.id.asc()).limit(500).all()
    for order in pending:
        # Expiration des ordres à cours limité
        if order.valid_until is not None and order.valid_until <= now:
            order.status = "cancelled"
            n_cancelled += 1
            continue
        # Les ordres ne s'exécutent qu'en séance
        if not market_open:
            continue
        cid = cids.get(order.symbol)
        px = latest.get(cid)
        if px is None:
            continue
        if order.order_type == "market":
            # Ordre au marché placé hors séance : exécution au prix du marché
            if _apply(db, order, px):
                n_limit += 1
                if order.portfolio_id:
                    touched.add(order.portfolio_id)
            else:
                n_cancelled += 1
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
    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Order engine commit failed")
    for pf_id in list(touched)[:20]:
        try:
            pf = db.query(Portfolio).filter(Portfolio.id == pf_id).first()
            if pf:
                sync_broker_account(db, pf)
        except Exception as e:
            logger.warning(f"Broker sync failed for pf {pf_id}: {e}")
    if touched:
        try:
            db.commit()
        except Exception:
            db.rollback()

    n_tpsl = 0
    # TP/SL: ne scanne que les positions avec TP/SL définis (évite scan 100k)
    tpsl_positions = db.query(Position).filter(
        Position.qty > 0,
        (Position.stop_loss.isnot(None)) | (Position.take_profit.isnot(None))
    ).limit(2000).with_for_update(skip_locked=True).all()
    for pos in tpsl_positions:
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
            portfolio = db.query(Portfolio).filter(Portfolio.id == pos.portfolio_id).with_for_update().first()
        if portfolio:
            portfolio.balance = (portfolio.balance or 0) + qty * px
            try:
                from .ledger import journal_investment
                # Utilise un id temporaire; sera mis à jour après création order
                journal_investment(db, pos.user_id, pos.portfolio_id, pos.symbol, "sell", qty, px, 0, currency=portfolio.currency or "XOF")
            except Exception as e:
                logger.warning(f"Ledger TP/SL failed for {pos.symbol}: {e}")
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
    if n_tpsl:
        db.commit()
    # Sync broker hors transaction principale
    for pf_id in list(touched)[-20:]:  # limite 20 sync par cycle
        try:
            pf = db.query(Portfolio).filter(Portfolio.id == pf_id).first()
            if pf:
                sync_broker_account(db, pf)
        except Exception as e:
            logger.warning(f"Broker sync failed for pf {pf_id}: {e}")
    if touched:
        try:
            db.commit()
        except Exception:
            db.rollback()

    return {"limit": n_limit, "tp_sl": n_tpsl, "cancelled": n_cancelled,
            "realtime": realtime}
