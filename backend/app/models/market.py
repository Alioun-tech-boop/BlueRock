from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Date, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class MarketData(Base):
    __tablename__ = "market_data"
    __table_args__ = (
        UniqueConstraint("company_id", "date", name="uq_market_data_company_date"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    open_price = Column(Float)
    high_price = Column(Float)
    low_price = Column(Float)
    close_price = Column(Float, nullable=False)
    volume = Column(Float)
    change_percent = Column(Float)
    market_cap = Column(Float)
    source = Column(String(100))
    is_synthetic = Column(Boolean, default=False)
    
    company = relationship("Company", back_populates="market_data")

class Dividend(Base):
    __tablename__ = "dividends"
    __table_args__ = (
        UniqueConstraint("company_id", "fiscal_year", name="uq_dividends_company_year"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    dividend_per_share = Column(Float, nullable=False)
    ex_date = Column(Date)
    payment_date = Column(Date)
    dividend_type = Column(String(50))
    currency = Column(String(10), default="XOF")
    is_synthetic = Column(Boolean, default=False)
    
    company = relationship("Company", back_populates="dividends")
