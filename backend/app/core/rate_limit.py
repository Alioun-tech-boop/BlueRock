"""Rate limiting partagé par IP (fenêtre fixe).

L'état vit dans le SharedStore (Redis si configuré, sinon mémoire par
processus) : la limite est donc commune à toutes les instances de l'API dès
que Redis est branché, et par processus sinon (correct en mono-instance).

Fenêtre fixe (INCR + EXPIRE) : plus économique que la fenêtre glissante et
suffisante pour la protection anti-abuse ; au pire un client peut passer
2× la limite à cheval sur deux fenêtres.

Anti-spoofing : le header X-Forwarded-For n'est pris en compte QUE si un
proxy de confiance est déclaré (TRUST_PROXY_IPS). Sinon on utilise l'IP de
socket — un client peut mentir sur XFF mais pas sur son IP réelle.
"""
import time

from fastapi import HTTPException

from ..config import settings
from .shared_store import store


def _ip_key(request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    # Cloudflare et proxies modernes: CF-Connecting-IP est la vraie IP même sans XFF
    cf_ip = request.headers.get("cf-connecting-ip")
    x_real = request.headers.get("x-real-ip")
    xff = request.headers.get("x-forwarded-for")
    # Si TRUST_PROXY_IPS="*" on fait confiance à tout proxy (Render, Railway)
    if settings.TRUST_PROXY_IPS == "*":
        if cf_ip:
            return cf_ip.strip()
        if xff:
            return xff.split(",")[0].strip() or client_ip
        if x_real:
            return x_real.strip()
        return client_ip
    if settings.TRUST_PROXY_IPS:
        trusted = {ip.strip() for ip in settings.TRUST_PROXY_IPS.split(",") if ip.strip()}
        if client_ip in trusted:
            if cf_ip:
                return cf_ip.strip()
            if xff:
                return xff.split(",")[0].strip() or client_ip
            if x_real:
                return x_real.strip()
        return client_ip
    # Sans proxy de confiance, on ignore XFF (anti-spoof) mais on log un warning si XFF présent en prod
    # En prod derrière Render sans TRUST_PROXY_IPS, le rate-limit sera partagé → inciter à configurer
    return client_ip


def check_rate_limit(request, limit: int, window_seconds: int = 60) -> None:
    """Lève HTTPException 429 si la limite est dépassée pour l'IP."""
    if not settings.RATE_LIMIT_ENABLED:
        return
    bucket = f"rl:{_ip_key(request)}:{request.url.path}"
    count = store.incr(bucket, ttl=window_seconds)
    if count == 1:
        store.set(bucket + ":s", str(time.time()), ttl=window_seconds)
    if count > limit:
        start_raw = store.get(bucket + ":s")
        try:
            start = float(start_raw) if start_raw else None
            remaining = int(start + window_seconds - time.time() + 1) if start else window_seconds
        except (TypeError, ValueError):
            remaining = window_seconds
        raise HTTPException(
            status_code=429,
            detail=f"Trop de requêtes. Réessayez dans {max(1, remaining)}s.",
        )
