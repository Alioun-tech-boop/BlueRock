"""Ledger double entrée — audit monétaire immutable.

Le solde d'un portefeuille est une VUE ; la vérité est la somme des écritures
du grand livre. Toute modification de liquidités doit être journalisée ici
AVANT la mise à jour du solde, avec une clé d'idempotence unique pour éviter
les doubles écritures (webhook + re-vérification, retry, concurrence).
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, func, Index, Numeric, CheckConstraint
from sqlalchemy.dialects.postgresql import JSONB
from ..database import Base


class LedgerAccount(Base):
    """Charte des comptes par utilisateur/portefeuille.

    Codes :
      CASH_<portfolio_id>          : liquidités du portefeuille
      CASH_IN                     : entrées de cash (dépôts)
      CASH_OUT                    : sorties de cash (retraits)
      INVEST_<portfolio_id>        : valeur d'investissement (achats)
      DIVIDEND                    : dividendes crédités
      FEES                        : frais/commissions
      ADJUSTMENT                  : corrections manuelles (contrôle)
    """

    __tablename__ = "ledger_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    code = Column(String(64), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    currency = Column(String(8), nullable=False, default="XOF")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_ledger_accounts_user_code", "user_id", "code", unique=True),
    )


class LedgerEntry(Base):
    """Une écriture du grand livre (débit ou crédit), append-only."""

    __tablename__ = "ledger_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=True, index=True)
    account_code = Column(String(64), nullable=False, index=True)
    entry_type = Column(String(4), nullable=False)  # DR | CR
    amount = Column(Numeric(18, 2), nullable=False)
    currency = Column(String(8), nullable=False, default="XOF")

    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_ledger_amount_positive"),
    )
    # Référence métier (relation de la transaction) + clé d'idempotence.
    ref_type = Column(String(32), nullable=False)
    ref_id = Column(String(64), nullable=False, index=True)
    idempotency_key = Column(String(96), unique=True, nullable=False, index=True)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())