from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum, BigInteger, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from ..database import Base

class StatementType(enum.Enum):
    INCOME = "Income Statement"
    BALANCE = "Balance Sheet"
    CASH_FLOW = "Cash Flow Statement"
    NOTES = "Notes"

class FinancialStatement(Base):
    __tablename__ = "financial_statements"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    statement_type = Column(Enum(StatementType), nullable=False)
    fiscal_year = Column(Integer, nullable=False)
    quarter = Column(Integer)
    currency = Column(String(10), default="XOF")
    source_file = Column(String(500))
    is_consolidated = Column(Boolean, default=True)
    is_synthetic = Column(Boolean, default=False)
    extracted_at = Column(DateTime(timezone=True), server_default=func.now())
    
    company = relationship("Company", back_populates="financial_statements")
    line_items = relationship("FinancialLineItem", back_populates="statement")

class FinancialLineItem(Base):
    __tablename__ = "financial_line_items"
    
    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("financial_statements.id"), nullable=False)
    account_code = Column(String(50))
    account_name = Column(String(200), nullable=False)
    value = Column(Float, nullable=False)
    note_reference = Column(String(50))
    
    statement = relationship("FinancialStatement", back_populates="line_items")
