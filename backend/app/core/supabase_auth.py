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
    """Valide un JWT GoTrue et renvoie les claims (sub, email, role, aal…).

    Sécurisé : l'audience et l'émetteur sont vérifiés pour ne jamais accepter
    un token signé par une autre instance Supabase (ou un autre projet).
    """
    if not token or not settings.SUPABASE_URL:
        return None
    try:
        signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
        claims = pyjwt.decode(
            token,
            signing_key.key,
            algorithms=[signing_key.algorithm_name],
            options={"verify_aud": True, "verify_iss": True},
            audience="authenticated",
            issuer=f"{settings.SUPABASE_URL}/auth/v1",
            leeway=30,
        )
    except Exception as exc:
        logger.warning("[JWT] verification failed: %s (token_len=%d, token_prefix=%s)", exc, len(token), token[:30])
        return None
    if not claims.get("sub"):
        logger.warning("[JWT] token verified but no sub claim (claims_keys=%s, token_prefix=%s)", list(claims.keys())[:10], token[:30])
        return None
    return claims


def _headers() -> dict:
    return {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def admin_find_user_by_email(email: str, *, _local_cache: dict | None = None) -> Optional[dict]:
    """Recherche un utilisateur auth.users par email (Admin API).

    Stratégie :
    1. Cache local optionnel pour éviter les appels API répétés.
    2. Recherche dans la page 1 (les plus récents) — O(1) si l'utilisateur
       vient de s'inscrire.
    3. Fallback : scan complet page par page (rare, < 5 % des cas).
    """
    email_l = (email or "").lower()
    if not email_l:
        return None

    cache_key = f"supabase_user:{email_l}"
    if _local_cache is not None and cache_key in _local_cache:
        return _local_cache[cache_key]

    try:
        r = httpx.get(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            params={"page": 1, "per_page": 1000},
            headers=_headers(),
            timeout=20,
        )
        r.raise_for_status()
        data = r.json()
        users = data if isinstance(data, list) else data.get("users", [])
        for u in reversed(users):
            if (u.get("email") or "").lower() == email_l:
                if _local_cache is not None:
                    _local_cache[cache_key] = u
                return u
        # Pages supplémentaires uniquement si la première page est pleine.
        if len(users) == 1000:
            page = 2
            while True:
                r = httpx.get(
                    f"{settings.SUPABASE_URL}/auth/v1/admin/users",
                    params={"page": page, "per_page": 1000},
                    headers=_headers(),
                    timeout=20,
                )
                r.raise_for_status()
                data = r.json()
                users = data if isinstance(data, list) else data.get("users", [])
                for u in reversed(users):
                    if (u.get("email") or "").lower() == email_l:
                        if _local_cache is not None:
                            _local_cache[cache_key] = u
                        return u
                if len(users) < 1000:
                    break
                page += 1
        return None
    except Exception as e:
        logger.warning(f"Supabase admin_find_user_by_email: {e}")
        return None


def admin_find_user_by_local_id(db, email: str) -> Optional[dict]:
    """Fast-path : profil local déjà lié (auth_id) → GET admin par ID (O(1)).

    Couvre la quasi-totalité des cas (utilisateur déjà connecté, migré ou
    profil auto-créé) sans jamais paginer l'ensemble des utilisateurs.
    """
    email_l = (email or "").lower()
    if not email_l:
        return None
    try:
        from ..models.user import User
        u = db.query(User).filter(User.email == email_l).first()
        if u and u.auth_id:
            return admin_user(str(u.auth_id))
    except Exception as e:
        logger.warning(f"Supabase admin_find_user_by_local_id: {e}")
    return None


def admin_create_user(email: str, password: str, name: str = "", metadata: Optional[dict] = None) -> Optional[dict]:
    """Crée un utilisateur auth.users (email confirmé d'office — migration)."""
    try:
        meta = {"full_name": name}
        if metadata:
            meta.update(metadata)
        r = httpx.post(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users",
            headers=_headers(),
            json={"email": email, "password": password, "email_confirm": True,
                  "user_metadata": meta},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Supabase admin_create_user: {e} ({getattr(e, 'response', None) and e.response.text[:200]})")
        return None


def admin_session_password(email: str, password: str) -> Optional[dict]:
    """Échange email/mot de passe contre une session réelle (tokens Supabase).

    Permet aux flux "connecté par le backend" (Google simulé, compte virtuel)
    de retourner une session authentifiée au frontend, comme un login classique.
    """
    try:
        r = httpx.post(
            f"{settings.SUPABASE_URL}/auth/v1/token",
            params={"grant_type": "password"},
            headers={
                "apikey": settings.SUPABASE_ANON_KEY,
                "Content-Type": "application/json",
            },
            json={"email": email, "password": password},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logger.warning(f"Supabase admin_session_password: {e} ({getattr(e, 'response', None) and e.response.text[:200]})")
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


def admin_confirm_user(uid: str) -> bool:
    """Confirme l'adresse email d'un utilisateur auth.users (après vérif OTP)."""
    try:
        r = httpx.put(
            f"{settings.SUPABASE_URL}/auth/v1/admin/users/{uid}",
            headers=_headers(),
            json={"email_confirm": True},
            timeout=20,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        logger.warning(f"Supabase admin_confirm_user: {e}")
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
