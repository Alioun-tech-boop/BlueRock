"""Sources ALTERNATIVES d'historique OHLC NGX (Nigerian Exchange).

Le fournisseur natif (NGN Market, voir ngx_provider.py) ne sert l'historique
qu'a partir du plan hobby+. Pour contourner cette limite sans payer, on passe
par une source tierce :

  - Twelve Data  (https://twelvedata.com) : cle gratuite, couvre la NGX via le
    code d'exchange `:NGX`. C'est la source par defaut (NGX_HISTORY_PROVIDER).
  - Stooq        (https://stooq.com)      : CSV sans cle, mais souvent derriere
    un mur anti-bot selon l'IP d'appel.

Les deux renvoient une liste de barres normalisees (voir normalize_bar),
compatibles avec persist.persist_history().
"""
from __future__ import annotations

import csv
import io
import logging
import time
from datetime import datetime, date

import httpx

from ..config import settings

logger = logging.getLogger("ngx_history_alt")

UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def _parse_date(value):
    """Parse une date (str ISO, DD/MM/YYYY, ou timestamp) en datetime.date."""
    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.date() if isinstance(value, datetime) else value
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except Exception:
            continue
    try:
        return datetime.fromtimestamp(float(s)).date()
    except Exception:
        return None


def normalize_bar(date, open_=None, high=None, low=None, close=None,
                  volume=None, market_cap=None, change_percent=None) -> dict:
    """Normalise une barre OHLC quelconque au schema MarketData (date en objet date)."""

    def f(v):
        try:
            return float(v) if v not in (None, "", "0", "null") else None
        except (TypeError, ValueError):
            return None

    return {
        "date": _parse_date(date),
        "open": f(open_),
        "high": f(high),
        "low": f(low),
        "close": f(close),
        "volume": f(volume),
        "market_cap": f(market_cap),
        "change_percent": f(change_percent),
    }


# --------------------------------------------------------------------------- #
# Twelve Data
# --------------------------------------------------------------------------- #
def fetch_history_twelvedata(symbol: str, days: int, api_key: str) -> list:
    """Historique journalier NGX via Twelve Data (symbole `{symbol}:NGX`)."""
    if not api_key:
        raise RuntimeError(
            "TWELVEDATA_API_KEY manquant : inscrivez-vous sur twelvedata.com "
            "(gratuit) et renseignez la cle pour activer l'historique NGX."
        )
    sym = f"{symbol}:NGX"
    url = "https://api.twelvedata.com/time_series"
    params = {
        "symbol": sym,
        "interval": "1day",
        "outputsize": min(int(days), 5000),
        "apikey": api_key,
    }
    r = httpx.get(url, params=params, timeout=30, headers=UA)
    if r.status_code == 429:
        raise RuntimeError("Twelve Data : quota journalier atteint (429).")
    if r.status_code != 200:
        raise RuntimeError(f"Twelve Data {sym} -> HTTP {r.status_code}")
    data = r.json()
    if data.get("status") != "ok" or "values" not in data:
        msg = data.get("message") or data.get("code") or "reponse invalide"
        logger.warning("Twelve Data %s : %s", sym, msg)
        return []
    # Twelve Data renvoie du plus recent au plus ancien.
    bars = []
    for row in reversed(data["values"]):
        bar = normalize_bar(
            date=row["datetime"],
            open_=row.get("open"),
            high=row.get("high"),
            low=row.get("low"),
            close=row.get("close"),
            volume=row.get("volume"),
        )
        if bar["close"] is None:
            continue
        bars.append(bar)
    logger.info("Twelve Data %s : %d barres recuperees", sym, len(bars))
    return bars


# --------------------------------------------------------------------------- #
# Stooq (CSV, sans cle — reseaux non filtres)
# --------------------------------------------------------------------------- #
def _parse_stooq_csv(text: str, days: int, sym: str) -> list:
    bars = []
    reader = csv.DictReader(io.StringIO(text.strip()))
    for row in reader:
        date = (row.get("Date") or "").strip()
        if not date:
            continue
        bar = normalize_bar(
            date=date,
            open_=row.get("Open"),
            high=row.get("High"),
            low=row.get("Low"),
            close=row.get("Close"),
            volume=row.get("Volume"),
        )
        if bar["close"] is None:
            continue
        bars.append(bar)
    if days and len(bars) > days:
        bars = bars[-days:]
    logger.info("Stooq %s : %d barres recuperees", sym, len(bars))
    return bars


def _stooq_proxy_cfg(proxy: str = None):
    if not proxy:
        return None
    import urllib.parse as up
    u = up.urlparse(proxy)
    cfg = {"server": f"{u.scheme or 'http'}://{u.hostname}:{u.port}"}
    if u.username:
        cfg["username"] = u.username
    if u.password:
        cfg["password"] = u.password
    return cfg


