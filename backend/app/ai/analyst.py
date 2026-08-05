from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import json
import os
from ..models.company import Company
from ..models.ratios import FinancialRatio
from ..models.analysis import AnalysisReport, ScoreCard, Valuation
from ..models.financial import FinancialStatement, FinancialLineItem, StatementType
from ..config import settings

class AIAnalyst:
    """
    AI-powered financial analyst that answers questions about companies.
    Uses OpenAI by default, but can work with any LLM provider.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.openai_api_key = settings.OPENAI_API_KEY
    
    def _get_company_context(self, company_id: int) -> str:
        company = self.db.query(Company).filter(Company.id == company_id).first()
        if not company:
            return "Company not found"
        
        ratios = self.db.query(FinancialRatio)\
            .filter(FinancialRatio.company_id == company_id, FinancialRatio.quarter.is_(None))\
            .order_by(FinancialRatio.fiscal_year.desc())\
            .first()
        
        scorecard = self.db.query(ScoreCard)\
            .filter(ScoreCard.company_id == company_id)\
            .order_by(ScoreCard.fiscal_year.desc())\
            .first()
        
        valuation = self.db.query(Valuation)\
            .filter(Valuation.company_id == company_id)\
            .order_by(Valuation.fiscal_year.desc())\
            .first()
        
        def fmt(val, suffix=""):
            if val is None:
                return "N/A"
            return f"{val:.2f}{suffix}"

        context = f"""
Company: {company.name} ({company.symbol})
Sector: {company.sector.value if company.sector else 'N/A'}
Description: {company.description or 'N/A'}
"""
        if ratios:
            context += f"""
Key Financial Ratios (Latest):
- ROE: {fmt(ratios.roe, '%')} | ROA: {fmt(ratios.roa, '%')}
- Net Margin: {fmt(ratios.net_margin, '%')} | Operating Margin: {fmt(ratios.operating_margin, '%')}
- P/E: {fmt(ratios.pe_ratio)} | P/B: {fmt(ratios.pb_ratio)}
- EPS: {fmt(ratios.eps)} | BVPS: {fmt(ratios.bvps)}
- Revenue Growth: {fmt(ratios.revenue_growth, '%')} | Net Income Growth: {fmt(ratios.net_income_growth, '%')}
- Debt/Equity: {fmt(ratios.debt_to_equity)} | Current Ratio: {fmt(ratios.current_ratio)}
- Dividend Yield: {fmt(ratios.dividend_yield, '%')}
- EV/EBITDA: {fmt(ratios.ev_ebitda)} | EV/EBIT: {fmt(ratios.ev_ebit)}
"""
        else:
            context += "\nKey Financial Ratios: No data available\n"

        if scorecard:
            context += f"""
Score Card:
- Profitability: {scorecard.profitability_score}/10
- Growth: {scorecard.growth_score}/10
- Debt: {scorecard.debt_score}/10
- Liquidity: {scorecard.liquidity_score}/10
- Valuation: {scorecard.valuation_score}/10
- Moat: {scorecard.moat_score}/10
- Total: {scorecard.total_score}/10 | Rating: {scorecard.rating}
"""
        if valuation:
            context += f"""
Valuation:
- DCF Value: {fmt(valuation.dcf_value)} XOF
- Graham Value: {fmt(valuation.graham_value)} XOF
- Buffett Value: {fmt(valuation.buffett_value)} XOF
- Current Price: {fmt(valuation.current_price)} XOF
- Target Price: {fmt(valuation.target_price)} XOF
- Discount: {fmt(valuation.discount_percent)}%
- Recommendation: {valuation.recommendation or 'N/A'}
"""
        return context
    
    def _get_llm_response(self, system_prompt: str, user_message: str, question: str = "") -> str:
        if self.openai_api_key and self.openai_api_key != "your-openai-api-key":
            try:
                import openai
                client = openai.OpenAI(api_key=self.openai_api_key)
                response = client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message}
                    ],
                    temperature=0.3,
                    max_tokens=2000
                )
                return response.choices[0].message.content
            except Exception:
                return self._rule_based_response(question or user_message)
        else:
            return self._rule_based_response(question or user_message)
    
    def _rule_based_response(self, question: str) -> str:
        question_lower = question.lower()
        
        if "sous-évalué" in question_lower or "under valued" in question_lower or "sous-évaluée" in question_lower or "undervalued" in question_lower:
            return self._analyze_undervaluation(question)
        elif "risque" in question_lower or "risk" in question_lower:
            return self._analyze_risks(question)
        elif "compar" in question_lower or "compare" in question_lower:
            return self._compare_companies(question)
        elif "rentable" in question_lower or "profitable" in question_lower:
            return self._analyze_profitability(question)
        elif "croissance" in question_lower or "growth" in question_lower:
            return self._analyze_growth(question)
        elif "dividende" in question_lower or "dividend" in question_lower:
            return self._analyze_dividend(question)
        elif "raison" in question_lower or "why" in question_lower or "pourquoi" in question_lower:
            return self._analyze_cause(question)
        else:
            return self._general_analysis(question)
    
    def _analyze_undervaluation(self, question: str) -> str:
        return """**Analyse de Valorisation**

