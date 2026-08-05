from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from ..models.financial import FinancialStatement, FinancialLineItem, StatementType
from ..models.ratios import FinancialRatio
from ..models.company import Company
from ..models.market import MarketData, Dividend

class RatioCalculator:
    """Calculates all financial ratios from structured financial data."""

    def __init__(self, db: Session):
        self.db = db
        self._items_cache: Dict[tuple, Dict[str, float]] = {}

    def _load_items(self, company_id: int, fiscal_year: int, quarter: Optional[int]) -> Dict[str, float]:
        """Charge tous les postes (année courante + année N-1) en une seule requête."""
        key = (company_id, fiscal_year, quarter)
        if key in self._items_cache:
            return self._items_cache[key]

        q = self.db.query(FinancialLineItem.account_name, FinancialLineItem.value)\
            .join(FinancialStatement)\
            .filter(
                FinancialStatement.company_id == company_id,
                FinancialStatement.fiscal_year.in_([fiscal_year, fiscal_year - 1]),
            )
        if quarter:
            q = q.filter(FinancialStatement.quarter == quarter)
        else:
            q = q.filter(FinancialStatement.quarter.is_(None))

        items: Dict[str, float] = {}
        for name, value in q.all():
            items.setdefault(name.lower(), float(value))
        self._items_cache[key] = items
        return items

    def get_line_item(self, company_id: int, fiscal_year: int, account_name: str, quarter: Optional[int] = None) -> Optional[float]:
        items = self._load_items(company_id, fiscal_year, quarter)
        needle = account_name.lower()
        for name, value in items.items():
            if needle in name:
                return value
        return None
    
    def get_total(self, company_id: int, fiscal_year: int, statement_type: StatementType, quarter: Optional[int] = None) -> Optional[float]:
        query = self.db.query(FinancialStatement)\
            .filter(
                FinancialStatement.company_id == company_id,
                FinancialStatement.fiscal_year == fiscal_year,
                FinancialStatement.statement_type == statement_type
            )
        if quarter:
            query = query.filter(FinancialStatement.quarter == quarter)
        else:
            query = query.filter(FinancialStatement.quarter.is_(None))
        
        statement = query.first()
        if not statement:
            return None
        
        total = sum(item.value for item in statement.line_items)
        return total
    
    def calculate_all_ratios(self, company_id: int, fiscal_year: int, quarter: Optional[int] = None) -> FinancialRatio:
        revenue = self.get_line_item(company_id, fiscal_year, "Revenu", quarter) or self.get_line_item(company_id, fiscal_year, "Chiffre d'affaires", quarter) or self.get_line_item(company_id, fiscal_year, "Produit net bancaire", quarter)
        cost_of_goods = self.get_line_item(company_id, fiscal_year, "Coût des ventes", quarter) or self.get_line_item(company_id, fiscal_year, "Coût des marchandises", quarter)
        gross_profit = self.get_line_item(company_id, fiscal_year, "Marge brute", quarter) or self.get_line_item(company_id, fiscal_year, "Bénéfice brut", quarter)
        operating_income = self.get_line_item(company_id, fiscal_year, "Résultat d'exploitation", quarter) or self.get_line_item(company_id, fiscal_year, "Résultat opérationnel", quarter)
        net_income = self.get_line_item(company_id, fiscal_year, "Résultat net", quarter)
        ebitda = self.get_line_item(company_id, fiscal_year, "EBITDA", quarter)
        
        total_assets = self.get_line_item(company_id, fiscal_year, "Total actif", quarter) or self.get_line_item(company_id, fiscal_year, "Total bilan", quarter)
        current_assets = self.get_line_item(company_id, fiscal_year, "Actif courant", quarter) or self.get_line_item(company_id, fiscal_year, "Actif circulant", quarter)
        current_liabilities = self.get_line_item(company_id, fiscal_year, "Passif courant", quarter) or self.get_line_item(company_id, fiscal_year, "Dettes à court terme", quarter)
        total_equity = self.get_line_item(company_id, fiscal_year, "Capitaux propres", quarter) or self.get_line_item(company_id, fiscal_year, "Total capitaux propres", quarter)
        # Quarantaine capitaux propres : des capitaux supérieurs au total des
        # actifs sont mathématiquement impossibles (extraction PDF faussée).
        equity_trusted = total_equity
        if total_equity and total_assets and total_assets > 0 and total_equity > total_assets:
            equity_trusted = None
        total_debt = self.get_line_item(company_id, fiscal_year, "Dette totale", quarter) or self.get_line_item(company_id, fiscal_year, "Total dettes", quarter)
        cash = self.get_line_item(company_id, fiscal_year, "Trésorerie", quarter) or self.get_line_item(company_id, fiscal_year, "Disponibilités", quarter)
        inventory = self.get_line_item(company_id, fiscal_year, "Stocks", quarter)
        receivables = self.get_line_item(company_id, fiscal_year, "Créances clients", quarter) or self.get_line_item(company_id, fiscal_year, "Clients", quarter)
        
        operating_expenses = self.get_line_item(company_id, fiscal_year, "Charges d'exploitation", quarter)
        interest_expense = self.get_line_item(company_id, fiscal_year, "Charges financières", quarter) or self.get_line_item(company_id, fiscal_year, "Intérêts", quarter)
        depreciation = self.get_line_item(company_id, fiscal_year, "Amortissements", quarter)
        
        fcf = self.get_line_item(company_id, fiscal_year, "Free cash flow", quarter) or self.get_line_item(company_id, fiscal_year, "Flux de trésorerie disponible", quarter)
        operating_cf = self.get_line_item(company_id, fiscal_year, "Flux de trésorerie d'exploitation", quarter)
        
        shares = self.get_line_item(company_id, fiscal_year, "Nombre d'actions", quarter) or self.get_line_item(company_id, fiscal_year, "Actions en circulation", quarter)

        company = self.db.query(Company).filter(Company.id == company_id).first()
        co_shares = company.shares_outstanding if company else None

        # Garde-fou : les postes « nombre d'actions » issus des PDF sont souvent
        # aberrants (15, 100 000, 16 666...). Le nombre de titres officiel BRVM
        # (Company.shares_outstanding) fait foi dès que l'extraction est douteuse
        # ou s'en écarte de plus de 20x.
        if shares is not None and shares > 0:
            if shares < 100000 or shares > 1e11:
                shares = None
            elif co_shares and (shares > co_shares * 20 or shares < co_shares / 20):
                shares = None
        if not shares:
            shares = co_shares
        
        market_data = self.db.query(MarketData)\
            .filter(MarketData.company_id == company_id)\
            .order_by(MarketData.date.desc())\
            .first()
        current_price = market_data.close_price if market_data else None
        
        dividend_data = self.db.query(Dividend)\
            .filter(Dividend.company_id == company_id, Dividend.fiscal_year == fiscal_year)\
            .first()
        dps = dividend_data.dividend_per_share if dividend_data else None
        
        prev_year_revenue = self.get_line_item(company_id, fiscal_year - 1, "Chiffre d'affaires")
        prev_year_net_income = self.get_line_item(company_id, fiscal_year - 1, "Résultat net")

        # Supprime tout ratio existant pour (entreprise, année, trimestre) avant recalcul
        self.db.query(FinancialRatio).filter(
            FinancialRatio.company_id == company_id,
            FinancialRatio.fiscal_year == fiscal_year,
            FinancialRatio.quarter.is_(quarter) if quarter is None else FinancialRatio.quarter == quarter,
        ).delete(synchronize_session=False)
        self.db.flush()

        ratio = FinancialRatio(
            company_id=company_id,
            fiscal_year=fiscal_year,
            quarter=quarter
        )
        
        if revenue and revenue > 0:
            ratio.operating_margin = (operating_income / revenue * 100) if operating_income else None
            ratio.net_margin = (net_income / revenue * 100) if net_income else None
            if gross_profit:
                ratio.gross_margin = (gross_profit / revenue * 100)
            if ebitda:
                ratio.ebitda_margin = (ebitda / revenue * 100)
        
        if equity_trusted and equity_trusted > 0:
            ratio.roe = (net_income / equity_trusted * 100) if net_income else None
        
        if total_assets and total_assets > 0:
            ratio.roa = (net_income / total_assets * 100) if net_income else None
            ratio.asset_turnover = (revenue / total_assets) if revenue else None
        
        if current_liabilities and current_liabilities > 0:
            ratio.current_ratio = (current_assets / current_liabilities) if current_assets else None
            quick_assets = (current_assets - inventory) if current_assets and inventory else current_assets
            ratio.quick_ratio = (quick_assets / current_liabilities) if quick_assets else None
            ratio.cash_ratio = (cash / current_liabilities) if cash else None

        if inventory and cost_of_goods and inventory > 0 and cost_of_goods > 0:
            prev_inventory = self.get_line_item(company_id, fiscal_year - 1, "Stocks", quarter)
            avg_inventory = (inventory + prev_inventory) / 2 if prev_inventory else inventory
            if avg_inventory > 0:
                ratio.inventory_turnover = cost_of_goods / avg_inventory
        
        if equity_trusted and equity_trusted > 0:
            ratio.debt_to_equity = (total_debt / equity_trusted) if total_debt else None
        
        if total_assets and total_assets > 0:
            ratio.debt_to_assets = (total_debt / total_assets) if total_debt else None
        
        if interest_expense and interest_expense != 0:
            ratio.interest_coverage = (operating_income / abs(interest_expense)) if operating_income else None
        
        if operating_expenses and revenue and revenue > 0:
            ratio.cost_to_income = (operating_expenses / revenue * 100)

        loans = self.get_line_item(company_id, fiscal_year, "Prêts et avances à la clientèle", quarter) \
            or self.get_line_item(company_id, fiscal_year, "Crédits à la clientèle", quarter) \
            or self.get_line_item(company_id, fiscal_year, "Encours de crédits", quarter)
        deposits = self.get_line_item(company_id, fiscal_year, "Dépôts de la clientèle", quarter) \
            or self.get_line_item(company_id, fiscal_year, "Dettes envers la clientèle", quarter) \
            or self.get_line_item(company_id, fiscal_year, "Dépôts clients", quarter)
        cost_of_risk = self.get_line_item(company_id, fiscal_year, "Coût du risque", quarter) \
            or self.get_line_item(company_id, fiscal_year, "Charges de provisions nettes", quarter)
        provisions = self.get_line_item(company_id, fiscal_year, "Provisions", quarter)
        interest_income = self.get_line_item(company_id, fiscal_year, "Produits d'intérêts", quarter)
        interest_cost = self.get_line_item(company_id, fiscal_year, "Charges d'intérêts", quarter)
        net_interest_margin = self.get_line_item(company_id, fiscal_year, "Marge nette d'intérêts", quarter)

        if deposits and deposits > 0:
            ratio.loan_to_deposit = (loans / deposits * 100) if loans else None

        risk_base = loans or deposits
        if risk_base and risk_base > 0:
            if cost_of_risk:
                ratio.cost_of_risk = (cost_of_risk / risk_base * 100)
            elif provisions:
                ratio.cost_of_risk = (provisions / risk_base * 100)

        if interest_income and interest_income > 0:
            nim = net_interest_margin or (interest_income - (interest_cost or 0))
            productive_base = loans or (deposits or total_assets)
            if productive_base and productive_base > 0:
                ratio.net_interest_margin = nim / productive_base * 100
        
        if shares and shares > 0:
            eps = (net_income / shares) if net_income else None
            # Quarantaine EPS : le PER officiel BRVM (snapshot) sert de référence.
            # Un EPS qui s'en écarte de plus de 5x (ou qui tombe sous 1/5) provient
            # presque toujours d'une extraction PDF avec une mauvaise unité/colonne.
            implied_eps = None
            if company and company.per and company.per > 0 and current_price and current_price > 0:
                implied_eps = current_price / company.per
            if eps is not None and implied_eps and implied_eps > 0:
                ratio_vs = abs(eps / implied_eps)
                if ratio_vs > 5 or ratio_vs < 0.2:
                    eps = None
            ratio.eps = eps
            ratio.bvps = (equity_trusted / shares) if equity_trusted else None
            if operating_cf:
                ratio.cfps = operating_cf / shares
            if fcf:
                ratio.fcf_per_share = fcf / shares
            if dps:
                ratio.dividend_per_share = dps
        
        if current_price and current_price > 0 and shares:
            market_cap = current_price * shares
            
            if ratio.eps and ratio.eps >= 1:
                ratio.pe_ratio = current_price / ratio.eps
            if ratio.bvps and ratio.bvps > 0:
                ratio.pb_ratio = current_price / ratio.bvps
            if revenue and revenue > 0 and shares > 0:
                ratio.ps_ratio = current_price / (revenue / shares)
            
            if dps and dps > 0:
                ratio.dividend_yield = (dps / current_price * 100)
                ratio.payout_ratio = (dps / ratio.eps * 100) if ratio.eps and ratio.eps > 0 else None
            
            ev = market_cap + (total_debt or 0) - (cash or 0)
            if ebitda and ebitda > 0:
                ratio.ev_ebitda = ev / ebitda
            if operating_income and operating_income > 0:
                ratio.ev_ebit = ev / operating_income
        
        if prev_year_revenue and prev_year_revenue > 0 and revenue:
            ratio.revenue_growth = ((revenue - prev_year_revenue) / prev_year_revenue * 100)
        if prev_year_net_income and prev_year_net_income > 0 and net_income:
            ratio.net_income_growth = ((net_income - prev_year_net_income) / prev_year_net_income * 100)
        if ratio.eps and ratio.eps >= 1:
            prev_net_income = self.get_line_item(company_id, fiscal_year - 1, "Résultat net")
            if prev_net_income is not None and shares and prev_net_income > 0:
                prev_eps = prev_net_income / shares
                prev_sane = prev_eps >= 1
                if prev_sane and implied_eps and implied_eps > 0:
                    prev_sane = abs(prev_eps / implied_eps) <= 5
                if prev_sane:
                    ratio.eps_growth = ((ratio.eps - prev_eps) / prev_eps * 100)
        
        self.db.add(ratio)
        self.db.commit()
        self.db.refresh(ratio)
        return ratio
