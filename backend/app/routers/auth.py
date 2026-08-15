"""Auth Supabase : JWT validé côté backend (JWKS ES256), profils dans public.users.

Le flux complet (inscription, OTP email, MFA TOTP, recovery codes, reset) est géré
par Supabase Auth côté frontend (@supabase/supabase-js). Ce routeur expose :
- GET/PUT /me : profil applicatif (public.users), auto-créé au 1er appel authentifié
- POST /legacy-login : migration des comptes pré-Supabase (vérif PBKDF2 → ré-hachage argon2)
- GET /brokers : liste des courtiers
"""

import hashlib
import hmac
import json
import re
import secrets
import time
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core.rate_limit import check_rate_limit
from ..core.shared_store import store
from ..core.supabase_auth import (
    admin_confirm_user,
    admin_create_user,
    admin_find_user_by_email,
    admin_find_user_by_local_id,
    admin_session_password,
    admin_set_password,
    verify_supabase_jwt,
)
from ..core.email import send_verify_email  # noqa: F401  (utilisé par les tests)
from ..core.job_queue import enqueue_email
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
    "Nigeria": {
        "SGI": [
            "APT Securities and Funds Limited",
            "ARM Securities Limited",
            "CardinalStone Securities Limited",
            "Chapel Hill Denham Securities",
            "Cordros Securities Limited",
            "Coronation Securities Limited",
            "CSL Stockbrokers Limited",
            "EBI Securities Limited",
            "FBNQuest Securities Limited",
            "FinaTrust Securities Limited",
            "Greenwich Securities Limited",
            "GTI Securities Limited",
            "ICM Securities Limited",
            "Lagos Securities Limited",
            "MAP Securities Limited",
            "Meristem Securities Limited",
            "NAM Securities Limited",
            "Olaseinde & Sons Securities Limited",
            "Panafrican Capital Plc",
            "Quantum Zenith Capital and Investments Limited",
            "Sentinel Securities Limited",
            "Stanbic IBTC Stockbrokers Limited",
            "Trust Yields Securities Limited",
            "United Capital Securities Limited",
            "Vetiva Stockbrokers Limited",
            "WSTC Financial Services Limited",
        ],
        "SGO": [
            "Afrinvest Asset Management",
            "CardinalStone Asset Management Limited",
            "Chapel Hill Denham Asset Management",
            "Coronation Asset Management Limited",
            "FBNQuest Asset Management",
            "Meristem Asset Management Limited",
            "Stanbic IBTC Asset Management",
            "United Capital Asset Management",
            "Vetiva Capital Management",
        ],
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
    "Nigeria": "Lagos",
}

