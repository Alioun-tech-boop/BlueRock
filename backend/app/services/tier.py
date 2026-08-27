"""Tier d'abonnement et consommation des tokens IA.

Règles :
  - Basic (gratuit) : BRVM seule, fonctionnalités essentielles, 50 tokens/mois.
  - Pro (4 900 FCFA/mois) : toutes les bourses (BRVM + NGX), toutes les
    fonctionnalités, 500 tokens/mois.
  - 1 question IA = 1 token ; l'allocation est réinitialisée chaque mois
    (wrap-around mensuel), puis re-synchronisée si la tier change.
  - Le gating NGX (market NGX / companies NGX) refuse les comptes Basic.
"""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models.user import User

TIER_ALLOTMENT = {
    settings.TIER_BASIC: settings.AI_TOKENS_BASIC,
    settings.TIER_PRO: settings.AI_TOKENS_PRO,
}


def is_pro(user: User | None) -> bool:
    if not user:
        return False
    if (user.tier or settings.TIER_BASIC) != settings.TIER_PRO:
        return False
    return not _trial_expired(user)


def _trial_expired(user: User) -> bool:
    """L'essai gratuit est-il terminé (et non renouvelable) ?"""
    return bool(user.trial_ends_at and user.trial_ends_at < datetime.utcnow())


def expire_trial_if_due(db: Session, user: User) -> bool:
    """Downgrade lazy : si l'essai gratuit est expiré, retour au plan Basic.

    Retourne True si la tier vient d'être rétrogradée.
    """
    if user.tier == settings.TIER_PRO and _trial_expired(user):
        set_tier(db, user, settings.TIER_BASIC)
        return True
    return False


def allotment_for(tier: str) -> int:
    return TIER_ALLOTMENT.get(tier or settings.TIER_BASIC, settings.AI_TOKENS_BASIC)


def month_key(dt: datetime | None) -> str:
    return (dt or datetime.utcnow()).strftime("%Y-%m")


def refill_tokens(db: Session, user: User) -> int:
    """Réinitialise l'allocation mensuelle si le mois a changé (ou la tier).

    Retourne le solde de tokens disponible.
    """
    now = datetime.utcnow()
    if not user.ai_tokens_reset_at or month_key(user.ai_tokens_reset_at) != month_key(now):
        user.ai_tokens_remaining = allotment_for(user.tier)
        user.ai_tokens_reset_at = now
        db.commit()
    elif user.ai_tokens_remaining is None:
        user.ai_tokens_remaining = allotment_for(user.tier)
        db.commit()
    return int(user.ai_tokens_remaining or 0)


def tokens_available(db: Session, user: User) -> dict:
    """État des tokens (allocation, restant, reset) pour le frontend."""
    expire_trial_if_due(db, user)
    remaining = refill_tokens(db, user)
    trial_active = user.trial_ends_at is not None and user.trial_ends_at >= datetime.utcnow()
    return {
        "tier": user.tier or settings.TIER_BASIC,
        "ai_tokens": remaining,
        "ai_tokens_limit": allotment_for(user.tier),
        "ai_tokens_reset_at": user.ai_tokens_reset_at.isoformat() if user.ai_tokens_reset_at else None,
        "is_trial": trial_active,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
    }


def consume_token(db: Session, user: User) -> int:
    """Consomme 1 token IA (après refill mensuel). 429 si épuisé."""
    remaining = refill_tokens(db, user)
    if remaining <= 0:
        raise HTTPException(
            status_code=429,
            detail=(
                "Épuisé : vos tokens IA du mois sont consommés. "
                "Passez à l'offre Pro pour 500 tokens/mois."
            ),
            headers={"X-BlueRock-Code": "tokens_exhausted"},
        )
    user.ai_tokens_remaining = remaining - 1
    db.commit()
    return remaining - 1


def set_tier(db: Session, user: User, tier: str) -> None:
    """Change la tier et réinitialise les tokens à l'allocation de la tier."""
    user.tier = tier
    user.ai_tokens_remaining = allotment_for(tier)
    user.ai_tokens_reset_at = datetime.utcnow()
    db.commit()


def require_pro(user: User | None) -> None:
    """Gating bourse : les flux NGX sont réservés à l'offre Pro."""
    if not is_pro(user):
        raise HTTPException(
            status_code=403,
            detail="La bourse NGX est réservée à l'offre Pro (4 900 FCFA/mois).",
            headers={"X-BlueRock-Code": "plan_required"},
        )