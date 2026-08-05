"""Flux temps réel BRVM — polling direct du site officiel (/fr/flux-en-temps-reel).

Le flux est rafraîchi toutes les 30 secondes pendant la cotation
(9h00-17h30 GMT, jours ouvrés) et toutes les 10 minutes hors séance.
Les prix proviennent directement de la BRVM et sont servis par le cache
mémoire en priorité ; ils sont aussi persistés dans MarketData (source
"BRVM_LIVE") pour garder la continuité historique.
"""
import threading
import time
import logging
import httpx
from bs4 import BeautifulSoup
from datetime import date, datetime, time as dtime

logger = logging.getLogger(__name__)

BRVM_REALTIME_URL = "https://www.brvm.org/fr/flux-en-temps-reel"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

MARKET_OPEN = dtime(9, 0)
MARKET_CLOSE = dtime(17, 30)
FAST_INTERVAL = 30     # secondes en séance
SLOW_INTERVAL = 600    # secondes hors séance


def _parse_price(text: str) -> float:
    text = text.strip().replace(" ", "").replace("\u202f", "").replace("\xa0", "")
    text = text.replace("FCFA", "").replace("fcfa", "").strip()
    if "," in text:
        text = text.replace(",", ".")
    return float(text) if text else 0.0


def _parse_change(text: str) -> float:
    text = text.strip().replace(" ", "").replace("\u202f", "").replace("\xa0", "").replace(",", ".").replace("%", "")
    return float(text) if text else 0.0


class LiveFeed:
    """Cache mémoire du flux temps réel BRVM (singleton)."""

    def __init__(self):
        self._lock = threading.Lock()
        self.prices = {}          # symbol -> {"price": float, "change": float}
        self.indices = {}         # "brvm_composite" -> {"value": float, "change": float}
        self.activities = {}      # transaction_value, equities_cap, bonds_cap
        self.last_update = None   # datetime (UTC) de la dernière valeur reçue
        self.last_attempt = None  # timestamp du dernier essai de rafraîchissement
        self.failures = 0
        self.status = "OFFLINE"   # LIVE | STALE | OFFLINE

    # ----- helpers -----

    def in_market_hours(self, now=None):
        now = now or datetime.utcnow()
        if now.weekday() >= 5:
            return False
        return MARKET_OPEN <= now.time() <= MARKET_CLOSE

    def should_refresh(self, force=False):
        if force or self.last_attempt is None:
            return True
        interval = FAST_INTERVAL if self.in_market_hours() else SLOW_INTERVAL
        return (time.time() - self.last_attempt) >= interval

    def snapshot(self):
        with self._lock:
            return {
                "mode": "BRVM_LIVE",
                "status": self.status,
                "last_update": self.last_update.isoformat() if self.last_update else None,
                "market_open": self.in_market_hours(),
                "prices": dict(self.prices),
                "indices": dict(self.indices),
                "activities": dict(self.activities),
            }

    # ----- scraping -----

    def _parse_page(self) -> dict:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            resp = client.get(BRVM_REALTIME_URL, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            soup = BeautifulSoup(resp.text, "lxml")

        prices = {}
        for item in soup.select(".item"):
            spans = item.select("span")
            if len(spans) < 3:
                continue
            symbol = spans[0].get_text(strip=True).upper()
            if not symbol or not symbol.isascii():
                continue
            try:
                prices[symbol] = {
                    "price": _parse_price(spans[1].get_text(strip=True)),
                    "change": _parse_change(spans[2].get_text(strip=True)),
                }
            except ValueError:
                continue

        indices = {}
        activities = {}
        for table in soup.select("table"):
            rows = table.select("tr")
            for tr in rows:
                tds = [td.get_text(strip=True) for td in tr.select("td")]
                if len(tds) < 2:
                    continue
                label = tds[0].upper()
                value = tds[1]
                if label == "VALEUR DES TRANSACTIONS":
                    activities["transaction_value"] = _parse_price(value)
                elif label == "CAPITALISATION ACTIONS":
                    activities["equities_cap"] = _parse_price(value)
                elif label == "CAPITALISATION DES OBLIGATIONS":
                    activities["bonds_cap"] = _parse_price(value)
                elif label in ("BRVM-C", "BRVM-30", "BRVM-PRES", "BRVM-PRINCIPAL"):
                    key = {
                        "BRVM-C": "brvm_composite",
                        "BRVM-30": "brvm_30",
                        "BRVM-PRES": "brvm_prestige",
                        "BRVM-PRINCIPAL": "brvm_principal",
                    }[label]
                    indices[key] = {
                        "value": _parse_price(value),
                        "change": _parse_change(tds[2]) if len(tds) > 2 else None,
                    }

        return {"prices": prices, "indices": indices, "activities": activities}

    # ----- persistance -----

    def _persist_db(self, prices: dict) -> int:
        from ..database import SessionLocal
        from .persist import persist_prices

        db = SessionLocal()
        try:
            return persist_prices(db, prices, source="BRVM_LIVE")
        except Exception as e:
            db.rollback()
            logger.error(f"LiveFeed: persist failed: {e}")
            return 0
        finally:
            db.close()

    # ----- boucle -----

    def refresh(self, force=False) -> int:
        if not self.should_refresh(force):
            return 0
        self.last_attempt = time.time()
        try:
            data = self._parse_page()
            prices = data["prices"]
            if not prices:
                raise RuntimeError("no prices parsed from BRVM")
            with self._lock:
                self.prices = prices
                self.indices = data["indices"]
                self.activities = data["activities"]
                self.last_update = datetime.utcnow()
                self.failures = 0
                self.status = "LIVE"
            self._persist_db(prices)
            logger.info(f"BRVM live feed: {len(prices)} prix reçus ({self.last_update.isoformat()})")
            return len(prices)
        except Exception as e:
            self.failures += 1
            with self._lock:
                self.status = "STALE" if self.last_update else "OFFLINE"
            logger.warning(f"BRVM live feed failed ({self.failures}x): {e}")
            return 0


live_feed = LiveFeed()
