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
        self.volumes = {}         # symbol -> {"volume": float, "estimated": bool}
        self.indices = {}         # "brvm_composite" -> {"value": float, "change": float}
        self.activities = {}      # transaction_value, equities_cap, bonds_cap
        self.last_update = None   # datetime (UTC) de la dernière valeur reçue
        self.last_attempt = None  # timestamp du dernier essai de rafraîchissement
        self.failures = 0
        self.status = "OFFLINE"   # LIVE | STALE | OFFLINE
        self._base_cache = {}     # symbol -> dernier volume quotidien connu (lazy)
        self._base_loaded_at = 0.0
        self._vol_prev = {}       # symbol -> volume déjà émis (croissance monotone)
        self.fixed_income = {}    # code -> {"price", "change", "name", "type", "date"}
        self.fixed_income_ts = 0.0
        self.fixed_income_status = None

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
                "volumes": dict(self.volumes),
                "indices": dict(self.indices),
                "activities": dict(self.activities),
                "fixed_income": dict(self.fixed_income),
                "fixed_income_date": (
                    next(iter(self.fixed_income.values()), {}).get("date")
                    if self.fixed_income else None),
            }

    # ----- obligations / FCTC (dernière séance BFIN) -----

    def _fixed_ttl(self) -> float:
        """Cache BFIN : 30 min en séance, 2 h hors séance."""
        return 1800.0 if self.in_market_hours() else 7200.0

    def _refresh_fixed_income(self, force: bool = False) -> dict:
        if not force and self.fixed_income and \
                (time.time() - self.fixed_income_ts) < self._fixed_ttl():
            return self.fixed_income
        from .bfin_history import fetch_latest_fixed_income
        data = fetch_latest_fixed_income()
        if data:
            self.fixed_income = data
            self.fixed_income_ts = time.time()
            self.fixed_income_status = "LIVE"
        else:
            self.fixed_income_ts = time.time()  # évite de re-scraper en boucle
            self.fixed_income_status = "OFFLINE"
        logger.info(f"BRVM live feed: {len(data)} obligations/FCTC (BFIN)")
        self.prices.update({k: {"price": v["price"], "change": v["change"]}
                            for k, v in data.items()})
        return data

    def _persist_fixed_db(self) -> int:
        """Persiste les obligations/FCTC (source BFIN), en créant la société
        idempotemment si elle n'existe pas encore."""
        if not self.fixed_income:
            return 0
        import threading as _t

        from ..database import SessionLocal
        from ..models.company import Company
        from .bfin_history import _ensure_company
        from .persist import persist_prices

        lock = _t.Lock()
        db = SessionLocal()
        try:
            company_ids = {c.symbol: c.id for c in db.query(Company).all()}
            for code, info in self.fixed_income.items():
                _ensure_company(db, company_ids, lock, code,
                                info.get("name") or code, info.get("type") or "obligation")
            n = persist_prices(db, self.fixed_income, source="BFIN")
            return n
        except Exception as e:
            db.rollback()
            logger.warning(f"LiveFeed: persist fixed income failed: {e}")
            return 0
        finally:
            db.close()

    # ----- volume temps réel -----

    def _base_volumes(self) -> dict:
        """Dernier volume quotidien connu par symbole (cache 10 min)."""
        if time.time() - self._base_loaded_at < 600 and self._base_cache:
            return self._base_cache
        from ..database import SessionLocal
        from ..models.company import Company
        from ..models.market import MarketData
        from datetime import timedelta

        result = {}
        db = SessionLocal()
        try:
            cutoff = date.today() - timedelta(days=10)
            rows = (
                db.query(Company.symbol, MarketData.volume)
                .join(MarketData, MarketData.company_id == Company.id)
                .filter(MarketData.date >= cutoff, MarketData.volume.isnot(None), MarketData.volume > 0)
                .order_by(MarketData.date.desc())
                .all()
            )
            seen = set()
            for symbol, volume in rows:
                if symbol in seen:
                    continue
                seen.add(symbol)
                result[symbol] = float(volume)
        except Exception as e:
            logger.warning("LiveFeed: base volumes unavailable: %s", e)
        finally:
            db.close()
        self._base_cache = result
        self._base_loaded_at = time.time()
        return result

    def _session_progress(self, now=None) -> float:
        """Progression de la séance 09:00-17:30 → 0..1 (départ à l'ouverture)."""
        now = now or datetime.utcnow().time()
        if now <= MARKET_OPEN:
            return 0.0
        if now >= MARKET_CLOSE:
            return 1.0
        total = (datetime.combine(date.today(), MARKET_CLOSE) -
                 datetime.combine(date.today(), MARKET_OPEN)).total_seconds()
        elapsed = (datetime.combine(date.today(), now) -
                   datetime.combine(date.today(), MARKET_OPEN)).total_seconds()
        return min(1.0, max(0.0, elapsed / total))

    def _compute_volumes(self, symbols: list) -> dict:
        """Volume "en direct" par symbole.

        Pendant la séance : croissance monotone depuis ~0 jusqu'au dernier volume
        quotidien connu (progressif + bruit déterministe par fenêtre de 30 s).
        Hors séance : dernier volume quotidien connu, sans estimation.
        """
        import random
        base = self._base_volumes()
        out = {}
        if not self.in_market_hours():
            for sym in symbols:
                if sym in base and base[sym] > 0:
                    out[sym] = {"volume": base[sym], "estimated": False}
            return out

        p = self._session_progress()
        p = min(1.0, (p ** 1.15) * 0.95 + 0.05)  # 5% dès l'ouverture
        for sym in symbols:
            b = base.get(sym)
            if not b or b <= 0:
                continue
            rng = random.Random(f"{sym}{int(time.time() / 30)}")
            noise = 0.94 + rng.random() * 0.12
            value = max(0, int(b * p * noise))
            value = max(value, self._vol_prev.get(sym, 0))
            self._vol_prev[sym] = value
            out[sym] = {"volume": value, "estimated": True}
        return out

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
                self.volumes = self._compute_volumes(list(prices.keys()))
                self.indices = data["indices"]
                self.activities = data["activities"]
                self.last_update = datetime.utcnow()
                self.failures = 0
                self.status = "LIVE"
            self._refresh_fixed_income()
            self._persist_db(prices)
            self._persist_fixed_db()
            logger.info(f"BRVM live feed: {len(prices)} prix reçus ({self.last_update.isoformat()})")
            return len(prices)
        except Exception as e:
            self.failures += 1
            with self._lock:
                self.status = "STALE" if self.last_update else "OFFLINE"
            logger.warning(f"BRVM live feed failed ({self.failures}x): {e}")
            return 0


live_feed = LiveFeed()
