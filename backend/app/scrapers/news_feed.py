"""Agrégateur de news marché BRVM temps réel.

Sources :
- BRVM officiel (communiqués/actualités des sociétés cotées) via le flux RSS.
- Presse professionnelle (Agence Ecofin, Sika Finance, Financial Afrik, Jeune Afrique, RFI...)
  via Google News RSS (opérateur site:).
- Financial Afrik directement (RSS).
"""
import re
import threading
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus, urlparse

import httpx

BRVM_FEED = "https://www.brvm.org/rss.xml"

GOOGLE_QUERIES = [
    "BRVM bourse UEMOA",
    "site:agenceecofin.com BRVM",
    "site:sikafinance.com",
    "site:financialafrik.com BRVM",
    "bourse r\u00e9gionale des valeurs mobili\u00e8res",
    "BRVM soci\u00e9t\u00e9 cot\u00e9e",
]

BING_QUERIES = [
    "BRVM bourse UEMOA",
    "BRVM soci\u00e9t\u00e9 cot\u00e9e",
    "bourse r\u00e9gionale des valeurs mobili\u00e8res UEMOA",
]

DIRECT_FEEDS = [
    ("Financial Afrik", "https://www.financialafrik.com/feed/"),
]

SYMBOLS = [
    "ABJC", "BICC", "BICB", "BNBC", "BOAB", "BOABF", "BOAC", "BOAM", "BOAN",
    "BOAS", "CABC", "CBIBF", "CFAC", "CIEC", "ECOC", "ETIT", "FTSC", "LNBB",
    "NEIC", "NSBC", "NTLC", "ONTBF", "ORAC", "ORGT", "PALC", "PRSC", "SAFC",
    "SDCC", "SDSC", "SEMC", "SGBC", "SHEC", "SIBC", "SICC", "SIVC", "SLBC",
    "SMBC", "SNTS", "SOGC", "SPHC", "STAC", "STBC", "TTLC", "TTLS", "UNLC",
    "UNXC", "SCRC",
]

RELEVANCE = re.compile(
    r"\b(brvm|bourse|uemoa|bceao|sika\s*finance|march[\u00e9e]\s+financier|obligat\w*|"
    r"dividend\w*|actions?\s+boursi|code\s+des\s+investissements|cotation|coti|"
    r"fonds\s+souverain|titre\s+boursier|portefeuille|indice\s+composite)\b",
    re.I,
)

CACHE_TTL = 300  # 5 minutes
MAX_BRVM = 20
MAX_PRESSE = 40
MAX_SOCIETES = 120
MAX_ITEMS = 200

_log = __import__("logging").getLogger(__name__)


def _clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


def _parse_rss_items(xml_text, bing=False):
    items = []
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return items
    for item in root.iter("item"):
        title = _clean(item.findtext("title"))
        link = _clean(item.findtext("link"))
        if not title or not link:
            continue
        pub = item.findtext("pubDate") or item.findtext("dc:date")
        src_el = item.find("source")
        source = _clean(src_el.text) if src_el is not None and src_el.text else ""
        real_url = _clean(src_el.get("url")) if src_el is not None else ""
        if bing and link.startswith("http://www.bing.com/news/apiclick"):
            parsed = _url_query_param(link, "url")
            if parsed:
                real_url = parsed
                link = parsed
        if real_url:
            if urlparse(real_url).path in ("", "/"):
                real_url = ""  # Google News : <source url> = page d'accueil
        if source:
            suffix = " - " + source
            if title.endswith(suffix):
                title = title[: -len(suffix)].strip()
        items.append({
            "title": title[:200],
            "url": link,
            "url_real": real_url or link,
            "date": _parse_date(pub) if pub else None,
            "source": source,
            "image": _rss_image(item),
        })
    return items


_MEDIA_NS = "{http://search.yahoo.com/mrss/}"


def _rss_image(item) -> str:
    """Image de couverture d'un item RSS : <enclosure>, <media:content>/<media:thumbnail>,
    sinon première <img> du contenu HTML (feeds WordPress)."""
    enc = item.find("enclosure")
    if enc is not None and (enc.get("type") or "").startswith("image/"):
        return _clean(enc.get("url"))
    for tag in ("media:content", _MEDIA_NS + "content"):
        mc = item.find(tag)
        if mc is not None and (mc.get("type") or "").startswith("image/"):
            return _clean(mc.get("url"))
    for tag in ("media:thumbnail", _MEDIA_NS + "thumbnail"):
        mt = item.find(tag)
        if mt is not None:
            return _clean(mt.get("url"))
    for tag in ("content:encoded", "{http://purl.org/rss/1.0/modules/content/}encoded"):
        body = item.findtext(tag) or ""
        if body:
            m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', body, re.I)
            if m:
                url = _clean(m.group(1))
                if url and not url.startswith("data:") and "logo" not in url.lower():
                    return url
    return ""


def _url_query_param(url, key):
    from urllib.parse import parse_qs, urlparse
    qs = parse_qs(urlparse(url).query)
    vals = qs.get(key)
    if vals and vals[0]:
        return _clean(vals[0])
    return ""


