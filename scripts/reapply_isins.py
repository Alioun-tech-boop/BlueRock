"""Réapplique les 47 ISIN officiels BRVM (par symbole, idempotent).

Usage : python scripts/reapply_isins.py  (depuis n'importe quel cwd)
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend", "app"))

from app.database import SessionLocal
from app.models.company import Company

ISINS = {
    "ABJC": "CI0000000600", "BICC": "CI0000000014", "BNBC": "CI0000000048",
    "BOAB": "BJ0000000048", "BOABF": "BF0000000133", "BOAC": "CI0000000956",
    "BOAM": "ML0000000520", "BOAN": "NE0000000015", "BOAS": "SN0000000332",
    "CABC": "CI0000000154", "CFAC": "CI0000000220", "CIEC": "CI0000000212",
    "SEMC": "CI0000000345", "ETIT": "TG0000000132", "FTSC": "CI0000000121",
    "NEIC": "CI0000000618", "NTLC": "CI0000000295", "ONTBF": "BF0000000117",
    "PALC": "CI0000000592", "SAFC": "CI0000000022", "SPHC": "CI0000000196",
    "PRSC": "CI0000000055", "STAC": "CI0000000352", "SGBC": "CI0000000030",
    "SICC": "CI0000000113", "STBC": "CI0000000097", "SMBC": "CI0000000170",
    "SDCC": "CI0000000204", "SOGC": "CI0000000162", "SLBC": "CI0000000105",
    "SNTS": "SN0000000019", "TTLC": "CI0000000659", "TTLS": "SN0000000357",
    "UNLC": "CI0000000287", "UNXC": "CI0000000337", "SHEC": "CI0000000246",
    "SDSC": "CI0000000261", "SIVC": "CI0000000550",
    "BICB": "BJ0000002457", "LNBB": "BJ0000002275", "ORAC": "CI0000005864",
    "ECOC": "CI0000002424", "NSBC": "CI0000002416", "SIBC": "CI0000001871",
    "CBIBF": "BF0000000604", "SCRC": "CI0000002028", "ORGT": "TG0000000249",
}

db = SessionLocal()
updated = 0
missing = []
for symbol, isin in ISINS.items():
    company = db.query(Company).filter(Company.symbol == symbol).first()
    if not company:
        missing.append(symbol)
        continue
    if company.isin != isin:
        company.isin = isin
        updated += 1
db.commit()

total_with_isin = db.query(Company).filter(Company.isin != None).count()
db.close()
print(f"ISIN mis à jour : {updated} ; total sociétés avec ISIN : {total_with_isin}/47")
if missing:
    print(f"SYMBOLES INTROUVABLES : {missing}")
