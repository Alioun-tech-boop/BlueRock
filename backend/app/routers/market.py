from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict
from ..core.rate_limit import check_rate_limit
from ..database import get_db
from ..models.market import MarketData
from ..models.company import Company, Sector
from ..routers.auth import get_current_user, get_optional_user
from ..services.tier import require_pro
from datetime import date, datetime, timedelta

from ..routers.companies import API_URL, COLORS

router = APIRouter(prefix="/api/market", tags=["Market"])

LIVE_MODE = "BRVM_LIVE"
DB_MODE = "BRVM_DB"

def _live_payload():
    """Données du flux temps réel (cache mémoire), vidées si absentes."""
    from ..scrapers.live_feed import live_feed
    snap = live_feed.snapshot()
    if snap["status"] == "OFFLINE" and not snap["prices"]:
        return None
    return snap

@router.get("/live")
def get_market_live():
    """Statut + prix temps réel du flux BRVM (cache)."""
    from ..scrapers.live_feed import live_feed
    return live_feed.snapshot()

@router.get("/ngx")
def get_market_ngx(user=Depends(get_optional_user)):
    """Statut + prix temps réel du flux NGX (cache, via NGN Market API).

    Réservé à l'offre Pro (toutes les bourses).
    """
    require_pro(user)
    from ..scrapers.ngx_feed import ngx_live_feed
    return ngx_live_feed.snapshot()

