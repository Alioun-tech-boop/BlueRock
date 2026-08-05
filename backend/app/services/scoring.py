from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models.ratios import FinancialRatio
from ..models.analysis import ScoreCard

class ScoringService:
    """Scores companies on multiple dimensions (0-10 scale)."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def _scale_value(self, value: Optional[float], thresholds: list) -> float:
        if value is None:
            return 5.0
        for score, min_val, max_val in thresholds:
            if min_val <= value <= max_val:
                return score
        return 5.0
    
    def score_profitability(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.roe is not None:
            if ratio.roe >= 20: scores.append(10)
            elif ratio.roe >= 15: scores.append(9)
            elif ratio.roe >= 10: scores.append(7)
            elif ratio.roe >= 5: scores.append(5)
            elif ratio.roe > 0: scores.append(4)
            else: scores.append(2)
        
        if ratio.net_margin is not None:
            if ratio.net_margin >= 20: scores.append(10)
            elif ratio.net_margin >= 12: scores.append(8)
            elif ratio.net_margin >= 8: scores.append(6)
            elif ratio.net_margin >= 4: scores.append(4)
            elif ratio.net_margin > 0: scores.append(3)
            else: scores.append(1)
        
        if ratio.operating_margin is not None:
            if ratio.operating_margin >= 25: scores.append(9)
            elif ratio.operating_margin >= 15: scores.append(7)
            elif ratio.operating_margin >= 8: scores.append(5)
            elif ratio.operating_margin > 0: scores.append(3)
            else: scores.append(1)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def score_growth(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.revenue_growth is not None:
            if ratio.revenue_growth >= 20: scores.append(10)
            elif ratio.revenue_growth >= 10: scores.append(8)
            elif ratio.revenue_growth >= 5: scores.append(6)
            elif ratio.revenue_growth > 0: scores.append(4)
            else: scores.append(2)
        
        if ratio.net_income_growth is not None:
            if ratio.net_income_growth >= 25: scores.append(10)
            elif ratio.net_income_growth >= 12: scores.append(8)
            elif ratio.net_income_growth >= 5: scores.append(6)
            elif ratio.net_income_growth > 0: scores.append(4)
            elif ratio.net_income_growth > -10: scores.append(2)
            else: scores.append(1)
        
        if ratio.eps_growth is not None:
            if ratio.eps_growth >= 20: scores.append(10)
            elif ratio.eps_growth >= 10: scores.append(7)
            elif ratio.eps_growth > 0: scores.append(5)
            elif ratio.eps_growth > -10: scores.append(3)
            else: scores.append(1)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def score_debt(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.debt_to_equity is not None:
            if ratio.debt_to_equity <= 0.3: scores.append(10)
            elif ratio.debt_to_equity <= 0.6: scores.append(9)
            elif ratio.debt_to_equity <= 1.0: scores.append(7)
            elif ratio.debt_to_equity <= 2.0: scores.append(5)
            elif ratio.debt_to_equity <= 3.0: scores.append(3)
            else: scores.append(1)
        
        if ratio.interest_coverage is not None:
            if ratio.interest_coverage >= 10: scores.append(10)
            elif ratio.interest_coverage >= 5: scores.append(8)
            elif ratio.interest_coverage >= 3: scores.append(6)
            elif ratio.interest_coverage >= 1.5: scores.append(4)
            else: scores.append(1)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def score_liquidity(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.current_ratio is not None:
            if ratio.current_ratio >= 2.5: scores.append(10)
            elif ratio.current_ratio >= 2.0: scores.append(8)
            elif ratio.current_ratio >= 1.5: scores.append(6)
            elif ratio.current_ratio >= 1.0: scores.append(4)
            else: scores.append(2)
        
        if ratio.quick_ratio is not None:
            if ratio.quick_ratio >= 1.5: scores.append(10)
            elif ratio.quick_ratio >= 1.0: scores.append(8)
            elif ratio.quick_ratio >= 0.7: scores.append(6)
            elif ratio.quick_ratio >= 0.5: scores.append(4)
            else: scores.append(2)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def score_valuation(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.pe_ratio is not None:
            if ratio.pe_ratio <= 5: scores.append(10)
            elif ratio.pe_ratio <= 8: scores.append(9)
            elif ratio.pe_ratio <= 10: scores.append(8)
            elif ratio.pe_ratio <= 15: scores.append(6)
            elif ratio.pe_ratio <= 20: scores.append(4)
            elif ratio.pe_ratio <= 30: scores.append(2)
            else: scores.append(1)
        
        if ratio.pb_ratio is not None:
            if ratio.pb_ratio <= 0.5: scores.append(10)
            elif ratio.pb_ratio <= 0.8: scores.append(9)
            elif ratio.pb_ratio <= 1.0: scores.append(8)
            elif ratio.pb_ratio <= 1.5: scores.append(6)
            elif ratio.pb_ratio <= 2.0: scores.append(4)
            elif ratio.pb_ratio <= 3.0: scores.append(2)
            else: scores.append(1)
        
        if ratio.dividend_yield is not None:
            if ratio.dividend_yield >= 10: scores.append(10)
            elif ratio.dividend_yield >= 7: scores.append(8)
            elif ratio.dividend_yield >= 5: scores.append(6)
            elif ratio.dividend_yield >= 3: scores.append(4)
            elif ratio.dividend_yield > 0: scores.append(2)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def score_moat(self, ratio: FinancialRatio) -> float:
        scores = []
        if ratio.roa is not None:
            if ratio.roa >= 10: scores.append(10)
            elif ratio.roa >= 7: scores.append(8)
            elif ratio.roa >= 4: scores.append(6)
            elif ratio.roa >= 2: scores.append(4)
            elif ratio.roa > 0: scores.append(2)
        
        if ratio.roe is not None:
            if ratio.roe >= 20: scores.append(10)
            elif ratio.roe >= 12: scores.append(7)
            elif ratio.roe >= 5: scores.append(4)
        
        if ratio.gross_margin is not None:
            if ratio.gross_margin >= 50: scores.append(10)
            elif ratio.gross_margin >= 35: scores.append(8)
            elif ratio.gross_margin >= 20: scores.append(6)
        
        return sum(scores) / len(scores) if scores else 5.0
    
    def generate_scorecard(self, company_id: int, fiscal_year: int) -> ScoreCard:
        ratio = self.db.query(FinancialRatio)\
            .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year, FinancialRatio.quarter.is_(None))\
            .first()
        if not ratio:
            raise ValueError(f"No financial data found for company {company_id}, year {fiscal_year}")
        
        profitability = self.score_profitability(ratio)
        growth = self.score_growth(ratio)
        debt = self.score_debt(ratio)
        liquidity = self.score_liquidity(ratio)
        valuation = self.score_valuation(ratio)
        moat = self.score_moat(ratio)
        
        total_score = (
            profitability * 0.20 +
            growth * 0.15 +
            debt * 0.15 +
            liquidity * 0.10 +
            valuation * 0.20 +
            moat * 0.20
        )
        
        rating = self._get_rating(total_score)
        
        scorecard = ScoreCard(
            company_id=company_id,
            fiscal_year=fiscal_year,
            profitability_score=round(profitability, 1),
            growth_score=round(growth, 1),
            debt_score=round(debt, 1),
            liquidity_score=round(liquidity, 1),
            management_score=round((profitability + growth) / 2, 1),
            valuation_score=round(valuation, 1),
            moat_score=round(moat, 1),
            total_score=round(total_score, 1),
            rating=rating
        )
        
        self.db.add(scorecard)
        self.db.commit()
        self.db.refresh(scorecard)
        return scorecard
    
    def _get_rating(self, score: float) -> str:
        if score >= 9.5: return "AAA"
        elif score >= 8.5: return "AA"
        elif score >= 7.5: return "A"
        elif score >= 6.5: return "BBB"
        elif score >= 5.5: return "BB"
        elif score >= 4.5: return "B"
        elif score >= 3.5: return "CCC"
        elif score >= 2.5: return "CC"
        else: return "C"
