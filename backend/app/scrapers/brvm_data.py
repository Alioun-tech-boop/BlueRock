"""BRVM real data scraper - company details + market indices.
Fetches real data from https://www.brvm.org (official BRVM website).
"""
from bs4 import BeautifulSoup
from datetime import date
import logging
import random
import time

from ._http import get_with_retry

logger = logging.getLogger(__name__)

BRVM_URL = "https://www.brvm.org"

_CACHE_TTL = 300  # 5 minutes
_overview_cache = {"ts": 0, "data": None}

# 47 symbols listed on BRVM (scraped from homepage)
ALL_SYMBOLS = [
    "ABJC", "BICB", "BICC", "BNBC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN", "BOAS",
    "CABC", "CBIBF", "CFAC", "CIEC", "ECOC", "ETIT", "FTSC", "LNBB", "NEIC", "NSBC",
    "NTLC", "ONTBF", "ORAC", "ORGT", "PALC", "PRSC", "SAFC", "SCRC", "SDCC", "SDSC",
    "SEMC", "SGBC", "SHEC", "SIBC", "SICC", "SIVC", "SLBC", "SMBC", "SNTS", "SOGC",
    "SPHC", "STAC", "STBC", "TTLC", "TTLS", "UNLC", "UNXC",
]

# Map BRVM sectors to internal Sector enum values
SECTOR_MAP = {
    "SERVICES FINANCIERS": "Services Financiers",
    "CONSOMMATION DE BASE": "Consommation de Base",
    "CONSOMMATION DISCRETIONNAIRE": "Consommation Discrétionnaire",
    "ENERGIE": "Énergie",
    "INDUSTRIELS": "Industriels",
    "SERVICES PUBLICS": "Services Publics",
    "TELECOMMUNICATIONS": "Télécommunications",
}


def _parse_num(text: str):
    """Parse '3 392 722 873 FCFA' or '16235,00' or '-0,15%' -> float."""
    if not text:
        return None
    text = text.strip().replace(" ", "").replace("\u202f", "").replace("\xa0", "")
    # strip trailing unit suffixes (FCFA, %)
    while text and text[-1] not in "0123456789.":
        text = text[:-1]
    text = text.replace(",", ".")
    try:
        return float(text)
    except ValueError:
        return None


def _get_page(path: str):
    try:
        resp = get_with_retry(f"{BRVM_URL}{path}")
        return BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        logger.error(f"Failed to fetch {path}: {e}")
        return None


def scrape_stock_detail(symbol: str) -> dict:
    """Scrape a single stock detail page /fr/{symbol}."""
    soup = _get_page(f"/fr/{symbol.lower()}")
    if not soup:
        return {}
    body = soup.body
    if not body:
        return {}
    text = body.get_text("\n", strip=True)

    def field(label):
        idx = text.find(label + ":")
        if idx < 0:
            idx = text.find(label)
        if idx < 0:
            return ""
        after = text[idx + len(label):].lstrip(":").strip()
        return after.split("\n")[0].strip() if "\n" in after else after

    detail = {
        "symbol": symbol,
        "name": field("Description"),
        "sector": field("Secteur"),
        "open": _parse_num(field("Cours Ouverture")),
        "close": _parse_num(field("Cours Cl\u00f4ture")),
        "volume": _parse_num(field("Volume Echange")),
        "value": _parse_num(field("Valeur Echange")),
        "change_percent": _parse_num(field("Variation Pourcentage")),
        "per": _parse_num(field("PER")),
        "reference_price": _parse_num(field("Cours de reference")),
        "shares_outstanding": _parse_num(field("Nombre de titres")),
        "market_cap": _parse_num(field("Capitalisation globale")),
        "float_cap": _parse_num(field("Capitalisation flottante")),
    }
    return detail


def scrape_all_stocks() -> list:
    """Scrape all 47 stock details from BRVM (avec délai de courtoisie)."""
    stocks = []
    for i, symbol in enumerate(ALL_SYMBOLS):
        detail = scrape_stock_detail(symbol)
        if detail:
            stocks.append(detail)
        if i < len(ALL_SYMBOLS) - 1:
            time.sleep(random.uniform(0.4, 1.2))
    logger.info(f"Scraped {len(stocks)} stock details from BRVM")
    return stocks


def _snapshot_fallback() -> dict:
    """Load last known good overview from the local snapshot file, if present."""
    import json as _json
    import os as _os
    path = _os.path.join(_os.path.dirname(__file__), "..", "data", "brvm_real_snapshot.json")
    if not _os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = _json.load(f)
        return data.get("overview", {})
    except Exception:
        return {}


