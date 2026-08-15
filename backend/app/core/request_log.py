"""Journalisation structurée des requêtes HTTP (JSON lines) + métriques.

Un seul log par requête (event=http_request) avec request_id corrélé via le
header X-Request-Id — exploitable dans le dashboard Render et tout aggregateur
de logs. L'IP est résolue comme dans le rate limiter : X-Forwarded-For n'est
honoré que si le peer est un proxy déclaré (TRUST_PROXY_IPS).
"""

import json
import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware

from .metrics import request_finished, request_started
from ..config import settings

logger = logging.getLogger(__name__)


def _client_ip(request):
    ip = request.client.host if request.client else "unknown"
    if settings.TRUST_PROXY_IPS:
        trusted = {p.strip() for p in settings.TRUST_PROXY_IPS.split(",") if p.strip()}
        xff = request.headers.get("x-forwarded-for")
        if xff and ip in trusted:
            return xff.split(",")[0].strip() or ip
    return ip


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = uuid.uuid4().hex
        method = request.method
        path = request.url.path
        client_ip = _client_ip(request)
        user_agent = (request.headers.get("user-agent") or "")[:200]
        request_started()
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        finally:
            duration = time.perf_counter() - start
            request_finished(method, path, status, duration)
            logger.info(json.dumps({
                "event": "http_request",
                "request_id": request_id,
                "method": method,
                "path": path,
                "status": status,
                "duration_ms": round(duration * 1000, 2),
                "client_ip": client_ip,
                "user_agent": user_agent,
            }, ensure_ascii=False))
        response.headers["X-Request-Id"] = request_id
        return response
