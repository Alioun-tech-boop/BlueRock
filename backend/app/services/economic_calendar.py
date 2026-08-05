"""Calendrier économique BRVM alimenté par les données réelles de la base.

Sources de vérité :
- financial_statements.source_file : la date de publication officielle est
  encodée dans le nom du fichier PDF BRVM (ex. 20260729_-_rapport_...).
- financial_line_items "Résultat net" / "Chiffre d'affaires" : valeurs
  réelles (Actuel) et valeur de l'exercice précédent (Précédent).
- macro_indicators : publications macro avec valeur de l'année précédente.
- companies.listing_date : admissions à la cote.
- CalendarFeed : annonces BRVM scrapées (AG, dividendes, communiqués...).
"""
import logging
import re
from datetime import datetime

_log = logging.getLogger(__name__)

COUNTRY_RULES = [
    (r"COTE D'IVOIRE|ABIDJAN|\bCI\b", "CI"),
    (r"BENIN|\bBN\b", "BJ"),
    (r"BURKINA|\bBF\b", "BF"),
    (r"MALI|\bML\b", "ML"),
    (r"NIGER|\bNE\b", "NE"),
    (r"SENEGAL|\bSN\b", "SN"),
    (r"TOGO|\bTG\b", "TG"),
]

FLAG_BY_COUNTRY = {
    "CI": "🇨🇮", "BJ": "🇧🇯", "BF": "🇧🇫", "ML": "🇲🇱",
    "NE": "🇳🇪", "SN": "🇸🇳", "TG": "🇹🇬", "UEMOA": "🏛️",
}

# Numéros (ordre alphabétique) des pays dans la zone UEMOA-BRVM
ISO_TO_NUM = {
    "BJ": "024", "BF": "854", "CI": "384", "ML": "466",
    "NE": "562", "SN": "686", "TG": "768",
}

_FILENAME_DATE = re.compile(r"(20\d{2})(\d{2})(\d{2})")


def infer_country(name):
    """Déduit le pays de la société depuis son nom officiel."""
    if not name:
        return "CI"
    up = name.upper()
    for pattern, code in COUNTRY_RULES:
        if re.search(pattern, up):
            return code
    return "CI"


def country_flag(country):
    return FLAG_BY_COUNTRY.get(country, "")


def publication_date_from_source(source_file):
    """Extrait la date de publication YYYYMMDD du nom de fichier PDF BRVM."""
    if not source_file:
        return None
    name = source_file.split("/")[-1]
    m = _FILENAME_DATE.match(name)
    if not m:
        return None
    try:
        return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3))).date()
    except ValueError:
        return None


def report_label(source_file):
    """Détermine le type de publication : annuel, semestriel, trimestriel."""
    name = (source_file or "").lower()
    if "trimestre" in name or "trimestriel" in name:
        return "trimestriel"
    if "semestre" in name or "semestriel" in name:
        return "semestriel"
    return "annuel"


def _fmt_value(v, unit="FCFA"):
    if v is None:
        return None
    try:
        fv = float(v)
    except (TypeError, ValueError):
        return None
    if abs(fv) >= 1_000_000_000:
        return f"{fv / 1_000_000_000:.2f} Mds"
    if abs(fv) >= 1_000_000:
        return f"{fv / 1_000_000:.1f} M"
    return f"{fv:,.0f}".replace(",", " ")


