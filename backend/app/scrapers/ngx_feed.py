"""Flux temps réel NGX (Nigerian Exchange) via l'API NGN Market.

Rafraîchi ~20 min pendant la séance NGX (lun-ven 08:00-15:00 UTC), moins
souvent hors séance. Les prix sont servis depuis le cache mémoire ; ils sont
aussi persistés dans MarketData (source "NGX_LIVE") pour la continuité
historique (les sociétés NGX accumulent leur historique à partir du premier
jour de collecte — pas de backfill rétroactif).

Sans clé API : le feed reste OFFLINE et les sociétés NGX affichent leur prix
de référence (None tant que rien n'a été reçu).
"""
import threading
import time
import logging
from datetime import datetime

from .ngx_provider import make_client, ngx_market_hours

logger = logging.getLogger(__name__)

NGX_FAST_INTERVAL = 20 * 60     # en séance : ~20 min (plan Free)
NGX_SLOW_INTERVAL = 60 * 60     # hors séance : 1 h


class NgxLiveFeed:
    """Cache mémoire du flux temps réel NGX (singleton)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.prices = {}          # symbol -> {"price", "change"}
        self.details = {}         # symbol -> {volume, market_cap, logo_url, sub_sector, name}
        self.last_update = None
        self.last_attempt = None
        self.failures = 0
        self.status = "OFFLINE"   # LIVE | STALE | OFFLINE
        self.disabled_reason = None

    # ----- helpers -----

    def should_refresh(self, force=False) -> bool:
        if force or self.last_attempt is None:
            return True
        interval = NGX_FAST_INTERVAL if ngx_market_hours() else NGX_SLOW_INTERVAL
        return (time.time() - self.last_attempt) >= interval

    def snapshot(self) -> dict:
        with self._lock:
            return {
                "mode": "NGX_LIVE",
                "status": self.status,
                "last_update": self.last_update.isoformat() if self.last_update else None,
                "market_open": ngx_market_hours(),
                "prices": dict(self.prices),
                "details": {k: dict(v) for k, v in self.details.items()},
                "disabled_reason": self.disabled_reason,
            }

    # ----- persistance -----

    def _persist_db(self, prices: dict) -> int:
        from ..database import SessionLocal
        from .persist import persist_prices

        db = SessionLocal()
        try:
            return persist_prices(db, prices, source="NGX_LIVE")
        except Exception as e:
            db.rollback()
            logger.error(f"NgxLiveFeed: persist failed: {e}")
            return 0
        finally:
            db.close()

    # ----- boucle -----

    def refresh(self, force=False) -> int:
        if not self.should_refresh(force):
            return 0
        self.last_attempt = time.time()
        try:
            client = make_client()
            if not client.configured:
                with self._lock:
                    self.status = "OFFLINE"
                    self.disabled_reason = "Clé NGN Market API absente — flux NGX désactivé"
                logger.info("NgxLiveFeed: disabled (no API key)")
                return 0
            rows = client.fetch_companies()
            if not rows:
                raise RuntimeError("no companies returned by NGN Market API")

            prices, details = {}, {}
            for row in rows:
                symbol = row["symbol"]
                if row.get("price"):
                    prices[symbol] = {"price": row["price"], "change": row.get("change")}
                details[symbol] = {
                    "name": row.get("name"),
                    "volume": row.get("volume"),
                    "market_cap": row.get("market_cap"),
                    "logo_url": row.get("logo_url"),
                    "sub_sector": row.get("sub_sector"),
                }

            with self._lock:
                self.prices = prices
                self.details = details
                self.last_update = datetime.utcnow()
                self.failures = 0
                self.status = "LIVE"
                self.disabled_reason = None
            self._persist_db(prices)
            logger.info(f"NGX live feed: {len(prices)} prix reçus ({self.last_update.isoformat()})")
            return len(prices)
        except Exception as e:
            self.failures += 1
            with self._lock:
                self.status = "STALE" if self.last_update else "OFFLINE"
            logger.warning(f"NGX live feed failed ({self.failures}x): {e}")
            return 0


ngx_live_feed = NgxLiveFeed()