def _parse_date(raw):
    if not raw:
        return None
    try:
        return parsedate_to_datetime(raw)
    except Exception:
        return None


def _fetch(url, headers=None):
    h = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0"}
    if headers:
        h.update(headers)
    return httpx.get(url, headers=h, timeout=15, follow_redirects=True)


def _fetch_google(query):
    url = "https://news.google.com/rss/search?q=" + quote_plus(query) + "&hl=fr&gl=CI&ceid=CI:fr"
    try:
        resp = _fetch(url)
        resp.raise_for_status()
        return _parse_rss_items(resp.text)
    except Exception as e:
        _log.warning("Google News query failed (%s): %s", query, e)
        return []


def _fetch_bing(query):
    """Bing News RSS : les liens sont des redirects 'apiclick' contenant
    l'URL réelle de l'article (url=...) — contrairement à Google News,
    l'URL source est donc directe et lisible dans l'application."""
    url = "https://www.bing.com/news/search?q=" + quote_plus(query) + "&format=rss&setlang=fr"
    try:
        resp = _fetch(url)
        resp.raise_for_status()
        return _parse_rss_items(resp.text, bing=True)
    except Exception as e:
        _log.warning("Bing News query failed (%s): %s", query, e)
        return []


def _fetch_brvm():
    for attempt in range(3):
        try:
            resp = _fetch(BRVM_FEED)
            resp.raise_for_status()
            items = _parse_rss_items(resp.text)
            for it in items:
                it["source"] = "BRVM"
            return items
        except Exception as e:
            _log.warning("BRVM RSS failed (attempt %d/3): %s", attempt + 1, e)
    return []


def _fetch_direct(label, url):
    try:
        resp = _fetch(url)
        resp.raise_for_status()
        items = _parse_rss_items(resp.text)
        for it in items:
            it["source"] = it["source"] or label
        return items
    except Exception as e:
        _log.warning("Direct feed %s failed: %s", label, e)
        return []


def _is_relevant(text, source):
    t = text.lower()
    if RELEVANCE.search(t):
        return True
    for sym in SYMBOLS:
        if re.search(r"\b" + sym + r"\b", t, re.I):
            return True
    if "brvm" in source.lower() or "sika" in source.lower() or "ecofin" in source.lower():
        return True
    return False


def _is_readable(it):
    url = it.get("url_real") or it.get("url") or ""
    return "news.google.com" not in url and "bing.com/news/apiclick" not in url


def _dedup(items):
    seen = {}
    for it in items:
        key = re.sub(r"[^\w]+", "", it["title"].lower())[:80]
        if not key:
            continue
        if key in seen:
            if _is_readable(it) and not _is_readable(seen[key]):
                seen[key] = it
            continue
        seen[key] = it
    return list(seen.values())


class NewsFeed:
    def __init__(self):
        self._lock = threading.Lock()
        self._items = []
        self.brvm = []
        self.presse = []
        self.societes = []
        self._fetched_at = None
        self._running = False

    def last_update(self):
        return self._fetched_at.isoformat() if self._fetched_at else None

    def refresh(self, force=False):
        """Retourne toujours immédiatement : si le cache est périmé, un refresh
        est lancé en arrière-plan et l'ancien contenu est servi en attendant."""
        now = datetime.now(timezone.utc)
        with self._lock:
            fresh = self._fetched_at and (now - self._fetched_at).total_seconds() < CACHE_TTL
            if fresh and not force:
                return self._items
            if self._running:
                return self._items
            self._running = True
            target = now
        threading.Thread(target=self._job, args=(target,), daemon=True).start()
        return self._items

    def _job(self, target):
        try:
            self._do_refresh(target)
        finally:
            with self._lock:
                self._running = False

    def _do_refresh(self, now):
        raw_brvm = _fetch_brvm()
        raw_presse = []
        for q in GOOGLE_QUERIES:
            raw_presse.extend(_fetch_google(q))
        for q in BING_QUERIES:
            raw_presse.extend(_fetch_bing(q))
        for label, url in DIRECT_FEEDS:
            raw_presse.extend(_fetch_direct(label, url))

        raw_societes = []
        try:
            from .company_feed import cached_fetch_all
            from ..database import SessionLocal
            from ..models.company import Company
            db = SessionLocal()
            try:
                sites = [
                    {"symbol": c.symbol, "name": c.name, "url": c.website}
                    for c in db.query(Company).all()
                    if c.website and c.website.startswith(("http://", "https://"))
                ]
            finally:
                db.close()
            raw_societes = cached_fetch_all(sites)
        except Exception as e:
            _log.warning("Company feed failed: %s", e)

        now_iso = now.isoformat()

        def enrich(raw, default_src, category, relevant=True):
            out = []
            for it in raw:
                title = it["title"]
                parsed = _parse_date(it["date"])
                it["date"] = (parsed.astimezone(timezone.utc).isoformat() if parsed else now_iso)
                src = it["source"] or default_src
                it["category"] = category
                it["source"] = src[:60]
                if relevant and not _is_relevant(title + " " + src, src):
                    continue
                out.append(it)
            return out

        societes = _dedup(enrich(raw_societes, "Société", "Société", relevant=False))[:MAX_SOCIETES]
        brvm = _dedup(enrich(raw_brvm, "BRVM", "BRVM"))[:MAX_BRVM]
        presse = _dedup(enrich(raw_presse, "Presse", "Presse"))
        presse.sort(key=lambda x: x.get("date") or now_iso, reverse=True)
        presse = presse[:MAX_PRESSE]

        items = societes + brvm + presse
        items.sort(key=lambda x: x.get("date") or now_iso, reverse=True)

        with self._lock:
            self._items = items[:MAX_ITEMS]
            self.brvm = brvm
            self.presse = presse
            self.societes = societes
            self._fetched_at = now

        try:
            _persist(items)
        except Exception as e:
            _log.warning("News persist failed: %s", e)
        _log.info("News feed: %d items (%d sociétés, %d BRVM, %d presse)", len(self._items), len(self.societes), len(self.brvm), len(self.presse))


