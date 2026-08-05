"""Auth Supabase : JWT validé côté backend (JWKS ES256), profils dans public.users.

Le flux complet (inscription, OTP email, MFA TOTP, recovery codes, reset) est géré
par Supabase Auth côté frontend (@supabase/supabase-js). Ce routeur expose :
- GET/PUT /me : profil applicatif (public.users), auto-créé au 1er appel authentifié
- POST /legacy-login : migration des comptes pré-Supabase (vérif PBKDF2 → ré-hachage argon2)
- GET /brokers : liste des courtiers
"""

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..core.supabase_auth import (
    admin_create_user,
    admin_find_user_by_email,
    admin_set_password,
    verify_supabase_jwt,
)
from ..database import get_db
from ..models.user import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

BROKERS_BY_COUNTRY: dict[str, dict[str, list[str]]] = {
    "Bénin": {
        "SGI": [
            "Africaine de Gestion et d'Intermédiation (AGI)",
            "SGI Africabourse",
            "SGI Bénin S.A",
            "SGI BIIC Financial Services (BFS)",
            "United Capital for Africa (UCA SGI)",
        ],
        "SGO": [
            "Africabourse Asset Management",
            "Africaine de Gestion d'Actifs (AGA)",
            "Saphir Asset Management",
            "SOAGA (Société Ouest Africaine de Gestion d'Actifs)",
        ],
    },
    "Burkina Faso": {
        "SGI": [
            "Image finances Internationales",
            "SGI Coris Bourse S.A",
            "SGI SBIF",
            "Société Africaine d'Ingénierie et d'Intermédiation Financières (SA2IF)",
        ],
        "SGO": [
            "Africa Asset Management",
            "Coris Asset Management",
        ],
    },
    "Côte d'Ivoire": {
        "SGI": [
            "Atlantique Finance",
            "Attijari Securities West Africa",
            "BICI Bourse",
            "BNI Finances",
            "BOA Capital Securities",
            "Bridge Securities",
            "BSIC Capital",
            "EDC Investment Corporation",
            "GEK Capital",
            "Hudson & Cie",
            "Kérales Finance",
            "MAC African",
            "Matha Securities",
            "NSIA Finance",
            "One Africa Markets (OAM CI)",
            "Oragroup Securities",
            "Phoenix Capital Management",
            "Société Générale Capital Securities West Africa (SGCSWA)",
            "Sirius Capital",
        ],
        "SGO": [
            "Atlantic Asset Management",
            "BNI Gestion",
            "BOA Capital Asset Management",
            "Bridge Asset Management",
            "Ecobank Asset Management",
            "Enko Capital West Africa",
            "Global Investors",
            "NSIA Asset Management",
            "PhoenixAfrica Asset Management",
            "SGA2E",
            "Société Générale Capital Asset Management West Africa",
            "SOGESPAR",
        ],
    },
    "Guinée-Bissau": {"SGI": [], "SGO": []},
    "Mali": {
        "SGI": [
            "CIFA Bourse",
            "Global Capital",
            "SGI Mali S.A",
        ],
        "SGO": [],
    },
    "Niger": {
        "SGI": ["SGI Niger S.A"],
        "SGO": [],
    },
    "Sénégal": {
        "SGI": [
            "ABCO Bourse",
            "CGF Bourse",
            "Everest Finance",
            "Finance Gestion Intermédiation (FGI)",
            "Impaxis Securities",
            "Invictus Capital & Finance",
        ],
        "SGO": [
            "Attijari Asset Management",
            "Baobab Asset Management",
            "BRM Asset Management",
            "CGF Gestion",
        ],
    },
    "Togo": {
        "SGI": ["SGI Togo S.A"],
        "SGO": [],
    },
}

BROKERS = [
    name
    for country in BROKERS_BY_COUNTRY.values()
    for category in ("SGI", "SGO")
    for name in country[category]
]

BROKER_CITIES = {
    "Bénin": "Cotonou",
    "Burkina Faso": "Ouagadougou",
    "Côte d'Ivoire": "Abidjan",
    "Guinée-Bissau": "Bissau",
    "Mali": "Bamako",
    "Niger": "Niamey",
    "Sénégal": "Dakar",
    "Togo": "Lomé",
}


def _broker_meta(name: str, category: str, country: str) -> dict:
    """Métadonnées déterministes par courtier (note, ville, année, descriptif)."""
    seed = int(hashlib.md5(name.encode()).hexdigest(), 16)
    note = round(6.2 + (seed % 370) / 100.0, 1)  # 6.2 → 9.9
    founded = 1993 + (seed >> 16) % 24  # 1993 → 2016
    return {
        "name": name,
        "category": category,
        "country": country,
        "city": BROKER_CITIES.get(country, country),
        "founded": founded,
        "note": note,
        "description": (
            "Intermédiation boursière & gestion de portefeuille"
            if category == "SGI"
            else "Gestion d'actifs & OPCVM"
        ),
    }


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