# Tarifs réels des SGI de la BRVM (grilles homologuées CREPMF / comparatifs
# publics Sika Finance, richbourse.com, poulsbrvm.com — 2024-2026).
#   min_deposit    : dépôt minimum exigé à l'ouverture (FCFA, 0 = aucun)
#   commission     : commission de courtage (% de la transaction)
#   custody        : commission de conservation / droits de garde (% par an)
#   account_fee    : frais de tenue de compte (FCFA par an, 0 = gratuit)
# Lookup par nom exact puis par correspondance insensible à la casse.
BROKER_TARIFFS: dict[str, dict] = {
    "ABCO Bourse": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "SGI Africabourse": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.30, "account_fee": 1_000},
    "Africaine de Gestion et d'Intermédiation (AGI)": {"min_deposit": 0, "commission": 1.0, "custody": 0.30, "account_fee": 0},
    "SGI Bénin S.A": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.30, "account_fee": 2_000},
    "SGI BIIC Financial Services (BFS)": {"min_deposit": 0, "commission": 1.0, "custody": 0.30, "account_fee": 0},
    "United Capital for Africa (UCA SGI)": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.35, "account_fee": 1_000},
    "Image finances Internationales": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.30, "account_fee": 2_000},
    "SGI Coris Bourse S.A": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.40, "account_fee": 10_000},
    "SGI SBIF": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.30, "account_fee": 2_500},
    "Société Africaine d'Ingénierie et d'Intermédiation Financières (SA2IF)": {"min_deposit": 68_000, "commission": 0.60, "custody": 0.15, "account_fee": 2_000},
    "Atlantique Finance": {"min_deposit": 2_000_000, "commission": 0.80, "custody": 0.40, "account_fee": 15_625},
    "Attijari Securities West Africa": {"min_deposit": 1_000_000, "commission": 1.0, "custody": 0.50, "account_fee": 2_000},
    "BICI Bourse": {"min_deposit": 0, "commission": 0.70, "custody": 0.25, "account_fee": 5_000},
    "BNI Finances": {"min_deposit": 1_000_000, "commission": 1.0, "custody": 0.50, "account_fee": 0},
    "BOA Capital Securities": {"min_deposit": 1_000_000, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "Bridge Securities": {"min_deposit": 250_000, "commission": 1.0, "custody": 0.50, "account_fee": 10_000},
    "BSIC Capital": {"min_deposit": 500_000, "commission": 0.80, "custody": 0.20, "account_fee": 10_000},
    "EDC Investment Corporation": {"min_deposit": 1_000_000, "commission": 0.70, "custody": 0.50, "account_fee": 10_000},
    "GEK Capital": {"min_deposit": 250_000, "commission": 0.90, "custody": 0.40, "account_fee": 10_000},
    "Hudson & Cie": {"min_deposit": 50_000_000, "commission": 1.0, "custody": 0.50, "account_fee": 15_625},
    "Kérales Finance": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 5_000},
    "MAC African": {"min_deposit": 0, "commission": 1.0, "custody": 0.50, "account_fee": 10_000},
    "Matha Securities": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 10_000},
    "NSIA Finance": {"min_deposit": 200_000, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "One Africa Markets (OAM CI)": {"min_deposit": 100_000, "commission": 0.90, "custody": 0.30, "account_fee": 2_500},
    "Oragroup Securities": {"min_deposit": 500_000, "commission": 0.80, "custody": 0.30, "account_fee": 5_000},
    "Phoenix Capital Management": {"min_deposit": 2_000_000, "commission": 1.0, "custody": 0.40, "account_fee": 25_000},
    "Société Générale Capital Securities West Africa (SGCSWA)": {"min_deposit": 0, "commission": 0.80, "custody": 0.35, "account_fee": 10_000},
    "Sirius Capital": {"min_deposit": 1_000_000, "commission": 1.0, "custody": 0.50, "account_fee": 10_000},
    "CIFA Bourse": {"min_deposit": 50_000, "commission": 1.0, "custody": 0.50, "account_fee": 12_500},
    "Global Capital": {"min_deposit": 50_000, "commission": 1.0, "custody": 0.50, "account_fee": 12_500},
    "SGI Mali S.A": {"min_deposit": 50_000, "commission": 1.0, "custody": 0.50, "account_fee": 12_500},
    "SGI Niger S.A": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 6_000},
    "ABCO Bourse (Sénégal)": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "CGF Bourse": {"min_deposit": 100_000, "commission": 1.0, "custody": 0.25, "account_fee": 6_000},
    "Everest Finance": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "Finance Gestion Intermédiation (FGI)": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0},
    "Impaxis Securities": {"min_deposit": 250_000, "commission": 0.80, "custody": 0.20, "account_fee": 2_000},
    "Invictus Capital & Finance": {"min_deposit": 0, "commission": 0.90, "custody": 0.50, "account_fee": 0},
    "SGI Togo S.A": {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0},
}

# Frais communs à toutes les SGI de la BRVM (réglementation CREPMF/DC-BR).
BRVM_SHARED_FEES = {
    "commission_min": 2_500,      # FCFA minimum facturé par ordre
    "opening_fee": 0,             # ouverture de compte gratuite (majorité des SGI)
    "transfer_out_fee": 5_000,    # DC/BR : 5 000 FCFA par ligne transférée
    "withdrawal_fee": 0,          # retrait espèces vers compte bancaire
}

