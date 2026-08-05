"""Récupération automatique des états financiers réels BRVM (annuels, semestriels,
trimestriels) publiés par les émetteurs sur brvm.org, extraction PDF et stockage.

Source : https://www.brvm.org/fr/rapports-societe-cotes/{symbole}
Filtres : field_type_rapport_tid = 57 (États Financiers), 58 (Rapports annuels),
59 (Rapports semestriels), 60 (Rapports trimestriels).
Aucune donnée inventée : un PDF non exploitable est ignoré avec un log.
"""
import logging
import os
import re
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup

from ._http import get_with_retry
from .pdf_extractor import PDFExtractor

_log = logging.getLogger(__name__)

BRVM_BASE = "https://www.brvm.org"
# Le slug des pages de rapports est le nom de l'émetteur, pas le code/raccourci boursier.
BRVM_SLUGS = {
    "ABJC": "servair-abidjan-ci", "BICB": "biic", "BICC": "bici-ci",
    "BNBC": "bernabe-ci", "BOAB": "bank-africa-bn", "BOABF": "bank-africa-bf",
    "BOAC": "bank-africa-ci", "BOAM": "bank-africa-ml", "BOAN": "bank-africa-ng",
    "BOAS": "bank-africa-sn", "CABC": "sicable", "CBIBF": "coris-bank-international",
    "CFAC": "cfao-motors-ci", "CIEC": "cie-ci", "ECOC": "ecobank-ci",
    "ETIT": "ecobank-tg", "FTSC": "filtisac-ci", "LNBB": "lnb",
    "NEIC": "nei-ceda-ci", "NSBC": "nsbc", "NTLC": "nestle-ci",
    "ONTBF": "onatel-bf", "ORAC": "orange-ci", "ORGT": "oragroup",
    "PALC": "palm-ci", "PRSC": "tractafric-ci", "SAFC": "safca-ci",
    "SCRC": "sucrivoire", "SDCC": "sodeci", "SDSC": "bollore-transport-logistics",
    "SEMC": "crown-siem-ci", "SGBC": "sgci", "SHEC": "vivo-energy-ci",
    "SIBC": "sib", "SICC": "sicor", "SIVC": "air-liquide-ci",
    "SLBC": "solibra", "SMBC": "smb", "SNTS": "sonatel", "SOGC": "sogb",
    "SPHC": "saph-ci", "STAC": "setao-ci", "STBC": "sitab", "TTLC": "total",
    "TTLS": "total-senegal-sa", "UNLC": "unilever-ci", "UNXC": "uniwax-ci",
}
REPORT_TYPES = {
    "financials": 57,   # États Financiers
    "annual": 58,       # Rapports annuels
    "semiannual": 59,   # Rapports semestriels
    "quarterly": 60,    # Rapports trimestriels
}
PAGE_SIZE = 20
MAX_PAGES = 5
MAX_DOWNLOADS_PER_COMPANY = 12
MAX_FILE_SIZE = 25 * 1024 * 1024
POLITE_DELAY = 0.4

YEAR_RE = re.compile(r"\b(20\d{2})\b")


def parse_period(title: str) -> Tuple[Optional[int], Optional[int]]:
    """Retourne (année, trimestre) depuis un titre de rapport. Trimestre None = annuel."""
    t = title.lower()
    year_match = YEAR_RE.findall(t)
    year = max(int(y) for y in year_match) if year_match else None

    quarter = None
    q_pat = re.compile(r"(?:1er|1\s*er|premier|1e?)\s*trimestre")
    if q_pat.search(t):
        quarter = 1
    elif re.search(r"(?:2(?:ème|eme|e)?|deuxième)\s*trimestre", t):
        quarter = 2
    elif re.search(r"(?:3(?:ème|eme|e)?|troisième)\s*trimestre", t):
        quarter = 3
    elif re.search(r"(?:4(?:ème|eme|e)?|quatrième)\s*trimestre", t):
        quarter = 4
    elif re.search(r"(?:1er|1\s*er|premier)\s*(?:semestre|s1)", t):
        quarter = 2
    elif re.search(r"(?:2(?:ème|eme|e)?|deuxième)\s*(?:semestre|s2)", t):
        quarter = 4
    return year, quarter


