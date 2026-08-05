"""Intégration Supabase : validation JWT (JWKS ES256), admin Auth API, Storage.

- verify_supabase_jwt : validation locale des tokens GoTrue (aucun appel réseau,
  clés JWKS mises en cache).
- admin_* : appels Admin API (service_role) pour la migration des comptes.
- storage_* : upload / téléchargement / URL signée du bucket "uploads".
"""

import base64
import json
import logging
import time
import uuid
from typing import Any, Optional

import httpx
import jwt as pyjwt
from jwt import PyJWKClient

from ..config import settings

logger = logging.getLogger(__name__)

_jwks_client: Optional[PyJWKClient] = None
_jwks_fetched_at: float = 0.0


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client, _jwks_fetched_at
    now = time.time()
    if _jwks_client is None or now - _jwks_fetched_at > settings.SUPABASE_JWT_REFRESH:
        url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
        _jwks_client = PyJWKClient(url, cache_keys=True)
        _jwks_fetched_at = now
    return _jwks_client


def verify_supabase_jwt(token: str) -> Optional[dict]:
    """Valide un JWT GoTrue et renvoie les claims (sub, email, role, aal…)."""
    if not token or not settings.SUPABASE_URL:
        return None
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            options={"verify_aud": False, "verify_iss": False},
            leeway=30,
        )
    except Exception:
        return None
    if not claims.get("sub"):
        return None
    return claims


def _headers() -> dict:
    return {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def admin_find_user_by_email(email: str) -> Optional[dict]:
    """Recherche un utilisateur auth.users par email (Admin API).

    Le paramètre `email` n'est pas un filtre supporté par GoTrue : on récupère
    la liste (paginée) et on filtre côté client.
    """
    email_l = (email or "").lower()
    page = 1
    try:
        while page <= 50:
            r = httpx.get(
                f"{settings.SUPABASE_URL}/auth/v1/admin/users",
                params={"page": page, "per_page": 1000},
                headers=_headers(),
                timeout=15,
            )
            r.raise_for_status()
            data = r.json()
            users = data if isinstance(data, list) else data.get("users", [])
            for u in users:
                if (u.get("email") or "").lower() == email_l:
                    return u
            if len(users) < 1000:
                break
            page += 1
        return None
    except Exception as e:
        logger.warning(f"Supabase admin_find_user_by_email: {e}")
        return None


def admin_create_user(email: str, password: str, name: str = "") -> Optional[dict]:
    """Crée un utilisateur auth.users (email confirmé d'office — migration)."""
    try:
        r = httpx.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers=_headers(),
            json={"email": email, "password": password, "email_confirm": True,
                  "user_metadata": {"full_name": name}},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Supabase admin_create_user: {e} ({getattr(e, 'response', None) and e.response.text[:200]})")
        return None


def admin_set_password(uid: str, password: str) -> bool:
    """Force un nouveau mot de passe (ré-hachage argon2 par Supabase)."""
    try:
        r = httpx.put(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}",
            headers=_headers(),
            json={"password": password},
            timeout=20,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f"Supabase admin_set_password: {e}")
        return False


def admin_user(uid: str) -> Optional[dict]:
    try:
        r = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}",
            headers=_headers(),
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def storage_upload(bucket: str, path: str, content: bytes, content_type: str = "application/octet-stream") -> bool:
    """Upload d'un objet dans un bucket (service_role)."""
    try:
        r = httpx.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
            headers={
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
                "Content-Type": content_type,
                "x-upsert": "true",
            },
            content=content,
            timeout=30,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f"Supabase storage_upload: {e}")
        return False


def storage_download(bucket: str, path: str) -> Optional[bytes]:
    try:
        r = httpx.get(
            f"{settings.SUPABASE_URL}/storage/v1/object/{bucket}/{path}",
            headers={
                "apikey": settings.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
            },
            timeout=30,
        )
        r.raise_for_status()
        return r.content
    except Exception:
        return None


def storage_signed_url(bucket: str, path: str, expires_in: int = 3600) -> Optional[str]:
    try:
        r = httpx.post(
            f"{settings.SUPABASE_URL}/storage/v1/object/sign/{bucket}/{path}",
            headers=_headers(),
            json={"expiresIn": expires_in},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()
        return f"{settings.SUPABASE_URL}/storage/v1{data.get('signedURL', '')}"
    except Exception:
        return None
