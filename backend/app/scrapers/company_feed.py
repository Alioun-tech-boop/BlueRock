"""News des sociétés cotées BRVM directement depuis leurs sites officiels.

Objectif : capter les communiqués et actualités publiés par les entreprises
elles-mêmes (sources primaires) avant leur reprise par les agrégateurs.

Pour chaque société :
1. Découverte d'un flux RSS : balise <link rel="alternate" type="application/rss+xml">
   sur la page d'accueil, puis chemins courants (/rss.xml, /fr/actualites/rss...).
2. À défaut de RSS exploitable (< 3 items), extraction des liens d'actualités
   depuis la page d'accueil (liens internes dont l'URL ou le titre évoque
   actualités/communiqués/presse).
"""
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse

import httpx

from .news_feed import _parse_rss_items, _dedup

RSS_PATHS = [
    "/rss.xml", "/rss", "/feed", "/feed/", "/flux-rss", "/flux", "/flux.xml",
    "/fr/rss.xml", "/fr/feed", "/en/rss.xml", "/en/feed", "/en/feed/",
    "/actualites/rss", "/actualites/feed", "/actualites/rss.xml",
    "/fr/actualites/rss", "/fr/actualites/feed", "/fr/actualites/rss.xml",
    "/news/rss", "/news/feed", "/news/rss.xml", "/en/news/rss",
    "/communiques/rss", "/communiques/rss.xml", "/media/rss", "/presse/rss",
    "/fr/presse/feed", "/fr/communiques/rss",
]

NEWS_HINT_RE = re.compile(
    r"(actualit|communiqu|presse|news|media|flash|publication|resultat|r\u00e9sultat|"
    r"dividende|assembl|bilan|rapport|exercice|annonce|info)", re.I)

EXCLUDE_PATH = re.compile(r"(#|mailto:|tel:|javascript:|login|register|connexion|sitemap|pdf$)", re.I)

# Filtre pour le fallback Google site:domaine (exclut les pages de navigation)
G_FALLBACK_TITLE_RE = re.compile(
    r"(r[ée]sultat|annuel|annuelle|dividend|communiqu[ée]|assembl|bilan|rapport|actionnaire|"
    r"chiffre d'affaires|b[ée]n[ée]fice|perte nette|augmentation de capital|admission|"
    r"cotation|cours du titre|obligat|accord|partenariat|investissement|acquisition|fusion|"
    r"restructur|nomination|d[ée]mission|r[ée]glement[ée]e?|comptes?|audit|exercice)", re.I)

_log = __import__("logging").getLogger(__name__)


def _fetch(url: str, timeout: float = 12.0) -> httpx.Response:
    h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0"}
    # max_redirects bas : certains sites BRVM (ex. smb.ci) bouclent leurs 302
    # en allongeant l'URL à chaque redirect (wppb_referer_url) ; on abandonne vite.
    def _get(verify: bool = True) -> httpx.Response:
        with httpx.Client(headers=h, timeout=timeout, follow_redirects=True,
                          max_redirects=4, verify=verify) as c:
            return c.get(url)
    try:
        return _get()
    except httpx.HTTPError as e:
        # Certificats obsolètes de certains sites BRVM (ex. cie.ci)
        if "SSL" in str(e) or "CERTIFICATE" in str(e).upper():
            return _get(verify=False)
        # Échec réseau transitoire (timeout, connexion) : une seule nouvelle tentative
        if not getattr(e, "response", None):
            import time as _t
            _t.sleep(2)
            return _get()
        raise


def _base_of(url: str) -> str:
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}" if p.scheme and p.netloc else url


def _same_host(url: str, base: str) -> bool:
    return urlparse(url).hostname == urlparse(base).hostname


def _rss_links(html: str, base: str) -> list:
    """Liens RSS déclarés dans le <head> de la page."""
    found = []
    for m in re.finditer(
        r'<link[^>]+(?:rel=["\']?alternate[^>]+type=["\']?application/rss\+xml["\']?[^>]*|'
        r'type=["\']?application/rss\+xml["\']?[^>]+rel=["\']?alternate["\']?[^>]*)>',
        html, re.I,
    ):
        tag = m.group(0)
        href_m = re.search(r'href=["\']([^"\']+)["\']', tag)
        if href_m:
            href = href_m.group(1)
            if href.startswith("/") or href.startswith("http"):
                found.append(urljoin(base, href))
    return found


