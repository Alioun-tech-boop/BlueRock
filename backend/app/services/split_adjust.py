"""Ajustement des prix historiques pour opérations sur capital.

Détecte les sauts de cours extrêmes entre deux séances consécutives
(réduction de capital par annulation de titres, regroupement d'actions,
split) et multiplie tous les prix antérieurs par le ratio mesuré, afin de
rendre la série continue pour l'affichage graphique (données brutes
inchangées en base).
"""
from typing import Optional

# Chute > 70 % ou hausse > 233 % d'une séance à l'autre : opération sur
# capital quasi certaine (impossible sur un marché réel sans annulation).
MIN_RATIO = 0.30
MAX_RATIO = 3.34


def detect_adjustments(closes: list[Optional[float]]) -> list[tuple[int, float]]:
    """Retourne [(index, ratio)] pour chaque événement détecté.

    ratio = close[i] / close[i-1] : les prix d'indice < i doivent être
    multipliés par ce ratio pour continuer la série.
    """
    events: list[tuple[int, float]] = []
    for i in range(1, len(closes)):
        prev, cur = closes[i - 1], closes[i]
        if prev is None or cur is None or prev == 0:
            continue
        r = cur / prev
        if r < MIN_RATIO or r > MAX_RATIO:
            events.append((i, r))
    return events


def adjust_rows(rows: list[dict]) -> list[dict]:
    """Applique les facteurs cumulés aux champs open/high/low/close de chaque
    ligne (dates triées croissantes). Modifie la liste en place et la renvoie."""
    n = len(rows)
    if n < 2:
        return rows
    closes = [r.get("close") for r in rows]
    factors = [1.0] * n
    events = detect_adjustments(closes)
    for idx, ratio in events:
        for j in range(idx):
            factors[j] *= ratio
    if not events:
        return rows
    for i, row in enumerate(rows):
        f = factors[i]
        if f == 1.0:
            continue
        for key in ("open", "high", "low", "close", "open_price", "high_price", "low_price", "close_price"):
            v = row.get(key)
            if v is not None:
                row[key] = round(v * f, 4)
    return rows
