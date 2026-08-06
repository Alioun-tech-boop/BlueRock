"""Lecture d'articles de presse : récupération du contenu complet d'un article
pour lecture intégrée dans le logiciel (plus besoin d'ouvrir le site externe).

Sources : liens issus du flux news (Google News redirect, Financial Afrik, Sika Finance...).
Le contenu est extrait par heuristiques (balises article/paragraphs) et mis en cache
en mémoire avec TTL pour ne pas marteler les sites sources.
"""
import logging
import threading
import re
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx

_log = logging.getLogger(__name__)

CACHE_TTL = 900  # 15 minutes
CACHE_MAX = 200
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0"
)
BLOCKED_HOSTS = ("localhost", "127.0.0.1", "::1", "0.0.0.0")


def _clean(s):
    return re.sub(r"\s+", " ", s or "").strip()


class ArticleContent:
    def __init__(self):
        self._lock = threading.Lock()
        self._cache = {}
        self._order = []

    def get(self, url: str):
        """Retourne le contenu d'un article (cache + fetch). Lève une exception
        si l'article est inaccessible ou ne contient pas de texte exploitable."""
        with self._lock:
            entry = self._cache.get(url)
            if entry:
                now = datetime.now(timezone.utc)
                if (now - entry["fetched_at"]).total_seconds() < CACHE_TTL:
                    return entry["data"]

        data = self._fetch(url)

        with self._lock:
            self._cache[url] = {"fetched_at": datetime.now(timezone.utc), "data": data}
            self._order.append(url)
            while len(self._order) > CACHE_MAX:
                old = self._order.pop(0)
                self._cache.pop(old, None)
        return data

    def _fetch(self, url: str) -> dict:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError("URL invalide")
        host = (parsed.hostname or "").lower()
        if not host or host in BLOCKED_HOSTS:
            raise ValueError("URL invalide")

        headers = {"User-Agent": USER_AGENT, "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8"}
        with httpx.Client(timeout=20, follow_redirects=True, headers=headers) as client:
            resp = client.get(url)
            resp.raise_for_status()
            html = resp.text

        # Si la réponse est un flux RSS (cas Google News : page intermédiaire),
        # on suit le lien réel du premier item.
        if "<rss" in html[:2000] or "<feed" in html[:2000]:
            real = _extract_first_link(html)
            if real:
                resp = client.get(real)
                resp.raise_for_status()
                html = resp.text

        return _extract_article(html, resp.url, url)


def _extract_first_link(xml_text: str) -> str:
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return ""
    for link in root.iter("link"):
        href = link.text or link.get("href") or ""
        href = href.strip()
        if href.startswith("http"):
            return href
    return ""


def _extract_article(html: str, final_url, original_url: str) -> dict:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "lxml")

    title = _pick([
        soup.find("meta", property="og:title"),
        soup.find("title"),
    ])
    title = _clean(title or final_url.host or "Article")

    excerpt = _pick([
        soup.find("meta", property="og:description"),
        soup.find("meta", {"name": "description"}),
    ])
    excerpt = _clean(excerpt)

    image = ""
    img = soup.find("meta", property="og:image")
    if img and img.get("content"):
        image = img["content"]

    article = _pick_container(soup)

    content, has_text = _extract_paragraphs(article, strict=article is soup.body)
    if not has_text:
        raise ValueError("Aucun contenu exploitable")

    source = _domain_label(final_url.host or "")
    if len(title) < 4:
        raise ValueError("Titre illisible")

    return {
        "title": title[:300],
        "url": str(final_url),
        "source": source[:60],
        "date": None,
        "image": image[:500],
        "excerpt": excerpt[:600],
        "summary": "",
        "content": content,
        "is_readable": True,
    }


def _pick(elements):
    for el in elements:
        if el is None:
            continue
        if el.name == "meta":
            val = el.get("content")
        else:
            val = el.get_text(strip=True)
        if val and len(val.strip()) > 3:
            return val.strip()
    return ""


def _pick_container(soup):
    """Choisit le conteneur principal de l'article.

    Les sites (Financial Afrik...) multiplient les balises <article> (cartes
    "grid") et certains n'ont pas de balise <main> : on priorise l'article
    dont la classe contient le token "post" + un id "post-XXXX", puis les
    conteneurs classiques, et on score chaque candidat par le nombre de
    paragraphes/titres significatifs pour écarter les widgets vides.
    """
    candidates = []
    for a in soup.find_all("article"):
        cls = [c.lower() for c in (a.get("class") or [])]
        if "post" in cls and any(c.startswith("post-") for c in cls):
            candidates.append(a)
    for sel in (
        "main",
        '[role="main"]',
        ".post-content",
        ".entry-content",
        ".article-content",
        ".post-body",
        "[class*='post-content']",
        "[class*='entry-content']",
    ):
        candidates.extend(soup.select(sel))

    best, best_score = None, 0
    for el in candidates:
        score = 0
        for p in el.find_all(["p", "h2", "h3", "blockquote"]):
            if len(_clean(p.get_text(" ", strip=True))) >= 60:
                score += 1
        if score > best_score:
            best, best_score = el, score
    if best is not None:
        return best
    return soup.body


_NOISE_CLASS = re.compile(
    r"author-?box|author-?info|related|similar|recommended|widget|comment|"
    r"social|footer|pagination|newsletter|subscribe|premium|breadcrumb|"
    r"post-nav|tags|entry-footer"
)


def _in_noise(p, node):
    for anc in p.parents:
        if anc is node:
            break
        for cls in anc.get("class", []) or []:
            if _NOISE_CLASS.search(cls.lower()):
                return True
    return False


def _extract_paragraphs(node, strict=False):
    """Récupère les paragraphes de texte significatifs, dans l'ordre.

    strict=True (repli sur <body>) exige au moins 3 paragraphes ; sinon un
    seul paragraphe exploitable suffit (beaucoup d'articles courts).
    """
    paragraphs = []
    seen = set()
    for p in node.find_all(["p", "h2", "h3", "blockquote"]):
        text = _clean(p.get_text(" ", strip=True))
        if not text or len(text) < 60:
            continue
        if _in_noise(p, node):
            continue
        # Ignore les évidences de widgets (nav, menus, captions)
        if re.search(
            r"^(menu|navigation|accueil|connexion|newsletter|partager|publicité|pub|"
            r"articles (liés|similaires|recommandés)|lire aussi|suivez)",
            text.lower(),
        ):
            continue
        key = re.sub(r"[^\w]+", "", text.lower())[:60]
        if key in seen:
            continue
        seen.add(key)
        paragraphs.append(text)
        if len(paragraphs) >= 60:
            break
    return paragraphs, len(paragraphs) >= (3 if strict else 1)


def _domain_label(host: str) -> str:
    parts = host.split(".")
    if len(parts) >= 2:
        return parts[-2].capitalize()
    return host.capitalize()


def summarize_article(title: str, content: list, lang: str = "fr") -> str:
    """Résumé IA (best-effort) — si aucun LLM dispo, on renvoie un extrait."""
    from ..services.llm import call_llm

    text = " ".join(content)
    prompt_lang = "en" if lang == "en" else "fr"
    system = (
        f"You are a financial news editor. Write a short {prompt_lang} summary "
        "of the article in 2-3 sentences, factual and neutral."
    )
    try:
        summ, _ = call_llm(
            system,
            f"Titre: {title}\n\n{text[:6000]}",
            max_tokens=1000,
            temperature=0.3,
        )
        if summ:
            return summ.strip()
    except Exception as e:
        _log.warning("Summarization failed: %s", e)
    return " ".join(content[:2])[:600]


article_content = ArticleContent()
