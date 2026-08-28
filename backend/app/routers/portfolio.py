from datetime import datetime
import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..models.user import User, Position, Order, Portfolio, UserPortfolio
from ..models.company import Company
from ..models.market import MarketData, Dividend
from ..models.dividend import DividendPayment
from ..services.dividend_engine import run_dividend_engine
from ..models.planning import PremiumPlan
from ..services.broker_sync import broker_ref_for, sync_broker_account
from ..scrapers.live_feed import live_feed
from .auth import get_current_user

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"])

DEMO_INVEST_LIMIT = 100_000_000  # 100 millions FCFA de capacité d'investissement démo
MAX_ACCOUNTS = 5

VALID_CURRENCIES = ("XOF", "NGN")


def _invest_limit_for(currency: str) -> float:
    """Plafond d'investissement démo selon la devise du compte."""
    from ..config import settings
    return float(settings.NGX_DEMO_INVEST_LIMIT) if currency == "NGN" else DEMO_INVEST_LIMIT


def _currency_label(currency: str) -> str:
    return "₦" if currency == "NGN" else "FCFA"


def _user_portfolio_ids(db: Session, user_id: int) -> list[int]:
    """Ids des portefeuilles appartenant à l'utilisateur (via la table de liaison)."""
    return [up.portfolio_id for up in db.query(UserPortfolio)
            .filter(UserPortfolio.user_id == user_id).all()]


def _portfolio_query(db: Session, user_id: int):
    """Requête de base : portefeuilles accessibles à l'utilisateur."""
    ids = _user_portfolio_ids(db, user_id)
    if not ids:
        return db.query(Portfolio).filter(False)
    return db.query(Portfolio).filter(Portfolio.id.in_(ids))


def demo_capacity_used(db: Session, user_id: int, currency: str = "XOF", for_update: bool = False) -> float:
    """Montant investi = valeur d'achat des positions + ordres d'achat en attente,
    limité aux comptes **démo** de la devise donnée. for_update=True verrouille les lignes pour TOCTOU."""
    # Ne charge que les portfolios démo de l'utilisateur (réels exclus — séparation stricte)
    user_pids = set(_user_portfolio_ids(db, user_id))
    if not user_pids:
        return 0.0
    pf_query = db.query(Portfolio).filter(
        Portfolio.id.in_(user_pids), Portfolio.currency == currency, Portfolio.type == "demo"
    )
    pf_currency = {p.id: p.currency for p in pf_query.all()}
    # Filtre portfolios démo de la devise
    valid_pids = {pid for pid, cur in pf_currency.items() if cur == currency}
    if not valid_pids:
        return 0.0
    pos_q = db.query(Position).filter(Position.user_id == user_id, Position.portfolio_id.in_(valid_pids))
    if for_update:
        pos_q = pos_q.with_for_update()
    pos_total = pos_q.all()
    invested = sum((p.qty or 0) * (p.avg_price or 0) for p in pos_total if p.qty > 0)
    ord_q = db.query(Order).filter(
        Order.user_id == user_id, Order.portfolio_id.in_(valid_pids),
        Order.side == "buy", Order.status == "pending"
    )
    if for_update:
        ord_q = ord_q.with_for_update()
    pending_buys = ord_q.all()
    invested += sum((o.qty or 0) * (o.limit_price or o.price or 0) for o in pending_buys)
    return invested


def demo_capacity_payload(db: Session, user_id: int, currency: str = "XOF") -> dict:
    limit = _invest_limit_for(currency)
    used = demo_capacity_used(db, user_id, currency)
    return {
        "demo_limit": limit,
        "demo_used": round(used, 2),
        "demo_remaining": round(max(limit - used, 0), 2),
    }


def _default_portfolio(db: Session, user_id: int) -> Portfolio | None:
    """Portefeuille par défaut de l'utilisateur, ou None s'il n'en a aucun
    (aucune création automatique)."""
    pf = _portfolio_query(db, user_id).filter(Portfolio.is_default.is_(True)).first()
    if pf:
        return pf
    pf = _portfolio_query(db, user_id).order_by(Portfolio.id.asc()).first()
    if pf:
        pf.is_default = True
        db.commit()
        db.refresh(pf)
        return pf
    return None


