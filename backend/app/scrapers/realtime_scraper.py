"""Real-time BRVM stock price scraper from the homepage."""
import httpx
from bs4 import BeautifulSoup
from datetime import date
import logging
from typing import Optional

from ._http import get_with_retry

logger = logging.getLogger(__name__)

BRVM_URL = "https://www.brvm.org"


def parse_price(text: str) -> Optional[float]:
    text = text.strip().replace(" ", "").replace("\u202f", "")
    try:
        return float(text) if text else None
    except ValueError:
        return None


def parse_change(text: str) -> Optional[float]:
    text = text.strip().replace(",", ".").replace("%", "").replace("\u202f", "")
    try:
        return float(text) if text else None
    except ValueError:
        return None


def scrape_market_prices() -> dict:
    """Scrape all stock prices from the BRVM homepage.
    Returns a dict of {symbol: {"price": float, "change": float}}.
    Les symboles sans prix valide (None, <=0) sont ignorés.
    """
    try:
        resp = get_with_retry(BRVM_URL)
        soup = BeautifulSoup(resp.text, "lxml")
    except Exception as e:
        logger.error(f"Scraping BRVM homepage aborted: {e}")
        return {}

    stocks = {}
    for item in soup.select(".item"):
        spans = item.select("span")
        if len(spans) < 3:
            continue
        symbol = spans[0].get_text(strip=True)
        if not symbol or not symbol.isascii():
            continue
        price = parse_price(spans[1].get_text(strip=True))
        change = parse_change(spans[2].get_text(strip=True))
        if price is None or price <= 0:
            logger.debug(f"Skipping {symbol}: invalid price {spans[1].get_text(strip=True)!r}")
            continue
        stocks[symbol] = {"price": price, "change": change if change is not None else 0.0}

    logger.info(f"Scraped {len(stocks)} stock prices from BRVM")
    return stocks


def update_db_prices(stocks: dict) -> int:
    """Update MarketData records in the database with scraped prices."""
    from app.database import SessionLocal
    from .persist import persist_prices

    db = SessionLocal()
    try:
        return persist_prices(db, stocks, source="SCRAPER_BRVM")
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to update DB: {e}")
        return 0
    finally:
        db.close()


def refresh_all_prices() -> int:
    """Full pipeline: scrape BRVM homepage -> update database."""
    stocks = scrape_market_prices()
    if not stocks:
        return 0
    return update_db_prices(stocks)