Pour déterminer si une action est sous-évaluée, j'examine plusieurs métriques :

1. **Ratio P/E (Price to Earnings)** : Un P/E bas par rapport au secteur indique une potentielle sous-évaluation. Idéalement < 10 pour la BRVM.

2. **Ratio P/B (Price to Book)** : Un P/B < 1 suggère que l'action se négocie en dessous de sa valeur comptable.

3. **Valeur Intrinsèque (DCF)** : La comparaison entre le cours actuel et la valeur fondamentale calculée par actualisation des flux futurs.

4. **Marge de sécurité** : La différence entre le cours actuel et la valeur intrinsèque. Une marge > 30% est attractive.

5. **Rendement du dividende** : Un rendement élevé et soutenable est un signe de valeur.

**Recommandation**: Consultez les onglets Valorisation et Scorecard pour une analyse détaillée des métriques spécifiques à cette entreprise."""
    
    def _analyze_risks(self, question: str) -> str:
        return """**Analyse des Risques**

Les principaux risques à considérer sont :

1. **Risque de liquidité** : Un Current Ratio < 1 indique des difficultés potentielles à court terme.

2. **Risque d'endettement** : Un Debt/Equity > 2 signale un endettement élevé. Vérifier la capacité de remboursement via l'Interest Coverage Ratio.

3. **Risque de rentabilité** : Baisse des marges sur plusieurs exercices consécutifs. Marge nette < 5% est préoccupante.

4. **Risque de croissance** : Si la croissance du chiffre d'affaires est inférieure à l'inflation, l'entreprise perd du terrain en termes réels.

5. **Risques spécifiques BRVM** : Concentration sectorielle, dépendance aux matières premières, risque politique et de change (pour les filiales hors UEMOA).

6. **Risque de valorisation** : Un P/E > 20 sans croissance justifiée peut signaler une surévaluation.

**Risques détectés** : Utilisez la section Prédictions pour voir les alertes spécifiques à cette entreprise."""
    
    def _compare_companies(self, question: str) -> str:
        return """**Analyse Comparative**

Pour comparer des entreprises, j'utilise une approche multi-critères :

1. **Rentabilité** : ROE, ROA, Marges
2. **Croissance** : CAGR du chiffre d'affaires et du bénéfice sur 3-5 ans
3. **Santé financière** : Niveau d'endettement et liquidité
4. **Valorisation** : P/E, P/B, EV/EBITDA
5. **Score global** : Notre système de notation propriétaire

