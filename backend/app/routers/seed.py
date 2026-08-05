from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..core.security import require_admin
from ..database import get_db
from ..models.company import Company, Sector
import json, os

router = APIRouter(prefix="/api/seed", tags=["Seed Data"])

SNAPSHOT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "brvm_real_snapshot.json")

SECTOR_VALUE_TO_ENUM = {s.value: s for s in Sector}


def _load_snapshot():
    with open(SNAPSHOT_PATH, encoding="utf-8") as f:
        return json.load(f)


def _map_sector(brvm_sector: str) -> Sector:
    from ..scrapers.brvm_data import SECTOR_MAP
    value = SECTOR_MAP.get(brvm_sector, "Autre")
    return SECTOR_VALUE_TO_ENUM.get(value, Sector.AUTRE)


@router.post("/companies")
def seed_companies(db: Session = Depends(get_db), _=Depends(require_admin)):
    snapshot = _load_snapshot()
    count = 0
    for data in snapshot["stocks"]:
        existing = db.query(Company).filter(Company.symbol == data["symbol"]).first()
        if not existing:
            company = Company(
                symbol=data["symbol"],
                name=data["name"],
                sector=_map_sector(data["sector"]),
                shares_outstanding=data.get("shares_outstanding"),
                per=data.get("per") or None,
                reference_price=data.get("reference_price") or None,
                description=f"{data['name']} - {data['sector']} (BRVM)",
            )
            db.add(company)
            count += 1
    db.commit()
    return {"status": "success", "companies_created": count}


@router.post("/all")
def seed_all(db: Session = Depends(get_db), _=Depends(require_admin)):
    snapshot = _load_snapshot()
    overview = snapshot.get("overview", {})
    stocks = snapshot["stocks"]

    companies_created = 0
    for data in stocks:
        existing = db.query(Company).filter(Company.symbol == data["symbol"]).first()
        if not existing:
            company = Company(
                symbol=data["symbol"],
                name=data["name"],
                sector=_map_sector(data["sector"]),
                shares_outstanding=data.get("shares_outstanding"),
                per=data.get("per") or None,
                reference_price=data.get("reference_price") or None,
                description=f"{data['name']} - {data['sector']} (BRVM)",
            )
            db.add(company)
            companies_created += 1
    db.commit()

    return {
        "status": "success",
        "message": f"Seeded {len(stocks)} real BRVM companies (aucune donnée générée : historique, états financiers et dividendes proviennent des sources réelles uniquement)",
        "companies_created": companies_created,
        "indices": {
            "brvm_composite": overview.get("brvm_composite"),
            "brvm_30": overview.get("brvm_30"),
            "brvm_prestige": overview.get("brvm_prestige"),
        }
    }