news_feed = NewsFeed()


def company_news(symbol: str, name: str = "", limit: int = 10) -> list:
    """News de l'entreprise : uniquement les items officiels de son flux
    (match exact du symbole) et, à défaut, les articles presse dont le
    titre mentionne le nom complet de l'entreprise."""
    items = news_feed.refresh()
    symbol = (symbol or "").upper().strip()
    name_key = re.sub(
        r"[^a-z0-9]+", "",
        (name or "").lower()
        .replace("cote d'ivoire", "").replace("côte d'ivoire", "")
    )
    exact = []
    loose = []
    for it in items:
        if symbol and it.get("symbol") and str(it.get("symbol")).upper() == symbol:
            exact.append(it)
            continue
        if not name_key or len(name_key) < 5 or it.get("category") != "Presse":
            continue
        title_key = re.sub(r"[^a-z0-9]+", "", (it.get("title") or "").lower())
        if name_key in title_key:
            loose.append(it)
    seen = {it.get("url_real") or it.get("url") for it in exact + loose}
    if symbol:
        try:
            from ..database import SessionLocal
            from ..models.news import NewsItem
            db = SessionLocal()
            try:
                rows = (
                    db.query(NewsItem)
                    .filter(NewsItem.symbol == symbol)
                    .order_by(NewsItem.published_at.desc())
                    .limit(limit)
                    .all()
                )
            finally:
                db.close()
            exact.extend(r for r in map(_to_dict, rows) if r["url_real"] not in seen)
        except Exception as e:
            _log.warning("Company news DB fallback failed: %s", e)
    return (exact + loose)[:limit]


def _to_dict(row) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "url": row.url,
        "url_real": row.url_real,
        "date": (row.published_at.isoformat() if row.published_at else row.created_at.isoformat()),
        "source": row.source,
        "category": row.category,
        "image": row.image or "",
        "symbol": row.symbol,
    }


def _persist(items: list) -> int:
    """Upsert des items agrégés en base (clé : url_real). Retourne le nombre
    de nouvelles entrées."""
    from ..database import SessionLocal
    from ..models.news import NewsItem
    db = SessionLocal()
    n_new = 0
    try:
        for it in items:
            url_real = it.get("url_real") or it.get("url")
            if not url_real or len(url_real) > 600:
                continue
            existing = db.query(NewsItem).filter(NewsItem.url_real == url_real).first()
            if existing:
                continue
            try:
                published = datetime.fromisoformat(it["date"]) if it.get("date") else None
                if published and published.tzinfo is not None:
                    published = published.astimezone(timezone.utc).replace(tzinfo=None)
            except Exception:
                published = None
            db.add(NewsItem(
                url_real=url_real,
                url=it.get("url") or url_real,
                title=(it.get("title") or "")[:300],
                source=(it.get("source") or "")[:100],
                category=(it.get("category") or "")[:50],
                image=(it.get("image") or "")[:600],
                symbol=(it.get("symbol") or "")[:20] or None,
                published_at=published,
            ))
            n_new += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    return n_new


def history(limit: int = 200, since: datetime = None) -> list:
    """Items persistés (année en cours par défaut) fusionnés avec le cache
    mémoire frais : les news ne disparaissent plus entre deux refresh."""
    from ..database import SessionLocal
    from ..models.news import NewsItem
    since = since or datetime(now_utc().year, 1, 1, tzinfo=timezone.utc)
    since_naive = since.astimezone(timezone.utc).replace(tzinfo=None)
    cached = news_feed.refresh()
    db = SessionLocal()
    try:
        rows = (
            db.query(NewsItem)
            .filter(NewsItem.published_at >= since_naive)
            .order_by(NewsItem.published_at.desc())
            .limit(500)
            .all()
        )
    finally:
        db.close()
    merged = {it.get("url_real") or it.get("url"): it for it in cached}
    for row in rows:
        merged.setdefault(row.url_real, _to_dict(row))
    items = list(merged.values())
    items.sort(key=lambda x: x.get("date") or "", reverse=True)
    return items[:limit]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)