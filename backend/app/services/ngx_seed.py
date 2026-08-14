"""Seed / sync idempotent du catalogue NGX.

- seed_ngx_catalog(db) : upsert du catalogue statique (startup + endpoint
  admin). Jamais d'écrasement : une société existante n'est modifiée que si
  son marché est incohérent (ex. société NGX marquée BRVM par un vieux seed).
- sync_ngx_from_api(db) : enrichit le catalogue depuis l'API NGN Market
  (noms officiels, sous-secteur, logo) et enregistre les prix du jour dans
  MarketData. Ne supprime jamais de société.
"""
import logging

from sqlalchemy.orm import Session

from ..data.ngx_companies import NGX_COMPANIES, NGX_COUNTRY, NGX_CURRENCY, NGX_EXCHANGE
from ..models.company import Company

logger = logging.getLogger(__name__)

# Symboles du catalogue remplacés dans la liste officielle NGX
# (renommages : Access Holdings, Tantalizers, The Initiates, Learn Africa).
NGX_SYMBOL_RENAMES = {
    "ACCESS": "ACCESSCORP",
    "INITIATES": "TIP",
    "LEARNAFRICA": "LEARNAFRCA",
    "TANTALIZERS": "TANTALIZER",
}


def _autore_sector(sub_sector: str | None):
    """Secteur BlueRock par défaut pour une société API non cataloguée."""
    from ..models.company import Sector
    text = (sub_sector or "").lower()
    if "bank" in text or "financ" in text:
        return Sector.SERVICES_FINANCIERS if "insur" not in text else Sector.ASSURANCE
    if "insur" in text:
        return Sector.ASSURANCE
    if "telecom" in text:
        return Sector.TELECOMS
    if "oil" in text or "gas" in text:
        return Sector.ENERGIE
    if "food" in text or "beverage" in text or "sugar" in text:
        return Sector.CONSOMMATION_BASE
    if "agric" in text or "plantation" in text:
        return Sector.AGROALIMENTAIRE
    if "cement" in text or "build" in text or "material" in text:
        return Sector.MATERIAUX
    if "manufactur" in text or "industrial" in text:
        return Sector.INDUSTRIELS
    if "real estate" in text:
        return Sector.IMMOBILIER
    if "transport" in text or "aviation" in text or "logistic" in text:
        return Sector.TRANSPORT
    if "conglom" in text:
        return Sector.HOLDING
    return Sector.AUTRE


def seed_ngx_catalog(db: Session) -> dict:
    """Upsert idempotent du catalogue NGX. Retourne {created, updated}."""
    created = 0
    updated = 0
    for symbol, name, sub_sector, sector in NGX_COMPANIES:
        existing = db.query(Company).filter(Company.symbol == symbol).first()
        if existing:
            if existing.exchange != NGX_EXCHANGE:
                existing.exchange = NGX_EXCHANGE
                existing.currency = NGX_CURRENCY
                existing.sector = sector
                existing.sub_sector = sub_sector
                updated += 1
            continue
        db.add(Company(
            symbol=symbol,
            name=name,
            sector=sector,
            instrument_type="equity",
            exchange=NGX_EXCHANGE,
            currency=NGX_CURRENCY,
            sub_sector=sub_sector,
            country=NGX_COUNTRY,
            description=f"{name} — {sub_sector} (NGX, Nigeria)",
        ))
        created += 1
    db.commit()
    if created or updated:
        logger.info(f"NGX catalog: {created} créées, {updated} mises à jour")
    return {"status": "success", "created": created, "updated": updated}


def merge_renamed_symbols(db: Session) -> dict:
    """Applique NGX_SYMBOL_RENAMES : renomme les sociétés encore au vieux
    symbole et supprime l'ancien doublon s'il existe (jamais si des
    positions/ordres l'utilisent). Idempotent."""
    from ..models.user import Order, Position

    merged = 0
    for old, new in NGX_SYMBOL_RENAMES.items():
        old_co = db.query(Company).filter(Company.symbol == old).first()
        if not old_co:
            continue
        new_co = db.query(Company).filter(Company.symbol == new).first()
        if new_co:
            refs = (db.query(Position).filter(Position.symbol == old).count()
                    + db.query(Order).filter(Order.symbol == old).count())
            if refs:
                logger.warning(f"NGX rename {old}→{new}: références actives, société conservée")
                continue
            db.delete(old_co)
        else:
            old_co.symbol = new
        merged += 1
    if merged:
        db.commit()
        logger.info(f"NGX renames appliqués : {merged}")
    return {"status": "success", "merged": merged}


def sync_ngx_from_api(db: Session) -> dict:
    """Enrichit le catalogue + persiste les prix du jour depuis l'API
    NGN Market. Retourne {companies, priced, offline: bool}."""
    from ..scrapers.ngx_provider import make_client
    from ..scrapers.ngx_feed import ngx_live_feed

    client = make_client()
    if not client.configured:
        return {"status": "offline",
                "reason": "Clé NGN Market API absente — flux NGX désactivé",
                "companies": 0, "priced": 0, "offline": True}

    merge_renamed_symbols(db)
    rows = client.fetch_companies()
    if not rows:
        return {"status": "offline",
                "reason": "NGN Market API : aucune donnée reçue",
                "companies": 0, "priced": 0, "offline": True}

    used = 0
    created = 0
    for row in rows:
        symbol = row["symbol"]
        if not symbol.isalnum():
            continue
        existing = db.query(Company).filter(Company.symbol == symbol).first()
        if existing:
            changed = False
            if existing.exchange != NGX_EXCHANGE:
                existing.exchange = NGX_EXCHANGE
                existing.currency = NGX_CURRENCY
                changed = True
            if row.get("name") and existing.name != row["name"]:
                existing.name = row["name"]
                changed = True
            if row.get("sub_sector") and existing.sub_sector != row["sub_sector"]:
                existing.sub_sector = str(row["sub_sector"])[:100]
                changed = True
            if row.get("shares_outstanding"):
                existing.shares_outstanding = row["shares_outstanding"]
                changed = True
            if not existing.country:
                existing.country = NGX_COUNTRY
                changed = True
            if changed:
                used += 1
            continue
        # Nouvelle liste officielle absente du catalogue statique (IPO récente).
        from ..data.ngx_companies import company_dict
        info = company_dict(symbol) or {}
        db.add(Company(
            symbol=symbol,
            name=row.get("name") or symbol,
            sector=(info.get("sector") if info else None) or _autore_sector(row.get("sub_sector")),
            instrument_type="equity",
            exchange=NGX_EXCHANGE,
            currency=NGX_CURRENCY,
            sub_sector=str(row.get("sub_sector"))[:100] if row.get("sub_sector") else None,
            country=NGX_COUNTRY,
            shares_outstanding=row.get("shares_outstanding"),
        ))
        created += 1
    db.commit()

    prices = {}
    for symbol, row in ((r["symbol"], r) for r in rows):
        if row.get("price"):
            prices[symbol] = {"price": row["price"], "change": row.get("change")}

    from ..scrapers.persist import persist_prices
    priced = persist_prices(db, prices, source="NGX_LIVE")
    ngx_live_feed.refresh(force=True)  # met à jour le cache mémoire
    return {"status": "success", "companies": len(rows), "priced": priced, "offline": False}