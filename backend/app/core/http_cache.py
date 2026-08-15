import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

CACHE_TTL = {
    "/api/market/overview": 120,
    "/api/market/live": 60,
    "/api/market/sparklines": 300,
    "/api/market/announcements": 120,
    "/api/market/news/article": 120,
    "/api/market/news": 120,
    "/api/market/calendar": 300,
    "/api/market/indices": 300,
    "/api/market/sectors": 300,
    "/api/companies/sectors": 300,
    "/api/companies/top-performers": 60,
    "/api/companies": 300,
    "/api/macro": 300,
    "/api/analysis/screen": 120,
    "/api/analysis/companies": 300,
    "/api/ingestion/summary": 60,
}
DEFAULT_TTL = 60
NO_CACHE_PREFIXES = (
    "/api/auth",
    "/api/portfolio",
    "/api/notifications",
    "/api/kyc",
    "/api/premium",
    "/api/community",
    "/api/brokers",
    "/api/broker-connect",
    "/api/seed",
    "/api/ingestion/pdf",
    "/api/ingestion/fetch",
    "/api/market/refresh",
    "/api/analysis/ask",
    "/api/health",
    "/api/metrics",
)
MAX_ENTRIES = 512
MAX_BODY = 2_000_000


class ResponseCacheMiddleware(BaseHTTPMiddleware):
    """Cache mémoire TTL pour les GET publics (réduit les accès DB à chaque clic)."""

    def __init__(self, app):
        super().__init__(app)
        self._cache = {}

    def _ttl(self, path):
        for prefix, ttl in CACHE_TTL.items():
            if path.startswith(prefix):
                return ttl
        return DEFAULT_TTL

    def _cacheable(self, request):
        if request.method != "GET":
            return False
        path = request.url.path
        if path.endswith(("/favicon.ico", "/robots.txt")):
            return False
        return not any(path.startswith(p) for p in NO_CACHE_PREFIXES)

    def _prune(self):
        now = time.time()
        expired = [k for k, v in self._cache.items() if v["expires"] < now]
        for k in expired:
            del self._cache[k]
        if len(self._cache) > MAX_ENTRIES:
            self._cache.clear()

    async def dispatch(self, request, call_next):
        if self._cacheable(request):
            key = request.url.path + request.url.query
            entry = self._cache.get(key)
            if entry and entry["expires"] > time.time():
                return Response(
                    content=entry["body"],
                    status_code=200,
                    media_type=entry["content_type"],
                    headers={
                        "X-Cache": "HIT",
                        "Cache-Control": f"public, max-age={self._ttl(request.url.path)}",
                    },
                )

        response = await call_next(request)

        if self._cacheable(request) and response.status_code == 200:
            body = b"".join([chunk async for chunk in response.body_iterator])
            response = Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )
            if 0 < len(body) <= MAX_BODY:
                self._prune()
                self._cache[key] = {
                    "body": body,
                    "content_type": response.media_type,
                    "expires": time.time() + self._ttl(request.url.path),
                }
            response.headers["X-Cache"] = "MISS"
            response.headers["Cache-Control"] = f"public, max-age={self._ttl(request.url.path)}"

        return response