def build_economic_events(db):
    """Événements économiques dérivés des données réelles BRVM en base."""
    from ..models.company import Company
    from ..models.financial import FinancialStatement, FinancialLineItem
    from ..models.macro import MacroIndicator

    events = []

    # 1) Publications de résultats (date officielle depuis le nom du PDF)
    stmts = (
        db.query(FinancialStatement)
        .filter(FinancialStatement.source_file.isnot(None))
        .all()
    )
    company_map = {c.id: c for c in db.query(Company).all()}

    # Net income par (company, année) pour la colonne Précédent
    net_income = {}
    rows = (
        db.query(FinancialLineItem, FinancialStatement)
        .join(FinancialStatement)
        .filter(
            FinancialStatement.statement_type == "INCOME",
            FinancialLineItem.account_name.ilike("%Résultat net%"),
        )
        .all()
    )
    for li, fs in rows:
        net_income.setdefault((fs.company_id, fs.fiscal_year), []).append(li.value)

    pub_dates = {}
    for fs in stmts:
        d = publication_date_from_source(fs.source_file)
        if d is None:
            continue
        key = (fs.company_id, fs.fiscal_year, fs.quarter)
        if key not in pub_dates or d < pub_dates[key][0]:
            pub_dates[key] = (d, report_label(fs.source_file))

    for (company_id, fy, quarter), (date, label) in pub_dates.items():
        co = company_map.get(company_id)
        if not co:
            continue
        events.append({
            "id": f"fin-{company_id}-{fy}-{quarter or 'A'}",
            "date": date.isoformat(),
            "time": None,
            "title": f"Publication des résultats {label}s {fy}",
            "type": "financier",
            "company": co.name,
            "symbol": co.symbol,
            "country": infer_country(co.name),
            "importance": 3 if label == "annuel" else 2,
            "actual": _fmt_value((net_income.get((company_id, fy)) or [None])[-1]),
            "forecast": None,
            "previous": _fmt_value((net_income.get((company_id, fy - 1)) or [None])[-1]),
            "unit": "FCFA",
            "source": "BRVM",
            "detail": f"{co.symbol} — exercice {fy}" + (f" S{quarter}" if quarter else ""),
        })

    # 2) Publications macro (avec valeur de l'année précédente)
    MACRO_LABELS = {
        "inflation": ("Inflation", "Taux d'inflation annuel"),
        "taux_directeur": ("Taux directeur BCEAO", "Taux directeur de la BCEAO"),
        "croissance_pib": ("Croissance PIB", "Croissance du PIB réel"),
        "pib_md_fcfa": ("PIB (Mds FCFA)", "Produit intérieur brut"),
        "taux_credit_moyen": ("Taux de crédit moyen", "Taux débiteur moyen pondéré"),
        "taux_change_eur_xof": ("Taux de change EUR/FCFA", "Parité EUR/FCFA"),
    }
    macro_rows = db.query(MacroIndicator).order_by(MacroIndicator.date).all()
    by_indicator = {}
    for mi in macro_rows:
        by_indicator.setdefault(mi.indicator, []).append(mi)
    for indicator, items in by_indicator.items():
        by_date = {}
        for mi in items:
            by_date.setdefault(mi.date.year, []).append(mi)
        for year in sorted(by_date):
            mi = by_date[year][0]
            prev = by_date.get(year - 1, [None])[0]
            label, _desc = MACRO_LABELS.get(mi.indicator, (mi.indicator, ""))
            unit = mi.unit or "%"
            def _v(v):
                if v is None:
                    return None
                return f"{float(v):,.1f}".replace(",", " ")
            events.append({
                "id": f"macro-{mi.id}",
                "date": mi.date.isoformat(),
                "time": None,
                "title": f"Publication : {label}",
                "type": "macro",
                "company": None,
                "symbol": None,
                "country": "UEMOA",
                "importance": 3 if mi.indicator in ("taux_directeur", "croissance_pib", "inflation") else 2,
                "actual": _v(mi.value),
                "forecast": None,
                "previous": _v(prev.value) if prev else None,
                "unit": unit,
                "source": mi.source or "BCEAO",
                "detail": f"{mi.country} — {year}",
            })

    # 3) Admissions à la cote
    for co in company_map.values():
        if not co.listing_date:
            continue
        events.append({
            "id": f"listing-{co.id}",
            "date": co.listing_date.date().isoformat() if hasattr(co.listing_date, "date") else str(co.listing_date),
            "time": None,
            "title": f"Admission à la cote : {co.name}",
            "type": "cotation",
            "company": co.name,
            "symbol": co.symbol,
            "country": infer_country(co.name),
            "importance": 2,
            "actual": None,
            "forecast": None,
            "previous": None,
            "unit": None,
            "source": "BRVM",
            "detail": f"{co.symbol} rejoint la cote de la BRVM",
        })

    return events


def build_calendar_payload(db, scraped_items=None):
    """Assemble le calendrier final : scraping BRVM + événements réels."""
    from ..scrapers.calendar_feed import calendar_feed

    scraped = scraped_items
    if scraped is None:
        scraped = calendar_feed.refresh(db=db)

    local = build_economic_events(db)
    seen = set()
    merged = []
    for e in scraped + local:
        key = (e.get("date") or "", e.get("title") or "", e.get("symbol") or e.get("company") or "")
        if key in seen:
            continue
        seen.add(key)
        norm = dict(e)
        if "country" not in norm or not norm.get("country"):
            norm["country"] = infer_country(norm.get("company"))
        if "importance" not in norm:
            t = norm.get("type", "")
            norm["importance"] = 3 if t == "brvm" and "AG" in (norm.get("title") or "") else (2 if t == "dividende" else 1)
        merged.append(norm)
    merged.sort(key=lambda e: (e.get("date") or "0000-00-00", e.get("title") or ""))
    return merged