def _link_title(a) -> str:
    """Titre d'un lien : texte, sinon alt d'image, sinon titre du bloc parent."""
    title = re.sub(r"\s+", " ", a.get_text(" ", strip=True))
    if len(title) < 10:
        img = a.find("img")
        if img is not None and img.get("alt"):
            title = img["alt"].strip()
        else:
            parent = a.find_parent(["article", "li", "div"])
            if parent is not None:
                head = parent.find(["h2", "h3", "h4"])
                if head is not None:
                    title = head.get_text(" ", strip=True)
    return re.sub(r"\s+", " ", title or "").strip()


IMG_BAD_RE = re.compile(
    r"(logo|icon|avatar|sprite|favicon|placeholder|data:image|\.svg|\.gif$|1x1|blank)",
    re.I)


def _link_img(a, base: str) -> str:
    """Image de couverture associée à un lien : <img> du lien, sinon 1re image
    du bloc parent (carte article). Ignore logos/icônes et images minuscules."""
    from urllib.parse import urljoin
    candidates = []
    img = a.find("img")
    if img is not None:
        candidates.append(img)
    parent = a.find_parent(["article", "li", "div"])
    if parent is not None:
        candidates.extend(parent.find_all("img", limit=3))
    for img in candidates:
        url = (img.get("src") or img.get("data-src")
               or img.get("data-lazy") or img.get("data-original") or "").strip()
        if not url or url.startswith("data:") or IMG_BAD_RE.search(url):
            continue
        w = img.get("width") or img.get("data-width")
        if w and str(w).isdigit() and int(w) < 80:
            continue
        abs_url = urljoin(base, url)
        if not abs_url.startswith(("http://", "https://")):
            continue
        return abs_url
    return ""


def _home_news_items(html: str, base: str) -> list:
    """Extraction de liens d'actualités depuis la page d'accueil (bs4)."""
    from bs4 import BeautifulSoup
    items = []
    seen_urls = set()
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return items
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        title = _link_title(a)
        if not href or EXCLUDE_PATH.search(href) or "#" in href:
            continue
        url = urljoin(base, href)
        if _same_host(url, base) is False:
            continue
        path = urlparse(url).path
        if path in ("", "/", "/fr", "/en", "/fr/", "/en/"):
            continue
        path_hint = bool(NEWS_HINT_RE.search(path))
        title_hint = bool(NEWS_HINT_RE.search(title)) and len(title) >= 10
        if not (title_hint or (path_hint and len(title) >= 20)):
            continue
        if not title or len(title) < 10 or len(title) > 220:
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        items.append({
            "title": title, "url": url, "url_real": url,
            "date": None, "image": _link_img(a, base),
        })
    return items


LISTING_PATH_RE = re.compile(r"(actualites|news|medias|communiques|presse|publications)", re.I)


def _find_listing_links(html: str, base: str) -> list:
    """Pages listes d'actualités (ex. 'Toutes les actualités') détectées sur l'accueil."""
    from bs4 import BeautifulSoup
    out = []
    try:
        soup = BeautifulSoup(html, "html.parser")
    except Exception:
        return out
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        title = _link_title(a)
        if not href or "#" in href or EXCLUDE_PATH.search(href):
            continue
        url = urljoin(base, href)
        if _same_host(url, base) is False:
            continue
        path = urlparse(url).path
        if not LISTING_PATH_RE.search(path) or not re.search(r"actualit|news|communiqu|presse", title, re.I):
            continue
        if url not in out:
            out.append(url)
    return out[:3]


