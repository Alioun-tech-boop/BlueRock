from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Text, UniqueConstraint
from sqlalchemy.sql import func
from ..database import Base

class MacroIndicator(Base):
    __tablename__ = "macro_indicators"
    __table_args__ = (
        UniqueConstraint("indicator", "date", name="uq_macro_indicator_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    country = Column(String(50), nullable=False, default="Côte d'Ivoire")
    indicator = Column(String(100), nullable=False, index=True)
    date = Column(Date, nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit = Column(String(20), default="%")
    source = Column(String(100))
    updated_at = Column(DateTime(timezone=True), server_default=func.now())
