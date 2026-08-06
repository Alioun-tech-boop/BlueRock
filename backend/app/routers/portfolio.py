from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, Position, Order
from .auth import get_current_user

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

DEMO_INVEST_LIMIT = 100_000_000  # 100 millions FCFA de capacité d'investissement démo


def demo_capacity_used(db: Session, user_id: int) -> float:
    """Montant investi = valeur d'achat des positions + ordres d'achat en attente."""
    pos_total = db.query(Position).filter(Position.user_id == user_id).all()
    invested = sum((p.qty or 0) * (p.avg_price or 0) for p in pos_total if p.qty > 0)
    pending_buys = db.query(Order).filter(
        Order.user_id == user_id, Order.side == "buy", Order.status == "pending"
    ).all()
    invested += sum((o.qty or 0) * (o.limit_price or o.price or 0) for o in pending_buys)
    return invested


def demo_capacity_payload(db: Session, user_id: int) -> dict:
    used = demo_capacity_used(db, user_id)
    return {
        "demo_limit": DEMO_INVEST_LIMIT,
        "demo_used": round(used, 2),
        "demo_remaining": round(max(DEMO_INVEST_LIMIT - used, 0), 2),
    }


class OrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    side: str  # buy | sell
    qty: float = Field(gt=0)
    price: float = Field(gt=0)
    order_type: str = "market"  # market | limit
    limit_price: float | None = None
    take_profit: float | None = None
    stop_loss: float | None = None


def _position_out(p: Position):
    return {
        "symbol": p.symbol,
        "qty": p.qty,
        "avg_price": p.avg_price,
        "take_profit": p.take_profit,
        "stop_loss": p.stop_loss,
    }


def _order_out(o: Order):
    return {
        "id": o.id,
        "symbol": o.symbol,
        "side": o.side,
        "qty": o.qty,
        "price": o.price,
        "order_type": o.order_type,
        "limit_price": o.limit_price,
        "status": o.status,
        "take_profit": o.take_profit,
        "stop_loss": o.stop_loss,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "executed_at": o.executed_at.isoformat() if o.executed_at else None,
    }


def _validate_tpsl(side: str, exec_px: float, tp, sl):
    """Valide la cohérence TP/SL par rapport au prix d'exécution estimé."""
    if tp is not None and tp <= 0:
        raise HTTPException(status_code=422, detail="Take profit invalide")
    if sl is not None and sl <= 0:
        raise HTTPException(status_code=422, detail="Stop loss invalide")
    if tp is not None and tp <= exec_px:
        raise HTTPException(status_code=422, detail="Le take profit doit être supérieur au prix d'exécution")
    if sl is not None and sl >= exec_px:
        raise HTTPException(status_code=422, detail="Le stop loss doit être inférieur au prix d'exécution")


def _execute(db: Session, user_id: int, symbol: str, side: str, qty: float, px: float, order: Order | None = None):
    """Applique l'exécution d'un ordre sur la position (logique du moteur)."""
    pos = db.query(Position).filter(Position.user_id == user_id, Position.symbol == symbol).first()

    if side == "sell":
        if not pos or pos.qty < qty - 1e-9:
            if order:
                order.status = "cancelled"
            return {"error": "insufficient"}
        remaining = pos.qty - qty
        if remaining <= 1e-9:
            db.delete(pos)
            pos_out = {"symbol": symbol, "qty": 0, "avg_price": 0, "take_profit": None, "stop_loss": None}
        else:
            pos.qty = remaining
            pos_out = _position_out(pos)
    else:
        if not pos:
            pos = Position(user_id=user_id, symbol=symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * qty)) / total_qty
        pos.qty = total_qty
        pos_out = _position_out(pos)

    db.flush()

    if order:
        order.status = "executed"
        order.price = px
        order.executed_at = datetime.utcnow()
    return {"position": pos_out}


