"""Paiements — comptes réels et frais d'inscription aux défis (Stripe via Supabase).

Flux :
  1. POST /api/payments/deposit → ordre pending + URL de checkout Stripe
     (session créée par l'Edge Function Supabase stripe-checkout) ;
  2. l'utilisateur paie sur la page hébergée Stripe ;
  3. confirmation : webhook Stripe (Edge Function stripe-webhook, qui
     crédite le solde ou valide l'inscription au défi) OU re-vérification
     au retour du checkout (POST /orders/{id}/verify → stripe-session-status) ;
  4. le solde du portefeuille est crédité UNE SEULE FOIS (flag credited).

Aucune simulation : sans Supabase/Stripe configurés, l'API refuse de créer
un ordre. Les comptes démo (portefeuilles virtuels) ne passent jamais par ici.
"""

import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..models.payment import DepositOrder
from ..models.user import User, Portfolio
from ..services import stripe_http
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/payments", tags=["payments"])

MIN_DEPOSIT = max(int(settings.DEPOSIT_MIN_AMOUNT), 100)
MAX_DEPOSIT = max(int(settings.DEPOSIT_MAX_AMOUNT), MIN_DEPOSIT)


class DepositRequest(BaseModel):
    account_id: int
    amount: float


def _order_payload(o: DepositOrder) -> dict:
    return {
        "id": o.id,
        "account_id": o.portfolio_id,
        "amount": o.amount,
        "currency": o.currency,
        "provider": o.provider,
        "provider_transaction_id": o.provider_transaction_id,
        "purpose": o.purpose,
        "status": o.status,
        "credited": o.credited,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "confirmed_at": o.confirmed_at.isoformat() if o.confirmed_at else None,
    }


def _get_account(db: Session, user_id: int, account_id: int) -> Portfolio:
    pf = db.query(Portfolio).join(
        Portfolio.user_portfolios
    ).filter(
        Portfolio.id == account_id,
        Portfolio.user_portfolios.any(user_id=user_id),
    ).first()
    if pf is None:
        raise HTTPException(status_code=404, detail="Compte portefeuille introuvable")
    return pf


def apply_payment_status(db: Session, order: DepositOrder,
                         provider_status: str, meta: dict | None = None,
                         session_id: str | None = None):
    """Applique le statut fournisseur à l'ordre (idempotent, crédit unique)."""
    if meta is not None:
        order.meta = {**(order.meta or {}), "last_provider_update": str(meta)[:2000]}
    if session_id:
        order.meta = {**(order.meta or {}), "session_id": session_id}
    mapped = {
        "ACCEPTED": "accepted",
        "PAID": "accepted",
        "COMPLETE": "accepted",
        "REFUSED": "refused",
        "FAILED": "failed",
        "CANCELLED": "cancelled",
    }.get(str(provider_status or "").upper())
    if not mapped:
        return
    if mapped == "accepted":
        # Crédit UNIQUEMENT pour un dépôt réel (purpose='deposit') : les frais
        # de défi (challenge_fee) sont gérés par l'Edge Function (inscription
        # 'paid' + portefeuille virtuel) et ne doivent JAMAIS créditer le
        # portefeuille de l'utilisateur.
        if order.purpose == "deposit":
            # Recharge l'état réel de la ligne : l'Edge (webhook ou
            # re-vérification) a pu créditer entre-temps (credited=true).
            db.refresh(order)
            # Crédit atomique : une seule requête gagne le flag credited.
            claimed = db.query(DepositOrder).filter(
                DepositOrder.id == order.id,
                DepositOrder.credited.is_(False),
            ).update({"credited": True}, synchronize_session=False)
            if claimed:
                pf = db.query(Portfolio).filter(
                    Portfolio.id == order.portfolio_id
                ).with_for_update().first()
                if pf is not None:
                    from ..services.ledger import journal_deposit
                    # Journalisation double entrée (idempotente) AVANT le crédit.
                    journal_deposit(db, order.user_id, pf.id, order.amount,
                                    order.id, currency=order.currency or "XOF")
                    pf.balance = (pf.balance or 0) + order.amount
                    logger.info("Paiement crédité : order=%s user=%s amount=%s",
                                order.id, order.user_id, order.amount)
        order.status = "accepted"
        order.confirmed_at = order.confirmed_at or datetime.utcnow()
    elif order.status != "accepted":
        # Jamais de rétrogradation d'un ordre déjà crédité.
        order.status = mapped
        if mapped in ("refused", "failed", "cancelled"):
            order.confirmed_at = order.confirmed_at or datetime.utcnow()


