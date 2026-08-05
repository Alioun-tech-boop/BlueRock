from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class CompanyBase(BaseModel):
    symbol: str
    name: str
    sector: str
    isin: Optional[str] = None
    shares_outstanding: Optional[float] = None
    website: Optional[str] = None
    description: Optional[str] = None

class CompanyCreate(CompanyBase):
    pass

class CompanyResponse(CompanyBase):
    id: int
    current_price: Optional[float] = None
    change_percent: Optional[float] = None
    market_cap: Optional[float] = None
    logo_url: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CompanyList(BaseModel):
    companies: List[CompanyResponse]
    total: int
