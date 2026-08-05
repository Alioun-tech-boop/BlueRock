# -*- coding: utf-8 -*-
"""Runner CLI pour la synchronisation des états financiers réels BRVM.

Usage (depuis backend/):
  python ../scripts/sync_financials_runner.py --recon --out recon.json
  python -u ../scripts/sync_financials_runner.py --max-years 10 --symbols ETIT,BICC --out sync_etit.json
  python -u ../scripts/sync_financials_runner.py --max-years 10 --out sync_all.json

--recon : liste uniquement les rapports publiés par société (année/trimestre)
          sans télécharger ni ingérer (état des lieux rapide).
"""
import argparse
import json
import logging
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from app.database import SessionLocal
from app.models.company import Company
from app.scrapers.financial_reports import (
    BRVM_SLUGS,
    fetch_company_reports,
    sync_financials,
    POLITE_DELAY,
)


def _all_symbols(db):
    return [c.symbol for c in db.query(Company).order_by(Company.symbol).all()]


def recon(symbols, out_path):
    db = SessionLocal()
    try:
        result = []
        for i, symbol in enumerate(symbols, 1):
            entry = {"symbol": symbol, "slug": BRVM_SLUGS.get(symbol, symbol.lower()), "reports": []}
            try:
                reports = fetch_company_reports(symbol)
                seen = set()
                for r in reports:
                    key = (r["year"], r["quarter"])
                    if key in seen:
                        continue
                    seen.add(key)
                    entry["reports"].append(key)
            except Exception as e:
                entry["error"] = str(e)
            entry["reports"].sort(key=lambda k: (-(k[0] or 0), -(k[1] or 0)))
            result.append(entry)
            print(f"[{i}/{len(symbols)}] {symbol}: {len(entry['reports'])} exercices {entry['reports'][:12]}", flush=True)
            time.sleep(POLITE_DELAY)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        print(f"Recon écrit dans {out_path}", flush=True)
    finally:
        db.close()


def run_sync(symbols, max_years, out_path):
    db = SessionLocal()
    try:
        result = sync_financials(db, symbols=symbols or None, max_years=max_years)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=1)
        ingested = sum(len(r["ingested"]) for r in result["results"])
        print(f"SYNC TERMINÉ : {result['companies']} sociétés, {ingested} rapports ingérés → {out_path}", flush=True)
    finally:
        db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--symbols", default="", help="Liste de symboles séparés par des virgules (défaut : toutes)")
    ap.add_argument("--max-years", type=int, default=10)
    ap.add_argument("--recon", action="store_true", help="Mode inventaire sans ingestion")
    ap.add_argument("--out", default="")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    symbols = [s.strip().upper() for s in args.symbols.split(",") if s.strip()] or None
    out = args.out or ("recon.json" if args.recon else "sync_result.json")

    if args.recon:
        db = SessionLocal()
        try:
            symbols = symbols or _all_symbols(db)
        finally:
            db.close()
        recon(symbols, out)
    else:
        run_sync(symbols, args.max_years, out)


if __name__ == "__main__":
    main()
