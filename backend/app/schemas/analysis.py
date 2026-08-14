from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class AIQuery(BaseModel):
    question: str = Field(min_length=2, max_length=500)
    company_id: Optional[int] = None
    company_name: Optional[str] = None

class AIResponse(BaseModel):
    answer: str
    context_used: bool = False
    ai_type: str = "rule-based"
    tokens_remaining: Optional[int] = None
    tier: Optional[str] = None

class AnalysisReportResponse(BaseModel):
    id: int
    title: str
    report_type: str
    summary: Optional[str] = None
    recommendations: Optional[str] = None
    target_price: Optional[float] = None
    confidence_score: Optional[float] = None
    created_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class PredictionResponse(BaseModel):
    predicted_eps: Optional[float] = None
    predicted_revenue: Optional[float] = None
    estimated_dividend: Optional[float] = None
    trend: Optional[str] = None
    confidence: Optional[float] = None
    risk_signals: List[Dict[str, Any]] = []
