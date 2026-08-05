"""Calendrier des événements BRVM lisible dans le logiciel.

Sources :
- BRVM officiel : pages d'annonces des émetteurs (AG, communiqués, notations,
  changements de dirigeants, franchissements de seuil) + événements sur valeurs
  (paiement de dividendes). Chaque annonce a une date officielle.
- Données locales réelles en secours : dates ex-dividende / paiement (table
  dividends) et dates de publication des indicateurs macro (macro_indicators),
  utilisées quand le site BRVM est injoignable.

Résultat mis en cache en mémoire (TTL) et rafraîchi en arrière-plan.
"""
import logging
import re
import threading
from datetime import datetime, timezone

import httpx

_log = logging.getLogger(__name__)

BRVM_BASE = "https://www.brvm.org"
CACHE_TTL = 3600  # 1 heure
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0"
)

ANNOUNCE_PAGES = [
    ("AG", "/fr/emetteurs/type-annonces/convocations-assemblees-generales"),
    ("Résolution", "/fr/emetteurs/type-annonces/projets-de-resolution"),
    ("Notation", "/fr/emetteurs/type-annonces/notations-financieres"),
    ("Communiqué", "/fr/emetteurs/type-annonces/communiques"),
    ("Dirigeant", "/fr/emetteurs/type-annonces/changements-de-dirigeants"),
    ("Seuil", "/fr/emetteurs/type-annonces/franchissements-de-seuil"),
    ("Dividende", "/fr/esv/paiement-de-dividendes"),
]

TITLE_CLEAN = re.compile(r"^[\w\s\-&'.()/:]+ - ")


class CalendarFeed:
    def __init__(self):
        self._lock = threading.Lock()
        self._items = []
        self._source = "local"
        self._brvm_ok = False
        self._fetched_at = None
        self._running = False

    def last_update(self):
        return self._fetched_at.isoformat() if self._fetched_at else None

    def refresh(self, force=False, db=None):
        now = datetime.now(timezone.utc)
        with self._lock:
            fresh = self._fetched_at and (now - self._fetched_at).total_seconds() < CACHE_TTL
            if fresh and not force:
                return self._items
            if self._running:
                return self._items
            self._running = True
            target = now
        threading.Thread(target=self._job, args=(target, db), daemon=True).start()
        return self._items

    def _job(self, target, db):
        try:
            self._do_refresh(target, db)
        except Exception as e:
            _log.warning("Calendar refresh error: %s", e)
        finally:
            with self._lock:
                self._running = False

    def _do_refresh(self, now, db):
        events = []
        brvm_events, brvm_ok = _fetch_brvm_events()
        source = "brvm" if brvm_ok else "local"
        if brvm_ok:
            events.extend(brvm_events)
        events.extend(_local_events(db))

        events.sort(key=lambda e: e["date"] or "")
        with self._lock:
            self._items = events
            self._source = source
            self._brvm_ok = brvm_ok
            self._fetched_at = now
        _log.info("Calendar feed: %d items (source=%s)", len(events), source)


def _fetch_brvm_events():
    """Scraping best-effort des pages d'annonces BRVM. Retourne ([], False) si injoignable."""
    events = []
    seen = set()

    for label, path in ANNOUNCE_PAGES:
        try:
            resp = httpx.get(
                BRVM_BASE + path,
                headers={"User-Agent": USER_AGENT},
                timeout=12,
                follow_redirects=True,
            )
            resp.raise_for_status()
        except Exception as e:
            _log.warning("BRVM page unreachable (%s): %s", path, e)
            continue

        from bs4 import BeautifulSoup

        soup = BeautifulSoup(resp.text, "lxml")
        rows = soup.select("tbody tr.views-row, tbody tr.odd, tbody tr.even")
        for row in rows:
            date_el = row.select_one("span.date-display-single")
            title_el = row.select_one("td.views-field-title")
            company_el = row.select_one("td.views-field-og-group-ref")
            file_link = row.select_one("a.btn-download")
            if not date_el or not title_el:
                continue
            content = date_el.get("content", "")
            m = re.search(r"(\d{4}-\d{2}-\d{2})", content or "")
            if not m:
                continue
            title = re.sub(r"\s+", " ", title_el.get_text(" ", strip=True)).strip()
            company = re.sub(r"\s+", " ", company_el.get_text(" ", strip=True)).strip() if company_el else ""
            if not title or len(title) < 5:
                continue
            key = (m.group(1), title[:60])
            if key in seen:
                continue
            seen.add(key)
            detail = ""
            if file_link:
                href = file_link.get("href", "")
                if href.lower().endswith((".pdf", ".doc", ".docx")):
                    detail = BRVM_BASE + href if href.startswith("/") else href
            events.append({
                "id": f"brvm-{len(events)}",
                "date": m.group(1),
                "title": f"{label} : {title}" if label != "Dividende" else title,
                "type": "brvm",
                "company": company or None,
                "symbol": None,
                "detail": detail or None,
                "source": "BRVM",
            })
            if len(events) >= 60:
                return events, True
    return events, bool(events)


def _local_events(db):
    if db is None:
        return []
    events = []

    from ..models.market import Dividend
    from ..models.company import Company

    rows = (
        db.query(Dividend, Company)
        .join(Company)
        .order_by(Dividend.ex_date.desc(), Dividend.payment_date.desc())
        .all()
    )
    for div, co in rows:
        if div.ex_date:
            events.append({
                "id": f"div-ex-{div.id}",
                "date": div.ex_date.isoformat(),
                "title": f"Ex-dividende {co.symbol}",
                "type": "dividende",
                "company": co.name,
                "symbol": co.symbol,
                "detail": f"{div.dividend_per_share} {div.currency or 'XOF'}/action" if div.dividend_per_share else None,
                "source": "Dividendes",
            })
        if div.payment_date:
            events.append({
                "id": f"div-pay-{div.id}",
                "date": div.payment_date.isoformat(),
                "title": f"Paiement dividende {co.symbol}",
                "type": "dividende",
                "company": co.name,
                "symbol": co.symbol,
                "detail": f"{div.dividend_per_share} {div.currency or 'XOF'}/action" if div.dividend_per_share else None,
                "source": "Dividendes",
            })

    from ..models.macro import MacroIndicator

    MACRO_LABELS = {
        "inflation": "Inflation",
        "taux_directeur": "Taux directeur BCEAO",
        "croissance_pib": "Croissance PIB",
        "pib_md_fcfa": "PIB (Mds FCFA)",
        "taux_credit_moyen": "Taux de crédit moyen",
        "taux_change_eur_xof": "Taux de change EUR/FCFA",
    }

    macro = db.query(MacroIndicator).order_by(MacroIndicator.date.desc()).all()
    for mi in macro:
        label = MACRO_LABELS.get(mi.indicator, mi.indicator)
        events.append({
            "id": f"macro-{mi.id}",
            "date": mi.date.isoformat(),
            "title": f"Publication {label} — {mi.country}",
            "type": "macro",
            "company": None,
            "symbol": None,
            "detail": f"{mi.value} {mi.unit or ''}",
            "source": mi.source or "Macro",
        })

    return events


calendar_feed = CalendarFeed()