def _claims_from_token(authorization: str) -> dict | None:
    if not authorization.startswith("Bearer "):
        return None
    return verify_supabase_jwt(authorization.removeprefix("Bearer ").strip())


def _resolve_user(claims: dict, db: Session) -> User | None:
    sub = claims.get("sub")
    if not sub:
        return None
    try:
        auth_uid = uuid.UUID(sub)
    except ValueError:
        return None
    return db.query(User).filter(User.auth_id == auth_uid).first()


def _ensure_profile(claims: dict, db: Session) -> User:
    """Renvoie le profil public.users lié à l'auth_id, ou le crée (1er appel)."""
    user = _resolve_user(claims, db)
    if user:
        return user
    meta = claims.get("user_metadata") or {}
    account_type = meta.get("account_type") or "demo"
    if account_type not in ("demo", "real"):
        account_type = "demo"
    user = User(
        auth_id=uuid.UUID(claims["sub"]),
        name=meta.get("full_name") or (claims.get("email") or "Utilisateur"),
        email=(claims.get("email") or "").lower(),
        password_hash="",
        account_type=account_type,
        broker_name=meta.get("broker_name") or None,
        broker_account=meta.get("broker_account") or None,
        email_verified=True,
        totp_enabled=claims.get("aal") == "aal2",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    claims = _claims_from_token(authorization)
    if not claims:
        raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous")
    return _ensure_profile(claims, db)


def get_optional_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User | None:
    claims = _claims_from_token(authorization)
    if not claims:
        return None
    return _ensure_profile(claims, db)


class LegacyLoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=128)


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    avatar: str | None = Field(default=None, max_length=16)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    account_type: str
    broker_name: str | None = None
    broker_account: str | None = None
    avatar: str | None = None
    created_at: datetime | None = None

    class Config:
        from_attributes = True


@router.post("/legacy-login")
def legacy_login(req: LegacyLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Étape de migration : valide l'ancien mot de passe PBKDF2 puis ré-hache côté
    Supabase (argon2). Après succès, le client se connecte normalement via Supabase."""
    if not settings.SUPABASE_URL:
        raise HTTPException(status_code=503, detail="Supabase non configuré")
    check_rate_limit(request, limit=10, window_seconds=900)
    email = req.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    # Comptes pré-Supabase : le hash PBKDF2 est stocké dans password_hash
    # (legacy_hash n'existait pas au moment du dump). Après migration, les deux
    # sont vides — un compte Supabase pur ne passe donc jamais ici.
    stored_hash = user.legacy_hash or user.password_hash
    if not stored_hash:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    salt, _, stored = stored_hash.partition("$")
    if not salt or not stored:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")
    if not hmac.compare_digest(hash_password(req.password, salt), stored):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    su = admin_find_user_by_email(email)
    if not su:
        su = admin_create_user(email, req.password, user.name)
        if not su:
            raise HTTPException(status_code=502, detail="Échec de la migration du compte")
    elif not admin_set_password(su["id"], req.password):
        raise HTTPException(status_code=502, detail="Échec de la migration du compte")

    user.auth_id = uuid.UUID(su["id"])
    user.legacy_hash = None
    user.password_hash = ""
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()
    return {"status": "ok", "email": user.email}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return UserOut.from_orm(user)


@router.put("/me")
def update_me(
    req: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.name is not None:
        name = req.name.strip()
        if not name:
            raise HTTPException(status_code=422, detail="Le nom ne peut pas être vide")
        user.name = name
    if req.avatar is not None:
        avatar = req.avatar.strip()
        if not avatar:
            user.avatar = None
        elif len(avatar) > 16 or not any(ord(ch) > 0x1F00 for ch in avatar):
            raise HTTPException(status_code=422, detail="Avatar invalide (emoji attendu)")
        else:
            user.avatar = avatar
    db.commit()
    db.refresh(user)
    return UserOut.from_orm(user)


@router.get("/brokers")
def list_brokers():
    enriched: dict[str, dict[str, list[dict]]] = {}
    for country, cats in BROKERS_BY_COUNTRY.items():
        enriched[country] = {
            "SGI": [_broker_meta(name, "SGI", country) for name in cats["SGI"]],
            "SGO": [_broker_meta(name, "SGO", country) for name in cats["SGO"]],
        }
    return {"brokers": enriched}
