"""Accès efficace aux séries de prix issues de market_data (lecture seule)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session


def all_price_series(
    db: Session,
    company_ids: Optional[list[int]] = None,
    end: Optional[date] = None,
    days: int = 253,
    start: Optional[date] = None,
) -> dict[int, list[tuple[date, float]]]:
    """Séries (date, close) par company_id sur les N dernières jours de cote."""
    end = end or date.today()
    if start is None:
        start = end - timedelta(days=int(days * 1.7) + 30)
    params: dict = {"start": start, "end": end}
    if company_ids:
        q = text(
            """
            SELECT company_id, date, close_price
            FROM market_data
            WHERE close_price IS NOT NULL AND close_price > 0
              AND company_id IN :cids
              AND date BETWEEN :start AND :end
            ORDER BY company_id, date
            """
        )
        params["cids"] = tuple(company_ids)
    else:
        q = text(
            """
            SELECT company_id, date, close_price
            FROM market_data
            WHERE close_price IS NOT NULL AND close_price > 0
              AND date BETWEEN :start AND :end
            ORDER BY company_id, date
            """
        )
    rows = db.execute(q, params).all()
    out: dict[int, list[tuple[date, float]]] = {}
    for cid, d, px in rows:
        out.setdefault(cid, []).append((d, float(px)))
    # troncature stricte aux `days` dernières clôtures (uniquement en mode auto)
    if start is None:
        for cid in list(out):
            if len(out[cid]) > days:
                out[cid] = out[cid][-days:]
    return out


def latest_prices_by_id(
    db: Session, company_ids: Optional[list[int]] = None
) -> dict[int, float]:
    if company_ids:
        q = text(
            """
            SELECT DISTINCT ON (company_id) company_id, close_price
            FROM market_data
            WHERE close_price IS NOT NULL AND close_price > 0
              AND company_id IN :cids
            ORDER BY company_id, date DESC
            """
        )
        rows = db.execute(q, {"cids": tuple(company_ids)}).all()
    else:
        q = text(
            """
            SELECT DISTINCT ON (company_id) company_id, close_price
            FROM market_data
            WHERE close_price IS NOT NULL AND close_price > 0
            ORDER BY company_id, date DESC
            """
        )
        rows = db.execute(q).all()
    return {int(cid): float(px) for cid, px in rows}