def _create_demo_portfolio(db: Session, user_id: int) -> Portfolio:
    """Crée explicitement le compte démo (action utilisateur explicite).
    Aucun fonds n'est alloué automatiquement : ils ne sont ajoutés qu'après
    dépôt, plafonné à DEMO_INVEST_LIMIT."""
    pf = Portfolio(name="Compte démo", type="demo",
                   balance=0, is_default=True)
    db.add(pf)
    db.flush()
    db.add(UserPortfolio(user_id=user_id, portfolio_id=pf.id, is_owner=True))
    db.commit()
    db.refresh(pf)
    return pf


def _portfolio_by_id(db: Session, user_id: int, portfolio_id: int | None) -> Portfolio:
    if portfolio_id:
        owned = db.query(UserPortfolio).filter(
            UserPortfolio.user_id == user_id,
            UserPortfolio.portfolio_id == portfolio_id,
        ).first()
        if not owned:
            raise HTTPException(status_code=404, detail="Compte introuvable")
        pf = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
        if not pf:
            raise HTTPException(status_code=404, detail="Compte introuvable")
        return pf
    pf = _default_portfolio(db, user_id)
    if not pf:
        raise HTTPException(status_code=404,
                            detail="Aucun compte — créez un compte avant d'utiliser cette fonctionnalité")
    return pf


def _portfolio_invested(db: Session, portfolio_id: int) -> float:
    pos_total = db.query(Position).filter(Position.portfolio_id == portfolio_id).all()
    return sum((p.qty or 0) * (p.avg_price or 0) for p in pos_total if p.qty > 0)


def _managed_name(db: Session, user_id: int, plan) -> str | None:
    if not plan.managed_portfolio_id:
        return None
    pf = db.query(Portfolio).filter(
        Portfolio.id == plan.managed_portfolio_id,
        Portfolio.id.in_(_user_portfolio_ids(db, user_id)),
    ).first()
    return pf.name if pf else None


def _portfolio_out(db: Session, pf: Portfolio) -> dict:
    invested = _portfolio_invested(db, pf.id)
    n_pos = db.query(Position).filter(Position.portfolio_id == pf.id, Position.qty > 0).count()
    return {
        "id": pf.id,
        "name": pf.name,
        "type": pf.type,
        "currency": pf.currency or "XOF",
        "broker_name": pf.broker_name,
        "balance": round(pf.balance or 0, 2),
        "invested": round(invested, 2),
        "position_count": n_pos,
        "is_default": bool(pf.is_default),
    }


class OrderRequest(BaseModel):
    symbol: str = Field(min_length=1, max_length=12, pattern=r"^[A-Za-z0-9._\-]+$")
    side: str = Field(pattern=r"^(buy|sell)$")
    qty: float = Field(gt=0, le=1_000_000)
    price: float = Field(gt=0, le=1_000_000_000)
    order_type: str = Field(default="market", pattern=r"^(market|limit)$")
    limit_price: float | None = Field(default=None, gt=0, le=1_000_000_000)
    take_profit: float | None = Field(default=None, gt=0, le=1_000_000_000)
    stop_loss: float | None = Field(default=None, gt=0, le=1_000_000_000)
    valid_until: datetime | None = None
    account_id: int | None = None


class AccountRequest(BaseModel):
    name: str | None = Field(default=None, max_length=60)
    type: str = Field(default="demo", pattern=r"^(demo|real)$")
    broker_name: str | None = Field(default=None, max_length=80)
    currency: str | None = Field(default=None, max_length=8)


class AmountRequest(BaseModel):
    amount: float = Field(gt=0, le=1_000_000_000)


class NameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)


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
        "plan_id": o.plan_id,
        "account_id": o.portfolio_id,
        "broker_ref": o.broker_ref,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "executed_at": o.executed_at.isoformat() if o.executed_at else None,
        "valid_until": o.valid_until.isoformat() if o.valid_until else None,
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


def _market_price_of(db: Session, symbol: str) -> float | None:
    """Prix de marché côté serveur pour un symbole : flux live (BRVM ou NGX,
    selon la bourse du titre) en priorité (cache mémoire), sinon dernière
    clôture en base. Retourne None si aucun prix n'est connu."""
    company = db.query(Company).filter(Company.symbol == symbol).first()
    if company and company.exchange == "NGX":
        from ..scrapers.ngx_feed import ngx_live_feed
        snap = ngx_live_feed.snapshot()
        live_px = (snap.get("prices") or {}).get(symbol)
        if live_px and live_px.get("price"):
            return live_px["price"]
        md = (db.query(MarketData)
              .filter(MarketData.company_id == company.id)
              .order_by(MarketData.date.desc()).first())
        return (md.close_price if md else None) or company.reference_price
    from ..scrapers.live_feed import live_feed
    snap = live_feed.snapshot()
    live_px = (snap.get("prices") or {}).get(symbol)
    if live_px and live_px.get("price"):
        return live_px["price"]
    if not company:
        return None
    md = (db.query(MarketData)
          .filter(MarketData.company_id == company.id)
          .order_by(MarketData.date.desc()).first())
    return md.close_price if md else company.reference_price


def _execute(db: Session, user_id: int, portfolio_id: int | None, symbol: str, side: str,
             qty: float, px: float, order: Order | None = None,
             portfolio: Portfolio | None = None):
    """Applique l'exécution d'un ordre sur la position (logique du moteur).
    Tient le solde du portefeuille à jour : achat → débit, vente → crédit.

    Verrouillage : la position et le portefeuille sont verrouillés en écriture
    (SELECT ... FOR UPDATE) pour sérialiser les exécutions concurrentes et
    garantir l'intégrité des soldes (pas de survente / solde négatif)."""
    pos = db.query(Position).filter(
        Position.user_id == user_id, Position.portfolio_id == portfolio_id, Position.symbol == symbol
    ).with_for_update().first()
    if portfolio:
        db.query(Portfolio).filter(Portfolio.id == portfolio.id).with_for_update().one()

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
        if portfolio:
            from ..services.ledger import journal_investment
            journal_investment(db, user_id, portfolio.id, symbol, "sell",
                               qty, px, order.id if order else 0,
                               currency=portfolio.currency or "XOF")
            portfolio.balance = (portfolio.balance or 0) + qty * px
    else:
        if portfolio and (portfolio.balance or 0) < qty * px - 1e-9:
            if order:
                order.status = "cancelled"
            return {"error": "insufficient_funds"}
        if not pos:
            pos = Position(user_id=user_id, portfolio_id=portfolio_id, symbol=symbol, qty=0, avg_price=0)
            db.add(pos)
        total_qty = pos.qty + qty
        pos.avg_price = ((pos.avg_price * pos.qty) + (px * qty)) / total_qty
        pos.qty = total_qty
        pos_out = _position_out(pos)
        if portfolio:
            from ..services.ledger import journal_investment
            journal_investment(db, user_id, portfolio.id, symbol, "buy",
                               qty, px, order.id if order else 0,
                               currency=portfolio.currency or "XOF")
            portfolio.balance = (portfolio.balance or 0) - qty * px

    db.flush()

    if order:
        order.status = "executed"
        order.price = px
        order.executed_at = datetime.utcnow()
    return {"position": pos_out}


