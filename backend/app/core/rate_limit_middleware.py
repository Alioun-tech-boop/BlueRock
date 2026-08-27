"""Rate limiting middleware global (multi-niveaux).

Protège TOUTES les routes, y compris celles sans check_rate_limit local :
une limite globale par IP + des limites par préfixe pour les endpoints
sensibles (auth, paiements, admin, KYC, courtiers…).

L'état vit dans le SharedStore (Redis si configuré, sinon mémoire par
processus). Invoqué en premier dans la chaîne middleware : les requêtes
limitées sont rejetées sans toucher au cache ni aux logs de requête.
"""
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from ..config import settings
from .rate_limit import _ip_key
from .shared_store import store

# (préfixe, limite, fenêtre en secondes)
PREFIX_RULES = [
    ("/api/health", 60, 60),
    ("/api/metrics", 20, 60),
    ("/api/auth", 20, 60),
    ("/api/kyc", 10, 60),
    ("/api/broker-connect", 10, 60),
    ("/api/payments", 15, 60),
    ("/api/subscription", 15, 60),
    ("/api/admin", 10, 60),
    ("/api/seed", 10, 60),
    ("/api/ingestion", 10, 60),
    ("/api/ai", 30, 60),
    ("/api/portfolio", 45, 60),
    ("/api/community", 180, 60),
    ("/api/challenges", 30, 60),
    ("/api/notifications", 20, 60),
    ("/api/premium", 20, 60),
    ("/api/brokers", 20, 60),
    ("/api/market/refresh", 10, 60),
]

GLOBAL_LIMIT = 240
GLOBAL_WINDOW = 60


def _bucket_allowed(bucket: str, limit: int, window: int) -> tuple[bool, int]:
    """Compte un appel dans le bucket. Retourne (autorisé, secondes restantes)."""
    count = store.incr(bucket, ttl=window)
    if count == 1:
        store.set(bucket + ":s", str(time.time()), ttl=window)
    if count <= limit:
        return True, 0
    start_raw = store.get(bucket + ":s")
    try:
        start = float(start_raw) if start_raw else None
        remaining = int(start + window - time.time() + 1) if start else window
    except (TypeError, ValueError):
        remaining = window
    return False, max(1, remaining)


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        ip = _ip_key(request)
        path = request.url.path

        allowed, remaining = _bucket_allowed(f"rl:g:{ip}", GLOBAL_LIMIT, GLOBAL_WINDOW)
        if not allowed:
            return self._reject(remaining)

        for prefix, limit, window in PREFIX_RULES:
            if path.startswith(prefix):
                allowed, remaining = _bucket_allowed(f"rl:m:{ip}{prefix}", limit, window)
                if not allowed:
                    return self._reject(remaining)
                break

        return await call_next(request)

    @staticmethod
    def _reject(remaining: int) -> JSONResponse:
        return JSONResponse(
            status_code=429,
            content={"detail": f"Trop de requêtes. Réessayez dans {remaining}s."},
            headers={"Retry-After": str(remaining)},
        )