def scrape_market_overview() -> dict:
    """Scrape real market indices from /fr/resume (Journée de cotation).
    Cached for 5 minutes to avoid hammering the BRVM website.
    Falls back to the local snapshot when the website is unreachable.
    """
    global _overview_cache
    now = time.time()
    if _overview_cache["data"] and (now - _overview_cache["ts"]) < _CACHE_TTL:
        return _overview_cache["data"]

    soup = _get_page("/fr/resume")
    if not soup:
        if _overview_cache["data"]:
            return _overview_cache["data"]
        fallback = _snapshot_fallback()
        if fallback:
            _overview_cache["ts"] = now
            _overview_cache["data"] = fallback
            logger.info("Using snapshot fallback for market overview")
        return fallback
    text = soup.get_text("\n", strip=True)
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    def field(label):
        for i, line in enumerate(lines):
            if line.startswith(label):
                # next non-empty line(s) contain the value(s)
                vals = []
                for nxt in lines[i + 1:i + 4]:
                    if nxt in ("Top 5", "Flop 5", "Activit\u00e9s du march\u00e9", "Emetteurs", "Se connecter"):
                        break
                    vals.append(nxt)
                return vals
        return []

    # Table "Activités du marché": label line then value line(s)
    act = field("Valeur des transactions")
    caps_act = field("Capitalisation Actions")
    caps_bond = field("Capitalisation des obligations")

    # Index lines: "BRVM-C", value, change
    comp = field("BRVM-C")
    c30 = field("BRVM-30")
    pres = field("BRVM-PRES")
    princ = field("BRVM-PRINCIPAL")

    # Sector index table: label, prev_close, close, change, ytd
    sector_indices = {}
    for sec_label in ["CONSOMMATION DE BASE", "CONSOMMATION DISCRETIONNAIRE", "ENERGIE",
                      "INDUSTRIELS", "SERVICES FINANCIERS", "SERVICES PUBLICS", "TELECOMMUNICATIONS"]:
        vals = field(f"BRVM - {sec_label}")
        if vals:
            sector_indices[sec_label] = {
                "prev_close": _parse_num(vals[0]),
                "value": _parse_num(vals[1]) if len(vals) > 1 else None,
                "change": _parse_num(vals[2]) if len(vals) > 2 else None,
                "ytd": _parse_num(vals[3]) if len(vals) > 3 else None,
            }

    def _pick(vals, idx=0):
        return _parse_num(vals[idx]) if vals and idx < len(vals) else None

    overview = {
        "brvm_composite": _pick(comp, 0),
        "brvm_composite_change": _pick(comp, 1),
        "brvm_30": _pick(c30, 0),
        "brvm_30_change": _pick(c30, 1),
        "brvm_prestige": _pick(pres, 0),
        "brvm_prestige_change": _pick(pres, 1),
        "brvm_principal": _pick(princ, 0),
        "brvm_principal_change": _pick(princ, 1),
        "transaction_value": _pick(act, 0),
        "equities_cap": _pick(caps_act, 0),
        "bonds_cap": _pick(caps_bond, 0),
        "sector_indices": sector_indices,
    }
    _overview_cache["ts"] = now
    _overview_cache["data"] = overview
    return overview


def refresh_real_data() -> dict:
    """Full pipeline: scrape all stocks + indices, update database."""
    from ..database import SessionLocal
    from ..models.company import Company
    from ..models.market import MarketData

    stocks = scrape_all_stocks()
    if not stocks:
        return {"status": "error", "message": "Failed to scrape BRVM data"}

    today = date.today()
    db = SessionLocal()
    try:
        companies = {co.symbol: co for co in db.query(Company).all()}
        updated = created = 0
        for s in stocks:
            co = companies.get(s["symbol"])
            if not co:
                continue
            close = s["close"]
            if close is None or close <= 0:
                continue  # ne jamais persister un prix invalide
            md = db.query(MarketData).filter(
                MarketData.company_id == co.id, MarketData.date == today
            ).first()
            if md:
                md.close_price = close
                md.open_price = s["open"] or md.open_price
                md.volume = s["volume"] or md.volume
                md.change_percent = s["change_percent"] or md.change_percent
                md.market_cap = s["market_cap"] or md.market_cap
                md.source = "BRVM_REAL"
                updated += 1
            else:
                md = MarketData(
                    company_id=co.id,
                    date=today,
                    open_price=s["open"],
                    close_price=close,
                    volume=s["volume"] or 0,
                    change_percent=s["change_percent"],
                    market_cap=s["market_cap"],
                    source="BRVM_REAL",
                )
                db.add(md)
                created += 1
        db.commit()
        return {"status": "success", "created": created, "updated": updated}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update real market data: {e}")
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