@router.get("")
def get_portfolio(account_id: int | None = None, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    portfolio = _portfolio_by_id(db, user.id, account_id)
    portfolios = _portfolio_query(db, user.id).order_by(Portfolio.id.asc()).all()

    positions = db.query(Position).filter(
        Position.user_id == user.id, Position.portfolio_id == portfolio.id
    ).all()
    orders = db.query(Order).filter(
        Order.user_id == user.id, Order.portfolio_id == portfolio.id
    ).order_by(Order.created_at.desc()).limit(100).all()

    linked = None
    plan = (db.query(PremiumPlan)
            .filter(PremiumPlan.user_id == user.id,
                    PremiumPlan.linked_to_portfolio.is_(True))
            .order_by(PremiumPlan.id.desc()).first())
    if plan:
        from ..services.premium_tracking import coverage_of
        cov = coverage_of(db, plan) if plan.status == "active" else None
        linked = {
            "id": plan.id,
            "plan_type": plan.plan_type,
            "status": plan.status,
            "last_value": plan.last_value,
            "last_pnl_pct": plan.last_pnl_pct,
            "matured_at": plan.matured_at.isoformat() if plan.matured_at else None,
            "linked_at": plan.linked_at.isoformat() if plan.linked_at else None,
            "coverage_pct": (cov or {}).get("coverage_pct"),
            "managed_account_id": plan.managed_portfolio_id,
            "managed_account_name": _managed_name(db, user.id, plan),
            "has_pin": bool(plan.pin_hash),
        }

    return {
        "account_type": user.account_type,
        "broker_name": user.broker_name,
        "broker_account": user.broker_account,
        "accounts": [_portfolio_out(db, a) for a in portfolios],
        "account": _portfolio_out(db, portfolio),
        "positions": [_position_out(p) for p in positions if p.qty > 0],
        "orders": [_order_out(o) for o in orders],
        "linked_plan": linked,
        **(demo_capacity_payload(db, user.id, portfolio.currency or "XOF") if (portfolio.type or "demo") == "demo" else {"demo_limit": None, "demo_used": None, "demo_remaining": None}),
    }


@router.get("/accounts")
def list_accounts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolios = _portfolio_query(db, user.id).order_by(Portfolio.id.asc()).all()
    return {"accounts": [_portfolio_out(db, a) for a in portfolios]}


@router.get("/dividends")
def list_dividends(account_id: int | None = None, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Versements de dividendes RÉELS crédités sur ce portefeuille."""
    portfolio = _portfolio_by_id(db, user.id, account_id)
    pays = db.query(DividendPayment).filter(
        DividendPayment.user_id == user.id,
        DividendPayment.portfolio_id == portfolio.id
    ).order_by(DividendPayment.payment_date.desc()).all()

    return {
        "dividends": [{
            "symbol": p.symbol,
            "name": p.company.name if p.company else p.symbol,
            "fiscal_year": p.fiscal_year,
            "dividend_per_share": p.dividend_per_share,
            "shares": p.shares,
            "amount": p.amount,
            "currency": p.currency,
            "ex_date": None,
            "payment_date": p.payment_date.isoformat() if p.payment_date else None,
            "credited_at": p.credited_at.isoformat() if p.credited_at else None,
        } for p in pays],
        "total": round(sum(p.amount for p in pays), 2),
        "currency": portfolio.currency or "XOF"
    }


@router.post("/accounts")
def create_account(req: AccountRequest, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    acc_type = (req.type or "demo").lower()
    if acc_type not in ("demo", "real"):
        raise HTTPException(status_code=422, detail="type doit être demo ou real")
    currency = (req.currency or "XOF").upper()
    if currency not in VALID_CURRENCIES:
        raise HTTPException(status_code=422,
                            detail=f"Devise invalide : doit être XOF (BRVM) ou NGN (NGX)")
    if currency == "NGN" and acc_type == "real":
        raise HTTPException(status_code=422,
                            detail="Les comptes réels (courtier SGI) sont en FCFA — "
                                   "les comptes NGX (₦) sont des comptes démo")
    count = _portfolio_query(db, user.id).count()
    if count >= MAX_ACCOUNTS:
        raise HTTPException(status_code=422,
                            detail=f"Nombre maximum de comptes atteint ({MAX_ACCOUNTS})")
    if acc_type == "real" and not req.broker_name:
        raise HTTPException(status_code=422, detail="Un courtier est requis pour un compte réel")
    if acc_type == "real":
        from ..config import settings
        from ..services.kyc_flow import kyc_verified
        if settings.FEATURE_KYC_ENABLED and not kyc_verified(db, user.id):
            raise HTTPException(
                status_code=403,
                detail="Votre identité n'est pas encore vérifiée. Terminez la vérification KYC "
                       "(page Vérification) avant de créer un compte réel.",
            )
    name = (req.name or "").strip()
    if not name:
        name = req.broker_name or ("Compte réel" if acc_type == "real" else
                                   ("Compte démo NGX (₦)" if currency == "NGN" else "Compte démo"))
    pf = Portfolio(
        name=name,
        type=acc_type,
        currency=currency,
        broker_name=req.broker_name,
        balance=0,
        is_default=(count == 0),
    )
    db.add(pf)
    db.flush()
    db.add(UserPortfolio(user_id=user.id, portfolio_id=pf.id, is_owner=True))
    db.commit()
    db.refresh(pf)
    return {"account": _portfolio_out(db, pf)}


@router.patch("/accounts/{account_id}")
def rename_account(account_id: int, req: NameRequest, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    pf = _portfolio_by_id(db, user.id, account_id)
    name = req.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Le nom du compte est requis")
    pf.name = name
    db.commit()
    db.refresh(pf)
    return {"account": _portfolio_out(db, pf)}


@router.post("/accounts/{account_id}/deposit")
def deposit_account(account_id: int, req: AmountRequest, request: Request,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    pf = _portfolio_by_id(db, user.id, account_id)
    pf = db.query(Portfolio).filter(Portfolio.id == pf.id).with_for_update().first()
    if req.amount < 0:
        raise HTTPException(status_code=422, detail="Le montant doit être positif")
    if pf.type == "real":
        raise HTTPException(
            status_code=403,
            detail="Les comptes réels sont approvisionnés uniquement via un dépôt sécurisé "
                   "(page Paiement) — dépôt direct refusé.",
        )
    limit = _invest_limit_for(pf.currency or "XOF")
    if pf.type == "demo" and (pf.balance or 0) + req.amount > limit + 1e-9:
        raise HTTPException(
            status_code=422,
            detail=f"Dépôt refusé : le compte démo est plafonné à "
                   f"{limit:,.0f} {_currency_label(pf.currency)} (solde actuel "
                   f"{(pf.balance or 0):,.0f} {_currency_label(pf.currency)})",
        )
    from ..services.ledger import journal_deposit
    journal_deposit(db, user.id, pf.id, req.amount,
                    f"demo:{pf.id}:{int(time.time()*1000)}",
                    currency=pf.currency or "XOF")
    from ..services.audit import audit
    audit(db, "demo_deposit", "portfolio", resource_id=pf.id,
          user_id=user.id, actor_role=user.role,
          ip=request.client.host if request else None,
          user_agent=request.headers.get("user-agent") if request else None,
          meta={"amount": req.amount, "currency": pf.currency})
    pf.balance = (pf.balance or 0) + req.amount
    db.commit()
    db.refresh(pf)
    return {"account": _portfolio_out(db, pf), "deposited": req.amount}


@router.post("/accounts/{account_id}/withdraw")
def withdraw_account(account_id: int, req: AmountRequest, request: Request,
                     user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    pf = _portfolio_by_id(db, user.id, account_id)
    if (pf.type or "demo").lower() == "real":
        raise HTTPException(
            status_code=403,
            detail="Retrait sur compte réel uniquement via un virement courtier ou la page Paiement — retrait direct refusé.",
        )
    pf = db.query(Portfolio).filter(Portfolio.id == pf.id).with_for_update().first()
    if req.amount > (pf.balance or 0) + 1e-9:
        raise HTTPException(status_code=422,
                            detail=f"Retrait supérieur au solde disponible "
                                   f"({(pf.balance or 0):,.0f} {_currency_label(pf.currency)})")
    from ..services.ledger import journal_withdraw
    journal_withdraw(db, user.id, pf.id, req.amount,
                     f"demo:{pf.id}:{int(time.time()*1000)}",
                     currency=pf.currency or "XOF")
    from ..services.audit import audit
    audit(db, "withdraw", "portfolio", resource_id=pf.id,
          user_id=user.id, actor_role=user.role,
          ip=request.client.host if request else None,
          user_agent=request.headers.get("user-agent") if request else None,
          meta={"amount": req.amount, "currency": pf.currency})
    pf.balance = (pf.balance or 0) - req.amount
    db.commit()
    db.refresh(pf)
    return {"account": _portfolio_out(db, pf), "withdrawn": req.amount}


@router.post("/accounts/{account_id}/default")
def make_default(account_id: int, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    pf = _portfolio_by_id(db, user.id, account_id)
    _portfolio_query(db, user.id).update({Portfolio.is_default: False})
    pf.is_default = True
    db.commit()
    db.refresh(pf)
    return {"account": _portfolio_out(db, pf)}


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    pf = _portfolio_by_id(db, user.id, account_id)
    count = _portfolio_query(db, user.id).count()
    if count <= 1:
        raise HTTPException(status_code=409, detail="Impossible de supprimer le dernier compte")
    if db.query(Position).filter(Position.portfolio_id == pf.id).count():
        raise HTTPException(status_code=409,
                            detail="Vendez vos positions avant de supprimer ce compte")
    if db.query(Order).filter(
        Order.portfolio_id == pf.id, Order.status == "pending"
    ).count():
        raise HTTPException(status_code=409,
                            detail="Annulez vos ordres en attente avant de supprimer ce compte")
    if pf.is_default:
        other = _portfolio_query(db, user.id).filter(
            Portfolio.id != pf.id).order_by(Portfolio.id.asc()).first()
        if other:
            other.is_default = True
    db.query(UserPortfolio).filter(
        UserPortfolio.user_id == user.id, UserPortfolio.portfolio_id == pf.id
    ).delete()
    db.delete(pf)
    db.commit()
    return {"ok": True}


@router.post("/demo-activate")
def activate_demo(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.broker_name:
        user.broker_name = "Compte démo"
    pf = _default_portfolio(db, user.id)
    if not pf:
        pf = _create_demo_portfolio(db, user.id)
    elif pf.type != "demo":
        # Ne jamais muter un compte réel en démo — chercher un démo existant ou en créer un nouveau
        demo_pf = _portfolio_query(db, user.id).filter(Portfolio.type == "demo").order_by(Portfolio.id.asc()).first()
        if demo_pf:
            pf = demo_pf
            # Mettre ce démo comme défaut si besoin
            if not pf.is_default:
                _portfolio_query(db, user.id).update({Portfolio.is_default: False})
                pf.is_default = True
        else:
            pf = _create_demo_portfolio(db, user.id)
    db.commit()
    return {
        "ok": True,
        "activated": True,
        "account_type": user.account_type,
        "broker_name": user.broker_name,
        "account": _portfolio_out(db, pf),
        **demo_capacity_payload(db, user.id, pf.currency or "XOF"),
    }


@router.get("/positions/{symbol}")
def get_position(symbol: str, account_id: int | None = None,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    portfolio = _portfolio_by_id(db, user.id, account_id)
    pos = db.query(Position).filter(
        Position.user_id == user.id, Position.portfolio_id == portfolio.id,
        Position.symbol == symbol.upper()
    ).first()
    if not pos or pos.qty <= 0:
        return {"symbol": symbol.upper(), "qty": 0, "avg_price": 0, "take_profit": None, "stop_loss": None}
    return _position_out(pos)


@router.post("/orders")
def place_order(req: OrderRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db), request: Request = None):
    check_rate_limit(request, limit=30, window_seconds=60)  # 30 ordres / min / IP
    symbol = req.symbol.strip().upper()
    side = req.side.lower()
    order_type = (req.order_type or "market").lower()
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=422, detail="Side doit être buy ou sell")
    if order_type not in ("market", "limit"):
        raise HTTPException(status_code=422, detail="order_type doit être market ou limit")

    portfolio = _portfolio_by_id(db, user.id, req.account_id)
    # Verrou pessimiste : deux achats concurrents ne peuvent pas dépasser
    # simultanément la capacité ou le solde du compte.
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio.id).with_for_update().first()

    # Garde-fou devise : un compte XOF ne peut pas acheter/vendre des titres
    # NGX (₦) et inversement.
    company = db.query(Company).filter(Company.symbol == symbol).first()
    if not company:
        raise HTTPException(status_code=404, detail="Titre inconnu sur BlueRock")
    pf_currency = (portfolio.currency or "XOF").upper()
    ticker_currency = company.currency or ("XOF" if company.exchange != "NGX" else "NGN")
    if pf_currency != ticker_currency:
        raise HTTPException(
            status_code=422,
            detail=f"Devise incompatible : « {symbol} » se négocie en "
                   f"{'₦ (NGX)' if ticker_currency == 'NGN' else 'FCFA (BRVM)'} "
                   f"mais le compte « {portfolio.name} » est en "
                   f"{'₦' if pf_currency == 'NGN' else 'FCFA'} — créez un compte "
                   f"{'NGX (₦)' if ticker_currency == 'NGN' else 'BRVM (FCFA)'}.",
        )

    if order_type == "limit":
        if req.limit_price is None or req.limit_price <= 0:
            raise HTTPException(status_code=422, detail="Un prix limite est requis pour un ordre à prix futur")
        exec_px = req.limit_price
    else:
        exec_px = _market_price_of(db, symbol)
        if exec_px is None:
            raise HTTPException(
                status_code=422,
                detail="Prix de marché indisponible pour ce titre, réessayez plus tard"
            )

    _validate_tpsl(side, exec_px, req.take_profit, req.stop_loss)

    if side == "buy":
        is_real = (getattr(portfolio, "type", "") or "demo").lower() == "real"
        from ..services.kyc_flow import kyc_verified
        # KYC obligatoire uniquement pour le réel (démo = bac à sable)
        if is_real and not kyc_verified(db, user.id):
            raise HTTPException(
                status_code=403,
                detail="Votre identité n'est pas encore vérifiée. Terminez la vérification KYC "
                       "(page Vérification) avant d'acheter des titres sur un compte réel."
            )
        # Plafond démo uniquement pour les comptes démo
        if not is_real:
            used = demo_capacity_used(db, user.id, pf_currency, for_update=True)
            total = used + req.qty * exec_px
            if total > _invest_limit_for(pf_currency) + 1e-9:
                remaining = max(_invest_limit_for(pf_currency) - used, 0)
                raise HTTPException(
                    status_code=422,
                    detail=f"Capacité d'investissement démo dépassée (plafond "
                           f"{_invest_limit_for(pf_currency):,.0f} {_currency_label(pf_currency)}, "
                           f"{remaining:,.0f} {_currency_label(pf_currency)} restants)."
                )
        if (portfolio.balance or 0) < req.qty * exec_px - 1e-9:
            raise HTTPException(
                status_code=422,
                detail=f"Solde insuffisant sur le compte « {portfolio.name} » "
                       f"({(portfolio.balance or 0):,.0f} {_currency_label(pf_currency)} disponibles). "
                       f"Déposez des fonds pour continuer."
            )

    market_open = live_feed.in_market_hours()
    # Limit : exécution immédiate si le cours actuel déclenche déjà (marché ouvert)
    if order_type == "limit":
        current_px = _market_price_of(db, symbol)
        if market_open and current_px is not None:
            triggered = (side == "buy" and current_px <= req.limit_price) or (side == "sell" and current_px >= req.limit_price)
            if triggered:
                place_pending = False
                exec_px = current_px
            else:
                place_pending = True
        else:
            place_pending = True
    else:
        place_pending = (not market_open)

    # Ordre enregistré en "pending" : exécution automatique à l'ouverture
    # (ou au croisement du cours pour un ordre à cours limité). On valide tout
    # de même qu'une vente est réalisable pour ne pas créer d'ordre impossible.
    if place_pending and side == "sell":
        pos = db.query(Position).filter(
            Position.user_id == user.id, Position.portfolio_id == portfolio.id,
            Position.symbol == symbol
        ).with_for_update().first()
        if not pos or pos.qty <= 0:
            raise HTTPException(status_code=409, detail="Vente refusée : vous ne détenez pas cette action")
        if req.qty > pos.qty + 1e-9:
            raise HTTPException(status_code=409, detail="Quantité insuffisante en portefeuille")

    order = Order(
        user_id=user.id,
        portfolio_id=portfolio.id,
        symbol=symbol,
        side=side,
        qty=req.qty,
        price=exec_px,
        order_type=order_type,
        limit_price=req.limit_price if order_type == "limit" else None,
        valid_until=req.valid_until,
        status="pending" if place_pending else "executed",
        take_profit=req.take_profit,
        stop_loss=req.stop_loss,
        broker_ref=broker_ref_for(portfolio) if portfolio.broker_client_id else None,
    )
    db.add(order)
    # Flush pour obtenir order.id avant journal_investment / audit (autoflush=False).
    db.flush()

    if place_pending:
        sync_broker_account(db, portfolio)
        db.commit()
        return {"ok": True, "status": "pending", "side": side, "symbol": symbol, "qty": req.qty,
                "price": exec_px, "order_id": order.id, "position": None,
                "executes_at_open": not market_open}

    pos = db.query(Position).filter(
        Position.user_id == user.id, Position.portfolio_id == portfolio.id,
        Position.symbol == symbol
    ).first()
    if side == "sell":
        if not pos or pos.qty <= 0:
            db.rollback()
            raise HTTPException(status_code=409, detail="Vente refusée : vous ne détenez pas cette action")
        if req.qty > pos.qty + 1e-9:
            db.rollback()
            raise HTTPException(status_code=409, detail="Quantité insuffisante en portefeuille")

    res = _execute(db, user.id, portfolio.id, symbol, side, req.qty, exec_px, order, portfolio)
    if res.get("error") == "insufficient":
        db.rollback()
        raise HTTPException(status_code=409, detail="Vente refusée : quantité insuffisante en portefeuille")
    if res.get("error"):
        db.rollback()
        raise HTTPException(status_code=422, detail="Solde insuffisant sur ce compte")

    if side == "buy" and (req.take_profit or req.stop_loss):
        pos = db.query(Position).filter(
            Position.user_id == user.id, Position.portfolio_id == portfolio.id,
            Position.symbol == symbol
        ).first()
        if pos:
            pos.take_profit = req.take_profit or pos.take_profit
            pos.stop_loss = req.stop_loss or pos.stop_loss
    elif side == "sell":
        pos = db.query(Position).filter(
            Position.user_id == user.id, Position.portfolio_id == portfolio.id,
            Position.symbol == symbol
        ).first()
        if pos and pos.qty > 0 and (req.take_profit or req.stop_loss):
            pos.take_profit = req.take_profit or pos.take_profit
            pos.stop_loss = req.stop_loss or pos.stop_loss

    sync_broker_account(db, portfolio)
    from ..services.audit import audit
    audit(db, "order_placed", "order", resource_id=order.id,
          user_id=user.id, actor_role=user.role,
          ip=request.client.host if request else None,
          user_agent=request.headers.get("user-agent") if request else None,
          meta={"symbol": symbol, "side": side, "qty": req.qty, "price": exec_px,
                "order_type": order_type, "portfolio_id": portfolio.id})
    db.commit()
    pos = db.query(Position).filter(
        Position.user_id == user.id, Position.portfolio_id == portfolio.id,
        Position.symbol == symbol
    ).first()
    return {
        "ok": True,
        "status": "executed",
        "side": side,
        "symbol": symbol,
        "qty": req.qty,
        "price": exec_px,
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
