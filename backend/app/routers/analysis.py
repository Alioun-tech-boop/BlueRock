from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from typing import Optional, List
from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..services.tier import consume_token
from ..database import get_db
from ..models.company import Company, Sector
from ..models.analysis import AnalysisReport, ScoreCard
from ..models.financial import FinancialStatement
from ..services.ratio_calculator import RatioCalculator
from ..services.valuation import ValuationService
from ..services.scoring import ScoringService
from ..services.predictions import PredictionService
from ..ai.analyst import AIAnalyst
from ..schemas.analysis import AIQuery, AIResponse, PredictionResponse
from ..routers.auth import get_current_user

router = APIRouter(prefix="/api/analysis", tags=["Analysis"])

@router.post("/ask", response_model=AIResponse)
def ask_ai(query: AIQuery, request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 questions / min / IP
    remaining = consume_token(db, user)  # 1 question = 1 token IA (mensuel)
    analyst = AIAnalyst(db)
    result = analyst.ask_question(
        company_id=query.company_id,
        question=query.question,
        company_name=query.company_name
    )
    return AIResponse(
        answer=result["answer"],
        context_used=result["context_used"],
        ai_type=result["ai_type"],
        tokens_remaining=remaining,
        tier=user.tier or "basic",
    )

def _resolve_company_id(company_id: str, db: Session) -> Optional[int]:
    if company_id.isdigit():
        return int(company_id)
    company = db.query(Company).filter(Company.symbol == company_id.upper()).first()
    return company.id if company else None

@router.post("/companies/{company_id}/analyze")
def analyze_company(company_id: str, fiscal_year: Optional[int] = None,
                    db: Session = Depends(get_db), user=Depends(get_current_user)):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    company = db.query(Company).filter(Company.id == cid).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    from sqlalchemy import func
    if not fiscal_year:
        fiscal_year = db.query(func.max(FinancialStatement.fiscal_year))\
            .filter(FinancialStatement.company_id == cid,
                    FinancialStatement.is_synthetic == False,
                    FinancialStatement.quarter.is_(None)).scalar()
    year = fiscal_year or 2023

    has_real = db.query(FinancialStatement.id).filter(
        FinancialStatement.company_id == cid,
        FinancialStatement.is_synthetic == False,
    ).first()
    if not has_real:
        raise HTTPException(status_code=422, detail="Aucun état financier réel disponible : importez les rapports PDF officiels avant de lancer l'analyse")
    
    calculator = RatioCalculator(db)
    ratios = calculator.calculate_all_ratios(cid, year)
    
    val_service = ValuationService(db)
    valuation = val_service.calculate_all_valuations(cid, year)
    if valuation is None:
        raise HTTPException(status_code=422, detail="Aucune valorisation calculable pour cet exercice (données EPS/BVPS/FCF manquantes)")
    
    scoring = ScoringService(db)
    scorecard = scoring.generate_scorecard(cid, year)
    
    analyst = AIAnalyst(db)
    report = analyst.generate_full_report(cid)
    
    return {
        "status": "success",
        "ratios": ratios.id,
        "valuation": valuation.id,
        "scorecard": scorecard.id,
        "report": report.id
    }

@router.get("/companies/{company_id}/predict", response_model=PredictionResponse)
def predict_company(company_id: str, db: Session = Depends(get_db)):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    has_real = db.query(FinancialStatement.id).filter(
        FinancialStatement.company_id == cid,
        FinancialStatement.is_synthetic == False,
    ).first()
    if not has_real:
        raise HTTPException(status_code=422, detail="Aucun état financier réel disponible : la prédiction nécessite des états financiers officiels")
    predictor = PredictionService(db)
    
    from sqlalchemy import func
    latest_year = db.query(func.max(FinancialStatement.fiscal_year))\
        .filter(FinancialStatement.company_id == cid,
                FinancialStatement.quarter.is_(None)).scalar() or 2023
    
    eps_pred = predictor.predict_next_eps(cid)
    rev_pred = predictor.predict_next_revenue(cid)
    div_est = predictor.estimate_dividend(cid, latest_year)
    risks = predictor.detect_risk_signals(cid)
    
    return PredictionResponse(
        predicted_eps=eps_pred["predicted_eps"] if eps_pred else None,
        predicted_revenue=rev_pred["predicted_revenue"] if rev_pred else None,
        estimated_dividend=div_est["estimated_dps"] if div_est else None,
        trend=eps_pred["trend"] if eps_pred else None,
        confidence=eps_pred["confidence"] if eps_pred else None,
        risk_signals=risks
    )

@router.get("/companies/{company_id}/report")
def get_analysis_report(company_id: str, db: Session = Depends(get_db)):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    report = db.query(AnalysisReport)\
        .filter(AnalysisReport.company_id == cid)\
        .order_by(AnalysisReport.created_at.desc())\
        .first()
    if not report:
        raise HTTPException(status_code=404, detail="No report found")
    return report

@router.get("/screen")
def screen_companies(
    min_score: float = Query(0, ge=0, le=10),
    max_pe: float = Query(50, ge=0),
    min_dividend: float = Query(0, ge=0),
    sector: Optional[str] = None,
    rating: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    from ..models.analysis import ScoreCard
    from ..models.ratios import FinancialRatio

    # Dernier scorecard et dernier ratio (année + id) par entreprise — DISTINCT ON
    # garantit une seule ligne par société, même si la base contient des doublons
    # historiques (anciennes versions de l'analyseur).
    latest_sc = db.query(
        ScoreCard.company_id,
        ScoreCard.id.label("sc_id"),
    ).distinct(ScoreCard.company_id).order_by(
        ScoreCard.company_id,
        ScoreCard.fiscal_year.desc(),
        ScoreCard.id.desc(),
    ).subquery()

    latest_rat = db.query(
        FinancialRatio.company_id,
        FinancialRatio.id.label("rat_id"),
    ).filter(FinancialRatio.quarter.is_(None)).distinct(FinancialRatio.company_id).order_by(
        FinancialRatio.company_id,
        FinancialRatio.fiscal_year.desc(),
        FinancialRatio.id.desc(),
    ).subquery()

    query = db.query(
        Company.id,
        Company.symbol,
        Company.name,
        Company.sector,
        Company.website,
        ScoreCard.total_score,
        ScoreCard.rating,
        FinancialRatio.pe_ratio,
        FinancialRatio.dividend_yield,
        FinancialRatio.roe,
        FinancialRatio.eps
    ).join(latest_sc, latest_sc.c.company_id == Company.id)\
     .join(latest_rat, latest_rat.c.company_id == Company.id)\
     .join(ScoreCard, ScoreCard.id == latest_sc.c.sc_id)\
     .join(FinancialRatio, FinancialRatio.id == latest_rat.c.rat_id)
    
    if sector:
        sector_enum = next((s for s in Sector if s.value.lower() == sector.lower()), None)
        if sector_enum:
            query = query.filter(Company.sector == sector_enum)
        else:
            query = query.filter(Company.sector == sector)

    if rating:
        query = query.filter(ScoreCard.rating == rating.upper())

    filters = [ScoreCard.total_score >= min_score, FinancialRatio.pe_ratio <= max_pe]
    if min_dividend and min_dividend > 0:
        filters.append(FinancialRatio.dividend_yield >= min_dividend)

    results = query.filter(*filters)\
        .order_by(ScoreCard.total_score.desc()).offset(skip).limit(limit).all()
    
    api_base = settings.API_BASE_URL.rstrip("/")

    from ..services.logos import resolve_logo_url

    return [
        {
            "company_id": r[0],
            "symbol": r[1],
            "name": r[2],
            "sector": r[3].value if hasattr(r[3], 'value') else r[3],
            "logo_url": resolve_logo_url(r[1], r[4], api_base),
            "score": float(r[5]) if r[5] is not None else None,
            "rating": r[6],
            "pe_ratio": float(r[7]) if r[7] is not None else None,
            "dividend_yield": float(r[8]) if r[8] is not None else None,
            "roe": float(r[9]) if r[9] is not None else None,
        }
        for r in results
    ]