def fetch_history_stooq_browser(symbol: str, days: int, proxy: str = None) -> list:
    """Fallback navigateur (Playwright) pour passer le challenge JS Cloudflare.

    Stooq sert un challenge JS (Turnstile/IUAM) qui bloque httpx meme depuis
    une IP residencielle. Un vrai navigateur (Chromium) execute le JS et obtient
    le cookie de clearance -> le CSV. Proxy optionnel (STOOQ_PROXY_URL).
    Un seul navigateur est reutilise pour tous les symboles (voir _get_browser).
    """
    sym = f"{symbol.lower()}.lg"
    url = f"https://stooq.com/q/d/l/?s={sym}&i=d"
    proxy_cfg = _stooq_proxy_cfg(proxy)
    browser = _get_browser(proxy_cfg)
    ctx = browser.new_context(
        user_agent=UA["User-Agent"], viewport={"width": 1280, "height": 800}
    )
    try:
        page = ctx.new_page()
        page.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )
        page.goto(url, wait_until="load", timeout=60000)
        try:
            page.wait_for_function(
                "document.body && document.body.innerText.indexOf('Date') >= 0",
                timeout=45000,
            )
        except Exception:
            pass
        text = page.inner_text("body")
    finally:
        ctx.close()

    if not text or text.lstrip().startswith(("<!DOCTYPE", "<html")):
        raise RuntimeError(
            f"Stooq {sym} : challenge Cloudflare persistant meme via navigateur "
            "(IP de sortie probablement bloquee). Utilisez une IP residentielle "
            "ou le plan hobby+ NGN Market."
        )
    return _parse_stooq_csv(text, days, sym)


_browser_singleton = None  # (playwright, browser) reutilise pour tout le backfill


def _get_browser(proxy_cfg=None):
    global _browser_singleton
    if _browser_singleton is None:
        from playwright.sync_api import sync_playwright
        p = sync_playwright().start()
        launch = dict(
            headless=True,
            args=["--disable-blink-features=AutomationControlled",
                  "--no-sandbox", "--disable-dev-shm-usage"],
        )
        if proxy_cfg:
            launch["proxy"] = proxy_cfg
        b = p.chromium.launch(**launch)
        _browser_singleton = (p, b)
    return _browser_singleton[1]


def fetch_history_stooq(symbol: str, days: int) -> list:
    """Historique journalier NGX via Stooq (symbole `{symbol}.lg`).

    Stooq est la SEULE source gratuite qui couvre reellement la NGX, mais son
    anti-bot Cloudflare bloque les clients non-navigateurs (httpx) et certaines
    IP (serveurs cloud, proxies datacenter). Strategie :
      1. tentative httpx (avec STOOQ_PROXY_URL si defini) ;
      2. si challenge Cloudflare -> fallback navigateur Playwright (resout le JS).
    Delai de 0,3 s entre les symboles (rate-limit).
    """
    sym = f"{symbol.lower()}.lg"
    url = "https://stooq.com/q/d/l/"
    params = {"s": sym, "i": "d"}
    hdr = dict(UA)
    hdr["Referer"] = "https://stooq.com/"
    proxy = settings.STOOQ_PROXY_URL or None

    last_err = None
    for attempt in range(2):
        try:
            with httpx.Client(proxy=proxy, timeout=30, headers=hdr,
                              follow_redirects=True) as client:
                r = client.get(url, params=params)
            break
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(1.5 * (attempt + 1))
    else:
        raise RuntimeError(
            f"Stooq {sym} : echec requete (proxy={proxy}) -> {last_err}"
        )

    challenged = (r.status_code != 200
                   or r.text.lstrip().startswith(("<!DOCTYPE", "<html")))
    if challenged:
        # Bascule sur un vrai navigateur pour resoudre le challenge JS.
        logger.warning("Stooq %s : challenge Cloudflare -> fallback Playwright", sym)
        return fetch_history_stooq_browser(symbol, days, proxy)
    time.sleep(0.3)
    return _parse_stooq_csv(r.text, days, sym)


# --------------------------------------------------------------------------- #
# Dispatcher
# --------------------------------------------------------------------------- #
def fetch_history_alt(symbol: str, days: int, provider: str = None) -> list:
    """Recupere l'historique NGX via la source alternative configuree."""
    provider = (provider or settings.NGX_HISTORY_PROVIDER or "twelvedata").lower()
    if provider == "stooq":
        return fetch_history_stooq(symbol, days)
    if provider == "ngnmarket":
        return []  # delégue au fournisseur natif (ngx_provider)
    # defaut : twelvedata
    return fetch_history_twelvedata(symbol, days, settings.TWELVEDATA_API_KEY or "")