def _build_checkout(db: Session, order: DepositOrder, user: User,
                    authorization: str, return_url: str) -> dict:
    """Crée la session de checkout Stripe via l'Edge Function Supabase."""
    if not stripe_http.is_configured():
        raise HTTPException(status_code=503,
                            detail="Le paiement n'est pas configuré (Supabase/Stripe)")
    try:
        data = stripe_http.create_checkout(
            {
                "order_id": order.id,
                "amount": order.amount,
                "currency": order.currency,
                "account_id": order.portfolio_id,
                "purpose": order.purpose,
                "return_url": return_url,
                **(order.meta or {}),
            },
            user_jwt=(authorization or "").removeprefix("Bearer ").strip(),
        )
    except stripe_http.StripeEdgeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    if not data.get("url"):
        raise HTTPException(status_code=502,
                            detail="La passerelle de paiement n'a pas retourné d'URL")
    order.meta = {**(order.meta or {}),
                  "session_id": data.get("session_id") or "",
                  "checkout_url": data["url"]}
    db.commit()
    db.refresh(order)
    return data


@router.post("/deposit")
def create_deposit(req: DepositRequest, request: Request,
                   user: User = Depends(get_current_user),
                   authorization: str = Header(default=""),
                   db: Session = Depends(get_db)):
    check_rate_limit(request, limit=10, window_seconds=60)
    if not (req.amount > 0):
        raise HTTPException(status_code=422, detail="Le montant doit être positif")
    pf = _get_account(db, user.id, req.account_id)
    if pf.type != "real":
        raise HTTPException(status_code=422,
                            detail="Le compte démo ne passe pas par un paiement")
    if (pf.currency or "XOF") != "XOF":
        raise HTTPException(status_code=422,
                            detail="Seuls les comptes FCFA (BRVM) acceptent les dépôts")
    if req.amount < MIN_DEPOSIT or req.amount > MAX_DEPOSIT:
        raise HTTPException(
            status_code=422,
            detail=f"Le montant doit être entre {MIN_DEPOSIT:,.0f} et "
                   f"{MAX_DEPOSIT:,.0f} FCFA",
        )

    # Les ordres en attente non finalisés ne doivent pas s'accumuler.
    db.query(DepositOrder).filter(
        DepositOrder.user_id == user.id, DepositOrder.status == "pending"
    ).update({"status": "cancelled"})

    txn = f"BR{uuid.uuid4().hex[:20]}".upper()
    order = DepositOrder(
        user_id=user.id,
        portfolio_id=pf.id,
        amount=req.amount,
        currency=settings.DEPOSIT_CURRENCY or "XOF",
        provider="stripe",
        provider_transaction_id=txn,
        purpose="deposit",
        meta={"purpose": "deposit", "account_name": pf.name or ""},
        status="pending",
    )
    db.add(order)
    # Commit AVANT l'appel Edge : l'Edge (connexion séparée) doit voir l'ordre.
    db.commit()
    db.refresh(order)
    try:
        data = _build_checkout(db, order, user, authorization,
                               return_url=settings.STRIPE_RETURN_URL)
    except Exception:
        order.status = "failed"
        db.commit()
        raise
    db.commit()
    db.refresh(order)
    from ..services.audit import audit
    audit(db, "deposit_requested", "deposit_order", resource_id=order.id,
          user_id=user.id, actor_role=user.role,
          ip=request.client.host if request else None,
          user_agent=request.headers.get("user-agent") if request else None,
          meta={"amount": req.amount, "currency": pf.currency})
    return {"mode": "payment",
            "payment_url": data["url"], "order": _order_payload(order)}


@router.post("/orders/{order_id}/verify")
def verify_deposit(order_id: int, request: Request,
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    """Re-vérifie un ordre auprès de Stripe (appelé au retour du checkout)."""
    check_rate_limit(request, limit=10, window_seconds=60)
    order = db.query(DepositOrder).filter(
        DepositOrder.id == order_id, DepositOrder.user_id == user.id
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Ordre de dépôt introuvable")

    try:
        info = stripe_http.check_session_status(order.id)
    except stripe_http.StripeEdgeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    paid = bool(info.get("paid"))
    apply_payment_status(db, order,
                         "ACCEPTED" if paid else "PENDING",
                         meta=info)
    from ..services.audit import audit
    audit(db, "deposit_confirmed" if paid else "deposit_checked",
          "deposit_order", resource_id=order.id,
          user_id=user.id, actor_role=user.role,
          ip=request.client.host if request else None,
          user_agent=request.headers.get("user-agent") if request else None,
          meta={"paid": paid, "amount": order.amount})
    db.commit()
    db.refresh(order)
    pf = db.query(Portfolio).filter(Portfolio.id == order.portfolio_id).first()
    return {
        "order": _order_payload(order),
        "account": {
            "id": pf.id if pf else None,
            "name": pf.name if pf else None,
            "balance": pf.balance if pf else None,
            "type": pf.type if pf else None,
        },
    }


@router.get("/orders")
def list_orders(user: User = Depends(get_current_user),
                db: Session = Depends(get_db),
                status: str | None = None):
    q = db.query(DepositOrder).filter(DepositOrder.user_id == user.id)
    if status:
        q = q.filter(DepositOrder.status == status)
    q = q.order_by(DepositOrder.id.desc()).limit(20)
    return {"orders": [_order_payload(o) for o in q.all()]}