Les entreprises peuvent être comparées via la page Analyse avec les graphiques interactifs. Sélectionnez jusqu'à 4 entreprises pour une comparaison détaillée."""
    
    def _analyze_profitability(self, question: str) -> str:
        return """**Analyse de la Rentabilité**

La rentabilité s'évalue à travers plusieurs indicateurs clés :

1. **ROE (Return on Equity)** : Mesure l'efficacité avec laquelle l'entreprise utilise les capitaux propres. > 15% est excellent pour la BRVM.

2. **ROA (Return on Assets)** : Capacité à générer du profit à partir des actifs. > 5% est satisfaisant.

3. **Marge nette** : Bénéfice net / Chiffre d'affaires. > 10% est bon pour les secteurs non financiers.

4. **Marge opérationnelle** : Efficacité de la gestion opérationnelle. > 15% indique un fort pouvoir de fixation des prix.

5. **Cost to Income Ratio** (Banques) : < 60% est excellent.

Consultez la section Scorecard pour les notes détaillées de rentabilité."""
    
    def _analyze_growth(self, question: str) -> str:
        return """**Analyse de la Croissance**

La croissance s'analyse sur plusieurs dimensions :

1. **Croissance du chiffre d'affaires** : Indique la capacité à développer le marché. > 10% par an est solide.

2. **Croissance du bénéfice net** : Doit idéalement suivre ou dépasser la croissance du CA.

3. **Croissance du BPA** : Bénéfice par action - crucial pour la création de valeur actionnariale.

4. **Qualité de la croissance** : Croissance organique vs acquisitions vs inflation.

Consultez les graphiques d'évolution dans la page entreprise pour visualiser les tendances de croissance sur 5 ans."""
    
    def _analyze_dividend(self, question: str) -> str:
        return """**Analyse des Dividendes**

Points clés à examiner :

1. **Rendement** : Dividende / Cours actuel. Un rendement > 5% est attractif sur la BRVM.

2. **Taux de distribution (Payout Ratio)** : Dividende / BPA. Idéalement entre 30% et 70%. < 30% = potentiel d'augmentation. > 80% = risque de réduction.

3. **Historique des dividendes** : Progression régulière sur 5+ ans est un bon signe.

4. **Soutenabilité** : Le dividende est-il couvert par le Free Cash Flow ?

Utilisez la section Dividendes pour voir l'historique complet."""
    
    def _analyze_cause(self, question: str) -> str:
        return """**Analyse des Causes**

Pour expliquer les variations significatives, j'examine :

1. **Effet de base** : Comparaison avec une année exceptionnellement bonne ou mauvaise.

2. **Éléments non-récurrents** : Provisions, dépréciations, plus-values de cession.

3. **Variations de change** : Impact des fluctuations du franc CFA pour les filiales étrangères.

4. **Changements sectoriels** : Réglementation, concurrence, prix des matières premières.

5. **Structure des coûts** : Hausse des charges, pression sur les marges.

Pour une analyse détaillée d'une variation spécifique, utilisez la question directe avec le nom de l'entreprise et l'indicateur concerné."""
    
    def _general_analysis(self, question: str) -> str:
        return """**Analyse Générale**

Je peux répondre à plusieurs types de questions :

- **Valorisation** : "ETI est-elle sous-évaluée ?", "Quel est le prix cible ?"
- **Rentabilité** : "Quelle banque est la plus rentable ?", "Analyse des marges"
- **Risques** : "Quels sont les principaux risques ?", "Détection de signaux faibles"
- **Comparaison** : "Compare ETI à BOA Burkina", "Quelle entreprise a la meilleure croissance ?"
- **Dividendes** : "Quel est le rendement du dividende ?", "Le dividende est-il soutenable ?"
- **Causes** : "Pourquoi le résultat global a-t-il chuté ?"

Posez votre question en français ou en anglais. Pour une analyse précise, mentionnez le nom de l'entreprise et l'indicateur souhaité.

💡 **Conseil** : Pour des réponses plus précises, configurez votre clé API OpenAI dans le fichier .env pour activer l'analyse IA avancée."""
    
    def ask_question(self, company_id: int, question: str, company_name: Optional[str] = None) -> Dict[str, Any]:
        context = self._get_company_context(company_id) if company_id else ""

        has_key = bool(self.openai_api_key and self.openai_api_key != "your-openai-api-key")
        
        system_prompt = """Tu es un analyste financier expert spécialisé dans la BRVM (Bourse Régionale des Valeurs Mobilières) et les marchés africains. Tu parles français et anglais.
        
Règles:
1. Réponds de manière concise, professionnelle et factuelle
2. Base tes réponses sur les données financières fournies
3. Si les données sont insuffisantes, indique-le clairement
4. Fournis des perspectives actionnariales claires (ACHEVER, GARDER, VENDRE)
5. Utilise un ton neutre et objectif
6. Inclus des ratios et métriques pertinentes dans ton analyse
7. Sois conscient du contexte BRVM (taille du marché, liquidité, secteurs dominants)"""
        
        user_message = f"""Contexte de l'entreprise:\n{context}\n\nQuestion de l'investisseur: {question}\n\nFournis une réponse d'analyste financier experte."""
        
        response = self._get_llm_response(system_prompt, user_message, question)
        used_llm = has_key and not response.startswith("**")

        return {
            "question": question,
            "answer": response,
            "context_used": bool(context and context != "Company not found"),
            "ai_type": "openai" if used_llm else "rule-based"
        }
    
    def generate_full_report(self, company_id: int) -> AnalysisReport:
        company = self.db.query(Company).filter(Company.id == company_id).first()
        if not company:
            raise ValueError("Company not found")
        
        analysis = self.ask_question(company_id, f"Analyse fondamentale complète de {company.name}")
        
        valuation = self.db.query(Valuation)\
            .filter(Valuation.company_id == company_id)\
            .order_by(Valuation.fiscal_year.desc())\
            .first()
        
        report = AnalysisReport(
            company_id=company_id,
            title=f"Analyse Fondamentale - {company.name}",
            report_type="ai_analysis",
            summary=analysis["answer"][:500] if len(analysis["answer"]) > 500 else analysis["answer"],
            raw_analysis=analysis,
            recommendations=valuation.recommendation if valuation else "N/A",
            target_price=valuation.target_price if valuation else None,
            confidence_score=7.5
        )
        
        self.db.add(report)
        self.db.commit()
        self.db.refresh(report)
        return report
