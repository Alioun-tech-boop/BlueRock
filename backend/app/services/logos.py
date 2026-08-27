"""Résolution des logos des sociétés cotées.

Priorité :
1. Fichier local /static/logos/<SYMBOLE>.<ext> (scanné au premier appel).
2. Champ website s'il pointe déjà vers /static/logos/.
3. Avatar lettre (ui-avatars) en secours.

Le champ website contient l'URL du site officiel (ex. https://sonatel.sn),
jamais une image : on ne l'utilise donc jamais directement comme logo.
"""
import os

FALLBACK_COLORS = ["0b2545", "16375f", "224b7a", "2e5f95", "3a73b0"]

def _resolve_logo_dir():
    # Supporte les deux emplacements : backend/static/logos (dev) et backend/app/static/logos (Docker)
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates = [
        os.path.join(base, "static", "logos"),
        os.path.join(base, "app", "static", "logos"),
    ]
    for p in candidates:
        if os.path.isdir(p):
            return p
    return candidates[0]

LOGO_DIR = _resolve_logo_dir()

_LOGO_BY_SYMBOL = None


def _scan():
    global _LOGO_BY_SYMBOL
    _LOGO_BY_SYMBOL = {}
    try:
        for f in os.listdir(LOGO_DIR):
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".ico", ".webp")):
                _LOGO_BY_SYMBOL[f.rsplit(".", 1)[0].upper()] = "/static/logos/" + f
    except OSError:
        _LOGO_BY_SYMBOL = {}


def logo_path_by_symbol(symbol: str) -> str | None:
    if _LOGO_BY_SYMBOL is None:
        _scan()
    return _LOGO_BY_SYMBOL.get((symbol or "").upper())


def resolve_logo_url(symbol: str, website: str | None = None, api_base: str = "") -> str:
    """URL complète (absolue) du logo d'une société."""
    path = logo_path_by_symbol(symbol)
    if not path and website and website.startswith("/static/logos/"):
        path = website
    if path:
        return api_base.rstrip("/") + path
    initial = (symbol or "?")[0].upper()
    color = FALLBACK_COLORS[sum(ord(c) for c in (symbol or "")) % len(FALLBACK_COLORS)]
    return f"https://ui-avatars.com/api/?name={initial}&background={color}&color=fff&size=64"
