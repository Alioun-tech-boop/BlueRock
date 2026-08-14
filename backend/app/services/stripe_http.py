"""Client des Edge Functions Supabase de paiement Stripe.

Le backend ne détient AUCUNE clé Stripe : la création du checkout, la
confirmation du paiement (webhook) et les remboursements sont exécutés par
les Edge Functions Supabase (supabase/functions/stripe-*), qui possèdent
les secrets Stripe et partagent la même base Postgres que l'application.

Appels :
  - stripe-checkout        : crée une session de paiement Stripe (côté client
                             avec le JWT de l'utilisateur authentifié).
  - stripe-session-status  : interroge Stripe pour re-confirmer un ordre au
                             retour du checkout (accès service key).
  - stripe-refund          : rembourse un paiement (désinscription d'un défi).
"""
import logging
import httpx
from urllib.parse import urljoin

from ..config import settings

logger = logging.getLogger(__name__)


class StripeEdgeError(Exception):
    pass


def edge_base_url() -> str:
    base = (settings.SUPABASE_FUNCTIONS_URL or "").strip()
    if base:
        return base.rstrip("/")
    supabase_url = (settings.SUPABASE_URL or "").strip().rstrip("/")
    if not supabase_url:
        return ""
    return f"{supabase_url}/functions/v1"


def is_configured() -> bool:
    return bool(edge_base_url() and settings.SUPABASE_SERVICE_KEY)


def _call(function: str, payload: dict, token: str | None = None,
          timeout: float = 30.0) -> dict:
    base = edge_base_url()
    if not base:
        raise StripeEdgeError(
            "Le paiement n'est pas configuré (SUPABASE_URL manquant)")
    headers = {
        "Content-Type": "application/json",
        "apikey": settings.SUPABASE_ANON_KEY or settings.SUPABASE_SERVICE_KEY or "",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = httpx.post(f"{base}/{function}", json=payload,
                          headers=headers, timeout=timeout)
    except httpx.HTTPError as e:
        logger.warning("Stripe edge %s: réseau (%s)", function, e)
        raise StripeEdgeError("Le service de paiement est injoignable, réessayez dans un instant")
    if resp.status_code >= 400:
        detail = ""
        try:
            detail = str(resp.json().get("error") or resp.text)[:300]
        except Exception:
            detail = resp.text[:300]
        logger.warning("Stripe edge %s: HTTP %s (%s)", function, resp.status_code, detail)
        raise StripeEdgeError(detail or "Erreur du service de paiement")
    return resp.json()


def create_checkout(payload: dict, user_jwt: str) -> dict:
    """Crée une session Stripe pour un ordre pending (Bearer = JWT utilisateur)."""
    return _call("stripe-checkout", payload, token=user_jwt)


def check_session_status(order_id: int) -> dict:
    """Interroge Stripe au retour du checkout (service key)."""
    if not (edge_base_url() and settings.SUPABASE_SERVICE_KEY):
        raise StripeEdgeError("Le service de paiement n'est pas configuré")
    return _call("stripe-session-status", {"order_id": order_id},
                 token=settings.SUPABASE_SERVICE_KEY)


def refund_order(order_id: int) -> dict:
    """Rembourse le paiement d'un ordre (service key)."""
    if not (edge_base_url() and settings.SUPABASE_SERVICE_KEY):
        raise StripeEdgeError("Le service de paiement n'est pas configuré")
    return _call("stripe-refund", {"order_id": order_id},
                 token=settings.SUPABASE_SERVICE_KEY)


def create_subscription(payload: dict) -> dict:
    """Crée une session d'abonnement Stripe (mode subscription, service key)."""
    if not (edge_base_url() and settings.SUPABASE_SERVICE_KEY):
        raise StripeEdgeError("Le service de paiement n'est pas configuré")
    return _call("stripe-subscribe", payload,
                 token=settings.SUPABASE_SERVICE_KEY)


def check_subscription_status(order_id: str) -> dict:
    """Interroge Stripe sur l'état de l'abonnement au retour du checkout."""
    if not (edge_base_url() and settings.SUPABASE_SERVICE_KEY):
        raise StripeEdgeError("Le service de paiement n'est pas configuré")
    return _call("stripe-subscription-status", {"order_id": order_id},
                 token=settings.SUPABASE_SERVICE_KEY)