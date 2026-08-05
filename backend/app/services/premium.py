from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models.company import Company
from ..models.analysis import ScoreCard, Valuation
from ..models.ratios import FinancialRatio
from ..models.market import MarketData
from ..models.user import User, Position
from ..config import settings

RISK_LEVELS = ("conservative", "balanced", "growth")

RISK_LABELS = {
    "conservative": "sécurisé",
    "balanced": "équilibré",
    "growth": "dynamique",
}


class PremiumService:
    """Plan d'investissement personnalisé : allocation Buffett/Graham,
    intérêts composés et guidage achat/vente de bout en bout."""

    RISK_PROFILES = {
        "conservative": {"k": 5, "max_weight": 0.30, "cash_pct": 0.15, "div_weight": 1.2, "growth_weight": 0.3},
        "balanced": {"k": 6, "max_weight": 0.25, "cash_pct": 0.10, "div_weight": 0.8, "growth_weight": 0.8},
        "growth": {"k": 7, "max_weight": 0.20, "cash_pct": 0.05, "div_weight": 0.4, "growth_weight": 1.4},
    }

    def __init__(self, db: Session):
        self.db = db

    def _latest_price(self, company_id: int) -> Optional[float]:
        row = self.db.query(MarketData.close_price).filter(
            MarketData.company_id == company_id
        ).order_by(MarketData.date.desc()).first()
        return float(row[0]) if row and row[0] else None

    def _latest_ratio(self, company_id: int) -> Optional[FinancialRatio]:
        fy = self.db.query(func.max(FinancialRatio.fiscal_year)).filter(
            FinancialRatio.company_id == company_id,
            FinancialRatio.quarter.is_(None),
        ).scalar()
        if not fy:
            return None
        return self.db.query(FinancialRatio).filter(
            FinancialRatio.company_id == company_id,
            FinancialRatio.fiscal_year == fy,
            FinancialRatio.quarter.is_(None),
        ).first()

    def _latest_scorecard(self, company_id: int) -> Optional[ScoreCard]:
        fy = self.db.query(func.max(ScoreCard.fiscal_year)).filter(
            ScoreCard.company_id == company_id,
        ).scalar()
        if not fy:
            return None
        return self.db.query(ScoreCard).filter(
            ScoreCard.company_id == company_id,
            ScoreCard.fiscal_year == fy,
        ).first()

    def _latest_valuation(self, company_id: int) -> Optional[Valuation]:
        fy = self.db.query(func.max(Valuation.fiscal_year)).filter(
            Valuation.company_id == company_id,
        ).scalar()
        if not fy:
            return None
        return self.db.query(Valuation).filter(
            Valuation.company_id == company_id,
            Valuation.fiscal_year == fy,
        ).first()

    def _company_by_symbol(self, symbol: str) -> Optional[Company]:
        return self.db.query(Company).filter(Company.symbol == symbol.upper()).first()

    def _clamp(self, v: float, lo: float, hi: float) -> float:
        return max(lo, min(hi, v))

    def _round2(self, v: Optional[float]) -> Optional[float]:
        return round(v, 2) if v is not None else None

    def _expected_return(self, price: float, fair: Optional[float], div_yield: float,
                         eps_growth: float, horizon_years: int) -> float:
        div_yield = div_yield or 0
        eps_growth = eps_growth or 0
        conv = 0.0
        if fair and fair > 0 and price > 0:
            conv = self._clamp((fair / price) ** (1 / max(horizon_years, 1)) - 1, -0.05, 0.15)
        div_r = (div_yield / 100.0) * 0.85
        growth_r = self._clamp((eps_growth / 100.0) * 0.35, -0.02, 0.06)
        return self._clamp(div_r + max(conv, 0.0) * 0.5 + growth_r + 0.01, 0.02, 0.25)

    def _rationale(self, price: float, fair: Optional[float], discount: float, div_yield: float) -> str:
        if fair and fair > 0:
            if discount >= 20:
                base = (f"Valeur intrinsèque estimée à {fair:,.0f} FCFA, soit une marge de "
                        f"sécurité de {discount:.0f}% sous le cours : valeur largement décotée.")
            elif discount >= 5:
                base = (f"Le cours reste sous la valeur intrinsèque estimée ({fair:,.0f} FCFA) : "
                        f"décote de {discount:.0f}%, marge de sécurité correcte.")
            else:
                base = (f"Le cours est proche de la valeur intrinsèque estimée ({fair:,.0f} FCFA). "
                        f"Privilégiez les achats sur repli.")
        else:
            base = "Valorisation intrinsèque non disponible : surveillez les fondamentaux."
        if div_yield >= 4:
            base += f" Rendement du dividende attractif de {div_yield:.1f}%."
        return base

    def _build_candidates(self, profile: dict, horizon_years: int,
                          holdings: Dict[str, float]) -> List[Dict[str, Any]]:
        sub = self.db.query(
            Valuation.company_id, func.max(Valuation.fiscal_year).label("fy")
        ).group_by(Valuation.company_id).subquery()
        companies = self.db.query(Company).join(sub, sub.c.company_id == Company.id).all()

        raw = []
        for c in companies:
            price = self._latest_price(c.id)
            if not price or price <= 0:
                continue
            ratio = self._latest_ratio(c.id)
            scorecard = self._latest_scorecard(c.id)
            valuation = self._latest_valuation(c.id)
            if not ratio or not scorecard or not valuation:
                continue
            discount_raw = valuation.discount_percent or 0
            # Garde-fou : les valorisations aberrantes (données PDF corrompues)
            # sont ramenées à une fourchette plausible de décote/surcote.
            discount = self._clamp(discount_raw, -90, 300)
            fair_raw = valuation.target_price
            if fair_raw and fair_raw > 0 and price > 0 and price * 0.3 <= fair_raw <= price * 10:
                fair_usable = fair_raw
            else:
                fair_usable = price * (1 + discount / 100.0)
            rec = (valuation.recommendation or "HOLD").upper()
            if rec == "SELL":
                continue
            score = scorecard.total_score or 0
            div_yield = ratio.dividend_yield or 0
            eps_growth = ratio.eps_growth or 0

            score_comp = (score / 10.0) * 50
            discount_comp = self._clamp(discount, 0, 50) / 50.0 * 30
            div_comp = min(div_yield, 15) / 15.0 * 10 * profile["div_weight"]
            growth_comp = (self._clamp(eps_growth, -10, 40) + 10) / 50.0 * 10 * profile["growth_weight"]
            rank = score_comp + discount_comp + div_comp + growth_comp

            raw.append({
                "company": c,
                "price": price,
                "ratio": ratio,
                "scorecard": scorecard,
                "valuation": valuation,
                "discount": discount,
                "fair_usable": fair_usable,
                "rec": rec,
                "score": score,
                "div_yield": div_yield,
                "eps_growth": eps_growth,
                "rank": rank,
            })

        raw.sort(key=lambda x: x["rank"], reverse=True)
        picked = raw[: profile["k"]]

        if not picked:
            return []

        total_rank = sum(x["rank"] for x in picked) or 1.0
        for x in picked:
            x["weight"] = x["rank"] / total_rank

        for _ in range(4):
            over = [(x["company"].symbol, x["weight"] - profile["max_weight"])
                    for x in picked if x["weight"] > profile["max_weight"]]
            if not over:
                break
            excess = sum(o[1] for o in over)
            for sym, e in over:
                for x in picked:
                    if x["company"].symbol == sym:
                        x["weight"] = profile["max_weight"]
            free = [x for x in picked if x["weight"] < profile["max_weight"]]
            if free:
                free_rank = sum(x["rank"] for x in free) or 1.0
                for x in free:
                    x["weight"] += excess * (x["rank"] / free_rank)

        candidates = []
        for x in picked:
            fair = x["fair_usable"]
            expected_return = self._expected_return(
                x["price"], fair, x["div_yield"], x["eps_growth"], horizon_years
            )
            held = holdings.get(x["company"].symbol, 0)
            if x["rec"] in ("BUY", "ACCUMULATE"):
                action = "ADD" if held and held > 0 else "BUY"
            else:
                action = "ADD" if held and held > 0 else "HOLD"
            candidates.append({
                "symbol": x["company"].symbol,
                "name": x["company"].name,
                "sector": x["company"].sector.value if hasattr(x["company"].sector, "value") else x["company"].sector,
                "logo_url": self._logo_url(x["company"].symbol, x["company"].website),
                "current_price": self._round2(x["price"]),
                "fair_value": self._round2(fair),
                "discount_percent": self._round2(x["discount"]),
                "dividend_yield": self._round2(x["div_yield"]),
                "eps_growth": self._round2(x["eps_growth"]),
                "score": self._round2(x["score"]),
                "rating": x["scorecard"].rating,
                "action": action,
                "weight_percent": self._round2(x["weight"] * 100),
                "expected_return": self._round2(expected_return),
                "rationale": self._rationale(x["price"], fair, x["discount"], x["div_yield"]),
            })
        return candidates

    def _logo_url(self, symbol: str, website: Optional[str]) -> Optional[str]:
        from .logos import resolve_logo_url
        return resolve_logo_url(symbol, website, settings.API_BASE_URL)

    def _build_advice(self, invested: float, n: int, risk_level: str,
                      projected_final: float, r_annual: float, horizon_years: int) -> str:
        label = RISK_LABELS.get(risk_level, "équilibré")
        return (
            f"Investissez {invested:,.0f} FCFA dès maintenant sur {n} titres sélectionnés "
            f"(profil {label}), en 3 tranches étalées sur 6 mois pour lisser le prix d'entrée. "
            f"Réinvestissez les dividendes. Objectif à {horizon_years} ans : "
            f"{projected_final:,.0f} FCFA, soit un rendement annuel moyen d'environ {r_annual * 100:.1f}%. "
            f"Vendez progressivement dès que le cours rejoint la valeur intrinsèque estimée (+15%) "
            f"ou si le score de qualité d'une valeur passe sous 5/10."
        )

    def _sell_triggers(self) -> List[Dict[str, str]]:
        return [
            {"trigger": "Objectif atteint", "detail": "Prenez vos bénéfices dès que le cours rejoint la valeur intrinsèque estimée (+15% au-dessus du prix d'entrée)."},
            {"trigger": "Dégradation du score", "detail": "Vendez si le score de qualité passe sous 5/10 ou si la note tombe sous BBB."},
            {"trigger": "Stop loss", "detail": "Coupez la position si le cours perd 15% par rapport au prix d'entrée moyen."},
            {"trigger": "Fondamentaux dégradés", "detail": "Réévaluez la ligne à chaque publication des états financiers annuels."},
        ]

    def build_plan(self, user: User, amount: float, monthly: float,
                   horizon_years: int, risk_level: str) -> Dict[str, Any]:
        if risk_level not in RISK_LEVELS:
            risk_level = "balanced"
        profile = self.RISK_PROFILES[risk_level]

        holdings = {}
        for p in self.db.query(Position).filter(Position.user_id == user.id, Position.qty > 0).all():
            holdings[p.symbol] = holdings.get(p.symbol, 0) + p.qty

        candidates = self._build_candidates(profile, horizon_years, holdings)
        if not candidates:
            raise ValueError(
                "Aucune valorisation exploitable : importez les états financiers officiels "
                "puis relancez l'analyse avant de générer un plan."
            )

        cash_buffer = amount * profile["cash_pct"]
        invested = amount - cash_buffer

        total_weight = sum(c["weight_percent"] for c in candidates) / 100.0 or 1.0
        for c in candidates:
            allocated = invested * (c["weight_percent"] / 100.0) / total_weight
            price = c["current_price"] or 0
            shares = int(allocated // price) if price > 0 else 0
            if shares < 1 and price > 0 and allocated >= price:
                shares = 1
            actual = shares * price if price > 0 else 0
            c["allocated_amount"] = round(actual, 2)
            c["shares"] = shares
            entry = c["current_price"]
            fair = c["fair_value"]
            c["entry_limit"] = self._round2(entry * 0.97)
            c["take_profit"] = self._round2((fair or entry) * 1.15)
            c["stop_loss"] = self._round2(entry * 0.85)
            c["projected_value"] = round(actual * (1 + c["expected_return"]) ** horizon_years, 2)
            if c["action"] in ("BUY", "ADD"):
                c["tranches"] = [
                    {"pct": 40, "timing": "Tranche 1 · immédiate"},
                    {"pct": 30, "timing": "Tranche 2 · à +3 mois"},
                    {"pct": 30, "timing": "Tranche 3 · à +6 mois"},
                ]
            else:
                c["tranches"] = []

        total_invested_actual = sum(c["allocated_amount"] for c in candidates)
        if total_invested_actual > 0:
            r_annual = sum(
                c["expected_return"] * c["allocated_amount"] for c in candidates
            ) / total_invested_actual
        else:
            r_annual = 0.03
        r_annual = self._clamp(r_annual, 0.03, 0.20)

        months = horizon_years * 12
        r_m = (1 + r_annual) ** (1 / 12) - 1
        value = invested
        schedule = []
        for m in range(1, months + 1):
            value = value * (1 + r_m) + monthly
            if m % 12 == 0:
                contributed = invested + monthly * m
                schedule.append({
                    "year": m // 12,
                    "value": round(value),
                    "gained": round(value - contributed),
                })
        projected_final = value
        total_contributions = invested + monthly * months
        gain = projected_final - total_contributions
        gain_pct = (gain / total_contributions * 100) if total_contributions > 0 else 0

        positions_out = []
        for p in self.db.query(Position).filter(Position.user_id == user.id, Position.qty > 0).all():
            company = self._company_by_symbol(p.symbol)
            price = self._latest_price(company.id) if company else None
            if not company or not price:
                continue
            value_pos = p.qty * price
            pnl = ((price - p.avg_price) / p.avg_price * 100) if p.avg_price else 0
            valuation = self._latest_valuation(company.id)
            rec = (valuation.recommendation or "HOLD").upper() if valuation else "HOLD"
            ratio = self._latest_ratio(company.id)
            expected = self._expected_return(
                price, valuation.target_price if valuation else None,
                (ratio.dividend_yield or 0) if ratio else 0,
                (ratio.eps_growth or 0) if ratio else 0,
                horizon_years,
            )
            if rec == "BUY" or rec == "ACCUMULATE":
                pos_action = "GARDER"
            elif rec == "SELL":
                pos_action = "VENDRE"
            elif rec == "REDUCE":
                pos_action = "RÉDUIRE"
            else:
                pos_action = "SURVEILLER"
            positions_out.append({
                "symbol": p.symbol,
                "name": company.name,
                "qty": p.qty,
                "avg_price": self._round2(p.avg_price),
                "current_price": self._round2(price),
                "value": round(value_pos, 2),
                "pnl_percent": self._round2(pnl),
                "action": pos_action,
                "projected_value": round(value_pos * (1 + expected) ** horizon_years, 2),
            })

        return {
            "amount": round(amount, 2),
            "monthly": round(monthly, 2),
            "horizon_years": horizon_years,
            "risk_level": risk_level,
            "invested": round(invested, 2),
            "cash_buffer": round(cash_buffer, 2),
            "expected_return": self._round2(r_annual),
            "projected_final": round(projected_final, 2),
            "total_contributions": round(total_contributions, 2),
            "gain": round(gain, 2),
            "gain_pct": self._round2(gain_pct),
            "schedule": schedule,
            "allocation": candidates,
            "positions": positions_out,
            "advice": self._build_advice(invested, len(candidates), risk_level,
                                         projected_final, r_annual, horizon_years),
            "sell_triggers": self._sell_triggers(),
            "universe": len(candidates),
        }