@router.get("/overview")
def get_market_overview(exchange: str = "BRVM", db: Session = Depends(get_db),
                        user=Depends(get_optional_user)):
    from ..scrapers.brvm_data import scrape_market_overview
    try:
        real = scrape_market_overview()
    except Exception:
        real = {}

    exchange = (exchange or "BRVM").upper()
    if exchange not in ("BRVM", "NGX"):
        raise HTTPException(status_code=422, detail="exchange doit être BRVM ou NGX")
    is_ngx = exchange == "NGX"
    if is_ngx:
        require_pro(user)  # la bourse NGX est une fonctionnalité de l'offre Pro

    if is_ngx:
        from ..scrapers.ngx_feed import ngx_live_feed
        live = ngx_live_feed.snapshot()
        live_prices = live.get("prices") or {}
        live_details = live.get("details") or {}
        live_status = live.get("status")
        live_last_update = live.get("last_update")
    else:
        live = _live_payload()
        live_prices = (live or {}).get("prices") or {}
        live_status = (live or {}).get("status")
        live_last_update = (live or {}).get("last_update")

    latest_date = db.query(func.max(MarketData.date)).scalar() or date.today()

    todays_data = db.query(MarketData).filter(MarketData.date == latest_date).all()
    companies_by_id = {c.id: c for c in db.query(Company).all()}
    md_by_company = {md.company_id: md for md in todays_data}

    if is_ngx:
        # Vue NGX : on itère sur le catalogue NGX (les MarketData ne sont
        # remplies qu'au premier jour de collecte, le flux live est prioritaire).
        targets = [c for c in companies_by_id.values() if c.exchange == "NGX"]
    else:
        targets = [companies_by_id[md.company_id] for md in todays_data
                   if md.company_id in companies_by_id
                   and companies_by_id[md.company_id].exchange == "BRVM"
                   and companies_by_id[md.company_id].instrument_type == "equity"]

    stocks = []
    for company in targets:
        md = md_by_company.get(company.id)
        live_price = live_prices.get(company.symbol)
        close_price = live_price["price"] if live_price else (md.close_price if md else None)
        change_percent = live_price["change"] if live_price else (md.change_percent if md else None)
        market_cap = (close_price * company.shares_outstanding) if live_price and company.shares_outstanding else (md.market_cap if md else None)
        from ..services.logos import resolve_logo_url
        logo_url = live_details.get(company.symbol, {}).get("logo_url") if is_ngx else None
        if not logo_url:
            logo_url = resolve_logo_url(company.symbol, company.website, API_URL)
        stocks.append({
            "id": company.id,
            "symbol": company.symbol,
            "company_name": company.name,
            "sector": company.sector.value if company.sector else None,
            "sub_sector": company.sub_sector,
            "currency": company.currency or ("NGN" if is_ngx else "XOF"),
            "exchange": company.exchange or exchange,
            "close_price": close_price,
            "change_percent": change_percent,
            "volume": md.volume if md else None,
            "market_cap": market_cap,
            "logo_url": logo_url,
            "date": latest_date.isoformat()
        })

    # Sector performance from DB
    sectors = {}
    for s in stocks:
        sec = s["sector"]
        if sec:
            if sec not in sectors:
                sectors[sec] = {"companies": 0, "total_change": 0, "count": 0, "total_volume": 0}
            sectors[sec]["companies"] += 1
            if s["change_percent"] is not None:
                sectors[sec]["total_change"] += s["change_percent"]
                sectors[sec]["count"] += 1
            if s["volume"]:
                sectors[sec]["total_volume"] += s["volume"]

    sector_perf = {}
    for sec, data in sectors.items():
        sector_perf[sec] = {
            "change": round(data["total_change"] / data["count"], 2) if data["count"] > 0 else 0,
            "volume": data["total_volume"],
            "companies": data["companies"]
        }

    total_mcap = sum(s["market_cap"] for s in stocks if s.get("market_cap")) if stocks else 0
    total_vol = sum(s["volume"] for s in stocks if s.get("volume")) if stocks else 0

    up_count = sum(1 for s in stocks if (s["change_percent"] or 0) > 0)
    down_count = sum(1 for s in stocks if (s["change_percent"] or 0) < 0)
    flat_count = sum(1 for s in stocks if (s["change_percent"] or 0) == 0)

    indices = {
        "brvm_composite": real.get("brvm_composite"),
        "brvm_composite_change": real.get("brvm_composite_change"),
        "brvm_30": real.get("brvm_30"),
        "brvm_30_change": real.get("brvm_30_change"),
        "brvm_prestige": real.get("brvm_prestige"),
        "brvm_prestige_change": real.get("brvm_prestige_change"),
        "brvm_principal": real.get("brvm_principal"),
        "brvm_principal_change": real.get("brvm_principal_change"),
        "transaction_value": real.get("transaction_value"),
        "equities_cap": real.get("equities_cap"),
        "bonds_cap": real.get("bonds_cap"),
        "change_percent": real.get("brvm_composite_change") if real.get("brvm_composite_change") is not None else (round(sum(s["change_percent"] or 0 for s in stocks) / len(stocks), 2) if stocks else 0),
        "up_count": up_count,
        "down_count": down_count,
        "flat_count": flat_count,
        "volume_total": total_vol,
        "market_cap": total_mcap,
        "date": latest_date.isoformat()
    }

    live_indices = (live or {}).get("indices") or {}
    for key in ("brvm_composite", "brvm_30", "brvm_prestige", "brvm_principal"):
        if key in live_indices:
            indices[key] = live_indices[key].get("value")
            indices[key + "_change"] = live_indices[key].get("change")
    if live and (live.get("activities") or {}):
        acts = live["activities"]
        if acts.get("transaction_value") is not None:
            indices["transaction_value"] = acts["transaction_value"]
        if acts.get("equities_cap") is not None:
            indices["equities_cap"] = acts["equities_cap"]
        if acts.get("bonds_cap") is not None:
            indices["bonds_cap"] = acts["bonds_cap"]

    sorted_stocks = sorted(stocks, key=lambda x: x.get("change_percent", 0) or 0, reverse=True)
    gainers = [s for s in sorted_stocks if s.get("change_percent", 0) is not None and s["change_percent"] > 0][:5]
    losers = [s for s in reversed(sorted_stocks) if s.get("change_percent", 0) is not None and s["change_percent"] < 0][:5]

    days_since_update = (date.today() - latest_date).days

    return {
        "indices": indices,
        "sector_indices": real.get("sector_indices", {}),
        "stocks": stocks,
        "sectors": sector_perf,
        "gainers": gainers,
        "losers": losers,
        "source": ("NGX_LIVE" if is_ngx else LIVE_MODE) if live_prices else DB_MODE,
        "last_update": live_last_update,
        "live_status": live_status,
        "freshness": {
            "latest_date": latest_date.isoformat(),
            "is_current": days_since_update <= 3,
            "days_since_update": max(days_since_update, 0),
            "note": ("Cours NGX actualisés par le flux NGN Market (rapprochement prix codés, "
                     "pas de backfill historique — l'historique s'accumule à partir du premier jour de collecte)."
                     if is_ngx else
                     "Cours actualisés par le flux BRVM ; l'historique des prix (BFIN) et les états "
                     "financiers (BRVM) sont des données réelles téléchargées."),
        },
    }

