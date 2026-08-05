from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class FinancialRatio(Base):
    __tablename__ = "financial_ratios"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    quarter = Column(Integer)
    
    # Profitability Ratios
    roe = Column(Float)  # Return on Equity
    roa = Column(Float)  # Return on Assets
    net_margin = Column(Float)
    operating_margin = Column(Float)
    gross_margin = Column(Float)
    ebitda_margin = Column(Float)
    
    # Efficiency Ratios
    cost_to_income = Column(Float)
    asset_turnover = Column(Float)
    inventory_turnover = Column(Float)
    
    # Liquidity Ratios
    current_ratio = Column(Float)
    quick_ratio = Column(Float)
    cash_ratio = Column(Float)
    
    # Leverage Ratios
    debt_to_equity = Column(Float)
    debt_to_assets = Column(Float)
    interest_coverage = Column(Float)
    
    # Growth Rates
    revenue_growth = Column(Float)
    net_income_growth = Column(Float)
    eps_growth = Column(Float)
    book_value_growth = Column(Float)
    
    # Per Share
    eps = Column(Float)  # Earnings Per Share
    bvps = Column(Float)  # Book Value Per Share
    cfps = Column(Float)  # Cash Flow Per Share
    fcf_per_share = Column(Float)
    dividend_per_share = Column(Float)
    
    # Valuation
    pe_ratio = Column(Float)
    pb_ratio = Column(Float)
    ps_ratio = Column(Float)
    ev_ebitda = Column(Float)
    ev_ebit = Column(Float)
    dividend_yield = Column(Float)
    payout_ratio = Column(Float)
    
    # Banking Specific
    loan_to_deposit = Column(Float)
    cost_of_risk = Column(Float)
    net_interest_margin = Column(Float)
    tier1_capital_ratio = Column(Float)
    
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company", back_populates="ratios")
