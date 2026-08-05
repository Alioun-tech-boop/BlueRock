from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from ..models.financial import FinancialStatement, FinancialLineItem, StatementType
from ..models.market import MarketData
from ..models.company import Company
import numpy as np
from sklearn.linear_model import LinearRegression
from sklearn.ensemble import RandomForestRegressor
import pickle
import os

class PredictionService:
    """ML-based prediction for earnings, dividends, and risk detection."""
    
    def __init__(self, db: Session):
        self.db = db
        self.models_dir = "data/models"
        os.makedirs(self.models_dir, exist_ok=True)
    
    def _get_historical_eps(self, company_id: int, years: int = 5) -> List[float]:
        from sqlalchemy import func
        latest_year = self.db.query(func.max(FinancialStatement.fiscal_year)).filter(
            FinancialStatement.company_id == company_id,
            FinancialStatement.quarter.is_(None),
        ).scalar()
        if not latest_year:
            return []
        eps_values = []
        for year in range(years):
            net_income = self.db.query(FinancialLineItem.value)\
                .join(FinancialStatement)\
                .filter(
                    FinancialStatement.company_id == company_id,
                    FinancialStatement.fiscal_year == latest_year - year,
                    FinancialStatement.quarter.is_(None),
                    FinancialLineItem.account_name.ilike("%Résultat net%")
                ).first()
            
            shares = self.db.query(FinancialLineItem.value)\
                .join(FinancialStatement)\
                .filter(
                    FinancialStatement.company_id == company_id,
                    FinancialStatement.fiscal_year == latest_year - year,
                    FinancialStatement.quarter.is_(None),
                    FinancialLineItem.account_name.ilike("%Nombre d'actions%")
                ).first()
            
            company = self.db.query(Company).filter(Company.id == company_id).first()
            shares_val = shares[0] if shares else (company.shares_outstanding if company else None)
            net_val = net_income[0] if net_income else None
            
            if net_val and shares_val and shares_val > 0:
                eps_values.append(net_val / shares_val)
        
        return list(reversed(eps_values))
    
    def _get_historical_revenue(self, company_id: int, years: int = 5) -> List[float]:
        from sqlalchemy import func
        latest_year = self.db.query(func.max(FinancialStatement.fiscal_year)).filter(
            FinancialStatement.company_id == company_id,
            FinancialStatement.quarter.is_(None),
        ).scalar()
        if not latest_year:
            return []
        revenues = []
        for year in range(years):
            rev = self.db.query(FinancialLineItem.value)\
                .join(FinancialStatement)\
                .filter(
                    FinancialStatement.company_id == company_id,
                    FinancialStatement.fiscal_year == latest_year - year,
                    FinancialStatement.quarter.is_(None),
                    FinancialLineItem.account_name.ilike("%Chiffre d'affaires%")
                ).first()
            if rev:
                revenues.append(rev[0])
        return list(reversed(revenues))
    
    def predict_next_eps(self, company_id: int) -> Optional[Dict[str, Any]]:
        eps_history = self._get_historical_eps(company_id)
        if len(eps_history) < 3:
            return None
        
        X = np.arange(len(eps_history)).reshape(-1, 1)
        y = np.array(eps_history)
        
        model = LinearRegression()
        model.fit(X, y)
        
        next_period = np.array([[len(eps_history)]])
        predicted_eps = model.predict(next_period)[0]
        
        trend = "up" if model.coef_[0] > 0 else "down"
        confidence = min(abs(model.coef_[0]) / (np.mean(y) + 1e-6) * 100, 95)
        
        return {
            "predicted_eps": round(predicted_eps, 2),
            "trend": trend,
            "confidence": round(confidence, 1),
            "last_value": round(eps_history[-1], 2) if eps_history else None,
            "change_percent": round((predicted_eps - eps_history[-1]) / abs(eps_history[-1]) * 100, 1) if eps_history and eps_history[-1] != 0 else 0
        }
    
    def predict_next_revenue(self, company_id: int) -> Optional[Dict[str, Any]]:
        rev_history = self._get_historical_revenue(company_id)
        if len(rev_history) < 3:
            return None
        
        X = np.arange(len(rev_history)).reshape(-1, 1)
        y = np.array(rev_history)
        
        model = LinearRegression()
        model.fit(X, y)
        
        next_period = np.array([[len(rev_history)]])
        predicted_rev = model.predict(next_period)[0]
        
        return {
            "predicted_revenue": round(predicted_rev, 2),
            "last_value": round(rev_history[-1], 2) if rev_history else None,
            "change_percent": round((predicted_rev - rev_history[-1]) / abs(rev_history[-1]) * 100, 1) if rev_history and rev_history[-1] != 0 else 0
        }
    
    def estimate_dividend(self, company_id: int, fiscal_year: int) -> Optional[Dict[str, Any]]:
        eps_prediction = self.predict_next_eps(company_id)
        if not eps_prediction:
            return None
        
        from ..models.ratios import FinancialRatio
        ratios = []
        for yr in range(1, 4):
            r = self.db.query(FinancialRatio)\
                .filter(FinancialRatio.company_id == company_id, FinancialRatio.fiscal_year == fiscal_year - yr + 1, FinancialRatio.quarter.is_(None))\
                .first()
            if r and r.payout_ratio:
                ratios.append(r.payout_ratio)
        
        avg_payout = sum(ratios) / len(ratios) / 100 if ratios else 0.3
        
        estimated_dps = eps_prediction["predicted_eps"] * avg_payout
        
        return {
            "estimated_dps": round(max(estimated_dps, 0), 2),
            "payout_ratio": round(avg_payout * 100, 1),
            "based_on_predicted_eps": eps_prediction["predicted_eps"]
        }
    
    def detect_risk_signals(self, company_id: int) -> List[Dict[str, Any]]:
        signals = []
        
        from ..models.ratios import FinancialRatio
        
        recent_ratios = self.db.query(FinancialRatio)\
            .filter(FinancialRatio.company_id == company_id, FinancialRatio.quarter.is_(None))\
            .order_by(FinancialRatio.fiscal_year.desc())\
            .limit(3)\
            .all()
        
        if len(recent_ratios) >= 2:
            for i in range(1, len(recent_ratios)):
                if recent_ratios[i-1].net_margin and recent_ratios[i].net_margin:
                    margin_change = recent_ratios[i-1].net_margin - recent_ratios[i].net_margin
                    if margin_change < -0.3:
                        signals.append({
                            "type": "WARNING",
                            "signal": "Dégradation significative de la marge nette",
                            "detail": f"Baisse de {abs(margin_change):.1f} points sur l'année"
                        })
                
                if recent_ratios[i-1].debt_to_equity and recent_ratios[i].debt_to_equity:
                    debt_change = recent_ratios[i-1].debt_to_equity - recent_ratios[i].debt_to_equity
                    if debt_change > 0.5:
                        signals.append({
                            "type": "WARNING",
                            "signal": "Augmentation rapide de l'endettement",
                            "detail": f"Dette/Capitaux propres en hausse de {debt_change:.2f}"
                        })
                
                if recent_ratios[i-1].current_ratio and recent_ratios[i].current_ratio:
                    if recent_ratios[i-1].current_ratio < 1.0:
                        signals.append({
                            "type": "ALERT",
                            "signal": "Problème de liquidité",
                            "detail": f"Current ratio à {recent_ratios[i-1].current_ratio:.2f} (< 1.0)"
                        })
        
        if not signals:
            signals.append({
                "type": "OK",
                "signal": "Aucun signal de risque détecté",
                "detail": "Les indicateurs sont stables"
            })
        
        return signals
    
    def find_potential_outperformers(self, sector: str = None) -> List[Dict[str, Any]]:
        from ..models.analysis import ScoreCard
        query = self.db.query(ScoreCard).order_by(ScoreCard.total_score.desc())
        if sector:
            query = query.join(Company).filter(Company.sector == sector)
        
        top = query.limit(10).all()
        return [
            {
                "company_id": s.company_id,
                "score": s.total_score,
                "rating": s.rating,
                "profitability": s.profitability_score,
                "growth": s.growth_score,
                "valuation": s.valuation_score
            }
            for s in top
        ]