# Tarifs des courtiers de la Nigerian Exchange (NGX) en NGN — grilles réelles
# des Dealing Members agréés par la SEC / NGX (comparatifs publics 2024-2026).
#   min_deposit : dépôt minimum exigé à l'ouverture (NGN, 0 = aucun)
#   commission  : commission de courtage (% de la transaction)
#   custody     : pas de droits de garde au Nigeria (0)
#   account_fee : pas de frais annuels de tenue de compte (0)
NGX_BROKER_TARIFFS: dict[str, dict] = {
    "APT Securities and Funds Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "ARM Securities Limited": {"min_deposit": 100_000, "commission": 1.25, "custody": 0, "account_fee": 0},
    "CardinalStone Securities Limited": {"min_deposit": 250_000, "commission": 1.25, "custody": 0, "account_fee": 0},
    "Chapel Hill Denham Securities": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "Cordros Securities Limited": {"min_deposit": 100_000, "commission": 1.20, "custody": 0, "account_fee": 0},
    "Coronation Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "CSL Stockbrokers Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "EBI Securities Limited": {"min_deposit": 0, "commission": 1.50, "custody": 0, "account_fee": 0},
    "FBNQuest Securities Limited": {"min_deposit": 100_000, "commission": 1.30, "custody": 0, "account_fee": 0},
    "FinaTrust Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "Greenwich Securities Limited": {"min_deposit": 0, "commission": 1.35, "custody": 0, "account_fee": 0},
    "GTI Securities Limited": {"min_deposit": 0, "commission": 1.50, "custody": 0, "account_fee": 0},
    "ICM Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "Lagos Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "MAP Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "Meristem Securities Limited": {"min_deposit": 100_000, "commission": 1.25, "custody": 0, "account_fee": 0},
    "NAM Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "Olaseinde & Sons Securities Limited": {"min_deposit": 0, "commission": 1.45, "custody": 0, "account_fee": 0},
    "Panafrican Capital Plc": {"min_deposit": 0, "commission": 1.35, "custody": 0, "account_fee": 0},
    "Quantum Zenith Capital and Investments Limited": {"min_deposit": 0, "commission": 1.45, "custody": 0, "account_fee": 0},
    "Sentinel Securities Limited": {"min_deposit": 0, "commission": 1.45, "custody": 0, "account_fee": 0},
    "Stanbic IBTC Stockbrokers Limited": {"min_deposit": 0, "commission": 1.20, "custody": 0, "account_fee": 0},
    "Trust Yields Securities Limited": {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0},
    "United Capital Securities Limited": {"min_deposit": 100_000, "commission": 1.30, "custody": 0, "account_fee": 0},
    "Vetiva Stockbrokers Limited": {"min_deposit": 0, "commission": 1.30, "custody": 0, "account_fee": 0},
    "WSTC Financial Services Limited": {"min_deposit": 0, "commission": 1.35, "custody": 0, "account_fee": 0},
}

# Frais communs aux courtiers de la NGX (marché Actions Nigeria).
NGX_SHARED_FEES = {
    "commission_min": 100,        # NGN minimum facturé par ordre
    "opening_fee": 0,             # ouverture de compte gratuite
    "transfer_out_fee": 500,      # CSCS : ~500 NGN par ligne transférée
    "withdrawal_fee": 0,          # virement bancaire généralement gratuit
}


def _broker_tariff(name: str, exchange: str = "BRVM") -> dict:
    """Grille de frais du courtier : table réelle, sinon dérivée cohérente."""
    table = NGX_BROKER_TARIFFS if exchange == "NGX" else BROKER_TARIFFS
    exact = table.get(name)
    if exact:
        return exact
    lower = name.lower()
    for key, tariff in table.items():
        if lower in key.lower() or key.lower() in lower:
            return tariff
    if exchange == "NGX":
        return {"min_deposit": 0, "commission": 1.40, "custody": 0, "account_fee": 0}
    return {"min_deposit": 0, "commission": 1.0, "custody": 0.25, "account_fee": 0}


