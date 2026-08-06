"""Remplit la table dividends (dividendes annuels réels BRVM) depuis sikafinance.com.

Source : https://www.sikafinance.com/marches/cotation_<SYM>.<pays> (section "DERNIERS DIVIDENDES")
Usage : python scripts/scrape_dividends.py
"""
import re
import sys
import time
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import SessionLocal  # noqa: E402
from app.models.market import Dividend  # noqa: E402
from app.models.company import Company  # noqa: E402

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept-Language": "fr-FR,fr;q=0.9",
}

OFFICIAL_URL = "https://www.brvm.org/fr/esv/paiement-de-dividendes"

# Mapping émetteur (page officielle BRVM) -> symbole
EMITTER_SYMBOL = {
    "NESTLE CI": "NTLC",
    "CFAO MOTORS CI": "CFAC",
    "SITAB": "STBC",
    "SOGB": "SOGC",
    "NSBC": "NSBC",
    "LNB": "LNBB",
    "SOLIBRA": "SLBC",
    "CIE CI": "CIEC",
    "BIIC": "BICB",
    "SERVAIR ABIDJAN CI": "ABJC",
}

MONTHS_FR = {
    "janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6,
    "juillet": 7, "août": 8, "septembre": 9, "octobre": 10, "novembre": 11,
    "décembre": 12,
}

SYMBOL_EXT = {
    # Côte d'Ivoire
    "ABJC": "ci", "BICC": "ci", "BNBC": "ci", "BOAC": "ci", "CABC": "ci",
    "CFAC": "ci", "CIEC": "ci", "SEMC": "ci", "FTSC": "ci", "NEIC": "ci",
    "NTLC": "ci", "PALC": "ci", "SAFC": "ci", "SPHC": "ci", "PRSC": "ci",
    "STAC": "ci", "SGBC": "ci", "SICC": "ci", "STBC": "ci", "SMBC": "ci",
    "SDCC": "ci", "SOGC": "ci", "SLBC": "ci", "TTLC": "ci", "UNLC": "ci",
    "UNXC": "ci", "SHEC": "ci", "SDSC": "ci", "SIVC": "ci", "ECOC": "ci",
    "NSBC": "ci", "SIBC": "ci", "ORAC": "ci", "SCRC": "ci",
    # Bénin
    "BOAB": "bj", "BICB": "bj", "LNBB": "bj",
    # Burkina Faso
    "BOABF": "bf", "CBIBF": "bf", "ONTBF": "bf",
    # Mali / Niger / Sénégal / Togo
    "BOAM": "ml", "BOAN": "ne",
    "BOAS": "sn", "SNTS": "sn", "TTLS": "sn",
    "ETIT": "tg", "ORGT": "tg",
}

client = httpx.Client(headers=HEADERS, timeout=60, follow_redirects=True)
db = SessionLocal()


def parse_number(value: str) -> float | None:
    value = value.strip().replace("\u00a0", "").replace(" ", "")
    if not value or value in ("-", "--", "N/A"):
        return None
    return float(value.replace(",", "."))


