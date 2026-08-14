from sqlalchemy import Column, Integer, Float, String, Text, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import relationship
from ..database import Base


class PremiumPlan(Base):
    __tablename__ = "premium_plans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount = Column(Float, nullable=False, default=0)
    monthly = Column(Float, nullable=False, default=0)
    horizon_years = Column(Integer, nullable=False, default=5)
    risk_level = Column(String(20), nullable=False, default="balanced")
    plan_type = Column(String(30), nullable=False, default="epargne")  # epargne | retraite | etudes | succession

    # Cycle de vie : le plan émis persiste jusqu'à maturité ou annulation
    status = Column(String(20), nullable=False, default="active")  # active | completed | cancelled
    issued_at = Column(DateTime, server_default=func.now())
    matured_at = Column(DateTime, nullable=True)  # fin d'horizon
    cancelled_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    # Gestion automatique : le portefeuille passe sous la commande du plan
    linked_to_portfolio = Column(Boolean, nullable=False, default=False)
    linked_at = Column(DateTime, nullable=True)
    managed_portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True)
    pin_hash = Column(String, nullable=True)  # code de sécurité optionnel (6 chiffres, PBKDF2)

    # Allocation éditée à l'émission (immuable pour la valorisation continue)
    allocation_snapshot = Column(Text, nullable=True)  # JSON du plan émis
    start_value = Column(Float, nullable=True)         # capital total à l'émission (réserve comprise)

    # Dernière valorisation (mise à jour par le tracking)
    last_value = Column(Float, nullable=True)
    last_pnl_pct = Column(Float, nullable=True)
    last_tracked_at = Column(DateTime, nullable=True)
    last_day_change_pct = Column(Float, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="premium_plans")
    snapshots = relationship("PremiumSnapshot", back_populates="plan", cascade="all, delete-orphan")


class PremiumSnapshot(Base):
    __tablename__ = "premium_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    plan_id = Column(Integer, ForeignKey("premium_plans.id"), nullable=False, index=True)
    date = Column(DateTime, nullable=False, index=True)
    value = Column(Float, nullable=False, default=0)
    invested = Column(Float, nullable=False, default=0)
    pnl_pct = Column(Float, nullable=False, default=0)
    day_change_pct = Column(Float, nullable=True)

    plan = relationship("PremiumPlan", back_populates="snapshots")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type = Column(String(30), nullable=False, default="info")  # plan | price | alert | system
    title = Column(String(160), nullable=False)
    body = Column(Text, default="")
    link = Column(String(200), nullable=True)
    read = Column(Boolean, default=False, nullable=False)
    email_sent = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
