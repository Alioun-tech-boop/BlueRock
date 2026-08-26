"""Simulateur patrimoine : que valait une somme investie sur la BRVM il y a
1 mois, 3 mois, 1 an... 10 ans ?

Basé sur l'indice composite BRVM reconstruit localement depuis les séances
réelles de market_data (ai.benchmark.composite_index). Le résultat (facteurs
de croissance par horizon) est identique pour tous les utilisateurs et n'est
recalculé qu'une fois par tranche de 30 minutes.
"""
import time
from datetime import date, timedelta
from typing import Dict, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..ai.benchmark import composite_index

router = APIRouter(prefix="/api/simulate", tags=["simulation"])

_cache: Dict = {"ts": 0.0, "data": None}
_TTL_SECONDS = 30 * 60

MONTHS_PER_YEAR = 12
WINDOW_YEARS = 11


def _sub_months(d: date, months: int) -> date:
    total = d.year * MONTHS_PER_YEAR + (d.month - 1) - months
    y, m = divmod(total, MONTHS_PER_YEAR)
    m += 1
    dim = [31, 29 if (y % 4 == 0 and (y % 100 != 0 or y % 400 == 0)) else 28,
           31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return date(y, m, min(d.day, dim[m - 1]))


def _level_at(idx, target: date) -> Optional[tuple]:
    """Dernier niveau d'indice disponible à une date <= target."""
    best = None
    for d, v in idx:
        if d > target:
            break
        best = (d, v)
    return best


def _compute(db: Session) -> Dict:
    end = date.today()
    start = end - timedelta(days=int(365.25 * WINDOW_YEARS))
    idx = composite_index(db, start, end)
    if not idx:
        return {"index": "BRVM Composite", "as_of": None, "horizons": []}
    as_of, last_level = idx[-1]

    months_list = [1, 3, 6] + [y * MONTHS_PER_YEAR for y in range(1, 11)]
    horizons = []
    for months in months_list:
        start_pt = _level_at(idx, _sub_months(end, months))
        if not start_pt or start_pt[1] <= 0:
            continue
        growth = last_level / start_pt[1]
        horizons.append({
            "key": f"{months}m",
            "months": months,
            "start_date": start_pt[0].isoformat(),
            "end_date": as_of.isoformat(),
            "growth": round(growth, 6),
            "pct": round((growth - 1) * 100, 2),
        })
    return {
        "index": "BRVM Composite",
        "as_of": as_of.isoformat(),
        "horizons": horizons,
    }


@router.get("/patrimoine")
def simulate_patrimoine(db: Session = Depends(get_db)):
    now = time.time()
    if _cache["data"] is None or now - _cache["ts"] > _TTL_SECONDS:
        _cache["data"] = _compute(db)
        _cache["ts"] = now
    return _cache["data"]
