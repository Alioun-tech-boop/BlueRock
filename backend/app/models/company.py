from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from ..database import Base

class Sector(enum.Enum):
    BANQUE = "Banque"
    ASSURANCE = "Assurance"
    AGROALIMENTAIRE = "Agroalimentaire"
    DISTRIBUTION = "Distribution"
    TRANSPORT = "Transport"
    TELECOMS = "Télécommunications"
    PETROLIER = "Pétrolier"
    SERVICES_PUBLICS = "Services Publics"
    MATERIAUX = "Matériaux"
    IMMOBILIER = "Immobilier"
    HOLDING = "Holding"
    SERVICES_FINANCIERS = "Services Financiers"
    CONSOMMATION_BASE = "Consommation de Base"
    CONSOMMATION_DISCRETIONNAIRE = "Consommation Discrétionnaire"
    ENERGIE = "Énergie"
    INDUSTRIELS = "Industriels"
    AUTRE = "Autre"

class Company(Base):
    __tablename__ = "companies"
    
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    sector = Column(Enum(Sector), nullable=False)
    instrument_type = Column(String(20), nullable=False, server_default="equity", default="equity")
    exchange = Column(String(20), nullable=False, server_default="BRVM", default="BRVM")  # BRVM | NGX
    currency = Column(String(10), nullable=False, server_default="XOF", default="XOF")   # XOF | NGN
    sub_sector = Column(String(100), nullable=True)  # spécifique NGX (ex. Building Materials)
    country = Column(String(50), nullable=True)
    isin = Column(String(20), unique=True)
    listing_date = Column(DateTime)
    shares_outstanding = Column(Float)
    per = Column(Float)
    reference_price = Column(Float)
    website = Column(String(500))
    description = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    financial_statements = relationship("FinancialStatement", back_populates="company")
    market_data = relationship("MarketData", back_populates="company")
    dividends = relationship("Dividend", back_populates="company")
    ratios = relationship("FinancialRatio", back_populates="company")
    analysis_reports = relationship("AnalysisReport", back_populates="company")
    scorecards = relationship("ScoreCard", back_populates="company")
    valuations = relationship("Valuation", back_populates="company")