@router.get("/indices")
def get_indices(db: Session = Depends(get_db)):
    from ..scrapers.brvm_data import scrape_market_overview
    try:
        real = scrape_market_overview()
    except Exception:
        real = {}

    latest_date = db.query(func.max(MarketData.date)).scalar() or date.today()
    data = db.query(MarketData).filter(MarketData.date == latest_date).all()
    total_mcap = sum(d.market_cap for d in data if d.market_cap) if data else 0
    total_vol = sum(d.volume for d in data if d.volume) if data else 0

    return {
        "brvm_composite": real.get("brvm_composite"),
        "brvm_30": real.get("brvm_30"),
        "brvm_prestige": real.get("brvm_prestige"),
        "sector_indices": real.get("sector_indices", {}),
        "change_percent": real.get("brvm_composite_change"),
        "volume_total": total_vol,
        "market_cap": total_mcap,
        "date": latest_date.isoformat()
    }


@router.get("/sparklines")
def get_sparklines(days: int = 30, db: Session = Depends(get_db)):
    """Séries courtes réelles (clôtures) par entreprise pour les mini-graphiques.

    Indexées par id (compat historique) ET par symbole (usage community :
    cartes financières des publications). `_meta` fournit nom/cours/variation
    par symbole pour rendre l'encart même hors top performers."""
    latest = db.query(func.max(MarketData.date)).scalar()
    if not latest:
        return {"_meta": {}}
    cutoff = latest - timedelta(days=max(1, days))
    rows = (
        db.query(MarketData, Company)
        .join(Company, Company.id == MarketData.company_id)
        .filter(MarketData.date >= cutoff)
        .order_by(MarketData.company_id, MarketData.date)
        .all()
    )
    result: Dict = {}
    names: Dict[int, str] = {}
    symbols: Dict[int, str] = {}
    for md, co in rows:
        result.setdefault(md.company_id, []).append(round(md.close_price, 2))
        names.setdefault(md.company_id, co.name)
        symbols.setdefault(md.company_id, co.symbol)
    clean: Dict = {}
    meta: Dict = {}
    for cid, series in result.items():
        sym = (symbols.get(cid) or "").upper()
        clean[cid] = series
        if sym:
            clean[sym] = series
            first, last = series[0], series[-1]
            change = ((last - first) / max(abs(first), 0.0001)) * 100 if len(series) > 1 else 0
            meta[sym] = {
                "name": names.get(cid),
                "close_price": last,
                "change_percent": round(change, 2),
                "symbol": sym,
            }
    clean["_meta"] = meta
    return clean


@router.get("/news")
def get_news(limit: int = Query(50, ge=1, le=500), force: bool = False, request: Request = None):
    """News marché BRVM : historique persisté trié du plus récent au plus
    ancien (positions stables) + re-scrape en arrière-plan si périmé ou
    demandé (force)."""
    from ..scrapers.news_feed import news_feed, history
    if force:
        check_rate_limit(request, limit=3, window_seconds=300)  # force = re-scrape complet
        news_feed.refresh(force=True)  # lancé en arrière-plan, réponse non bloquée
    items = history(limit=limit, since=None)
    return {
        "items": items,
        "brvm": news_feed.brvm,
        "presse": news_feed.presse,
        "societes": news_feed.societes,
        "count": len(items),
        "last_update": news_feed.last_update(),
    }


