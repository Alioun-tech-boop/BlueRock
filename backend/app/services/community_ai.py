"""Moteur IA léger de la communauté (Phase 7).

Pas d'API LLM externe : le moteur combine un détecteur de toxicité
(lexique + patrons) et un agrégateur d'opinion (sentiment pondéré par
l'engagement) pour produire des signaux explicables et traçables :
- Pulse : condensation de l'opinion communautaire par symbole (-100..+100)
- Watch : classement des symboles par momentum et buzz
- Toxicité : score 0..1 + décision de masquage automatique (modération assistée)
"""
import re
import math
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Détection de toxicité / abus (lexique francophone BRVM + patrons structurels)
# ---------------------------------------------------------------------------

TOXIC_LEXICON = [
    "connard", "connasse", "conne", "con ", "salope", "pute", "fdp", "enculé", "enculer",
    "enfoiré", "abruti", "crétin", "imbécile", "débile", "gros porc", "traîne", "fils de pute",
    "batard", "bâtard", "nique", "merdeux", "tocard", "taré", "dégénéré", "trou du cul",
    "couillon", "gogol", "gogole", "pd ", "pd.", "salaud", "ordure", "raclure", "fumier",
    "bouffon", "branleur", "bâtarde", "pute à", "viens dm baiser",
]

SCAM_PATTERNS = [
    "gagne ", "gagner ", "rendez", "rends-moi", "rends moi", "envoyez", "virement",
    "urgent", "gratuit", "sans risque", "argent facile", "rendre 2x", "doublez votre",
    "devenez riche", "retrait immédiat", "whatsapp", "telegram @", "groupe vip",
    "investissez maintenant", "cliquez ici", "rend 3x", "multiplicat", "portefeuille secret",
    "occaz unique", "payer en avance", "à vie", "coupon spécial",
]

LINK_RE = re.compile(r"https?://|www\.", re.IGNORECASE)
CAP_RE = re.compile(r"\b[A-Z]{5,}\b")
REPEAT_RE = re.compile(r"(.)\1{5,}")
PHONE_RE = re.compile(r"\+?\d[\d .\-]{7,}")


def ai_toxicity_score(content: str) -> float:
    """Score de toxicité 0..1 (heuristique, explicable)."""
    if not content:
        return 0.0
    text = content.lower()
    hits = 0.0
    weight = 0.0

    lex = sum(1 for w in TOXIC_LEXICON if w in text)
    hits += min(lex, 4) * 2.6
    weight += 4

    scam = sum(1 for p in SCAM_PATTERNS if p in text)
    hits += min(scam, 4) * 1.9
    weight += 4

    links = len(LINK_RE.findall(text))
    if links >= 3:
        hits += 3.0
    weight += 1

    caps = len(CAP_RE.findall(content))
    if caps >= 5 and len(content) > 150:
        hits += 2.0
    weight += 1

    repeats = len(REPEAT_RE.findall(content))
    if repeats >= 3:
        hits += 1.5
    weight += 1

    phones = len(PHONE_RE.findall(content))
    if phones >= 2:
        hits += 2.0
    weight += 1

    score = hits / weight if weight else 0.0
    return round(min(score, 1.0), 3)


def ai_is_toxic(content: str, threshold: float = 0.55) -> bool:
    """Décision binaire utilisée par la modération assistée."""
    return ai_toxicity_score(content) >= threshold


# ---------------------------------------------------------------------------
# Pulse : condensation de l'opinion communautaire par symbole
# ---------------------------------------------------------------------------

_SENTIMENT_WEIGHT = {"bullish": 1.0, "neutral": 0.0, "bearish": -1.0}


def ai_pulse_for(posts: list) -> dict:
    """Produit le pulse d'un symbole à partir d'une liste de posts visibles.

    Chaque post vote bullish(1)/neutral(0)/bearish(-1), pondéré par son
    engagement (rockets & partages). Le momentum est ramené sur -100..+100.
    """
    if not posts:
        return {
            "posts": 0, "bullish_pct": 0.0, "bearish_pct": 0.0, "neutral_pct": 0.0,
            "momentum": 0.0, "engagement": 0,
        }
    w_sum = 0.0
    vote = 0.0
    counts = {"bullish": 0, "bearish": 0, "neutral": 0}
    engagement = 0
    for p in posts:
        sent = p.sentiment if p.sentiment in _SENTIMENT_WEIGHT else "neutral"
        counts[sent] += 1
        w = 1.0 + min(len(p.reactions), 10) * 1.5 + min(len(p.shares), 5)
        w_sum += w
        vote += _SENTIMENT_WEIGHT[sent] * w
        engagement += len(p.reactions) + len(p.shares) + (p.views or 0)
    momentum = (vote / w_sum) * 100.0 if w_sum else 0.0
    total = len(posts)
    return {
        "posts": total,
        "bullish_pct": round(counts["bullish"] / total * 100, 1),
        "bearish_pct": round(counts["bearish"] / total * 100, 1),
        "neutral_pct": round(counts["neutral"] / total * 100, 1),
        "momentum": round(max(-100.0, min(100.0, momentum)), 1),
        "engagement": engagement,
    }


def ai_buzz(posts_count: int, avg_count: float) -> int:
    """Vivacité 1..10 (loi logarithme) : comparaison au volume moyen du marché."""
    if posts_count <= 0:
        return 1
    if avg_count <= 0:
        return 5
    ratio = posts_count / avg_count
    return max(1, min(10, int(round(4.0 + math.log1p(ratio) * 2.0))))


def ai_links_count(content: str) -> int:
    return len(LINK_RE.findall((content or "").lower()))