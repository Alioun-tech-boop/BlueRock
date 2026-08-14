from sqlalchemy import Column, Integer, Float, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB

from ..database import Base


class DepositOrder(Base):
    """Ordre de paiement (dépôt compte réel ou frais d'inscription à un défi).

    Créé côté app (statut pending), puis confirmé par le webhook Stripe
    (Supabase Edge Function) : le solde du portefeuille est crédité UNE
    SEULE FOIS (flag credited), quelle que soit la source de confirmation
    (webhook ou re-vérification au retour du checkout).
    """

    __tablename__ = "deposit_orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="XOF", nullable=False)
    provider = Column(String, default="stripe", nullable=False)
    provider_transaction_id = Column(String, unique=True, index=True, nullable=False)
    purpose = Column(String, default="deposit", nullable=False)  # deposit | challenge_fee
    status = Column(String, default="pending", nullable=False)  # pending | accepted | refused | failed | cancelled | refunded
    credited = Column(Boolean, default=False, nullable=False)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    confirmed_at = Column(DateTime, nullable=True)


class SubscriptionOrder(Base):
    """Ordre d'abonnement Pro (checkout Stripe mode=subscription).

    Créé côté app (statut pending), puis confirmé par le webhook Stripe
    (Edge Function stripe-webhook) ou la re-vérification au retour du
    checkout (stripe-subscription-status) : l'utilisateur passe en tier
    "pro" et reçoit son allocation mensuelle de tokens IA (idempotent).
    """

    __tablename__ = "subscription_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider_transaction_id = Column(String, nullable=True)  # session Stripe
    status = Column(String, default="pending", nullable=False)  # pending | accepted | cancelled | failed
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    confirmed_at = Column(DateTime, nullable=True)