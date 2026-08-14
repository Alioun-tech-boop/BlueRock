"""Middleware de protection CSRF pour FastAPI.

Implémente le pattern Synchronizer Token :
- Génère un token CSRF unique par session
- Stocke le token dans un cookie HTTP-only
- Valide le token présent dans le header X-CSRF-Token pour les méthodes sensibles
"""
import secrets
from typing import Callable

from fastapi import Request, Response, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

from ..config import settings


class CSRFMiddleware(BaseHTTPMiddleware):
    """Middleware CSRF pour protéger les méthodes d'état changeant."""

    def __init__(
        self,
        app: ASGIApp,
        cookie_name: str = "csrf_token",
        header_name: str = "X-CSRF-Token",
        safe_methods: set = {"GET", "HEAD", "OPTIONS", "TRACE"},
        exempt_routes: set = None,
    ):
        super().__init__(app)
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.safe_methods = safe_methods
        self.exempt_routes = exempt_routes or {
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/seed",  # endpoints de seed public
            "/docs",  # Swagger UI
            "/redoc",  # ReDoc
            "/openapi.json",  # schéma OpenAPI
        }
        # Durée de vie du cookie CSRF (1 jour)
        self.cookie_max_age = 60 * 60 * 24

    def _generate_csrf_token(self) -> str:
        """Génère un token CSRF cryptographiquement sécurisé."""
        return secrets.token_urlsafe(32)

    def _get_token_from_request(self, request: Request) -> str | None:
        """Extrait le token CSRF du header ou du corps de la requête."""
        # Essayer le header X-CSRF-Token
        token = request.headers.get(self.header_name)
        if token:
            return token

        # Pour les formulaires, essayer le corps (application/x-www-form-urlencoded)
        # Note: ceci nécessite que le corps soit lu, ce qui peut affecter les performances
        # En production, privilégier l'approche header
        return None

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Exempter les routes spécifiques
        if request.url.path in self.exempt_routes:
            return await call_next(request)

        # Exempter les méthodes sûres (lecture seule)
        if request.method in self.safe_methods:
            response = await call_next(request)
            # S'assurer qu'un cookie CSRF est présent pour les prochaines requêtes
            if self.cookie_name not in request.cookies:
                token = self._generate_csrf_token()
                response.set_cookie(
                    key=self.cookie_name,
                    value=token,
                    max_age=self.cookie_max_age,
                    httponly=True,
                    secure=not settings.DEBUG,  # HTTPS en prod
                    samesite="strict",
                )
            return response

        # Pour les méthodes d'état changeant, valider le token CSRF
        csrf_token_cookie = request.cookies.get(self.cookie_name)
        csrf_token_request = self._get_token_from_request(request)

        # Vérifications de sécurité
        if not csrf_token_cookie:
            raise HTTPException(
                status_code=403,
                detail="Token CSRF manquant dans les cookies",
            )

        if not csrf_token_request:
            raise HTTPException(
                status_code=403,
                detail="Token CSRF manquant dans la requête",
            )

        if not secrets.compare_digest(csrf_token_cookie, csrf_token_request):
            raise HTTPException(
                status_code=403,
                detail="Token CSRF invalide",
            )

        # Token valide, poursuivre le traitement
        response = await call_next(request)
        return response


def setup_csrf_middleware(app):
    """Configure le middleware CSRF sur l'application FastAPI."""
    app.add_middleware(
        CSRFMiddleware,
        cookie_name="bluerock_csrf_token",
        header_name="X-CSRF-Token",
        exempt_routes={
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/refresh",
            "/api/auth/verify-email",
            "/api/auth/password-reset",
            "/api/auth/password-reset/confirm",
            "/api/seed",
            "/docs",
            "/redoc",
            "/openapi.json",
            "/api/market/overview",  # endpoints publics de marché
            "/api/market/live",
            "/api/companies",
            "/api/companies/top-performers",
        },
    )