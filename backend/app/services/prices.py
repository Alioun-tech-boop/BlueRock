"""Derniers cours de marché partagés : 1 requête, cache court en mémoire.

Toutes les vues (défis, suivi premium, rééquilibrage) doivent utiliser cette
fonction au lieu de re-scanner market_data à chaque appel. Le cache (5 s)
absorbe les pics de lecture sans jamais obsoléter les prix plus d'un cycle.
"""
import threading
from datetime import datetime

from sqlalchemy.orm import Session

PRICES_CACHE_TTL = 5  # secondes

_cache: dict = {}
_cache_lock = threading.Lock()


def latest_prices(db: Session) -> dict[str, float]:
    """Dernier cours par symbole (DISTINCT ON company_id), en cache 5 s.

    Les clôtures DB servent de base ; les cours temps réel du flux BRVM
    (cache mémoire) sont superposés quand ils sont disponibles, comme sur
    /api/market/overview — sinon les défis figent sur les clôtures.
    """
    now = datetime.now().timestamp()
    with _cache_lock:
        if _cache and now - _cache["ts"] < PRICES_CACHE_TTL:
            return _cache["prices"]
    from sqlalchemy import text
    rows = db.execute(text(
        "SELECT DISTINCT ON (md.company_id) co.symbol, md.close_price "
        "FROM market_data md JOIN companies co ON co.id = md.company_id "
        "WHERE md.close_price IS NOT NULL "
        "ORDER BY md.company_id, md.date DESC"
    )).all()
    prices = {r[0]: float(r[1]) for r in rows}
    try:
        from ..scrapers.live_feed import live_feed
        snap = live_feed.snapshot()
        for sym, v in (snap.get("prices") or {}).items():
            price = v.get("price") if isinstance(v, dict) else v
            if price and price > 0:
                prices[sym] = float(price)
    except Exception:
        pass
    with _cache_lock:
        _cache["ts"] = now
        _cache["prices"] = prices
    return prices