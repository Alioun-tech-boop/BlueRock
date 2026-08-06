from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from ..models.ratios import FinancialRatio
from ..models.company import Company
from ..models.market import MarketData
from ..models.analysis import Valuation

class ValuationService:
    """Calculates intrinsic value using multiple methods."""
    
    WACC_DEFAULT = 0.10
    GROWTH_RATE_DEFAULT = 0.05
    TERMINAL_GROWTH = 0.03
    PROJECTION_YEARS = 5
    RISK_FREE_RATE = 0.065  # ~6.5% for WAEMU region
    EQUITY_RISK_PREMIUM = 0.08
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_current_price(self, company_id: int) -> Optional[float]:
        market_data = self.db.query(MarketData)\
            .filter(MarketData.company_id == company_id)\
            .order_by(MarketData.date.desc())\
            .first()
        return market_data.close_price if market_data else None
    
    def calculate_dcf(self, company_id: int, fiscal_year: int) -> Optional[float]:
        ratio = self.db.query(FinancialRatio)\
            .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year, FinancialRatio.quarter.is_(None))\
            .first()
        if not ratio or not ratio.fcf_per_share:
            return None
        
        fcf_per_share = ratio.fcf_per_share
        eps = ratio.eps or 0
        
        growth_rates = []
        for yr in range(1, 4):
            prev = self.db.query(FinancialRatio)\
                .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year - yr, FinancialRatio.quarter.is_(None))\
                .first()
            if prev and prev.eps:
                growth_rates.append((prev.eps - eps) / abs(eps) if eps != 0 else 0)
        
        avg_growth = sum(growth_rates) / len(growth_rates) if growth_rates else self.GROWTH_RATE_DEFAULT
        growth_rate = min(max(avg_growth, -0.2), 0.30)
        
        wacc = self.WACC_DEFAULT
        if ratio.debt_to_equity:
            weight_debt = ratio.debt_to_equity / (1 + ratio.debt_to_equity)
            weight_equity = 1 - weight_debt
            cost_equity = self.RISK_FREE_RATE + self.EQUITY_RISK_PREMIUM
            cost_debt = self.RISK_FREE_RATE * 0.7
            wacc = weight_equity * cost_equity + weight_debt * cost_debt
        
        pv_fcf = 0
        for year in range(1, self.PROJECTION_YEARS + 1):
            projected_fcf = fcf_per_share * (1 + growth_rate) ** year
            pv_fcf += projected_fcf / (1 + wacc) ** year
        
        terminal_value = (fcf_per_share * (1 + growth_rate) ** self.PROJECTION_YEARS * (1 + self.TERMINAL_GROWTH)) / (wacc - self.TERMINAL_GROWTH)
        pv_terminal = terminal_value / (1 + wacc) ** self.PROJECTION_YEARS
        
        dcf_value = pv_fcf + pv_terminal
        return dcf_value
    
    def calculate_graham_value(self, eps: float, bvps: float, growth_rate: float = 0) -> float:
        if growth_rate > 0:
            return eps * (8.5 + 2 * growth_rate) * 4.4 / 6.5
        return (22.5 * eps * bvps) ** 0.5 if eps > 0 and bvps > 0 else 0
    
    def calculate_buffett_value(self, eps: float, growth_rate: float = 0.10, years: int = 10) -> float:
        if not eps or eps <= 0:
            return 0
        future_eps = eps * (1 + growth_rate) ** years
        return future_eps / 0.065
    
    def calculate_all_valuations(self, company_id: int, fiscal_year: int) -> Valuation:
        ratio = self.db.query(FinancialRatio)\
            .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year, FinancialRatio.quarter.is_(None))\
            .first()
        
        current_price = self.get_current_price(company_id)
        eps = ratio.eps if ratio else None
        bvps = ratio.bvps if ratio else None
        
        dcf_value = self.calculate_dcf(company_id, fiscal_year)
        # La croissance passée peut être aberrante (extractions PDF) : on borne
        # le taux utilisé dans la formule de Graham à une fourchette réaliste.
        graham_growth = None
        if ratio and ratio.eps_growth is not None:
            graham_growth = max(-0.20, min(0.60, (ratio.eps_growth or 0) / 100.0))
        graham_value = self.calculate_graham_value(eps or 0, bvps or 0, graham_growth or 0) if eps else None
        buffett_value = self.calculate_buffett_value(eps or 0, 0.10) if eps else None

        historical_pe = []
        for yr in range(1, 4):
            r = self.db.query(FinancialRatio)\
                .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year - yr, FinancialRatio.quarter.is_(None))\
                .first()
            if r and r.pe_ratio and 1 <= r.pe_ratio <= 100:
                historical_pe.append(r.pe_ratio)
        avg_pe = sum(historical_pe) / len(historical_pe) if historical_pe else 10

        target_price = None
        if eps and avg_pe:
            target_price = eps * avg_pe * 1.1

        # Garde-fou : une valeur intrinsèque supérieure à 10x le cours signale
        # presque toujours une donnée corrompue (EPS ou flux hors norme) ;
        # la méthode concernée est alors écartée du calcul.
        price = current_price or 0
        values = [
            v for v in [dcf_value, graham_value, buffett_value, target_price]
            if v and v > 0 and (price <= 0 or v <= price * 10)
        ]
        blended_target = sum(values) / len(values) if values else None
        
        discount_percent = None
        if blended_target and current_price and current_price > 0:
            discount_percent = ((blended_target - current_price) / current_price) * 100
        
        recommendation = "N/A"
        if discount_percent is not None:
            if discount_percent > 20:
                recommendation = "BUY"
            elif discount_percent > 5:
                recommendation = "ACCUMULATE"
            elif discount_percent > -5:
                recommendation = "HOLD"
            elif discount_percent > -20:
                recommendation = "REDUCE"
            else:
                recommendation = "SELL"
        
        # Remplace toute valorisation existante pour (entreprise, année) : évite les doublons
        self.db.query(Valuation).filter(
            Valuation.company_id == company_id,
            Valuation.fiscal_year == fiscal_year,
        ).delete(synchronize_session=False)
        self.db.flush()
        
        valuation = Valuation(
            company_id=company_id,
            fiscal_year=fiscal_year,
            dcf_value=dcf_value,
            graham_value=graham_value,
            buffett_value=buffett_value,
            target_price=blended_target,
            current_price=current_price,
            discount_percent=discount_percent,
            recommendation=recommendation
        )
        
        self.db.add(valuation)
        self.db.commit()
        self.db.refresh(valuation)
        return valuation
