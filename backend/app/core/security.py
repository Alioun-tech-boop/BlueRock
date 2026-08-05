"""Helpers d'authentification admin et quotas IA."""
import threading
import time
from collections import defaultdict
from typing import Optional

from fastapi import Header, HTTPException

from ..config import settings
from ..models.user import User

def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> None:
    """Endpoints d'administration : exigent le token admin (env ADMIN_TOKEN)."""
    if not settings.ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="Admin non configuré sur ce serveur")
    if not x_admin_token or x_admin_token != settings.ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Accès admin refusé")


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
