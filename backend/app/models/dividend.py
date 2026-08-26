"""Enregistrement des versements de dividendes réels crédités aux portefeuilles."""
from datetime import datetime
from sqlalchemy import Column, Integer, Float, DateTime, Date, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from ..database import Base


class DividendPayment(Base):
    __tablename__ = "dividend_payments"
    __table_args__ = (
        UniqueConstraint("user_id", "dividend_id", "portfolio_id", name="uq_user_dividend_portfolio"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    dividend_id = Column(Integer, ForeignKey("dividends.id"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    dividend_per_share = Column(Float, nullable=False)
    shares = Column(Float, nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), nullable=False, default="XOF")
    payment_date = Column(Date, nullable=False)
    credited_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")
    portfolio = relationship("Portfolio")
    company = relationship("Company")
    dividend = relationship("Dividend")