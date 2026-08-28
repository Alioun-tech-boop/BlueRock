"""Passerelle courtiers (Broker Connect) : connexion des comptes préexistants.

Flux :
1. POST /auth          — le client s'authentifie chez son courtier (numéro de
                         compte + PIN) → session courtier signée + révocable.
2. POST /link          — l'utilisateur BlueRock authentifié lie la session
                         courtier à son portefeuille réel (import des
                         liquidités + positions).
3. GET /status         — comptes courtiers liés de l'utilisateur.
4. POST /sync          — synchronise l'activité du portefeuille vers le courtier.
5. GET /statement      — relevé de compte avec valeurs de marché.
6. POST /unlink        — délie et révoque toutes les sessions.

Sécurité : tokens HMAC-SHA256 signés et enregistrés (révocation immédiate),
PIN PBKDF2, verrouillage après échecs, rate limiting par IP, journal d'audit.
"""

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core.broker_auth import (
    audit, check_account_pin, check_locked, issue_broker_token,
    public_account, register_failure, register_success, revoke_all_sessions,
    verify_broker_token,
)
from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..models.broker_connect import BrokerClientAccount
from ..models.user import BrokerAccount, Order, Portfolio, Position, UserPortfolio
from ..routers.auth import BROKERS_BY_COUNTRY, get_current_user
from ..services.broker_sync import sync_broker_account
from ..models.user import User

router = APIRouter(prefix="/api/broker-connect", tags=["broker-connect"])


class BrokerAuthRequest(BaseModel):
    broker_name: str = Field(min_length=2, max_length=120)
    account_number: str = Field(min_length=3, max_length=40)
    pin: str = Field(min_length=4, max_length=16)


def _broker_category_of(broker_name: str) -> str:
    for categories in BROKERS_BY_COUNTRY.values():
        for category, brokers in categories.items():
            if broker_name in brokers:
                return category
    return "SGI"


def _broker_currency(broker_name: str) -> str:
    """Devise du compte courtier : NGN pour les courtiers nigérians (NGX),
    FCFA (XOF) pour les SGI/SGO de la BRVM."""
    nigeria = BROKERS_BY_COUNTRY.get("Nigeria") or {}
    for names in nigeria.values():
        if broker_name in names:
            return "NGN"
    return "XOF"


def _find_account(db: Session, broker_name: str, account_number: str) -> BrokerClientAccount | None:
    return (
        db.query(BrokerClientAccount)
        .filter(
            BrokerClientAccount.broker_name == broker_name.strip(),
            BrokerClientAccount.account_number == account_number.strip().upper(),
            BrokerClientAccount.status == "active",
        )
        .first()
    )


def _linked_portfolio(db: Session, user_id: int, account_id: int) -> Portfolio | None:
    """Portefeuille réel lié à ce compte courtier ET appartenant à l'utilisateur."""
    return (
        db.query(Portfolio)
        .join(UserPortfolio, UserPortfolio.portfolio_id == Portfolio.id)
        .filter(
            UserPortfolio.user_id == user_id,
            Portfolio.broker_client_id == account_id,
            Portfolio.type == "real",
        )
        .first()
    )


def _require_owner(session, db: Session, user_id: int) -> BrokerClientAccount:
    """Vérifie que la session courtier appartient à un compte lié à l'utilisateur."""
    account = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.id == session.client_account_id
    ).first()
    if not account or account.linked_user_id != user_id:
        raise HTTPException(status_code=403,
                            detail="Ce compte courtier n'est pas lié à votre compte")
    return account


@router.post("/auth")
def broker_auth(req: BrokerAuthRequest, request: Request, db: Session = Depends(get_db)):
    """Authentification auprès du courtier (compte préexistant + PIN)."""
    check_rate_limit(request, limit=5, window_seconds=60)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    account = _find_account(db, req.broker_name, req.account_number)
    if not account:
        audit(db, None, req.broker_name, req.account_number.upper(), False,
              "unknown_account", ip, ua)
        raise HTTPException(status_code=401,
                            detail="Numéro de compte ou PIN invalide")

    check_locked(account)
    if not check_account_pin(account, req.pin):
        register_failure(db, account)
        audit(db, account.id, account.broker_name, account.account_number, False,
              "invalid_pin", ip, ua)
        raise HTTPException(status_code=401,
                            detail="Numéro de compte ou PIN invalide")

    register_success(db, account)
    token, session = issue_broker_token(account.id, db, ip, ua)
    audit(db, account.id, account.broker_name, account.account_number, True,
          "ok", ip, ua)
    return {
        "ok": True,
        "broker_token": token,
        "expires_in": settings.BROKER_SESSION_TTL_SECONDS,
        "account": public_account(account),
    }


