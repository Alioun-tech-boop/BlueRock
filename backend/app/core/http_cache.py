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
# Routes jamais mises en cache (données privées ou mutables).
# Les routes Pro (companies NGX, market NGX) restent cachables MAIS avec Vary: Authorization
# pour éviter qu'un Basic ne reçoive le cache d'un Pro.
NO_CACHE_PREFIXES = (
    "/api/auth",
    "/api/admin",
    "/api/portfolio",
    "/api/payments",
    "/api/subscription",
    "/api/challenges",
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
    "/api/ai/export",
    "/api/ai",
)
# Préfixes dont la réponse dépend du tier (Pro vs Basic) — cache séparé par auth
TIER_VARY_PREFIXES = (
    "/api/companies",
    "/api/market/overview",
    "/api/market/sparklines",
    "/api/market/indices",
    "/api/market/sectors",
    "/api/analysis/screen",
    "/api/analysis/companies",
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
            # LRU: supprime les plus anciennes (par expires) au lieu de tout purger
            sorted_keys = sorted(self._cache.keys(), key=lambda k: self._cache[k]["expires"])
            # Supprime 25% des plus anciennes pour lisser le thundering herd
            for k in sorted_keys[: MAX_ENTRIES // 4]:
                self._cache.pop(k, None)

    def _cache_key(self, request) -> str:
        # Clé stable: path + query triée + variation par auth pour routes Pro
        path = request.url.path
        # Trie les params pour éviter double miss ?a=1&b=2 vs ?b=2&a=1
        query = request.url.query
        if query:
            try:
                from urllib.parse import parse_qsl, urlencode
                params = parse_qsl(query, keep_blank_values=True)
                params.sort()
                query = urlencode(params)
            except Exception:
                pass
        key = path + (f"?{query}" if query else "")
        # Variation par tier/auth pour routes sensibles
        if any(path.startswith(p) for p in TIER_VARY_PREFIXES):
            auth = request.headers.get("authorization", "")
            if auth:
                import hashlib
                # Hash court du token pour séparer Pro/Basic sans exposer le token
                key += f"|auth:{hashlib.sha256(auth.encode()).hexdigest()[:12]}"
            else:
                key += "|auth:anon"
        return key

    async def dispatch(self, request, call_next):
        cacheable = self._cacheable(request)
        key = self._cache_key(request) if cacheable else None
        if cacheable:
            entry = self._cache.get(key)
            if entry and entry["expires"] > time.time():
                # Respecte Vary pour Pro routes
                headers = {
                    "X-Cache": "HIT",
                    "Cache-Control": entry.get("cache_control", f"public, max-age={self._ttl(request.url.path)}"),
                }
                if entry.get("vary"):
                    headers["Vary"] = entry["vary"]
                return Response(
                    content=entry["body"],
                    status_code=200,
                    media_type=entry["content_type"],
                    headers=headers,
                )

        response = await call_next(request)

        if cacheable and response.status_code == 200:
            # Ne pas cacher StreamingResponse volumineuses (PDF) sans bufferiser entièrement en cas de grande taille
            try:
                body = b"".join([chunk async for chunk in response.body_iterator])
            except Exception:
                return response
            # Reconstruit la réponse (body_iterator consommé)
            response = Response(
                content=body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )
            if 0 < len(body) <= MAX_BODY:
                self._prune()
                # Cache-Control: private si authentifié sur route Pro, sinon public
                path = request.url.path
                is_vary = any(path.startswith(p) for p in TIER_VARY_PREFIXES)
                has_auth = bool(request.headers.get("authorization"))
                if is_vary and has_auth:
                    cc = f"private, max-age={self._ttl(path)}"
                    vary = "Authorization"
                else:
                    cc = f"public, max-age={self._ttl(path)}"
                    vary = "Authorization" if is_vary else None
                self._cache[key] = {
                    "body": body,
                    "content_type": response.media_type,
                    "expires": time.time() + self._ttl(path),
                    "cache_control": cc,
                    "vary": vary,
                }
                response.headers["X-Cache"] = "MISS"
                response.headers["Cache-Control"] = cc
                if vary:
                    response.headers["Vary"] = vary
            else:
                response.headers["X-Cache"] = "MISS"
                if not response.headers.get("Cache-Control"):
                    response.headers["Cache-Control"] = f"public, max-age={self._ttl(request.url.path)}"
            # Recalcule Content-Length si présent
            if "content-length" in response.headers:
                response.headers["content-length"] = str(len(body))

        return response
