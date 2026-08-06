"""Pipeline de recalcul automatique des statistiques financières après ingestion
de rapports : ratios → scorecard → valorisation. Ne lève jamais (résilient)."""
import logging

from sqlalchemy.orm import Session

from .ratio_calculator import RatioCalculator
from .scoring import ScoringService
from .valuation import ValuationService

logger = logging.getLogger(__name__)


def recompute_stats(db: Session, company_id: int, fiscal_year: int, quarter=None) -> dict:
    """Recalcule ratios, scorecard et valorisation pour (entreprise, exercice).

    Chaque étape est isolée : un échec ne bloque pas les suivantes.
    Retourne le détail des étapes recalculées.
    """
    result = {"ratios": False, "scorecard": False, "valuation": False}

    try:
        ratio = RatioCalculator(db).calculate_all_ratios(company_id, fiscal_year, quarter)
        result["ratios"] = ratio is not None
    except Exception as e:
        logger.warning("recompute ratios (%s, %s): %s", company_id, fiscal_year, e)
        db.rollback()
        db.commit()

    try:
        scorecard = ScoringService(db).generate_scorecard(company_id, fiscal_year)
        result["scorecard"] = scorecard is not None
    except Exception as e:
        logger.warning("recompute scorecard (%s, %s): %s", company_id, fiscal_year, e)
        db.rollback()
        db.commit()

    try:
        valuation = ValuationService(db).calculate_all_valuations(company_id, fiscal_year)
        result["valuation"] = valuation is not None
    except Exception as e:
        logger.warning("recompute valuation (%s, %s): %s", company_id, fiscal_year, e)
        db.rollback()
        db.commit()

    return result
