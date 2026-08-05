from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Optional, List
from datetime import date
from ..database import get_db
from ..core.security import require_admin
from ..models.macro import MacroIndicator
from pydantic import BaseModel
from typing import Dict

router = APIRouter(prefix="/api/macro", tags=["macro"])

REFERENCE_DATA = {
    "inflation": {
        "country": "Côte d'Ivoire",
        "unit": "%",
        "source": "INS / BCEAO (référence)",
        "values": {2020: 2.4, 2021: 4.1, 2022: 5.3, 2023: 4.4, 2024: 3.6, 2025: 3.2},
    },
    "taux_directeur": {
        "country": "UEMOA",
        "unit": "%",
        "source": "BCEAO (référence)",
        "values": {2020: 2.5, 2021: 2.5, 2022: 3.0, 2023: 3.5, 2024: 4.5, 2025: 4.0},
    },
    "croissance_pib": {
        "country": "Côte d'Ivoire",
        "unit": "%",
        "source": "FMI / Gouvernement (référence)",
        "values": {2020: 1.7, 2021: 7.1, 2022: 6.2, 2023: 6.5, 2024: 6.1, 2025: 6.5},
    },
    "pib_md_fcfa": {
        "country": "Côte d'Ivoire",
        "unit": "Md FCFA",
        "source": "FMI / Gouvernement (référence)",
        "values": {2020: 42000, 2021: 45000, 2022: 48000, 2023: 52000, 2024: 56000, 2025: 60000},
    },
    "taux_credit_moyen": {
        "country": "UEMOA",
        "unit": "%",
        "source": "BCEAO (référence)",
        "values": {2020: 6.2, 2021: 6.0, 2022: 6.3, 2023: 6.8, 2024: 7.2, 2025: 6.9},
    },
    "taux_change_eur_xof": {
        "country": "UEMOA",
        "unit": "FCFA/EUR",
        "source": "BCEAO (parité fixe)",
        "values": {2020: 655.957, 2021: 655.957, 2022: 655.957, 2023: 655.957, 2024: 655.957, 2025: 655.957},
    },
}


class MacroPoint(BaseModel):
    date: date
    value: float
    unit: str
    source: str


class MacroResponse(BaseModel):
    indicator: str
    country: str
    unit: str
    source: str
    series: List[MacroPoint]


@router.get("", response_model=List[MacroResponse])
def get_macro(
    indicator: Optional[str] = Query(None, description="Nom exact de l'indicateur"),
    country: Optional[str] = None,
    limit: int = Query(10, ge=1, le=60),
    db: Session = Depends(get_db),
):
    q = db.query(MacroIndicator)
    if indicator:
        q = q.filter(MacroIndicator.indicator == indicator)
    if country:
        q = q.filter(MacroIndicator.country == country)
    rows = q.order_by(MacroIndicator.indicator, MacroIndicator.date.desc()).all()

    grouped: Dict[str, dict] = {}
    for row in rows:
        g = grouped.setdefault(row.indicator, {"indicator": row.indicator, "country": row.country, "unit": row.unit, "source": row.source, "series": []})
        g["series"].append(MacroPoint(date=row.date, value=row.value, unit=row.unit, source=row.source))
        if len(g["series"]) > limit:
            g["series"] = g["series"][:limit]

    if not grouped and indicator:
        raise HTTPException(status_code=404, detail=f"Indicateur '{indicator}' introuvable")
    return list(grouped.values())


@router.get("/latest")
def get_latest_macro(db: Session = Depends(get_db)):
    sub = db.query(
        MacroIndicator.indicator,
        func.max(MacroIndicator.date).label("max_date"),
    ).group_by(MacroIndicator.indicator).subquery()

    rows = db.query(MacroIndicator).join(
        sub,
        (MacroIndicator.indicator == sub.c.indicator) & (MacroIndicator.date == sub.c.max_date),
    ).all()

    return [
        {
            "indicator": r.indicator,
            "country": r.country,
            "value": r.value,
            "unit": r.unit,
            "date": r.date,
            "source": r.source,
        }
        for r in rows
    ]


def seed_macro(db: Session):
    """Charge les valeurs de référence (BCEAO/INS)."""
    if db.query(MacroIndicator).count() > 0:
        return {"status": "already_seeded", "count": db.query(MacroIndicator).count()}

    count = 0
    for indicator, spec in REFERENCE_DATA.items():
        for year, value in spec["values"].items():
            db.add(MacroIndicator(
                country=spec["country"],
                indicator=indicator,
                date=date(year, 12, 31),
                value=value,
                unit=spec["unit"],
                source=spec["source"],
            ))
            count += 1
    db.commit()
    return {"status": "seeded", "count": count}


@router.post("/seed", include_in_schema=False)
def seed_macro_endpoint(db: Session = Depends(get_db), _=Depends(require_admin)):
    return seed_macro(db)
