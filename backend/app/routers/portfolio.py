from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.user import User, Position, Order
from .auth import get_current_user

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])


class OrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    side: str  # buy | sell
    qty: float = Field(gt=0)
    price: float = Field(gt=0)


def _position_out(p: Position):
    return {"symbol": p.symbol, "qty": p.qty, "avg_price": p.avg_price}


@router.get("")
def get_portfolio(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    positions = db.query(Position).filter(Position.user_id == user.id).all()
    orders = db.query(Order).filter(Order.user_id == user.id).order_by(Order.created_at.desc()).limit(100).all()
    return {
        "account_type": user.account_type,
        "broker_name": user.broker_name,
        "broker_account": user.broker_account,
        "positions": [_position_out(p) for p in positions if p.qty > 0],
        "orders": [
            {"id": o.id, "symbol": o.symbol, "side": o.side, "qty": o.qty, "price": o.price,
             "created_at": o.created_at.isoformat() if o.created_at else None}
            for o in orders
        ],
    }


@router.get("/positions/{symbol}")
def get_position(symbol: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pos = db.query(Position).filter(
        Position.user_id == user.id, Position.symbol == symbol.upper()
    ).first()
    if not pos or pos.qty <= 0:
        return {"symbol": symbol.upper(), "qty": 0, "avg_price": 0}
    return _position_out(pos)


@router.post("/orders")
def place_order(req: OrderRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    symbol = req.symbol.strip().upper()
    side = req.side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="Side doit être buy ou sell")

    pos = db.query(Position).filter(Position.user_id == user.id, Position.symbol == symbol).first()

    if side == "sell":
        if not pos or pos.qty <= 0:
            raise HTTPException(status_code=409, detail="Vente refusée : vous ne détenez pas cette action")
        if req.qty > pos.qty + 1e-9:
            raise HTTPException(status_code=409, detail="Quantité insuffisante en portefeuille")

    order = Order(user_id=user.id, symbol=symbol, side=side, qty=req.qty, price=req.price)
    db.add(order)

    if side == "buy":
        if not pos:
            pos = Position(user_id=user.id, symbol=symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + req.qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (req.price * req.qty)) / total_qty
        pos.qty = total_qty
        pos_out = _position_out(pos)
    else:
        remaining = pos.qty - req.qty
        if remaining <= 1e-9:
            db.delete(pos)
            pos_out = {"symbol": symbol, "qty": 0, "avg_price": 0}
        else:
            pos.qty = remaining
            pos_out = _position_out(pos)

    db.commit()
    return {"ok": True, "side": side, "symbol": symbol, "qty": req.qty, "position": pos_out}