@router.get("")
def get_portfolio(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    positions = db.query(Position).filter(Position.user_id == user.id).all()
    orders = db.query(Order).filter(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100).all()
    return {
        "account_type": user.account_type,
        "broker_name": user.broker_name,
        "broker_account": user.broker_account,
        "positions": [_position_out(p) for p in positions if p.qty > 0],
        "orders": [_order_out(o) for o in orders],
        **demo_capacity_payload(db, user.id),
    }


@router.post("/demo-activate")
def activate_demo(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.broker_name:
        user.broker_name = "Compte démo"
        db.commit()
    return {
        "ok": True,
        "activated": True,
        "account_type": user.account_type,
        "broker_name": user.broker_name,
        **demo_capacity_payload(db, user.id),
    }


@router.get("/positions/{symbol}")
def get_position(symbol: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pos = db.query(Position).filter(
        Position.user_id == user.id, Position.symbol == symbol.upper()
    ).first()
    if not pos or pos.qty <= 0:
        return {"symbol": symbol.upper(), "qty": 0, "avg_price": 0, "take_profit": None, "stop_loss": None}
    return _position_out(pos)


@router.post("/orders")
def place_order(req: OrderRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    symbol = req.symbol.strip().upper()
    side = req.side.lower()
    order_type = (req.order_type or "market").lower()
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="Side doit être buy ou sell")
    if order_type not in ("market", "limit"):
        raise HTTPException(status_code=422, detail="order_type doit être market ou limit")

    if order_type == "limit":
        if req.limit_price is None or req.limit_price <= 0:
            raise HTTPException(status_code=422, detail="Un prix limite est requis pour un ordre à prix futur")
        exec_px = req.limit_price
    else:
        exec_px = req.price

    _validate_tpsl(side, exec_px, req.take_profit, req.stop_loss)

    if side == "buy":
        used = demo_capacity_used(db, user.id)
        total = used + req.qty * exec_px
        if total > DEMO_INVEST_LIMIT + 1e-9:
            remaining = max(DEMO_INVEST_LIMIT - used, 0)
            raise HTTPException(
                status_code=422,
                detail=f"Capacité d'investissement démo dépassée (plafond 100 000 000 FCFA, "
                       f"{remaining:,.0f} FCFA restants)."
            )

    order = Order(
        user_id=user.id,
        symbol=symbol,
        side=side,
        qty=req.qty,
        price=exec_px,
        order_type=order_type,
        limit_price=req.limit_price if order_type == "limit" else None,
        status="pending" if order_type == "limit" else "executed",
        take_profit=req.take_profit,
        stop_loss=req.stop_loss,
    )
    db.add(order)

    if order_type == "limit":
        db.commit()
        return {"ok": True, "status": "pending", "side": side, "symbol": symbol, "qty": req.qty, "order_id": order.id, "position": None}

    pos = db.query(Position).filter(Position.user_id == user.id, Position.symbol == symbol).first()
    if side == "sell":
        if not pos or pos.qty <= 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="Vente refusée : vous ne détenez pas cette action")
        if req.qty > pos.qty + 1e-9:
            db.rollback()
            raise HTTPException(status_code=409, detail="Quantité insuffisante en portefeuille")

    res = _execute(db, user.id, symbol, side, req.qty, exec_px, order)
    if res.get("error"):
        db.rollback()
        raise HTTPException(status_code=409, detail="Vente refusée : quantité insuffisante en portefeuille")

    if side == "buy" and (req.take_profit or req.stop_loss):
        pos = db.query(Position).filter(Position.user_id == user.id, Position.symbol == symbol).first()
        if pos:
            pos.take_profit = req.take_profit or pos.take_profit
            pos.stop_loss = req.stop_loss or pos.stop_loss
    elif side == "sell":
        pos = db.query(Position).filter(Position.user_id == user.id, Position.symbol == symbol).first()
        if pos and pos.qty > 0 and (req.take_profit or req.stop_loss):
            pos.take_profit = req.take_profit or pos.take_profit
            pos.stop_loss = req.stop_loss or pos.stop_loss

    db.commit()
    pos = db.query(Position).filter(Position.user_id == user.id, Position.symbol == symbol).first()
    return {
        "ok": True,
        "status": "executed",
        "side": side,
        "symbol": symbol,
        "qty": req.qty,
        "order_id": order.id,
        "position": _position_out(pos) if pos and pos.qty > 0 else {"symbol": symbol, "qty": 0, "avg_price": 0, "take_profit": None, "stop_loss": None},
    }


@router.delete("/orders/{order_id}")
def cancel_order(order_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Ordre introuvable")
    if order.status != "pending":
        raise HTTPException(status_code=409, detail="Seuls les ordres en attente peuvent être annulés")
    order.status = "cancelled"
    db.commit()
    return {"ok": True, "order_id": order.id, "status": "cancelled"}
