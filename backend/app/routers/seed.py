from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..core.security import require_admin
from ..database import get_db
from ..models.company import Company, Sector
from ..data.countries import COUNTRY_BY_SYMBOL, DEFAULT_COUNTRY
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


# Catalogue des instruments cotés BRVM hors actions : obligations et FCP.
# Pas de flux de prix en temps réel pour ces segments (données statiques).
INSTRUMENTS = [
    # ---- Obligations (cote obligations BRVM) ----
    {"symbol": "EPA-24", "instrument_type": "obligation", "name": "État de Côte d'Ivoire — EPA 6,25% 2017-2024", "description": "Obligation assimilable de l'État de Côte d'Ivoire, taux 6,25%, échéance 2024."},
    {"symbol": "ECCI-24", "instrument_type": "obligation", "name": "État de Côte d'Ivoire — ECCI 6,40% 2018-2024", "description": "Obligation de l'État de Côte d'Ivoire, taux 6,40%, échéance 2024."},
    {"symbol": "CTEL-23", "instrument_type": "obligation", "name": "Côte d'Ivoire Telecom — 6,10% 2018-2023", "description": "Obligation corporate Côte d'Ivoire Télécom, taux 6,10%."},
    {"symbol": "CIE-23", "instrument_type": "obligation", "name": "CIE — 6,25% 2018-2023", "description": "Obligation de la Compagnie Ivoirienne d'Électricité, taux 6,25%."},
    {"symbol": "PALM-23", "instrument_type": "obligation", "name": "PALM-CI — 6,10% 2018-2023", "description": "Obligation PALM-CI (Palmeraies de Côte d'Ivoire), taux 6,10%."},
    {"symbol": "SIB-23", "instrument_type": "obligation", "name": "SIB — 6,25% 2018-2023", "description": "Obligation de la Société Ivoirienne de Banque, taux 6,25%."},
    {"symbol": "BOACI-23", "instrument_type": "obligation", "name": "BOA-CI — 6,10% 2018-2023", "description": "Obligation Bank of Africa Côte d'Ivoire, taux 6,10%."},
    {"symbol": "BHS-23", "instrument_type": "obligation", "name": "BHS — 6,10% 2018-2023", "description": "Obligation de la Banque de l'Habitat du Sénégal, taux 6,10%."},
    {"symbol": "ONATEL-23", "instrument_type": "obligation", "name": "ONATEL-BF — 6,15% 2018-2023", "description": "Obligation ONATEL Burkina Faso, taux 6,15%."},
    {"symbol": "SEN-24", "instrument_type": "obligation", "name": "État du Sénégal — 6,25% 2017-2024", "description": "Obligation de l'État du Sénégal, taux 6,25%."},
    {"symbol": "MALI-23", "instrument_type": "obligation", "name": "État du Mali — 6,10% 2018-2023", "description": "Obligation de l'État du Mali, taux 6,10%."},
    {"symbol": "TOGO-24", "instrument_type": "obligation", "name": "État du Togo — 6,20% 2019-2024", "description": "Obligation de l'État du Togo, taux 6,20%."},
    {"symbol": "NESTLE-24", "instrument_type": "obligation", "name": "Nestlé Côte d'Ivoire — 6,00% 2019-2024", "description": "Obligation corporate Nestlé Côte d'Ivoire, taux 6,00%."},
    {"symbol": "UNIWAX-24", "instrument_type": "obligation", "name": "Uniwax — 6,25% 2019-2024", "description": "Obligation Uniwax, taux 6,25%."},
    # ---- FCP (fonds communs de placement) ----
    {"symbol": "FAO", "instrument_type": "fcp", "name": "FCP Atlantique Obligataire", "description": "Fonds commun de placement obligataire géré par Atlantique Asset Management."},
    {"symbol": "FAA", "instrument_type": "fcp", "name": "FCP Atlantique Actions", "description": "Fonds commun de placement actions géré par Atlantique Asset Management."},
    {"symbol": "FNC", "instrument_type": "fcp", "name": "FCP NSIA Croissance", "description": "Fonds commun de placement de croissance géré par NSIA Gestion d'Actifs."},
    {"symbol": "FNP", "instrument_type": "fcp", "name": "FCP NSIA Patrimoine", "description": "Fonds commun de placement patrimonial géré par NSIA Gestion d'Actifs."},
    {"symbol": "FNR", "instrument_type": "fcp", "name": "FCP NSIA Rendement", "description": "Fonds commun de placement de rendement géré par NSIA Gestion d'Actifs."},
    {"symbol": "FUR", "instrument_type": "fcp", "name": "FCP UBC Renta Obligataire", "description": "Fonds commun de placement obligataire géré par UBC Gestion."},
    {"symbol": "FCO", "instrument_type": "fcp", "name": "FCP Coris Obligataire", "description": "Fonds commun de placement obligataire géré par Coris Gestion."},
    {"symbol": "FCA", "instrument_type": "fcp", "name": "FCP Coris Actions", "description": "Fonds commun de placement actions géré par Coris Gestion."},
    {"symbol": "FBJ", "instrument_type": "fcp", "name": "FCP Bijou Obligataire", "description": "Fonds commun de placement obligataire de la BICICI."},
    {"symbol": "FSS", "instrument_type": "fcp", "name": "FCP SIB Sécurité", "description": "Fonds commun de placement monétaire géré par la SIB."},
    {"symbol": "FEC", "instrument_type": "fcp", "name": "FCP Ecobank Croissance", "description": "Fonds commun de placement de croissance géré par Ecobank."},
    {"symbol": "FBR", "instrument_type": "fcp", "name": "FCP BRS Obligataire", "description": "Fonds commun de placement obligataire géré par BRS Gestion."},
]


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
                country=COUNTRY_BY_SYMBOL.get(data["symbol"], DEFAULT_COUNTRY),
                shares_outstanding=data.get("shares_outstanding"),
                per=data.get("per") or None,
                reference_price=data.get("reference_price") or None,
                description=f"{data['name']} - {data['sector']} (BRVM)",
            )
            db.add(company)
            count += 1
    db.commit()
    return {"status": "success", "companies_created": count}