def scrape_symbol(symbol: str, ext: str) -> list[tuple[int, float]]:
    url = f"https://www.sikafinance.com/marches/cotation_{symbol}.{ext}"
    r = client.get(url)
    r.raise_for_status()
    m = re.search(r"(?is)DERNIERS\s+DIVIDENDES(.*?)</table>", r.text)
    if not m:
        return []
    rows = re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", m.group(1))
    result = []
    for row in rows:
        cells = [re.sub(r"<[^>]+>", "", c).strip() for c in re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", row)]
        if len(cells) < 2 or not cells[0].isdigit():
            continue
        year = cells[0]
        amount = parse_number(cells[1])
        if amount is None:
            continue
        result.append((int(year), amount))
    return result


def parse_fr_date(value: str):
    """'7 septembre 2026' -> date(2026, 9, 7)."""
    m = re.match(r"(\d{1,2})\s+([a-zàâäéèêëîïôöùûüç-]+)\s+(\d{4})", value.strip().lower())
    if not m:
        return None
    day, month_name, year = m.groups()
    month = MONTHS_FR.get(month_name)
    if month is None:
        return None
    import datetime
    return datetime.date(int(year), month, int(day))


def sync_official_brvm(companies: dict[str, Company]) -> tuple[int, int]:
    """Synchronise les dividendes récents (montants + dates) depuis la page officielle BRVM."""
    r = client.get(OFFICIAL_URL)
    r.raise_for_status()
    tables = re.findall(r"(?is)<table[^>]*>(.*?)</table>", r.text)
    updated = 0
    inserted = 0
    for table in tables:
        if "Exercice comptable" not in table:
            continue
        for row in re.findall(r"(?is)<tr[^>]*>(.*?)</tr>", table):
            cells = [re.sub(r"<[^>]+>", "", c).strip().replace("\u00a0", " ") for c in re.findall(r"(?is)<t[dh][^>]*>(.*?)</t[dh]>", row)]
            if len(cells) < 7:
                continue
            emitter, _, _, year, payment, ex, amount = cells[:7]
            symbol = EMITTER_SYMBOL.get(emitter.strip().upper())
            if not symbol or not year.isdigit():
                continue
            company = companies.get(symbol)
            if not company:
                continue
            dps = parse_number(amount.replace("FCFA", ""))
            if dps is None:
                continue
            existing = (
                db.query(Dividend)
                .filter(Dividend.company_id == company.id, Dividend.fiscal_year == int(year))
                .first()
            )
            kwargs = dict(
                dividend_per_share=dps,
                ex_date=parse_fr_date(ex),
                payment_date=parse_fr_date(payment),
                dividend_type="annuel",
                currency="XOF",
                is_synthetic=False,
            )
            if existing:
                for key, value in kwargs.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                db.add(Dividend(company_id=company.id, fiscal_year=int(year), **kwargs))
                inserted += 1
    return inserted, updated


def main() -> None:
    companies = {c.symbol: c for c in db.query(Company).all()}
    total_inserted = 0
    total_updated = 0
    errors = []
    for symbol, ext in SYMBOL_EXT.items():
        company = companies.get(symbol)
        if not company:
            errors.append(f"{symbol}: société absente de la base")
            continue
        try:
            rows = scrape_symbol(symbol, ext)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{symbol}: {exc}")
            continue
        if not rows:
            errors.append(f"{symbol}: aucune donnée de dividende trouvée")
            continue
        for fiscal_year, amount in rows:
            existing = (
                db.query(Dividend)
                .filter(Dividend.company_id == company.id, Dividend.fiscal_year == fiscal_year)
                .first()
            )
            if existing:
                existing.dividend_per_share = amount
                existing.dividend_type = "annuel"
                existing.is_synthetic = False
                total_updated += 1
            else:
                db.add(
                    Dividend(
                        company_id=company.id,
                        fiscal_year=fiscal_year,
                        dividend_per_share=amount,
                        dividend_type="annuel",
                        currency="XOF",
                        is_synthetic=False,
                    )
                )
                total_inserted += 1
        print(f"{symbol}: {len(rows)} lignes ({rows[0][0]}-{rows[-1][0]})")
        time.sleep(0.4)
    db.commit()
    print("\nSynchronisation BRVM officielle (montants + dates)...")
    inserted_official, updated_official = sync_official_brvm(companies)
    db.commit()
    print("\nRésumé :")
    print(f"  Insérées  : {total_inserted}")
    print(f"  Mises à jour : {total_updated}")
    print(f"  BRVM officiel - insérées : {inserted_official}, mises à jour : {updated_official}")
    if errors:
        print("  Erreurs   :")
        for e in errors:
            print(f"    - {e}")
    db.close()


if __name__ == "__main__":
    main()
