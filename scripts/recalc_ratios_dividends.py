# -*- coding: utf-8 -*-
"""Recalcule les ratios financiers pour les (société, exercice) couverts par un dividende.

Usage (depuis backend/) : python ../scripts/recalc_ratios_dividends.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from sqlalchemy import text  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.services.ratio_calculator import RatioCalculator  # noqa: E402


def main():
    db = SessionLocal()
    try:
        pairs = db.execute(
            text("SELECT DISTINCT company_id, fiscal_year FROM dividends ORDER BY company_id, fiscal_year")
        ).fetchall()
        calc = RatioCalculator(db)
        done = 0
        with_yield = 0
        for company_id, fiscal_year in pairs:
            ratio = calc.calculate_all_ratios(company_id, fiscal_year)
            done += 1
            if ratio.dividend_yield is not None:
                with_yield += 1
            print(f"company {company_id} / {fiscal_year} -> DPS={ratio.dividend_per_share}, yield={ratio.dividend_yield}, payout={ratio.payout_ratio}")
        print(f"\nRECALC TERMINÉ : {done} (société, année) recalculés, dont {with_yield} avec rendement calculé")
    finally:
        db.close()


if __name__ == "__main__":
    main()
