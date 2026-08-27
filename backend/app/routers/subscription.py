"""Abonnement Premium (offre Pro) — Stripe via Supabase Edge Functions.

Flux :
  1. POST /api/subscription/subscribe → ordre pending + URL de checkout
     Stripe (session mode=subscription créée par l'Edge Function
     stripe-subscribe) ;
  2. l'utilisateur s'abonne sur la page hébergée Stripe (4 900 FCFA/mois) ;
  3. confirmation : webhook Stripe (stripe-webhook, qui bascule la tier en
     "pro" et crée l'allocation mensuelle de tokens IA) OU re-vérification
     au retour du checkout (POST /orders/{id}/verify → stripe-subscription-status) ;
  4. l'annulation (retour au plan Basic) est locale (POST /cancel) ; le
     webhook customer.subscription.deleted fera de même en production.

Aucune simulation : sans Supabase/Stripe configurés, l'API refuse de créer
un ordre d'abonnement.
"""

import datetime
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..models.payment import SubscriptionOrder
from ..models.user import User
from ..services import stripe_http
from ..services.tier import set_tier, is_pro, tokens_available
from .auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/subscription", tags=["subscription"])


def _order_payload(o: SubscriptionOrder) -> dict:
    return {
        "id": o.id,
        "order_id": o.order_id,
        "status": o.status,
        "provider_transaction_id": o.provider_transaction_id,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "confirmed_at": o.confirmed_at.isoformat() if o.confirmed_at else None,
    }


@router.post("/trial")
def start_trial(request: Request, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Offre l'essai gratuit Pro (durée configurée, une seule fois par compte).

    Aucun paiement requis ni config Stripe : l'essai est accordé immédiatement.
    """
    check_rate_limit(request, limit=5, window_seconds=60)
    if is_pro(user):
        raise HTTPException(status_code=409,
                            detail="Vous êtes déjà Pro (essai ou abonnement)")

    if user.trial_ends_at is not None:
        raise HTTPException(
            status_code=409,
            detail="Vous avez déjà utilisé votre essai gratuit.",
            headers={"X-BlueRock-Code": "trial_used"},
        )

    set_tier(db, user, settings.TIER_PRO)
    user.trial_ends_at = datetime.datetime.utcnow() + datetime.timedelta(
        days=settings.TRIAL_DAYS)
    db.commit()
    db.refresh(user)
    return {"plan": tokens_available(db, user)}


@router.post("/subscribe")
def subscribe(request: Request, user: User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    """Crée l'ordre d'abonnement Pro et l'URL de checkout Stripe."""
    check_rate_limit(request, limit=10, window_seconds=60)
    if not settings.FEATURE_SUBSCRIPTION_ENABLED:
        raise HTTPException(status_code=503,
                            detail="L'abonnement Pro est indisponible pour le moment.")
    if is_pro(user):
        raise HTTPException(status_code=409, detail="Vous êtes déjà abonné à l'offre Pro")

    if not stripe_http.is_configured():
        raise HTTPException(status_code=503,
                            detail="L'abonnement n'est pas configuré (Supabase/Stripe)")

    # Les ordres en attente non finalisés ne doivent pas s'accumuler.
    db.query(SubscriptionOrder).filter(
        SubscriptionOrder.user_id == user.id,
        SubscriptionOrder.status == "pending",
    ).update({"status": "cancelled"})

    order = SubscriptionOrder(
        order_id=f"SUB{uuid.uuid4().hex[:20]}".upper(),
        user_id=user.id,
        status="pending",
    )
    db.add(order)
    # Commit AVANT l'appel Edge : l'Edge (connexion séparée) doit voir l'ordre.
    db.commit()
    db.refresh(order)

    try:
        data = stripe_http.create_subscription(
            {
                "order_id": order.order_id,
                "return_url": settings.SUBSCR_RETURN_URL,
            }
        )
    except stripe_http.StripeEdgeError as e:
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=502, detail=str(e))
    if not data.get("url"):
        order.status = "failed"
        db.commit()
        raise HTTPException(status_code=502,
                            detail="La passerelle de paiement n'a pas retourné d'URL")

    order.provider_transaction_id = data.get("session_id") or ""
    order.meta = {
        "session_id": data.get("session_id") or "",
        "checkout_url": data["url"],
    }
    db.commit()
    db.refresh(order)
    return {"mode": "subscription",
            "payment_url": data["url"], "order": _order_payload(order)}


@router.post("/orders/{order_id}/verify")
def verify_subscription(order_id: int, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    """Re-vérifie l'abonnement auprès de Stripe (appelé au retour du checkout)."""
    order = db.query(SubscriptionOrder).filter(
        SubscriptionOrder.id == order_id,
        SubscriptionOrder.user_id == user.id,
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Ordre d'abonnement introuvable")

    try:
        info = stripe_http.check_subscription_status(order.order_id)
    except stripe_http.StripeEdgeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    if info.get("subscribed"):
        import datetime
        if order.status != "accepted":
            order.status = "accepted"
            order.confirmed_at = datetime.datetime.utcnow()
            db.commit()
        set_tier(db, user, settings.TIER_PRO)

    fresh = db.query(SubscriptionOrder).filter(
        SubscriptionOrder.id == order.id).first()
    return {
        "order": _order_payload(fresh),
        "plan": tokens_available(db, user),
    }


@router.post("/cancel")
def cancel_subscription(user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    """Annule l'abonnement : retour au plan Basic + tokens réinitialisés.

    En production, l'annulation passera par le portail client Stripe (le
    webhook customer.subscription.deleted fera la même bascule côté serveur).
    """
    db.query(SubscriptionOrder).filter(
        SubscriptionOrder.user_id == user.id,
        SubscriptionOrder.status == "accepted",
    ).update({"status": "cancelled"})
    set_tier(db, user, settings.TIER_BASIC)
    return {"plan": tokens_available(db, user)}


@router.get("/status")
def subscription_status(user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    """État de l'abonnement (tier, tokens, prochaine régénération)."""
    return {"plan": tokens_available(db, user)}