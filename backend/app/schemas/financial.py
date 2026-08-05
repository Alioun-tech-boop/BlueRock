from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

class FinancialStatementResponse(BaseModel):
    id: int
    company_id: int
    statement_type: str
    fiscal_year: int
    quarter: Optional[int] = None
    currency: str = "XOF"
    is_synthetic: Optional[bool] = False
    line_items: List[Dict[str, Any]] = []
    
    class Config:
        from_attributes = True

class RatioResponse(BaseModel):
    roe: Optional[float] = None
    roa: Optional[float] = None
    net_margin: Optional[float] = None
    operating_margin: Optional[float] = None
    gross_margin: Optional[float] = None
    ebitda_margin: Optional[float] = None
    cost_to_income: Optional[float] = None
    current_ratio: Optional[float] = None
    quick_ratio: Optional[float] = None
    debt_to_equity: Optional[float] = None
    interest_coverage: Optional[float] = None
    eps: Optional[float] = None
    bvps: Optional[float] = None
    fcf_per_share: Optional[float] = None
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ev_ebitda: Optional[float] = None
    ev_ebit: Optional[float] = None
    dividend_yield: Optional[float] = None
    revenue_growth: Optional[float] = None
    net_income_growth: Optional[float] = None
    eps_growth: Optional[float] = None
    dividend_per_share: Optional[float] = None
    
    class Config:
        from_attributes = True

class ValuationResponse(BaseModel):
    dcf_value: Optional[float] = None
    graham_value: Optional[float] = None
    buffett_value: Optional[float] = None
    target_price: Optional[float] = None
    current_price: Optional[float] = None
    discount_percent: Optional[float] = None
    recommendation: Optional[str] = None
    
    class Config:
        from_attributes = True

class ScoreCardResponse(BaseModel):
    profitability_score: Optional[float] = None
    growth_score: Optional[float] = None
    debt_score: Optional[float] = None
    liquidity_score: Optional[float] = None
    management_score: Optional[float] = None
    valuation_score: Optional[float] = None
    moat_score: Optional[float] = None
    total_score: Optional[float] = None
    rating: Optional[str] = None
    
    class Config:
        from_attributes = True