def _crawl_listing(listing_url: str, source: str, max_items: int = 12) -> list:
    """Articles depuis une page liste d'actualités."""
    from bs4 import BeautifulSoup
    try:
        resp = _fetch(listing_url, timeout=10.0)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return []
    base = _base_of(listing_url)
    items = []
    seen = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        title = _link_title(a)
        if not href or "#" in href or EXCLUDE_PATH.search(href):
            continue
        if len(title) < 12 or len(title) > 220:
            continue
        url = urljoin(base, href)
        if _same_host(url, base) is False:
            continue
        path = urlparse(url).path
        if LISTING_PATH_RE.search(path) and len(path) < 40:
            continue
        if not (NEWS_HINT_RE.search(path) or NEWS_HINT_RE.search(title)):
            continue
        if url in seen:
            continue
        seen.add(url)
        date = None
        parent = a.find_parent(["article", "li", "div"])
        if parent is not None:
            time_el = parent.find("time")
            if time_el is not None and time_el.get("datetime"):
                date = time_el["datetime"]
        items.append({
            "title": title, "url": url, "url_real": url,
            "date": date, "image": _link_img(a, base),
        })
        if len(items) >= max_items:
            break
    return items


def _fetch_company(site: dict) -> list:
    """News d'une société : RSS d'abord, sinon liens de la page d'accueil."""
    symbol = site.get("symbol", "")
    name = site.get("name", symbol)
    url = (site.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return []
    base = _base_of(url)
    items = []
    try:
        resp = _fetch(base + "/", timeout=20.0)
        resp.raise_for_status()
        html = resp.text
        base = _base_of(str(resp.url))
    except Exception as e:
        _log.warning("Company %s homepage failed (%s): %s", symbol, base, e)
        return items

    rss_candidates = _rss_links(html, base)
    for path in RSS_PATHS:
        if len(rss_candidates) >= 3:
            break
        rss_candidates.append(urljoin(base, path))

    for rss_url in rss_candidates[:3]:
        try:
            resp = _fetch(rss_url, timeout=8.0)
            resp.raise_for_status()
            parsed = _parse_rss_items(resp.text)
            if parsed:
                items.extend(parsed)
                break
        except Exception:
            continue

    if len(items) < 3:
        listing_links = _find_listing_links(html, base)
        for listing_url in listing_links[:2]:
            crawled = _crawl_listing(listing_url, name)
            if crawled:
                items.extend(crawled)
                break

    if len(items) < 3:
        items.extend(_home_news_items(html, base))

    if not items:
        # Sites sans liens statiques (JS lourd) : news publiées sur le domaine
        # via Google News (url_real = URL directe de l'article sur le site).
        try:
            from .news_feed import _fetch_google
            host = urlparse(base).hostname or ""
            if host:
                for it in _fetch_google("site:" + host):
                    title = it.get("title") or ""
                    if len(title) >= 12 and G_FALLBACK_TITLE_RE.search(title):
                        items.append(it)
        except Exception:
            pass

    if not items:
        return []

    items = _dedup(items)
    now = datetime.now(timezone.utc).isoformat()
    out = []
    for it in items:
        out.append({
            "title": it["title"],
            "url": it.get("url") or "",
            "url_real": it.get("url_real") or it.get("url") or "",
            "date": it.get("date") or now,
            "source": name[:60],
            "symbol": symbol,
            "image": it.get("image") or "",
        })
    return out[:4]


def fetch_all(sites: list, max_workers: int = 8) -> list:
    """Toutes les sociétés en parallèle, dédupliquées par domaine."""
    seen_hosts = set()
    uniq = []
    for s in sites:
        url = (s.get("url") or "").strip()
        if not url.startswith(("http://", "https://")):
            continue
        host = urlparse(url).netloc.lower()
        if host in seen_hosts:
            continue
        seen_hosts.add(host)
        uniq.append(s)

    results = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_company, s): s for s in uniq}
        for fut in futures:
            try:
                results.extend(fut.result())
            except Exception as e:
                _log.warning("Company feed worker error: %s", e)

    for it in results:
        d = it.get("date")
        if isinstance(d, datetime):
            it["date"] = d.astimezone(timezone.utc).isoformat()

    results.sort(key=lambda x: x.get("date") or "", reverse=True)
    return results


_lock = threading.Lock()
_cached = []
_cached_at = None
_CACHE_TTL = 240


def cached_fetch_all(sites: list) -> list:
    """Version cachée 4 min pour ne pas marteler les sites à chaque appel."""
    global _cached, _cached_at
    now = datetime.now(timezone.utc)
    with _lock:
        if _cached_at and (now - _cached_at).total_seconds() < _CACHE_TTL:
            return _cached
    data = fetch_all(sites)
    with _lock:
        _cached = data
        _cached_at = now
    return data
