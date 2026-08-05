"""Rate limiting en mémoire par IP (sans dépendance externe).

Bucket glissant simple : (clé, [timestamps]). Purge périodique des entrées
anciennes pour éviter la fuite mémoire.
"""
import threading
import time
from collections import defaultdict
from fastapi import HTTPException

from ..config import settings

_buckets: dict[str, list[float]] = defaultdict(list)
_lock = threading.Lock()


def _ip_key(request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(request, limit: int, window_seconds: int = 60) -> None:
    """Lève HTTPException 429 si la limite est dépassée pour l'IP."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    key = f"{_ip_key(request)}:{request.url.path}"
    now = time.monotonic()
    with _lock:
        ts = _buckets[key]
        cutoff = now - window_seconds
        ts[:] = [t for t in ts if t > cutoff]
        if len(ts) >= limit:
            raise HTTPException(
                status_code=429,
                detail=f"Trop de requêtes. Réessayez dans {int(cutoff + window_seconds - now + 1)}s.",
            )
        ts.append(now)
        # purge globale périodique (toutes les ~1000 insertions)
        if len(_buckets) > 10000:
            for k in [k for k, v in _buckets.items() if not v or v[-1] < now - window_seconds]:
                del _buckets[k]
