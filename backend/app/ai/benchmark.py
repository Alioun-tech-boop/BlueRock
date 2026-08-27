"""Indice de référence BRVM Composite, reconstruit localement.

L'indice est pondéré par capitalisation flottante (approximation : market_cap
stocké, sinon close × shares_outstanding) à partir des données réelles de
market_data. L'indice est normalisé à 1.0 à la date de départ de la fenêtre.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from .quant import daily_returns


def composite_daily_returns(
    db: Session, start: date, end: Optional[date] = None
) -> list[tuple[date, float]]:
    """Rendements journaliers de l'indice composite pondéré capitalisation.

    Retourne une liste de (date, return). Ne garde que les jours où au moins
    2 sociétés ont coté. Si market_cap manque, on retombe sur close × shares.
    """
    end = end or date.today()
    rows = db.execute(text(
        """
        SELECT md.date AS d, md.company_id AS cid, md.close_price AS px,
               md.market_cap AS mcap, co.shares_outstanding AS shares
        FROM market_data md
        JOIN companies co ON co.id = md.company_id
        WHERE md.date BETWEEN :start AND :end
          AND md.close_price IS NOT NULL AND md.close_price > 0
          AND (co.exchange IS NULL OR co.exchange = 'BRVM')
        ORDER BY md.date
        """
    ), {"start": start, "end": end}).all()

    by_day: dict[date, dict[int, tuple[float, float]]] = {}
    for d, cid, px, mcap, shares in rows:
        weight = mcap if mcap else (px * (shares or 0))
        if weight <= 0:
            weight = px
        by_day.setdefault(d, {})[cid] = (px, weight)

    out: list[tuple[date, float]] = []
    prev: Optional[dict[int, tuple[float, float]]] = None
    prev_date: Optional[date] = None
    for d in sorted(by_day):
        cur = by_day[d]
        if len(cur) < 2:
            continue
        if prev is None:
            out.append((d, 0.0))
            prev = cur
            prev_date = d
            continue
        # entreprises communes aux deux jours → rendement enchaîné pondéré
        common = {cid: (prev[cid][0], cur[cid][0], prev[cid][1]) for cid in prev if cid in cur}
        if len(common) < 2:
            out.append((d, 0.0))
            prev = cur
            prev_date = d
            continue
        total_w = sum(w for _, _, w in common.values())
        r = 0.0
        if total_w > 0:
            for p0, p1, w in common.values():
                if p0:
                    r += (w / total_w) * ((p1 - p0) / p0)
        out.append((d, r))
        prev = cur
        prev_date = d
    return out


def composite_index(
    db: Session, start: date, end: Optional[date] = None
) -> list[tuple[date, float]]:
    """Indice cumulé normalisé à 1.0 (liste (date, value))."""
    rets = composite_daily_returns(db, start, end)
    idx: list[tuple[date, float]] = []
    level = 1.0
    first = True
    for d, r in rets:
        if first:
            idx.append((d, level))
            first = False
        else:
            level *= (1 + r)
            idx.append((d, level))
    return idx


def benchmark_regime(db: Session) -> str:
    """Régime de marché court terme : BULL / BEAR / SIDEWAYS / HIGH_VOLATILITY."""
    end = date.today()
    start = end - timedelta(days=400)
    idx = composite_index(db, start, end)
    if not idx:
        return "SIDEWAYS"
    closes = [v for _, v in idx]
    from .quant import annualized_volatility, daily_returns, series_return

    rets = daily_returns(closes)
    vol = annualized_volatility(rets)
    r3m = series_return(closes, 63)
    if vol is not None and vol > 0.35:
        return "HIGH_VOLATILITY"
    if r3m is None:
        return "SIDEWAYS"
    if r3m >= 0.03:
        return "BULL"
    if r3m <= -0.03:
        return "BEAR"
    return "SIDEWAYS"