@router.get("/session")
def broker_session(x_broker_token: str = Header(default=""),
                   db: Session = Depends(get_db)):
    """État de la session courtier courante (token fourni dans l'en-tête)."""
    session = verify_broker_token(x_broker_token, db)
    account = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.id == session.client_account_id
    ).first()
    return {
        "ok": True,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
        "account": public_account(account),
    }


@router.post("/link")
def broker_link(user: User = Depends(get_current_user),
                x_broker_token: str = Header(default=""),
                db: Session = Depends(get_db)):
    """Lie le compte courtier authentifié au compte portefeuille réel de
    l'utilisateur BlueRock (import des liquidités et positions)."""
    session = verify_broker_token(x_broker_token, db)
    account = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.id == session.client_account_id
    ).first()

    if account.linked_user_id and account.linked_user_id != user.id:
        raise HTTPException(status_code=409,
                            detail="Ce compte courtier est déjà lié à un autre utilisateur BlueRock")

    from ..config import settings
    from ..services.kyc_flow import kyc_verified
    if getattr(settings, "FEATURE_KYC_ENABLED", False) and not kyc_verified(db, user.id):
        raise HTTPException(
            status_code=403,
            detail="Vérification KYC requise avant de lier un compte réel (page Vérification).",
        )

    count = db.query(UserPortfolio).filter(UserPortfolio.user_id == user.id).count()
    if count >= 5:
        raise HTTPException(status_code=422,
                            detail="Nombre maximum de comptes atteint (5). "
                                   "Supprimez un compte avant d'en lier un nouveau")

    pf = _linked_portfolio(db, user.id, account.id)
    if not pf:
        # Ré-attache le portefeuille réel précédemment lié au même courtier
        # (après un unlink, le portefeuille est conservé mais détaché).
        pf = (
            db.query(Portfolio)
            .join(UserPortfolio, UserPortfolio.portfolio_id == Portfolio.id)
            .filter(
                UserPortfolio.user_id == user.id,
                Portfolio.type == "real",
                Portfolio.broker_name == account.broker_name,
                Portfolio.broker_client_id.is_(None),
            )
            .order_by(Portfolio.id.asc())
            .first()
        )
    if not pf:
        pf = Portfolio(
            name=f"Compte {account.broker_name}",
            type="real",
            broker_name=account.broker_name,
            broker_client_id=account.id,
            currency=_broker_currency(account.broker_name),
            balance=account.cash_balance or 0,
            is_default=(count == 0),
        )
        db.add(pf)
        db.flush()
        db.add(UserPortfolio(user_id=user.id, portfolio_id=pf.id, is_owner=True))
        db.flush()
    else:
        # Ré-attachement : le courtier redevient la source des liquidités.
        pf.broker_client_id = account.id
        pf.currency = _broker_currency(account.broker_name)
        pf.balance = account.cash_balance or 0
        db.flush()

    # Import (ou resynchronisation) des positions côté courtier.
    holdings = json.loads(account.holdings or "[]")
    for h in holdings:
        existing = db.query(Position).filter(
            Position.user_id == user.id, Position.portfolio_id == pf.id,
            Position.symbol == h["symbol"],
        ).first()
        if existing:
            existing.qty = h["qty"]
            existing.avg_price = h["avg_price"]
        else:
            db.add(Position(
                user_id=user.id, portfolio_id=pf.id, symbol=h["symbol"],
                qty=h["qty"], avg_price=h["avg_price"],
            ))
    db.flush()

    account.linked_user_id = user.id
    session.user_id = user.id

    ba = db.query(BrokerAccount).filter(
        BrokerAccount.user_id == user.id,
        BrokerAccount.broker_name == account.broker_name,
        BrokerAccount.id_number == account.account_number,
    ).first()
    if not ba:
        db.add(BrokerAccount(
            user_id=user.id,
            broker_name=account.broker_name,
            broker_category=_broker_category_of(account.broker_name),
            full_name=account.holder_name,
            phone="",  # non connu lors d'un rattachement (compte préexistant)
            id_type="npi",
            id_number=account.account_number,
            status="approved",
        ))

    audit(db, account.id, account.broker_name, account.account_number, True,
          "link", None, None)
    db.commit()
    db.refresh(pf)

    from .portfolio import _portfolio_out
    return {
        "ok": True,
        "linked": True,
        "account": public_account(account),
        "portfolio": _portfolio_out(db, pf),
    }


