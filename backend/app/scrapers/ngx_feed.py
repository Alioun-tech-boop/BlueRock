"""Flux temps réel NGX (Nigerian Exchange) via l'API NGN Market.

Rafraîchi ~20 min pendant la séance NGX (lun-ven 08:00-15:00 UTC), moins
souvent hors séance. Les prix sont servis depuis le cache mémoire ; ils sont
aussi persistés dans MarketData (source "NGX_LIVE") pour la continuité
historique (les sociétés NGX accumulent leur historique à partir du premier
jour de collecte).

Backfill historique : `NgxLiveFeed.backfill(days=...)` recharge les séries
OHLC passées. Par défaut il utilise la source alternative configurée
(`NGX_HISTORY_PROVIDER`, ex. Twelve Data en free) pour contourner la limite du
plan Free NGN Market. Si `provider="ngnmarket"`, il tente l'historique natif
(plan hobby+ requis ; sinon 403 PLAN_REQUIRED). Voir `backfill_ngx_history`
(pilote CLI) et `POST /api/admin/ngx/backfill`.

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
                    prices[symbol] = {
                        "price": row["price"],
                        "change": row.get("change"),
                        "volume": row.get("volume"),
                    }
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

    # ----- backfill historique (source alternative ou natif) -----

    def backfill(self, days: int = 365, symbols: list = None, limit: int = None,
                 persist: bool = True, provider: str = None) -> dict:
        """Recharge l'historique OHLC des sociétés NGX dans MarketData.

        `provider` (ou settings.NGX_HISTORY_PROVIDER) choisit la source :
          - "twelvedata" (defaut) : historique gratuit via Twelve Data.
          - "stooq"               : CSV Stooq (réseaux non filtrés).
          - "ngnmarket"           : historique natif NGN Market (plan hobby+),
            sinon 403 PLAN_REQUIRED.

        Idempotent (upsert par company_id + date). Retourne un résumé.
        """
        from ..database import SessionLocal
        from ..models.company import Company
        from .persist import persist_history
        from ..config import settings

        provider = (provider or settings.NGX_HISTORY_PROVIDER or "twelvedata").lower()

        db = SessionLocal()
        try:
            sym2id = {co.symbol: co.id for co in db.query(Company).filter(Company.exchange == "NGX").all()}
            targets = symbols or list(sym2id.keys())
            if limit:
                targets = targets[:limit]

            total = 0
            scanned = 0
            errors = []
            for sym in targets:
                if sym not in sym2id:
                    continue
                try:
                    if provider == "ngnmarket":
                        from .ngx_provider import make_client, PlanRequired
                        client = make_client()
                        if not client.configured:
                            return {"status": "OFFLINE", "reason": "clé API NGN Market absente", "persisted": 0}
                        try:
                            bars = client.fetch_history(sym, period=_period_for_days(days))
                        except PlanRequired as e:
                            logger.warning(f"NgxLiveFeed.backfill: {e}")
                            return {
                                "status": "PLAN_REQUIRED",
                                "reason": "Plan Free insuffisant pour l'historique NGX — passez au plan hobby+ sur ngnmarket.com",
                                "scanned": scanned, "persisted": total,
                            }
                    else:
                        from .ngx_history_alt import fetch_history_alt
                        bars = fetch_history_alt(sym, days, provider=provider)
                except Exception as e:
                    logger.warning(f"NgxLiveFeed.backfill {sym} ({provider}) erreur: {e}")
                    errors.append(f"{sym}: {e}")
                    continue
                scanned += 1
                if bars and persist:
                    total += persist_history(db, {sym: bars}, source="NGX_LIVE")
        finally:
            db.close()

        if errors:
            return {
                "status": "PARTIAL" if total else "ERROR",
                "provider": provider,
                "scanned": scanned,
                "persisted": total,
                "errors": errors[:5],
            }
        return {"status": "OK", "provider": provider, "scanned": scanned, "persisted": total}


def _period_for_days(days: int) -> str:
    if days <= 31:
        return "1M"
    if days <= 92:
        return "3M"
    if days <= 183:
        return "6M"
    if days <= 365:
        return "1Y"
    if days <= 730:
        return "2Y"
    if days <= 1825:
        return "5Y"
    return "MAX"


ngx_live_feed = NgxLiveFeed()
