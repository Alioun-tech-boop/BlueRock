from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from ..config import settings
from ..database import get_db
from ..models.company import Company, Sector
from ..models.ratios import FinancialRatio
from ..models.financial import FinancialStatement, FinancialLineItem, StatementType
from ..models.market import MarketData, Dividend
from ..models.analysis import ScoreCard, Valuation, AnalysisReport
from ..schemas.company import CompanyResponse, CompanyCreate, CompanyList
from ..schemas.financial import RatioResponse, ValuationResponse, ScoreCardResponse, FinancialStatementResponse
from ..core.supabase_auth import storage_signed_url
from datetime import date
from sqlalchemy import func

router = APIRouter(prefix="/api/companies", tags=["Companies"])

LIVE_MODE = "BRVM_LIVE"
DB_MODE = "BRVM_DB"

API_URL = settings.API_BASE_URL.rstrip("/")

COLORS = [
    "#1a73e8", "#e8453c", "#34a853", "#fbbc04", "#9c27b0",
    "#00acc1", "#ff6d00", "#43a047", "#e91e63", "#3f51b5",
    "#795548", "#607d8b", "#009688", "#ff5722", "#673ab7"
]

def _resolve_company_id(company_id: str, db: Session) -> Optional[int]:
    """Resolve a company id or symbol to a numeric id."""
    if company_id.isdigit():
        return int(company_id)
    company = db.query(Company).filter(Company.symbol == company_id.upper()).first()
    return company.id if company else None


def _prefetch_context(db: Session, company_ids: List[int]) -> dict:
    """Précharge tout le contexte nécessaire à l'enrichissement en 4 requêtes
    (au lieu de ~6 requêtes par entreprise)."""
    latest = db.query(func.max(MarketData.date)).scalar() or date.today()
    ctx: dict = {
        "latest": latest,
        "mds": {},
        "ratios": {},
        "scorecards": {},
        "net_incomes": {},
        "live": None,
    }
    if not company_ids:
        return ctx

    for md in db.query(MarketData).filter(
            MarketData.date == latest, MarketData.company_id.in_(company_ids)).all():
        ctx["mds"][md.company_id] = md

    for r in db.query(FinancialRatio).filter(
            FinancialRatio.company_id.in_(company_ids),
            FinancialRatio.quarter.is_(None),
    ).order_by(FinancialRatio.fiscal_year.desc(), FinancialRatio.id.desc()).all():
        ctx["ratios"].setdefault(r.company_id, r)

    for s in db.query(ScoreCard).filter(
            ScoreCard.company_id.in_(company_ids)
    ).order_by(ScoreCard.fiscal_year.desc(), ScoreCard.id.desc()).all():
        ctx["scorecards"].setdefault(s.company_id, s)

    fy_rows = db.query(
        FinancialStatement.company_id,
        func.max(FinancialStatement.fiscal_year),
    ).filter(
        FinancialStatement.company_id.in_(company_ids),
        FinancialStatement.quarter.is_(None),
    ).group_by(
        FinancialStatement.company_id).all()
    for coid, fy in fy_rows:
        val = db.query(FinancialLineItem.value).join(FinancialStatement).filter(
            FinancialStatement.company_id == coid,
            FinancialStatement.fiscal_year == fy,
            FinancialStatement.quarter.is_(None),
            FinancialLineItem.account_name.ilike("%Résultat net%"),
        ).first()
        if val and val[0]:
            ctx["net_incomes"][coid] = val[0]

    from ..scrapers.live_feed import live_feed
    ctx["live"] = live_feed.snapshot()
    return ctx


