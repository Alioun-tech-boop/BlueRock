from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database import Base

class AnalysisReport(Base):
    __tablename__ = "analysis_reports"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(300))
    report_type = Column(String(50))  # fundamental, technical, ai_analysis
    summary = Column(Text)
    raw_analysis = Column(JSON)
    recommendations = Column(String(50))  # BUY, SELL, HOLD
    target_price = Column(Float)
    confidence_score = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company", back_populates="analysis_reports")

class ScoreCard(Base):
    __tablename__ = "scorecards"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    
    profitability_score = Column(Float)
    growth_score = Column(Float)
    debt_score = Column(Float)
    liquidity_score = Column(Float)
    management_score = Column(Float)
    valuation_score = Column(Float)
    moat_score = Column(Float)
    momentum_score = Column(Float)
    
    total_score = Column(Float)
    rating = Column(String(20))  # AAA, AA, A, BBB, BB, B, CCC
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company", back_populates="scorecards")

class Valuation(Base):
    __tablename__ = "valuations"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    
    # DCF Valuation
    dcf_value = Column(Float)
    dcf_assumptions = Column(JSON)
    
    # Graham Value
    graham_value = Column(Float)
    
    # Buffett Value
    buffett_value = Column(Float)
    
    # EV Methods
    ev_ebitda_value = Column(Float)
    ev_ebit_value = Column(Float)
    
    # Target Price
    target_price = Column(Float)
    current_price = Column(Float)
    discount_percent = Column(Float)
    
    recommendation = Column(String(50))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company", back_populates="valuations")
