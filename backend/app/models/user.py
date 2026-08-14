from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, func, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    auth_id = Column(PG_UUID(as_uuid=True), nullable=True, index=True)  # auth.users.id (Supabase)
    legacy_hash = Column(String, nullable=True)  # hash PBKDF2 avant migration Supabase
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    account_type = Column(String, default="demo")  # demo | real
    broker_name = Column(String, nullable=True)
    broker_account = Column(String, nullable=True)
    avatar = Column(String, nullable=True)  # emoji ou initiale custom
    email_notif_enabled = Column(Boolean, default=True, nullable=False)  # alertes plan par email
    api_token = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime, nullable=True)

    # Vérification email
    # Abonnement : tier (basic | pro) + tokens IA (allocation mensuelle).
    tier = Column(String, default="basic", nullable=False)  # basic | pro
    ai_tokens_remaining = Column(Integer, default=50, nullable=False)
    ai_tokens_reset_at = Column(DateTime, nullable=True)
    stripe_customer_id = Column(String, nullable=True)
    stripe_subscription_id = Column(String, nullable=True)

    email_verified = Column(Boolean, default=False, nullable=False)
    email_verify_code = Column(String, nullable=True)
    email_verify_expires = Column(DateTime, nullable=True)
    email_verify_attempts = Column(Integer, default=0, nullable=False)
    email_verify_sent_at = Column(DateTime, nullable=True)

    # 2FA TOTP
    totp_secret = Column(String, nullable=True)
    totp_enabled = Column(Boolean, default=False, nullable=False)
    recovery_codes = Column(String, nullable=True)  # hashes séparés par \n

    # Verrouillage
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)

    # Réinitialisation mot de passe
    password_reset_code = Column(String, nullable=True)
    password_reset_expires = Column(DateTime, nullable=True)
    password_reset_attempts = Column(Integer, default=0, nullable=False)

    positions = relationship("Position", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user", cascade="all, delete-orphan")
    premium_plans = relationship("PremiumPlan", back_populates="user", cascade="all, delete-orphan")
    broker_accounts = relationship("BrokerAccount", back_populates="user", cascade="all, delete-orphan")
    user_portfolios = relationship("UserPortfolio", back_populates="user", cascade="all, delete-orphan")
    portfolios = relationship("Portfolio", secondary="user_portfolios", viewonly=True)


class Portfolio(Base):
    """Compte portefeuille : réel (courtier) ou virtuel (entraînement).

    Entité indépendante de l'authentification : l'appartenance à un
    utilisateur passe par la table de liaison user_portfolios.
    """

    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False, default="demo")  # demo | real
    currency = Column(String, nullable=False, default="XOF", server_default="XOF")  # XOF (BRVM) | NGN (NGX)
    broker_name = Column(String, nullable=True)
    broker_client_id = Column(Integer, ForeignKey("broker_client_accounts.id"),
                              nullable=True, index=True)  # compte courtier lié
    balance = Column(Float, default=0, nullable=False)  # liquidités FCFA
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user_portfolios = relationship("UserPortfolio", back_populates="portfolio",
                                   cascade="all, delete-orphan")


class UserPortfolio(Base):
    """Liaison utilisateur ↔ portefeuille (plusieurs portefeuilles par utilisateur)."""

    __tablename__ = "user_portfolios"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False, index=True)
    is_owner = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="user_portfolios")
    portfolio = relationship("Portfolio", back_populates="user_portfolios")


class BrokerAccount(Base):
    __tablename__ = "broker_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    broker_name = Column(String, nullable=False)
    broker_category = Column(String, nullable=False)  # SGI | SGO
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    id_type = Column(String, nullable=False)  # cni | passeport | ninea | npi
    id_number = Column(String, nullable=False)
    kyc_id = Column(Integer, ForeignKey("user_kyc.id"), nullable=True, index=True)  # dossier KYC partagé avec la SGI
    # Cycle de vie du dossier SGI :
    #   transmitted → under_review | info_requested | refused
    #   approved (par la SGI) → account_opening → account_open
    status = Column(String, default="transmitted")
    sgi_note = Column(Text, nullable=True)            # note / motif de la SGI (demande d'infos, refus…)
    user_response = Column(Text, nullable=True)       # réponse de l'utilisateur aux informations demandées
    transmitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    account_opened_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="broker_accounts")


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    symbol = Column(String, nullable=False, index=True)
    qty = Column(Float, default=0)
    avg_price = Column(Float, default=0)
    take_profit = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)

    user = relationship("User", back_populates="positions")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    symbol = Column(String, nullable=False, index=True)
    side = Column(String, nullable=False)  # buy | sell
    qty = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    order_type = Column(String, nullable=False, default="market")  # market | limit | take_profit | stop_loss
    limit_price = Column(Float, nullable=True)
    status = Column(String, nullable=False, default="executed")  # executed | pending | cancelled
    take_profit = Column(Float, nullable=True)
    stop_loss = Column(Float, nullable=True)
    plan_id = Column(Integer, ForeignKey("premium_plans.id"), nullable=True, index=True)
    broker_ref = Column(String, nullable=True, index=True)  # référence d'ordre côté courtier
    executed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="orders")
