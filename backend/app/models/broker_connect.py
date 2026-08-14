"""Passerelle courtiers (Broker Connect) : comptes préexistants chez les SGI/SGO.

Trois entités :
- BrokerClientAccount : registre des comptes clients tels qu'ils existent
  chez le courtier (numéro de compte, titulaire, PIN haché, liquidités,
  positions). C'est « l'utilisateur préexistant » du courtier.
- BrokerSession : sessions issues de l'authentification chez le courtier
  (token HMAC signé + enregistrement serveur pour révocation immédiate).
- BrokerLoginEvent : journal d'audit de toutes les tentatives d'authentification.
"""

from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, func,
)
from sqlalchemy.orm import relationship
from ..database import Base


class BrokerClientAccount(Base):
    """Compte client préexistant chez un courtier (registre côté courtier)."""

    __tablename__ = "broker_client_accounts"

    id = Column(Integer, primary_key=True, index=True)
    broker_name = Column(String, nullable=False, index=True)
    account_number = Column(String, unique=True, index=True, nullable=False)
    holder_name = Column(String, nullable=False)
    pin_hash = Column(String, nullable=False)  # PBKDF2-SHA256 (salt$digest)
    cash_balance = Column(Float, default=0, nullable=False)
    holdings = Column(Text, nullable=True)  # JSON [{symbol, qty, avg_price}]
    status = Column(String, default="active", nullable=False)  # active | suspended
    failed_attempts = Column(Integer, default=0, nullable=False)
    locked_until = Column(DateTime, nullable=True)
    linked_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    last_sync_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", foreign_keys=[linked_user_id])
    sessions = relationship(
        "BrokerSession", back_populates="client_account",
        cascade="all, delete-orphan",
    )


class BrokerSession(Base):
    """Session d'authentification chez le courtier (révocable)."""

    __tablename__ = "broker_sessions"

    id = Column(Integer, primary_key=True, index=True)
    client_account_id = Column(
        Integer, ForeignKey("broker_client_accounts.id"), nullable=False, index=True
    )
    token_hash = Column(String, unique=True, index=True, nullable=False)  # SHA-256 du token
    user_id = Column(Integer, nullable=True)  # utilisateur plateforme au moment du link (si lié)
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)

    client_account = relationship("BrokerClientAccount", back_populates="sessions")


class BrokerLoginEvent(Base):
    """Journal d'audit des authentifications courtier (succès et échecs)."""

    __tablename__ = "broker_login_events"

    id = Column(Integer, primary_key=True, index=True)
    client_account_id = Column(Integer, ForeignKey("broker_client_accounts.id"),
                               nullable=True, index=True)
    broker_name = Column(String, nullable=True)
    account_number = Column(String, nullable=True)
    success = Column(Boolean, default=False, nullable=False)
    reason = Column(String, nullable=True)  # invalid_pin | locked | ok | link | unlink
    ip = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
