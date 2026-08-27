"""Bibliothèque quantitative déterministe de Bluerock AI.

Toutes les fonctions sont pures, déterministes et n'utilisent jamais de LLM.
Un résultat non calculable est exprimé par None (affiché « N/A » côté UI) :
aucune valeur n'est inventée.
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

TRADING_DAYS = 252


def pct_change(old: float, new: float) -> Optional[float]:
    if old is None or new is None or old == 0:
        return None
    return (new - old) / abs(old)


def daily_returns(closes: Sequence[float]) -> list[float]:
    out: list[float] = []
    prev = None
    for c in closes:
        if c is None or c <= 0:
            prev = None
            continue
        if prev is not None:
            out.append((c - prev) / prev)
        prev = c
    return out


def series_return(closes: Sequence[float], lookback: Optional[int] = None) -> Optional[float]:
    """Rendement simple sur les N dernières clôtures (ou toute la série)."""
    if not closes:
        return None
    end = closes[-1]
    if end is None or end <= 0:
        return None
    if lookback is None:
        start = next((c for c in closes if c is not None), None)
    else:
        idx = min(lookback, len(closes) - 1)
        start = closes[-1 - idx]
    if start is None or start <= 0:
        return None
    return (end - start) / start


def annualized_volatility(returns: Sequence[float], periods: int = TRADING_DAYS) -> Optional[float]:
    if len(returns) < 2:
        return None
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / (len(returns) - 1)
    if var <= 0:
        return None
    return math.sqrt(var * periods)


def annualized_return(returns: Sequence[float], periods: int = TRADING_DAYS) -> Optional[float]:
    if not returns:
        return None
    total = 1.0
    for r in returns:
        total *= (1 + r)
    if total <= 0:
        return None
    years = len(returns) / periods
    if years <= 0:
        return None
    return total ** (1 / years) - 1


def max_drawdown(values: Sequence[float]) -> Optional[float]:
    """Drawdown maximum (négatif) à partir d'une série de valeurs."""
    peak: Optional[float] = None
    max_dd = 0.0
    for v in values:
        if v is None or v <= 0:
            continue
        peak = v if peak is None else max(peak, v)
        if peak > 0:
            dd = (v - peak) / peak
            if dd < max_dd:
                max_dd = dd
    return max_dd if peak is not None else None


def downside_deviation(
    returns: Sequence[float], target: float = 0.0, periods: int = TRADING_DAYS
) -> Optional[float]:
    if len(returns) < 2:
        return None
    sq = sum((r - target) ** 2 for r in returns if r < target) / len(returns)
    if sq <= 0:
        return None
    return math.sqrt(sq * periods)


def sharpe_ratio(
    returns: Sequence[float], rf: float = 0.065, periods: int = TRADING_DAYS
) -> Optional[float]:
    ann = annualized_return(returns, periods)
    vol = annualized_volatility(returns, periods)
    if ann is None or vol is None or vol <= 0:
        return None
    return (ann - rf) / vol


def sortino_ratio(
    returns: Sequence[float], rf: float = 0.065, periods: int = TRADING_DAYS
) -> Optional[float]:
    ann = annualized_return(returns, periods)
    dd = downside_deviation(returns, target=rf, periods=periods)
    if ann is None or dd is None or dd <= 0:
        return None
    return (ann - rf) / dd


def beta(stock_returns: Sequence[float], market_returns: Sequence[float]) -> Optional[float]:
    if len(stock_returns) < 3 or len(stock_returns) != len(market_returns):
        return None
    n = len(stock_returns)
    sm = sum(stock_returns) / n
    mm = sum(market_returns) / n
    num = sum((s - sm) * (m - mm) for s, m in zip(stock_returns, market_returns))
    den = sum((m - mm) ** 2 for m in market_returns)
    if den <= 0:
        return None
    return num / den


def var_95(returns: Sequence[float], periods: int = TRADING_DAYS) -> Optional[float]:
    """VaR 95 % annualisée (positive = perte potentielle)."""
    if len(returns) < 20:
        return None
    sorted_r = sorted(returns)
    idx = max(0, min(len(sorted_r) - 1, int(round(0.05 * len(sorted_r))) - 1))
    return abs(sorted_r[idx]) * math.sqrt(periods)


def cvar_95(returns: Sequence[float], periods: int = TRADING_DAYS) -> Optional[float]:
    if len(returns) < 20:
        return None
    sorted_r = sorted(returns)
    idx = max(1, int(round(0.05 * len(sorted_r))))
    tail = sorted_r[:idx]
    return abs(sum(tail) / len(tail)) * math.sqrt(periods)


def risk_score(
    vol: Optional[float],
    beta: Optional[float],
    max_dd: Optional[float],
) -> Optional[float]:
    """Score de risque 0 (sûr) → 100 (très risqué)."""
    parts: list[float] = []
    if vol is not None:
        parts.append(min(100.0, max(0.0, (vol / 0.5) * 100)))
    if beta is not None:
        parts.append(min(100.0, max(0.0, 25.0 + (beta - 0.5) / 1.5 * 100)))
    if max_dd is not None:
        parts.append(min(100.0, max(0.0, (abs(max_dd) / 0.5) * 100)))
    return round(sum(parts) / len(parts), 1) if parts else None


def momentum_score(closes: Sequence[float]) -> Optional[float]:
    """Score de momentum -100..100 : pondération 1M/3M/6M/12M."""
    if not closes:
        return None
    vals: list[float] = []
    for lookback, w in ((21, 0.2), (63, 0.3), (126, 0.3), (252, 0.2)):
        r = series_return(closes, lookback)
        if r is not None:
            clipped = max(-0.5, min(0.5, r))
            vals.append((clipped / 0.5) * 100 * w)
    return round(sum(vals), 1) if vals else None


def to_0_100(value: Optional[float], lo: float = -100.0, hi: float = 100.0) -> Optional[float]:
    """Normalise une valeur dans [lo, hi] vers [0, 100] (None si absente)."""
    if value is None:
        return None
    if hi == lo:
        return 50.0
    clipped = max(lo, min(hi, value))
    return round((clipped - lo) / (hi - lo) * 100, 1)


def zscore(values: Sequence[float]) -> Optional[float]:
    """Score standard du dernier élément de la série."""
    if len(values) < 2:
        return None
    mean = sum(values) / len(values)
    var = sum((v - mean) ** 2 for v in values) / (len(values) - 1)
    if var <= 0:
        return None
    std = math.sqrt(var)
    return (values[-1] - mean) / std


def correlation(series_a: Sequence[float], series_b: Sequence[float]) -> Optional[float]:
    """Corrélation de Pearson entre deux séries alignées (None si données insuffisantes)."""
    if len(series_a) < 3 or len(series_a) != len(series_b):
        return None
    n = len(series_a)
    ma = sum(series_a) / n
    mb = sum(series_b) / n
    num = sum((a - ma) * (b - mb) for a, b in zip(series_a, series_b))
    da = sum((a - ma) ** 2 for a in series_a)
    db = sum((b - mb) ** 2 for b in series_b)
    if da <= 0 or db <= 0:
        return None
    return num / math.sqrt(da * db)


def herfindahl(weights: Sequence[float]) -> Optional[float]:
    """Indice de concentration de Herfindahl (1 = totalement concentré)."""
    if not weights:
        return None
    total = sum(abs(w) for w in weights)
    if total <= 0:
        return None
    return round(sum((w / total) ** 2 for w in weights), 4)