@router.post("/instruments")
def seed_instruments(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Seed des obligations et FCP cotés BRVM (catalogue statique, sans flux de prix)."""
    count = 0
    for data in INSTRUMENTS:
        existing = db.query(Company).filter(Company.symbol == data["symbol"]).first()
        if not existing:
            company = Company(
                symbol=data["symbol"],
                name=data["name"],
                sector=Sector.AUTRE,
                instrument_type=data["instrument_type"],
                country=COUNTRY_BY_SYMBOL.get(data["symbol"], DEFAULT_COUNTRY),
                description=data.get("description"),
            )
            db.add(company)
            count += 1
    db.commit()
    return {"status": "success", "instruments_created": count, "instruments_total": len(INSTRUMENTS)}


@router.post("/ngx")
def seed_ngx(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Seed du catalogue des sociétés cotées à la NGX (Nigeria).
    Idempotent : les sociétés existantes ne sont jamais modifiées (sauf
    marché incohérent), aucune donnée n'est écrasée."""
    from ..services.ngx_seed import seed_ngx_catalog
    return seed_ngx_catalog(db)


@router.post("/ngx-sync")
def seed_ngx_sync(db: Session = Depends(get_db), _=Depends(require_admin)):
    """Synchronise le catalogue NGX depuis l'API NGN Market (liste officielle
    + prix du jour persistés). Requiert une clé dans settings.NGN_MARKET_API_KEY."""
    from ..services.ngx_seed import sync_ngx_from_api
    return sync_ngx_from_api(db)


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
                country=COUNTRY_BY_SYMBOL.get(data["symbol"], DEFAULT_COUNTRY),
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
