from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, func
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
    api_token = Column(String, unique=True, index=True, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    last_login = Column(DateTime, nullable=True)

    # Vérification email
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
    premium_plan = relationship("PremiumPlan", back_populates="user", cascade="all, delete-orphan", uselist=False)
    broker_accounts = relationship("BrokerAccount", back_populates="user", cascade="all, delete-orphan")


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
    status = Column(String, default="draft")  # draft | sent | approved
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="broker_accounts")


class Position(Base):
    __tablename__ = "positions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    qty = Column(Float, default=0)
    avg_price = Column(Float, default=0)

    user = relationship("User", back_populates="positions")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    symbol = Column(String, nullable=False, index=True)
    side = Column(String, nullable=False)  # buy | sell
    qty = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="orders")
