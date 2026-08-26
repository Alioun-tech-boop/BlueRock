"""Helpers d'authentification admin, RBAC et quotas IA."""
import hashlib
import hmac
import os
import threading
import time
import uuid
from collections import defaultdict
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.user import User
from .supabase_auth import verify_supabase_jwt

# Hiérarchie des rôles (ordre croissant de privilèges).
ROLE_LEVELS = {
    "user": 0,
    "analyst": 1,
    "support": 2,
    "compliance": 3,
    "security": 4,
    "admin": 5,
    "super_admin": 6,
}


def role_level(role: str | None) -> int:
    return ROLE_LEVELS.get((role or "user").lower(), 0)


def _admin_from_jwt(authorization: str, db: Session, min_level: int = ROLE_LEVELS["admin"]) -> User | None:
    """Résout un utilisateur admin depuis le Bearer JWT (RBAC)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    claims = verify_supabase_jwt(authorization.removeprefix("Bearer ").strip())
    if not claims:
        return None
    sub = claims.get("sub")
    try:
        auth_uid = uuid.UUID(sub)
    except (TypeError, ValueError):
        return None
    user = db.query(User).filter(User.auth_id == auth_uid).first()
    if user is not None and role_level(user.role) >= min_level:
        return user
    return None


def require_admin(x_admin_token: Optional[str] = Header(default=None),
                  authorization: str = Header(default=""),
                  db: Session = Depends(get_db)) -> User:
    """Accès admin : RBAC par défaut (JWT + users.role >= admin), avec
    rétro-compatibilité au token statique ADMIN_TOKEN (en transition)."""
    if settings.ADMIN_TOKEN and x_admin_token and hmac.compare_digest(x_admin_token, settings.ADMIN_TOKEN):
        return None
    user = _admin_from_jwt(authorization, db, ROLE_LEVELS["admin"])
    if user is None:
        raise HTTPException(status_code=403, detail="Accès admin refusé")
    return user


def require_role(min_role: str):
    """Fabrique une dépendance exigeant au moins le rôle donné (RBAC JWT)."""
    min_level = role_level(min_role)

    def dep(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous")
        claims = verify_supabase_jwt(authorization.removeprefix("Bearer ").strip())
        if not claims:
            raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous")
        sub = claims.get("sub")
        try:
            auth_uid = uuid.UUID(sub)
        except (TypeError, ValueError):
            raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous")
        user = db.query(User).filter(User.auth_id == auth_uid).first()
        if user is None or role_level(user.role) < min_level:
            raise HTTPException(status_code=403, detail="Rôle insuffisant")
        return user

    return dep


_PIN_ITERATIONS = 100_000


def hash_pin(pin: str) -> str:
    """Hache un code de sécurité (6 chiffres) : sel aléatoire + PBKDF2-SHA256."""
    salt = os.urandom(16).hex()
    digest = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), _PIN_ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_pin(pin: str, stored: str | None) -> bool:
    """Vérifie un code de sécurité contre le hash stocké (comparaison constante)."""
    if not stored:
        return False
    try:
        salt, digest = stored.split("$", 1)
        calc = hashlib.pbkdf2_hmac("sha256", pin.encode(), bytes.fromhex(salt), _PIN_ITERATIONS).hex()
        return hmac.compare_digest(calc, digest)
    except Exception:
        return False


# Quota IA : user_id -> {date_str -> count}
_ai_quota: dict[int, dict[str, int]] = defaultdict(dict)
_quota_lock = threading.Lock()


def check_ai_quota(user: User) -> None:
    """Quota quotidien de questions IA par utilisateur."""
    today = time.strftime("%Y-%m-%d")
    with _quota_lock:
        counts = _ai_quota[user.id]
        n = counts.get(today, 0)
        if n >= settings.AI_DAILY_QUOTA:
            raise HTTPException(
                status_code=429,
                detail=f"Quota IA quotidien atteint ({settings.AI_DAILY_QUOTA} questions). Réessayez demain.",
            )
        counts[today] = n + 1