@router.get("/status")
def broker_status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Comptes courtiers liés à l'utilisateur (tableau de bord)."""
    from .portfolio import _portfolio_out
    accounts = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.linked_user_id == user.id
    ).all()
    out = []
    for a in accounts:
        pf = _linked_portfolio(db, user.id, a.id)
        out.append({
            "account": public_account(a),
            "portfolio": _portfolio_out(db, pf) if pf else None,
        })
    return {"ok": True, "linked": out}


@router.post("/sync")
def broker_sync(user: User = Depends(get_current_user),
                x_broker_token: str = Header(default=""),
                db: Session = Depends(get_db)):
    """Pousse l'activité du portefeuille vers le registre courtier."""
    session = verify_broker_token(x_broker_token, db)
    account = _require_owner(session, db, user.id)
    pf = _linked_portfolio(db, user.id, account.id)
    if not pf:
        raise HTTPException(status_code=404, detail="Aucun portefeuille lié à ce compte courtier")
    updated = sync_broker_account(db, pf)
    audit(db, account.id, account.broker_name, account.account_number, True,
          "sync", None, None)
    db.commit()
    return {
        "ok": True,
        "synced": updated,
        "account": public_account(account),
        "portfolio_balance": round(pf.balance or 0, 2),
    }


@router.get("/statement")
def broker_statement(user: User = Depends(get_current_user),
                     x_broker_token: str = Header(default=""),
                     db: Session = Depends(get_db)):
    """Relevé du compte courtier : liquidités, positions valorisées au cours
    de marché, ordres exécutés (références courtier incluses)."""
    from .portfolio import _market_price_of, _order_out
    session = verify_broker_token(x_broker_token, db)
    account = _require_owner(session, db, user.id)
    pf = _linked_portfolio(db, user.id, account.id)
    if not pf:
        raise HTTPException(status_code=404, detail="Aucun portefeuille lié à ce compte courtier")

    positions = db.query(Position).filter(
        Position.portfolio_id == pf.id, Position.qty > 0
    ).all()
    holdings = []
    invested = 0.0
    market_value = 0.0
    for p in positions:
        px = _market_price_of(db, p.symbol) or p.avg_price or 0
        holdings.append({
            "symbol": p.symbol,
            "qty": p.qty,
            "avg_price": p.avg_price,
            "market_price": px,
            "market_value": round(p.qty * px, 2),
            "pnl": round((px - p.avg_price) * p.qty, 2),
        })
        invested += (p.qty or 0) * (p.avg_price or 0)
        market_value += p.qty * px

    orders = db.query(Order).filter(Order.portfolio_id == pf.id).order_by(
        Order.created_at.desc()).limit(50).all()
    return {
        "ok": True,
        "statement": {
            "broker_name": account.broker_name,
            "account_number_masked": public_account(account)["account_number_masked"],
            "holder_name": account.holder_name,
            "cash_balance": round(pf.balance or 0, 2),
            "invested": round(invested, 2),
            "market_value": round(market_value, 2),
            "total_value": round((pf.balance or 0) + market_value, 2),
            "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else None,
            "holdings": holdings,
            "orders": [_order_out(o) for o in orders],
        },
    }


@router.post("/unlink")
def broker_unlink(user: User = Depends(get_current_user),
                  x_broker_token: str = Header(default=""),
                  db: Session = Depends(get_db)):
    """Délie le compte courtier : révocation immédiate de toutes les sessions,
    suppression de la fiche courtier, le portefeuille reste à l'utilisateur."""
    session = verify_broker_token(x_broker_token, db)
    account = _require_owner(session, db, user.id)

    pf = _linked_portfolio(db, user.id, account.id)
    if pf:
        pf.broker_client_id = None  # plus de synchronisation courtier

    revoke_all_sessions(account.id, db)
    account.linked_user_id = None
    db.query(BrokerAccount).filter(
        BrokerAccount.user_id == user.id,
        BrokerAccount.broker_name == account.broker_name,
        BrokerAccount.id_number == account.account_number,
    ).delete(synchronize_session=False)

    audit(db, account.id, account.broker_name, account.account_number, True,
          "unlink", None, None)
    db.commit()
    return {"ok": True, "unlinked": True}