def _enrich_company(company, db, ctx: Optional[dict] = None):
    """Attach current price, change, market_cap, logo, real ratios to a company."""
    if ctx is None:
        ctx = _prefetch_context(db, [company.id])

    latest = ctx["latest"]
    md = ctx["mds"].get(company.id)

    snap = ctx["live"]
    live_prices = (snap or {}).get("prices") or {}
    live_on = bool(snap and snap.get("status") != "OFFLINE")
    live_price = live_prices.get(company.symbol)
    price_source = LIVE_MODE if (live_price and live_on) else DB_MODE

    ratio = ctx["ratios"].get(company.id)

    eps = None
    if company.shares_outstanding and company.id in ctx["net_incomes"]:
        eps = ctx["net_incomes"][company.id] / company.shares_outstanding

    idx = hash(company.symbol) % len(COLORS)
    initial = company.symbol[0].upper()
    from ..services.logos import resolve_logo_url

    price = live_price["price"] if live_price else md.close_price if md else None
    per_real = company.per
    if not per_real and price and eps:
        per_real = round(price / eps, 2) if eps > 0 else None

    result = {
        "id": company.id,
        "symbol": company.symbol,
        "name": company.name,
        "sector": company.sector.value if company.sector else "Autre",
        "instrument_type": company.instrument_type or "equity",
        "isin": company.isin,
        "shares_outstanding": company.shares_outstanding,
        "website": company.website,
        "description": company.description,
        "current_price": price,
        "change_percent": live_price["change"] if live_price else (md.change_percent if md else None),
        "market_cap": (price * company.shares_outstanding) if live_price and company.shares_outstanding else (md.market_cap if md else None),
        "price_source": price_source,
        "per": per_real,
        "eps": eps,
        "reference_price": company.reference_price,
        "pe_ratio": float(ratio.pe_ratio) if ratio and ratio.pe_ratio else per_real,
        "pb_ratio": float(ratio.pb_ratio) if ratio and ratio.pb_ratio else None,
        "ps_ratio": float(ratio.ps_ratio) if ratio and ratio.ps_ratio else None,
        "roe": float(ratio.roe) if ratio and ratio.roe else None,
        "dividend_yield": float(ratio.dividend_yield) if ratio and ratio.dividend_yield else None,
        "bpa": eps,
        "net_margin": float(ratio.net_margin) if ratio and ratio.net_margin else None,
        "revenue": None,
        "net_income": None,
        "ev_ebitda": float(ratio.ev_ebitda) if ratio and ratio.ev_ebitda else None,
        "total_score": None,
        "rating": None,
        "logo_url": resolve_logo_url(company.symbol, company.website, API_URL),
        "created_at": company.created_at,
    }

    scorecard = ctx["scorecards"].get(company.id)
    if scorecard:
        result.update({
            "total_score": float(scorecard.total_score),
            "rating": scorecard.rating,
            "growth_score": float(scorecard.growth_score) if scorecard.growth_score else None,
            "profitability_score": float(scorecard.profitability_score) if scorecard.profitability_score else None,
            "valuation_score": float(scorecard.valuation_score) if scorecard.valuation_score else None,
            "debt_score": float(scorecard.debt_score) if scorecard.debt_score else None,
            "liquidity_score": float(scorecard.liquidity_score) if scorecard.liquidity_score else None,
            "management_score": float(scorecard.management_score) if scorecard.management_score else None,
            "moat_score": float(scorecard.moat_score) if scorecard.moat_score else None,
            "momentum_score": float(scorecard.momentum_score) if scorecard.momentum_score else None,
        })

    return result

@router.get("/sectors")
def get_sectors():
    return [s.value for s in Sector]

@router.get("/top-performers")
def get_top_performers(limit: int = 10, db: Session = Depends(get_db)):
    from sqlalchemy import func as safunc
    from ..models.analysis import ScoreCard

    latest = db.query(
        ScoreCard.company_id,
        safunc.max(ScoreCard.fiscal_year).label("fy")
    ).group_by(ScoreCard.company_id).subquery()

    scorecards = db.query(ScoreCard).join(
        latest,
        (latest.c.company_id == ScoreCard.company_id) & (latest.c.fy == ScoreCard.fiscal_year)
    ).order_by(ScoreCard.total_score.desc()).limit(limit).all()

    from ..scrapers.live_feed import live_feed
    snap = live_feed.snapshot()
    live_prices = snap.get("prices") or {}
    live_on = snap["status"] != "OFFLINE"
    latest_date = db.query(func.max(MarketData.date)).scalar() or date.today()

    ids = [sc.company_id for sc in scorecards]
    companies = {c.id: c for c in db.query(Company).filter(Company.id.in_(ids)).all()} if ids else {}
    mds = {md.company_id: md for md in db.query(MarketData).filter(
        MarketData.date == latest_date, MarketData.company_id.in_(ids)).all()} if ids else {}

    result = []
    for sc in scorecards:
        company = companies.get(sc.company_id)
        md = mds.get(sc.company_id)
        live_price = live_prices.get(company.symbol) if company else None
        current_price = live_price["price"] if (live_price and live_on) else (md.close_price if md else None)
        change_percent = live_price["change"] if (live_price and live_on) else (md.change_percent if md else None)
        from ..services.logos import resolve_logo_url
        logo_url = resolve_logo_url(company.symbol if company else "", company.website if company else None, API_URL)
        result.append({
            "company_id": sc.company_id,
            "company_name": company.name if company else "N/A",
            "symbol": company.symbol if company else "N/A",
            "logo_url": logo_url,
            "current_price": current_price,
            "change_percent": change_percent,
            "total_score": sc.total_score,
            "rating": sc.rating,
            "profitability": sc.profitability_score,
            "growth": sc.growth_score,
            "valuation": sc.valuation_score
        })
    return result