def _clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", title).strip()


def fetch_company_reports(symbol: str, max_pages: int = MAX_PAGES) -> List[Dict]:
    """Collecte (titre, url PDF) de tous les rapports publiés pour une société."""
    slugs = [BRVM_SLUGS.get(symbol.upper(), symbol.lower()), symbol.lower()]
    reports = []
    seen = set()

    for slug in slugs:
        page0_ok = False
        for page in range(max_pages):
            url = f"{BRVM_BASE}/fr/rapports-societe-cotes/{slug}?page={page}"
            try:
                resp = get_with_retry(url, timeout=25)
            except Exception as e:
                _log.warning("[%s] page %d injoignable (%s): %s", symbol, page, slug, e)
                break
            page0_ok = True
            soup = BeautifulSoup(resp.text, "lxml")

            found = 0
            for link in soup.select("a[href*='/sites/default/files/']"):
                href = link.get("href", "")
                if not href.lower().endswith(".pdf"):
                    continue
                full = href if href.startswith("http") else BRVM_BASE + href
                if full in seen:
                    continue
                seen.add(full)
                row = link.find_parent("tr") or link.find_parent("div")
                title = _clean_title(row.get_text(" ", strip=True)) if row else ""
                if not title:
                    title = _clean_title(link.get("title", "")) or full.split("/")[-1]
                year, quarter = parse_period(title)
                reports.append({
                    "title": title,
                    "url": full,
                    "year": year,
                    "quarter": quarter,
                    "kind": "annual" if quarter is None else "periodic",
                })
                found += 1

            if found < PAGE_SIZE:
                break
            time.sleep(POLITE_DELAY)

        if page0_ok:
            break

    return reports


def _best_reports(reports: List[Dict], max_years: int = 2) -> List[Dict]:
    """Sélectionne les rapports utiles : les N derniers exercices annuels + le dernier
    rapport périodique (trimestre/semestre) le plus récent non déjà couvert."""
    annual = sorted(
        [r for r in reports if r["quarter"] is None and r["year"]],
        key=lambda r: -r["year"],
    )
    selected: List[Dict] = []

    years_seen = set()
    for r in annual:
        if len(selected) >= max_years:
            break
        if r["year"] in years_seen:
            continue
        years_seen.add(r["year"])
        selected.append(r)

    periodic = sorted(
        [r for r in reports if r["quarter"] is not None and r["year"]],
        key=lambda r: (-r["year"], -r["quarter"]),
    )
    covered = {(r["year"], r["quarter"]) for r in selected}
    for r in periodic:
        if (r["year"], r["quarter"]) in covered:
            continue
        selected.append(r)
        break

    return selected


def _download_pdf(url: str) -> Optional[bytes]:
    for attempt in range(2):
        try:
            resp = get_with_retry(url, timeout=60)
        except Exception as e:
            _log.warning("Téléchargement PDF échoué (%s): %s", url, e)
            if attempt == 0:
                time.sleep(2)
                continue
            return None
        if not resp.content.startswith(b"%PDF"):
            _log.warning("Fichier non-PDF ignoré (%d octets, lien mort?): %s", len(resp.content), url)
            return None
        if len(resp.content) == 0 or len(resp.content) > MAX_FILE_SIZE:
            _log.warning("PDF ignoré (%d octets): %s", len(resp.content), url)
            return None
        return resp.content
    return None