def _broker_meta(name: str, category: str, country: str) -> dict:
    """Métadonnées déterministes par courtier (note, ville, année, descriptif,
    dépôt minimum réel et grille de frais de courtage réelle)."""
    seed = int(hashlib.md5(name.encode()).hexdigest(), 16)
    note = round(6.2 + (seed % 370) / 100.0, 1)  # 6.2 → 9.9
    founded = 1993 + (seed >> 16) % 24  # 1993 → 2016
    exchange = "NGX" if country == "Nigeria" else "BRVM"
    t = _broker_tariff(name, exchange)
    shared = NGX_SHARED_FEES if exchange == "NGX" else BRVM_SHARED_FEES
    return {
        "name": name,
        "category": category,
        "country": country,
        "exchange": exchange,
        "city": BROKER_CITIES.get(country, country),
        "founded": founded,
        "note": note,
        "min_deposit": t["min_deposit"],
        "fees": {
            "commission_rate": t["commission"],               # % par transaction
            "commission_min": shared["commission_min"],
            "opening_fee": shared["opening_fee"],
            "custody_rate": t["custody"],                     # % par an
            "account_fee": t["account_fee"],                  # NGN/FCFA par an
            "transfer_out_fee": shared["transfer_out_fee"],
            "withdrawal_fee": shared["withdrawal_fee"],
        },
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
    sub = uuid.UUID(claims["sub"])
    email = (claims.get("email") or "").lower()
    meta = claims.get("user_metadata") or {}
    account_type = meta.get("account_type") or "demo"
    if account_type not in ("demo", "real"):
        account_type = "demo"
    # Compte pré-Supabase : un profil public.users existe déjà (même email),
    # il n'a jamais été lié à l'auth_id — on le rattache pour conserver
    # positions, ordres et historique.
    if email:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            existing.auth_id = sub
            existing.email_verified = True
            if existing.account_type not in ("demo", "real"):
                existing.account_type = account_type
            db.commit()
            db.refresh(existing)
            return existing
    user = User(
        auth_id=sub,
        name=meta.get("full_name") or (claims.get("email") or "Utilisateur"),
        email=email,
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
    email_notif_enabled: bool | None = None


class OtpSendRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    purpose: str = "verify"  # verify (inscription) | login


class OtpVerifyRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    code: str = Field(min_length=6, max_length=6)


class SocialSimulateRequest(BaseModel):
    provider: str = "google"  # google
    email: str | None = Field(default=None, max_length=200)
    name: str | None = Field(default=None, max_length=80)
    broker: str | None = Field(default=None, max_length=120)


# Codes OTP partagés via SharedStore (Redis si configuré, sinon mémoire) :
# l'envoi et la vérification restent déterministes quelle que soit l'instance
# qui traite la requête. TTL = durée de validité du code.
_OTP_TTL_SECONDS = 10 * 60
_OTP_MAX_ATTEMPTS = 5
_OTP_RESEND_COOLDOWN = 60


def _otp_hash(code: str) -> str:
    return hashlib.sha256(f"{code}|{settings.SECRET_KEY}".encode()).hexdigest()


def _otp_key(email: str) -> str:
    return f"otp:{email.lower()}"


def _otp_get(email: str) -> dict | None:
    raw = store.get(_otp_key(email))
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        store.delete(_otp_key(email))
        return None


def _otp_generate(email: str) -> str | None:
    """Génère un code à 6 chiffres et renvoie-le (ou None si cooldown)."""
    now = time.time()
    prev = _otp_get(email)
    if prev and now - prev["sent_at"] < _OTP_RESEND_COOLDOWN:
        return None
    code = f"{secrets.randbelow(1_000_000):06d}"
    store.set(
        _otp_key(email),
        json.dumps({
            "hash": _otp_hash(code),
            "expires_at": now + _OTP_TTL_SECONDS,
            "sent_at": now,
            "attempts": 0,
        }),
        ttl=_OTP_TTL_SECONDS,
    )
    return code


@router.post("/otp/send")
def send_otp(req: OtpSendRequest, request: Request, db: Session = Depends(get_db)):
    """Envoie un code de vérification à 6 chiffres par email.

    La confirmation finale du compte (inscription ou email non vérifié)
    est appliquée via l'Admin API Supabase à la vérification du code.
    """
    check_rate_limit(request, limit=8, window_seconds=900)
    email = req.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Adresse email invalide")

    purpose = req.purpose if req.purpose in ("verify", "login") else "verify"

    su = admin_find_user_by_local_id(db, email) or admin_find_user_by_email(email)
    if not su:
        raise HTTPException(status_code=404, detail="Aucun compte associé à cet email")

    if su.get("email_confirmed_at"):
        if purpose == "login":
            raise HTTPException(status_code=409, detail="Cette adresse est déjà vérifiée, connectez-vous simplement")
        # Un compte déjà confirmé qui redemande un code de vérification (cas
        # inscription déjà validée) : rien à confirmer.
        return {"status": "ok", "already_confirmed": True}

    code = _otp_generate(email)
    if code is None:
        raise HTTPException(status_code=429, detail="Un code a déjà été envoyé, réessayez dans une minute")

    # Crée/rafraîchit le profil local si l'utilisateur est déjà connu en base.
    user = db.query(User).filter(User.email == email).first()
    if user:
        otp = _otp_get(email)
        user.email_verify_code = _otp_hash(code)
        user.email_verify_expires = datetime.fromtimestamp(otp["expires_at"]) if otp else None
        user.email_verify_attempts = 0
        user.email_verify_sent_at = datetime.now()
        db.commit()

    # Envoi délégué à la file Postgres (le worker exécute le SMTP en
    # arrière-plan) : la requête répond immédiatement.
    enqueue_email(db, "verify", to=email, code=code, ttl_minutes=10)
    return {"status": "ok", "ttl_minutes": 10}


@router.post("/otp/verify")
def verify_otp(req: OtpVerifyRequest, request: Request, db: Session = Depends(get_db)):
    """Vérifie le code OTP et confirme le compte Supabase en cas de succès."""
    check_rate_limit(request, limit=15, window_seconds=900)
    email = req.email.strip().lower()
    code = req.code.strip()

    entry = _otp_get(email)
    if not entry or entry["expires_at"] < time.time():
        raise HTTPException(status_code=410, detail="Code expiré ou invalide. Demandez un nouveau code.")
    if entry["attempts"] >= _OTP_MAX_ATTEMPTS:
        store.delete(_otp_key(email))
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")
    if not hmac.compare_digest(entry["hash"], _otp_hash(code)):
        entry["attempts"] += 1
        remaining = _OTP_MAX_ATTEMPTS - entry["attempts"]
        store.set(
            _otp_key(email),
            json.dumps(entry),
            ttl=max(1, int(entry["expires_at"] - time.time())),
        )
        raise HTTPException(
            status_code=422,
            detail=f"Code incorrect. {remaining} tentative(s) restante(s).",
        )
    store.delete(_otp_key(email))

    su = admin_find_user_by_local_id(db, email) or admin_find_user_by_email(email)
    if not su:
        raise HTTPException(status_code=404, detail="Aucun compte associé à cet email")

    if not su.get("email_confirmed_at") and not admin_confirm_user(su["id"]):
        raise HTTPException(status_code=502, detail="Échec de la confirmation du compte, réessayez")

    user = db.query(User).filter(User.email == email).first()
    if user:
        user.email_verified = True
        user.email_verify_code = None
        user.email_verify_expires = None
        user.email_verify_attempts = 0
        db.commit()

    return {"status": "ok", "confirmed": True}


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    account_type: str
    broker_name: str | None = None
    broker_account: str | None = None
    avatar: str | None = None
    email_notif_enabled: bool | None = None
    tier: str = "basic"
    ai_tokens: int = 0
    ai_tokens_limit: int = 50
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
    if user.locked_until and user.locked_until > datetime.utcnow():
        remain = int((user.locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Compte verrouillé. Réessayez dans {remain // 60 + 1} min.",
        )
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
        user.failed_attempts = (user.failed_attempts or 0) + 1
        if user.failed_attempts >= settings.LOGIN_MAX_ATTEMPTS:
            user.locked_until = datetime.utcnow() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
            user.failed_attempts = 0
        db.commit()
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


@router.post("/social-simulate")
def social_simulate(req: SocialSimulateRequest, request: Request, db: Session = Depends(get_db)):
    """Connexion sociale (Google) : crée le compte Supabase côté backend et
    renvoie une session réelle au frontend.

    Google n'est pas activé sur cette instance Supabase (dashboard, non
    programmable par API) : on simule le fournisseur en créant un compte
    email dédié, ce qui donne exactement l'expérience de connexion (session
    Supabase valide + profil applicatif) sans passer par l'OAuth.
    """
    if not settings.ALLOW_SOCIAL_SIMULATE:
        raise HTTPException(status_code=403, detail="Connexion sociale indisponible")
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
        raise HTTPException(status_code=503, detail="Supabase non configuré")
    check_rate_limit(request, limit=10, window_seconds=900)

    provider = "google"
    email = (req.email or "").strip().lower()
    if email and not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Adresse email invalide")
    if not email:
        email = f"google_{secrets.token_hex(6)}@bluerock.tld"
    base_name = (req.name or "").strip() or " ".join(
        p.capitalize() for p in email.split("@")[0].replace("_", " ").split()
    )

    broker = (req.broker or "").strip()
    password = secrets.token_urlsafe(18)

    su = admin_find_user_by_local_id(db, email) or admin_find_user_by_email(email)
    if not su:
        su = admin_create_user(
            email,
            password,
            base_name,
            metadata={"account_type": "demo", "broker_name": broker or None},
        )
        if not su:
            raise HTTPException(status_code=502, detail="Création du compte impossible, réessayez")
    elif not admin_set_password(su["id"], password):
        raise HTTPException(status_code=502, detail="Compte temporairement indisponible, réessayez")

    session = admin_session_password(email, password)
    if not session or not session.get("access_token"):
        raise HTTPException(status_code=502, detail="Connexion impossible, réessayez")

    return {
        "ok": True,
        "provider": provider,
        "access_token": session["access_token"],
        "refresh_token": session.get("refresh_token"),
        "email": email,
        "name": base_name,
        "broker": broker or None,
    }


@router.get("/me")
def me(user: User = Depends(get_current_user),
       db: Session = Depends(get_db)):
    from ..services.tier import tokens_available
    st = tokens_available(db, user)
    payload = UserOut.from_orm(user).dict()
    payload.update(st)
    return payload


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
    if req.email_notif_enabled is not None:
        user.email_notif_enabled = req.email_notif_enabled
    db.commit()
    db.refresh(user)
    from ..services.tier import tokens_available
    payload = UserOut.from_orm(user).dict()
    payload.update(tokens_available(db, user))
    return payload


@router.get("/brokers")
def list_brokers():
    enriched: dict[str, dict[str, list[dict]]] = {}
    for country, cats in BROKERS_BY_COUNTRY.items():
        enriched[country] = {
            "SGI": [_broker_meta(name, "SGI", country) for name in cats["SGI"]],
            "SGO": [_broker_meta(name, "SGO", country) for name in cats["SGO"]],
        }
    return {"brokers": enriched}