@router.get("/news/article")
def get_news_article(url: str, lang: str = "fr"):
    """Contenu complet d'un article pour lecture intégrée dans le logiciel.
    Résumé IA best-effort, texte extrait par heuristiques."""
    from ..scrapers.article_content import article_content, summarize_article
    from ..scrapers.news_feed import news_feed
    from urllib.parse import urlparse

    host = (urlparse(url).hostname or "").lower()
    if host.endswith("news.google.com"):
        for it in news_feed.refresh():
            if it.get("url") == url and it.get("url_real"):
                url = it["url_real"]
                break

    try:
        data = article_content.get(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Article inaccessible : {e}")
    if not data.get("summary"):
        data["summary"] = summarize_article(data["title"], data["content"], lang)
    return data


@router.get("/calendar")
def get_calendar(force: bool = False, db: Session = Depends(get_db), request: Request = None):
    """Calendrier économique BRVM : annonces officielles (AG, dividendes,
    communiqués) + publications de résultats et indicateurs macro dérivés
    des données réelles en base."""
    if force:
        check_rate_limit(request, limit=3, window_seconds=300)  # force = re-scrape complet
    from ..scrapers.calendar_feed import calendar_feed
    items = calendar_feed.refresh(force=force, db=db)
    from ..services.economic_calendar import build_calendar_payload
    merged = build_calendar_payload(db, scraped_items=items)
    return {
        "items": merged,
        "source": calendar_feed._source,
        "count": len(merged),
        "last_update": calendar_feed.last_update(),
    }


@router.get("/announcements")
def get_announcements(db: Session = Depends(get_db)):
    """Annonces récupérées du site BRVM (best-effort, [] si indisponible)."""
    import httpx
    from bs4 import BeautifulSoup

    url = "https://www.brvm.org/fr/actualites"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    try:
        resp = httpx.get(url, headers=headers, timeout=15, follow_redirects=True)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception:
        return []

    announcements = []
    seen = set()
    for a in soup.select("a[href*='/fr/actualites/'], a[href*='/fr/communiques/'], a[href*='/fr/annonces/']")[:30]:
        title = a.get_text(strip=True)
        if not title or len(title) < 15 or title in seen:
            continue
        seen.add(title)
        href = a.get("href", "")
        if not href.startswith("http"):
            href = "https://www.brvm.org" + href
        announcements.append({
            "title": title[:160],
            "source": "BRVM",
            "url": href,
            "date": None,
        })
        if len(announcements) >= 10:
            break
    return announcements

@router.get("/sectors")
def get_sectors(db: Session = Depends(get_db)):
    latest_date = db.query(func.max(MarketData.date)).scalar() or date.today()
    data = db.query(MarketData, Company).join(Company).filter(MarketData.date == latest_date).all()
    
    sectors = {}
    for md, co in data:
        sec = co.sector.value if co.sector else "Autre"
        if sec not in sectors:
            sectors[sec] = {"change": 0, "volume": 0, "companies": 0, "count": 0}
        sectors[sec]["companies"] += 1
        sectors[sec]["volume"] += md.volume or 0
        if md.change_percent is not None:
            sectors[sec]["change"] += md.change_percent
            sectors[sec]["count"] += 1
    
    result = {}
    for sec, d in sectors.items():
        result[sec] = {
            "change": round(d["change"] / d["count"], 2) if d["count"] else 0,
            "volume": d["volume"],
            "companies": d["companies"]
        }
    return result

@router.post("/refresh")
def refresh_market_data(request: Request, db: Session = Depends(get_db), user=Depends(get_current_user)):
    check_rate_limit(request, limit=5, window_seconds=60)  # 5 rafraîchissements / min / IP
    from ..scrapers.realtime_scraper import refresh_all_prices
    count = refresh_all_prices()
    return {"status": "success", "records_updated": count}