@router.get("")
def list_companies(
    sector: Optional[str] = None,
    search: Optional[str] = None,
    instrument_type: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(Company)
    if instrument_type:
        query = query.filter(Company.instrument_type == instrument_type)
    if sector:
        sector_enum = next((s for s in Sector if s.value.lower() == sector.lower()), None)
        if sector_enum:
            query = query.filter(Company.sector == sector_enum)
        else:
            query = query.filter(Company.sector == sector)
    if search:
        query = query.filter(
            Company.name.ilike(f"%{search}%") | Company.symbol.ilike(f"%{search}%")
        )
    total = query.count()
    companies = query.offset(skip).limit(limit).all()
    ctx = _prefetch_context(db, [c.id for c in companies])
    enriched = [_enrich_company(c, db, ctx) for c in companies]
    return {"companies": enriched, "total": total}

@router.get("/{company_id}")
def get_company(company_id: str, db: Session = Depends(get_db)):
    company = None
    if company_id.isdigit():
        company = db.query(Company).filter(Company.id == int(company_id)).first()
    if not company:
        company = db.query(Company).filter(
            Company.symbol == company_id.upper()
        ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return _enrich_company(company, db)

@router.get("/{company_id}/ratios", response_model=RatioResponse)
def get_company_ratios(
    company_id: str,
    fiscal_year: Optional[int] = None,
    db: Session = Depends(get_db)
):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    query = db.query(FinancialRatio).filter(
        FinancialRatio.company_id == cid, FinancialRatio.quarter.is_(None))
    if fiscal_year:
        query = query.filter(FinancialRatio.fiscal_year == fiscal_year)
    ratio = query.order_by(FinancialRatio.fiscal_year.desc()).first()
    if not ratio:
        raise HTTPException(status_code=404, detail="No ratios found")
    return ratio

@router.get("/{company_id}/financials", response_model=List[FinancialStatementResponse])
def get_company_financials(
    company_id: str,
    fiscal_year: Optional[int] = None,
    statement_type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    query = db.query(FinancialStatement).filter(
        FinancialStatement.company_id == cid, FinancialStatement.quarter.is_(None))
    if fiscal_year:
        query = query.filter(FinancialStatement.fiscal_year == fiscal_year)
    if statement_type:
        query = query.filter(FinancialStatement.statement_type == statement_type)
    from sqlalchemy.orm import joinedload
    statements = query.options(joinedload(FinancialStatement.line_items)).order_by(
        FinancialStatement.fiscal_year.desc()).all()
    
    result = []
    for stmt in statements:
        stmt_dict = {
            "id": stmt.id,
            "company_id": stmt.company_id,
            "statement_type": stmt.statement_type.value if stmt.statement_type else None,
            "fiscal_year": stmt.fiscal_year,
            "quarter": stmt.quarter,
            "currency": stmt.currency,
            "is_synthetic": stmt.is_synthetic,
            "line_items": [{"account_name": item.account_name, "value": item.value} for item in stmt.line_items]
        }
        result.append(stmt_dict)
    return result

@router.get("/{company_id}/valuation", response_model=ValuationResponse)
def get_company_valuation(company_id: str, fiscal_year: Optional[int] = None, db: Session = Depends(get_db)):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    query = db.query(Valuation).filter(Valuation.company_id == cid)
    if fiscal_year:
        query = query.filter(Valuation.fiscal_year == fiscal_year)
    valuation = query.order_by(Valuation.fiscal_year.desc()).first()
    if not valuation:
        raise HTTPException(status_code=404, detail="No valuation found")
    return valuation

@router.get("/{company_id}/scorecard", response_model=ScoreCardResponse)
def get_company_scorecard(company_id: str, fiscal_year: Optional[int] = None, db: Session = Depends(get_db)):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    query = db.query(ScoreCard).filter(ScoreCard.company_id == cid)
    if fiscal_year:
        query = query.filter(ScoreCard.fiscal_year == fiscal_year)
    scorecard = query.order_by(ScoreCard.fiscal_year.desc()).first()
    if not scorecard:
        raise HTTPException(status_code=404, detail="No scorecard found")
    return scorecard

@router.get("/{company_id}/market-data")
def get_company_market_data(
    company_id: str,
    days: int = Query(3650, ge=1, le=20000),
    db: Session = Depends(get_db)
):
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    data = db.query(MarketData)\
        .filter(MarketData.company_id == cid)\
        .order_by(MarketData.date.desc())\
        .limit(days)\
        .all()
    out = []
    prev_close = None
    for m in sorted(data, key=lambda x: x.date):
        open_price = m.open_price if m.open_price is not None else (prev_close or m.close_price)
        high = m.high_price if m.high_price is not None else max(open_price, m.close_price)
        low = m.low_price if m.low_price is not None else min(open_price, m.close_price)
        out.append({
            "date": m.date.isoformat(),
            "open": open_price,
            "high": high,
            "low": low,
            "close": m.close_price,
            "open_price": open_price,
            "high_price": high,
            "low_price": low,
            "close_price": m.close_price,
            "volume": m.volume,
            "change_percent": m.change_percent,
            "market_cap": m.market_cap,
        })
        prev_close = m.close_price
    from ..services.split_adjust import adjust_rows
    out = adjust_rows(out)
    return out


@router.get("/{company_id}/full")
def get_company_full(company_id: str, days: int = Query(365, ge=30, le=20000), db: Session = Depends(get_db)):
    """Fiche entreprise complète : infos, prix, ratios, scorecard, valorisation,
    rapport IA, historique prix (chandeliers), dividendes et news (données réelles uniquement)."""
    cid = _resolve_company_id(company_id, db)
    if not cid:
        raise HTTPException(status_code=404, detail="Company not found")
    company = db.query(Company).filter(Company.id == cid).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    base = _enrich_company(company, db)

    latest_date = db.query(func.max(MarketData.date)).scalar() or date.today()
    latest_md = db.query(MarketData).filter(
        MarketData.company_id == cid, MarketData.date == latest_date
    ).first()
    prev_md = db.query(MarketData).filter(
        MarketData.company_id == cid, MarketData.date < latest_date
    ).order_by(MarketData.date.desc()).first()

    ratio = db.query(FinancialRatio).filter(
        FinancialRatio.company_id == cid, FinancialRatio.quarter.is_(None))\
        .order_by(FinancialRatio.fiscal_year.desc(), FinancialRatio.id.desc()).first()
    scorecard = db.query(ScoreCard).filter(ScoreCard.company_id == cid)\
        .order_by(ScoreCard.fiscal_year.desc(), ScoreCard.id.desc()).first()
    valuation = db.query(Valuation).filter(Valuation.company_id == cid)\
        .order_by(Valuation.fiscal_year.desc(), Valuation.id.desc()).first()
    report = db.query(AnalysisReport).filter(AnalysisReport.company_id == cid)\
        .order_by(AnalysisReport.created_at.desc()).first()

    hist = db.query(MarketData).filter(MarketData.company_id == cid)\
        .order_by(MarketData.date.desc()).limit(days).all()
    hist.sort(key=lambda m: m.date)

    dividends = db.query(Dividend).filter(Dividend.company_id == cid)\
        .order_by(Dividend.fiscal_year.asc()).all()

    from ..scrapers.news_feed import company_news
    news = company_news(company.symbol, company.name or "")

    def ratio_dict():
        if not ratio:
            return {}
        return {
            "roe": ratio.roe, "roa": ratio.roa,
            "net_margin": ratio.net_margin, "operating_margin": ratio.operating_margin,
            "gross_margin": ratio.gross_margin, "ebitda_margin": ratio.ebitda_margin,
            "cost_to_income": ratio.cost_to_income,
            "current_ratio": ratio.current_ratio, "quick_ratio": ratio.quick_ratio,
            "cash_ratio": ratio.cash_ratio,
            "debt_to_equity": ratio.debt_to_equity, "interest_coverage": ratio.interest_coverage,
            "eps": ratio.eps, "bvps": ratio.bvps, "cfps": ratio.cfps,
            "fcf_per_share": ratio.fcf_per_share, "dividend_per_share": ratio.dividend_per_share,
            "pe_ratio": ratio.pe_ratio, "pb_ratio": ratio.pb_ratio, "ps_ratio": ratio.ps_ratio,
            "ev_ebitda": ratio.ev_ebitda, "ev_ebit": ratio.ev_ebit,
            "dividend_yield": ratio.dividend_yield, "payout_ratio": ratio.payout_ratio,
            "revenue_growth": ratio.revenue_growth, "net_income_growth": ratio.net_income_growth,
            "eps_growth": ratio.eps_growth,
            "loan_to_deposit": ratio.loan_to_deposit, "cost_of_risk": ratio.cost_of_risk,
        }

    def scorecard_dict():
        if not scorecard:
            return {}
        return {
            "total_score": scorecard.total_score, "rating": scorecard.rating,
            "profitability_score": scorecard.profitability_score,
            "growth_score": scorecard.growth_score, "debt_score": scorecard.debt_score,
            "liquidity_score": scorecard.liquidity_score,
            "management_score": scorecard.management_score,
            "valuation_score": scorecard.valuation_score,
            "moat_score": scorecard.moat_score, "momentum_score": scorecard.momentum_score,
            "fiscal_year": scorecard.fiscal_year,
        }

    def valuation_dict():
        if not valuation:
            return {}
        return {
            "dcf_value": valuation.dcf_value, "graham_value": valuation.graham_value,
            "buffett_value": valuation.buffett_value,
            "ev_ebitda_value": valuation.ev_ebitda_value, "ev_ebit_value": valuation.ev_ebit_value,
            "target_price": valuation.target_price, "current_price": valuation.current_price,
            "discount_percent": valuation.discount_percent,
            "recommendation": valuation.recommendation,
        }

    raw = {}
    if report and report.raw_analysis:
        raw = report.raw_analysis if isinstance(report.raw_analysis, dict) else {}

    prev_close = None
    history_out = []
    for m in hist:
        open_price = m.open_price if m.open_price is not None else (prev_close or m.close_price)
        high = m.high_price if m.high_price is not None else max(open_price, m.close_price)
        low = m.low_price if m.low_price is not None else min(open_price, m.close_price)
        history_out.append({
            "date": m.date.isoformat(),
            "open": open_price, "high": high,
            "low": low, "close": m.close_price,
            "volume": m.volume,
        })
        prev_close = m.close_price

    from ..services.split_adjust import adjust_rows
    history_out = adjust_rows(history_out)

    statements = db.query(FinancialStatement).filter(
        FinancialStatement.company_id == cid,
    ).order_by(
        FinancialStatement.fiscal_year.desc(),
        FinancialStatement.quarter.asc().nulls_last(),
        FinancialStatement.statement_type,
    ).all()

    return {
        "company": base,
        "price": {
            "current": latest_md.close_price if latest_md else None,
            "change_percent": latest_md.change_percent if latest_md else None,
            "open": latest_md.open_price if latest_md else None,
            "high": latest_md.high_price if latest_md else None,
            "low": latest_md.low_price if latest_md else None,
            "volume": latest_md.volume if latest_md else None,
            "prev_close": prev_md.close_price if prev_md else None,
            "market_cap": latest_md.market_cap if latest_md else None,
            "date": latest_date.isoformat(),
            "per": company.per or (ratio.pe_ratio if ratio else None),
        },
        "ratios": ratio_dict(),
        "scorecard": scorecard_dict(),
        "valuation": valuation_dict(),
        "ai": {
            "summary": report.summary if report else None,
            "recommendation": (report.recommendations or valuation.recommendation) if (report or valuation) else None,
            "target_price": report.target_price if report else (valuation.target_price if valuation else None),
            "confidence": report.confidence_score if report else None,
            "raw": raw,
        },
        "history": history_out,
        "statements": [
            {
                "id": s.id,
                "type": s.statement_type.value,
                "fiscal_year": s.fiscal_year,
                "quarter": s.quarter,
                "currency": s.currency,
                "is_consolidated": s.is_consolidated,
                "source_file": s.source_file,
                "extracted_at": s.extracted_at.isoformat() if s.extracted_at else None,
                "source_url": (s.source_file if str(s.source_file or "").startswith("http")
                               else storage_signed_url("uploads", f"pdfs/{s.source_file}")
                               if s.source_file else None),
                "line_items": [
                    {"account": i.account_name, "value": i.value}
                    for i in s.line_items
                ],
            }
            for s in statements
        ],
        "dividends": [
            {
                "fiscal_year": d.fiscal_year,
                "dividend_per_share": d.dividend_per_share,
                "ex_date": d.ex_date.isoformat() if d.ex_date else None,
                "payment_date": d.payment_date.isoformat() if d.payment_date else None,
                "dividend_type": d.dividend_type,
                "yield_pct": (d.dividend_per_share / latest_md.close_price * 100) if (latest_md and latest_md.close_price) else None,
            }
            for d in dividends
        ],
        "profile": None,
        "news": news,
        "data_synthetic": bool(
            db.query(FinancialStatement.id).filter(
                FinancialStatement.company_id == cid,
                FinancialStatement.is_synthetic == True,
            ).first()
        ),
    }