def sync_financials(db, symbols: Optional[List[str]] = None, max_years: int = 2, on_company=None) -> Dict:
    """Télécharge et ingère les états financiers réels des sociétés. Retourne un bilan.
    on_company : callback optionnel appelé après chaque société (progression)."""
    from ..models.company import Company
    from ..models.financial import StatementType
    from ..services.financial_store import cleanup_existing, store_statement
    from ..services.ratio_calculator import RatioCalculator

    companies = db.query(Company).all()
    if symbols:
        symbols = {s.upper() for s in symbols}
        companies = [c for c in companies if c.symbol in symbols]

    summary = []
    for idx, company in enumerate(companies, 1):
        company_result = {
            "symbol": company.symbol,
            "name": company.name,
            "ingested": [],
            "skipped": [],
            "errors": [],
        }
        try:
            reports = fetch_company_reports(company.symbol)
        except Exception as e:
            company_result["errors"].append(f"collecte: {e}")
            summary.append(company_result)
            continue

        if not reports:
            company_result["errors"].append("aucun rapport publié")
            summary.append(company_result)
            continue

        selected = _best_reports(reports, max_years)[:MAX_DOWNLOADS_PER_COMPANY]
        extractor = PDFExtractor()

        try:
            for rep in selected:
                key = f"{rep['year']}{rep['quarter'] or 'A'}"
                pdf = _download_pdf(rep["url"])
                if pdf is None:
                    company_result["errors"].append(f"{key}: téléchargement impossible")
                    continue

                tmp_path = os.path.join(
                    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    "uploads", f"sync_{company.symbol}_{key}_{int(time.time()*1000)}.pdf",
                )
                try:
                    with open(tmp_path, "wb") as f:
                        f.write(pdf)
                    extracted = extractor.extract_financial_statements(tmp_path)
                except ValueError as e:
                    company_result["skipped"].append(f"{key}: {e}")
                    continue
                finally:
                    if os.path.exists(tmp_path):
                        os.remove(tmp_path)

                cleanup_existing(db, company.id, rep["year"], rep["quarter"])

                stmt_income = store_statement(
                    db, company.id, rep["year"], StatementType.INCOME,
                    extracted.get("income_statement", {}), rep["quarter"], rep["url"],
                )
                stmt_balance = store_statement(
                    db, company.id, rep["year"], StatementType.BALANCE,
                    extracted.get("balance_sheet", {}), rep["quarter"], rep["url"],
                )
                stmt_cf = store_statement(
                    db, company.id, rep["year"], StatementType.CASH_FLOW,
                    extracted.get("cash_flow", {}), rep["quarter"], rep["url"],
                )
                if not (stmt_income or stmt_balance or stmt_cf):
                    db.rollback()
                    company_result["skipped"].append(f"{key}: aucune donnée extraite")
                    continue

                db.commit()

                ratios = None
                try:
                    calculator = RatioCalculator(db)
                    ratios = calculator.calculate_all_ratios(company.id, rep["year"], rep["quarter"])
                except Exception as e:
                    _log.warning("[%s] ratios %s: %s", company.symbol, key, e)
                    db.rollback()
                    db.commit()

                n_items = sum(
                    len(s.line_items) for s in (stmt_income, stmt_balance, stmt_cf) if s
                )
                company_result["ingested"].append({
                    "year": rep["year"],
                    "quarter": rep["quarter"],
                    "title": rep["title"][:80],
                    "statements": sum(1 for s in (stmt_income, stmt_balance, stmt_cf) if s),
                    "line_items": n_items,
                    "ratios_recomputed": ratios is not None,
                })
                db.commit()
                _log.info("[%s] ingéré %s (%d lignes, ratios=%s)",
                          company.symbol, key, n_items, ratios is not None)
                time.sleep(POLITE_DELAY)
        except Exception as e:
            _log.error("[%s] erreur traitement: %s", company.symbol, e)
            db.rollback()
            company_result["errors"].append(f"traitement: {e}")

        summary.append(company_result)
        if on_company:
            try:
                on_company(company_result)
            except Exception as _e:
                _log.warning("callback progression: %s", _e)

    return {
        "ran_at": datetime.now().isoformat(),
        "companies": len(companies),
        "results": summary,
    }


def run_cli():
    """Lancement en ligne de commande (logs vers stdout)."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        datefmt="%H:%M:%S",
    )
    from ..database import SessionLocal

    db = SessionLocal()
    try:
        result = sync_financials(db)
        total_ingested = 0
        total_skipped = 0
        for r in result["results"]:
            if r["ingested"]:
                total_ingested += len(r["ingested"])
                labels = [f"{i['year']}{i['quarter'] or 'A'}" for i in r["ingested"]]
                print(f"{r['symbol']}: {labels}")
            else:
                total_skipped += 1
                print(f"{r['symbol']}: AUCUNE ingestion ({'; '.join(r['errors']) or 'tout skippé'})")
        print(f"\nTOTAL: {len(result['results'])} sociétés, {total_ingested} rapports ingérés, "
              f"{total_skipped} sociétés sans ingestion")
    finally:
        db.close()
