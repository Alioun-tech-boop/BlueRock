"""Persistance des prix de marché dans MarketData.

Règles communes aux flux live/scrapers :
- On ne persiste jamais le week-end (samedi/dimanche) : pas de point factice
  qui polluerait l'historique (l'audit P0-2 : le live feed écrivait 2 points
  identiques datés du week-end et masquait la vraie séance).
- Hiérarchie des sources : BFIN (séance réelle importée) > BRVM_LIVE >
  SCRAPER_BRVM. Une séance réelle BFIN n'est jamais écrasée par du live.
- `volume` reste None quand inconnu (jamais 0 codé en dur).
- Upsert par (company_id, date) pour la continuité de l'historique.
"""
from datetime import date, timedelta
import logging

logger = logging.getLogger(__name__)


def is_trading_day(d: date) -> bool:
    """Jour ouvré BRVM : lundi-vendredi (le calendrier férié est géré par
    les séances réelles BFIN qui ne seront jamais écrasées)."""
    return d.weekday() < 5


def persist_prices(db, prices: dict, source: str = "BRVM_LIVE", day: date = None) -> int:
    """Écrit/maj les prix {symbol: {"price", "change", "volume"?}} pour `day`
    (défaut : aujourd'hui). Retourne le nombre de sociétés persistées.
    """
    from ..models.company import Company
    from ..models.market import MarketData

    day = day or date.today()
    if not is_trading_day(day):
        logger.info(f"persist_prices: {day} est un week-end, persistance ignorée")
        return 0

    companies = {co.symbol: co for co in db.query(Company).all()}
    count = 0
    for symbol, p in prices.items():
        co = companies.get(symbol)
        if not co:
            continue
        price = p.get("price")
        if price is None or price <= 0:
            continue  # ne jamais persister un prix nul ou négatif

        existing = db.query(MarketData).filter(
            MarketData.company_id == co.id, MarketData.date == day
        ).first()
        if existing and existing.source == "BFIN":
            continue  # séance réelle déjà en base, ne pas écraser

        market_cap = (price * co.shares_outstanding) if co.shares_outstanding else None
        volume = p.get("volume")
        if volume is None and existing is not None and existing.volume is not None:
            volume = existing.volume  # conserver le volume réel déjà présent

        if existing:
            existing.close_price = price
            existing.change_percent = p.get("change")
            existing.market_cap = market_cap
            if volume is not None:
                existing.volume = volume
            existing.source = source
        else:
            db.add(MarketData(
                company_id=co.id,
                date=day,
                close_price=price,
                change_percent=p.get("change"),
                volume=volume,
                market_cap=market_cap,
                source=source,
            ))
        count += 1
    db.commit()
    return count


def latest_real_session(db) -> date:
    """Dernière séance réelle connue (toute source non synthétique)."""
    from ..models.market import MarketData
    d = db.query(MarketData.date).filter(
        MarketData.source == "BFIN", MarketData.is_synthetic == False  # noqa: E712
    ).order_by(MarketData.date.desc()).first()
    if d:
        return d[0]
    return date.today() - timedelta(days=7)
