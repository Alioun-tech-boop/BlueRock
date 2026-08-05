import hashlib
import hmac
import re
import secrets
import string
import time
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import settings
from ..core import email as mail
from ..core.rate_limit import check_rate_limit
from ..core.totp import (
    consume_recovery_code,
    generate_recovery_codes,
    generate_totp_secret,
    hash_recovery_code,
    totp_provisioning_uri,
    verify_totp,
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
    """Métadonnées déterministes par courtier (note, ville, année, descriptif).

    La note est stable entre les appels : même courtier → même note.
    """
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


def _validate_password(password: str) -> None:
    """Politique de mot de passe : longueur + complexité."""
    if len(password) < settings.PASSWORD_MIN_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Le mot de passe doit contenir au moins {settings.PASSWORD_MIN_LENGTH} caractères.",
        )
    if settings.PASSWORD_REQUIRE_COMPLEXITY:
        checks = {
            "minuscule": lambda p: any(c.islower() for c in p),
            "majuscule": lambda p: any(c.isupper() for c in p),
            "chiffre": lambda p: any(c.isdigit() for c in p),
            "caractère spécial": lambda p: any(c in string.punctuation for c in p),
        }
        missing = [label for label, ok in checks.items() if not ok(password)]
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Le mot de passe doit contenir : {", ".join(missing)}.",
            )


def _generate_code(length: int = 6) -> str:
    return "".join(secrets.choice(string.digits) for _ in range(length))


def _issue_token(user: User) -> str:
    """Token opaque avec expiration embarquée : <hex>.<exp_epoch>."""
    expiry = int(time.time()) + settings.AUTH_TOKEN_TTL_SECONDS
    user.api_token = f"{secrets.token_hex(24)}.{expiry}"
    user.last_login = datetime.utcnow()
    return user.api_token


def get_current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    user = _resolve_token(authorization, db)
    if not user:
        raise HTTPException(status_code=401, detail="Session invalide, reconnectez-vous")
    return user


def get_optional_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User | None:
    return _resolve_token(authorization, db)


def _resolve_token(authorization: str, db: Session) -> User | None:
    if not authorization.startswith("Bearer "):
        return None
    token_full = authorization.removeprefix("Bearer ").strip()
    if not token_full:
        return None
    user = db.query(User).filter(User.api_token == token_full).first()
    if not user:
        # Migration douce : anciens tokens hex simples (sans expiration)
        raw = token_full.rpartition(".")[0]
        if "." in token_full and raw:
            user = db.query(User).filter(User.api_token == raw).first()
    if not user:
        return None
    if "." in user.api_token:
        try:
            if int(user.api_token.rpartition(".")[2]) < time.time():
                return None
        except ValueError:
            return None
    return user


def _check_locked(user: User) -> None:
    if user.locked_until and user.locked_until > datetime.utcnow():
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=423,
            detail=f"Compte verrouillé. Réessayez dans {remaining} min.",
        )


def _record_failure(user: User, db: Session) -> None:
    user.failed_attempts = (user.failed_attempts or 0) + 1
    if user.failed_attempts >= settings.LOGIN_MAX_ATTEMPTS:
        user.locked_until = datetime.utcnow() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
        user.failed_attempts = 0
    db.commit()


def _reset_failures(user: User, db: Session) -> None:
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()


def _send_verify_code(user: User, db: Session, request: Request) -> None:
    """(Ré)envoie le code de vérification email avec délai anti-spam."""
    now = datetime.utcnow()
    if user.email_verify_sent_at and (now - user.email_verify_sent_at).total_seconds() < settings.EMAIL_VERIFY_RESEND_SECONDS:
        wait = int(settings.EMAIL_VERIFY_RESEND_SECONDS - (now - user.email_verify_sent_at).total_seconds()) + 1
        raise HTTPException(status_code=429, detail=f"Un code a déjà été envoyé. Réessayez dans {wait}s.")
    code = _generate_code()
    user.email_verify_code = code
    user.email_verify_expires = now + timedelta(seconds=settings.EMAIL_VERIFY_TTL_SECONDS)
    user.email_verify_attempts = 0
    user.email_verify_sent_at = now
    db.commit()
    mail.send_verify_email(user.email, code, settings.EMAIL_VERIFY_TTL_SECONDS // 60)


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: str
    password: str = Field(min_length=1, max_length=128)
    account_type: str = "demo"  # demo | real
    broker_name: str | None = None
    broker_account: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str


class VerifyEmailRequest(BaseModel):
    email: str
    code: str


class TotpLoginRequest(BaseModel):
    """Étape 2 de connexion : code TOTP + token temporaire d'étape 1."""
    temp_token: str
    code: str


class TotpSetupRequest(BaseModel):
    """Activation du 2FA : code TOTP confirmant le scan du QR."""
    code: str


class TotpDisableRequest(BaseModel):
    """Désactivation du 2FA : code TOTP OU code de secours."""
    code: str
    type: str = "totp"  # totp | recovery


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    password: str = Field(min_length=1, max_length=128)


class UpdateProfileRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    avatar: str | None = Field(default=None, max_length=16)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    account_type: str
    broker_name: str | None = None
    broker_account: str | None = None
    avatar: str | None = None
    email_verified: bool
    totp_enabled: bool
    created_at: datetime | None = None
    token: str | None = None

    class Config:
        from_attributes = True


def _user_out(user: User, token: str | None = None) -> UserOut:
    return UserOut.from_orm(user).model_copy(update={"token": token})


@router.post("/register")
def register(req: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=8, window_seconds=900)  # 8 inscriptions / 15 min / IP
    email = req.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Adresse email invalide")
    _validate_password(req.password)
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Un compte existe déjà avec cet email")

    account_type = req.account_type if req.account_type in ("demo", "real") else "demo"
    broker_name = (req.broker_name or "").strip()
    broker_account = (req.broker_account or "").strip()
    if account_type == "real":
        if not broker_name or broker_name not in BROKERS:
            raise HTTPException(status_code=422, detail="Compte réel : sélectionnez un courtier")
        if not broker_account:
            raise HTTPException(status_code=422, detail="Compte réel : numéro de compte courtier requis")

    salt = secrets.token_hex(16)
    user = User(
        name=req.name.strip(),
        email=email,
        password_hash=f"{salt}${hash_password(req.password, salt)}",
        account_type=account_type,
        broker_name=broker_name or None,
        broker_account=broker_account or None,
        email_verified=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    code = _generate_code()
    user.email_verify_code = code
    user.email_verify_expires = datetime.utcnow() + timedelta(seconds=settings.EMAIL_VERIFY_TTL_SECONDS)
    user.email_verify_attempts = 0
    user.email_verify_sent_at = datetime.utcnow()
    db.commit()

    mail.send_verify_email(user.email, code, settings.EMAIL_VERIFY_TTL_SECONDS // 60)
    return {"status": "pending_verification", "email": user.email}


@router.post("/verify-email")
def verify_email(req: VerifyEmailRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=15, window_seconds=300)
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if user.email_verified:
        return {"status": "already_verified", "email": user.email}
    if user.email_verify_attempts >= settings.EMAIL_VERIFY_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")

    code = req.code.strip().replace(" ", "")
    valid = (
        user.email_verify_code is not None
        and hmac.compare_digest(user.email_verify_code, code)
        and user.email_verify_expires is not None
        and user.email_verify_expires > datetime.utcnow()
    )
    if not valid:
        user.email_verify_attempts = (user.email_verify_attempts or 0) + 1
        db.commit()
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")

    user.email_verified = True
    user.email_verify_code = None
    user.email_verify_expires = None
    user.email_verify_attempts = 0
    db.commit()
    mail.send_welcome_email(user.email, user.name)
    return {"status": "verified", "email": user.email}


@router.post("/resend-verification")
def resend_verification(req: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=3, window_seconds=600)
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if user.email_verified:
        return {"status": "already_verified"}
    _send_verify_code(user, db, request)
    return {"status": "sent"}


@router.post("/login")
def login(req: LoginRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=10, window_seconds=900)  # 10 essais / 15 min / IP
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    _check_locked(user)

    salt, _, stored = user.password_hash.partition("$")
    if not hmac.compare_digest(hash_password(req.password, salt), stored):
        _record_failure(user, db)
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect")

    _reset_failures(user, db)

    if not user.email_verified:
        code = _generate_code()
        user.email_verify_code = code
        user.email_verify_expires = datetime.utcnow() + timedelta(seconds=settings.EMAIL_VERIFY_TTL_SECONDS)
        user.email_verify_attempts = 0
        user.email_verify_sent_at = datetime.utcnow()
        db.commit()
        mail.send_verify_email(user.email, code, settings.EMAIL_VERIFY_TTL_SECONDS // 60)
        raise HTTPException(
            status_code=403,
            detail={
                "error": "email_not_verified",
                "message": "Votre email n'est pas encore vérifié. Un code vous a été envoyé.",
            },
        )

    if user.totp_enabled:
        # Étape 1/2 : mot de passe OK → token temporaire (5 min) pour l'étape TOTP
        temp = f"tmp.{secrets.token_hex(16)}.{int(time.time()) + 300}"
        user.api_token = temp
        db.commit()
        return {"status": "totp_required", "temp_token": temp}

    token = _issue_token(user)
    db.commit()
    return _user_out(user, token)


@router.post("/login-2fa")
def login_2fa(req: TotpLoginRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=10, window_seconds=900)
    user = db.query(User).filter(User.api_token == req.temp_token).first()
    if not user or not req.temp_token.startswith("tmp."):
        raise HTTPException(status_code=401, detail="Session de connexion expirée, recommencez.")
    try:
        if int(req.temp_token.rpartition(".")[2]) < time.time():
            user.api_token = None
            db.commit()
            raise HTTPException(status_code=401, detail="Session de connexion expirée, recommencez.")
    except ValueError:
        raise HTTPException(status_code=401, detail="Session de connexion invalide.")

    _check_locked(user)

    code = req.code.strip().replace(" ", "")
    if verify_totp(user.totp_secret or "", code):
        _reset_failures(user, db)
        token = _issue_token(user)
        db.commit()
        return _user_out(user, token)

    # Tentative de code de secours
    remaining = consume_recovery_code(user.recovery_codes, code)
    if remaining is not None:
        user.recovery_codes = remaining or None
        _reset_failures(user, db)
        token = _issue_token(user)
        db.commit()
        return _user_out(user, token)

    _record_failure(user, db)
    raise HTTPException(status_code=401, detail="Code 2FA invalide.")


@router.post("/2fa/setup")
def setup_2fa(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Le 2FA est déjà activé sur ce compte.")
    secret = generate_totp_secret()
    user.totp_secret = secret
    db.commit()
    return {
        "secret": secret,
        "provisioning_uri": totp_provisioning_uri(secret, user.email),
    }


@router.post("/2fa/enable")
def enable_2fa(req: TotpSetupRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="Le 2FA est déjà activé sur ce compte.")
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Demandez d'abord le QR code (POST /2fa/setup).")
    if not verify_totp(user.totp_secret, req.code):
        raise HTTPException(status_code=400, detail="Code incorrect. Vérifiez que votre application affiche bien ce code.")

    user.totp_enabled = True
    codes = generate_recovery_codes()
    user.recovery_codes = "\n".join(hash_recovery_code(c) for c in codes)
    db.commit()
    return {"status": "enabled", "recovery_codes": codes}


@router.post("/2fa/disable")
def disable_2fa(req: TotpDisableRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.totp_enabled:
        raise HTTPException(status_code=400, detail="Le 2FA n'est pas activé sur ce compte.")
    if req.type == "recovery":
        remaining = consume_recovery_code(user.recovery_codes, req.code)
        if remaining is None:
            raise HTTPException(status_code=400, detail="Code de secours invalide.")
        user.recovery_codes = remaining or None
    else:
        if not verify_totp(user.totp_secret or "", req.code):
            raise HTTPException(status_code=400, detail="Code 2FA invalide.")
    user.totp_enabled = False
    user.totp_secret = None
    user.recovery_codes = None
    db.commit()
    return {"status": "disabled"}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=3, window_seconds=600)
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # Réponse générique pour ne pas révéler l'existence du compte
        return {"status": "sent"}
    now = datetime.utcnow()
    code = _generate_code()
    user.password_reset_code = code
    user.password_reset_expires = now + timedelta(seconds=settings.PASSWORD_RESET_TTL_SECONDS)
    user.password_reset_attempts = 0
    db.commit()
    mail.send_reset_email(user.email, code, settings.PASSWORD_RESET_TTL_SECONDS // 60)
    return {"status": "sent"}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, limit=10, window_seconds=900)
    _validate_password(req.password)
    email = req.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Compte introuvable")
    if user.password_reset_attempts >= settings.PASSWORD_RESET_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Trop de tentatives. Demandez un nouveau code.")

    code = req.code.strip().replace(" ", "")
    valid = (
        user.password_reset_code is not None
        and hmac.compare_digest(user.password_reset_code, code)
        and user.password_reset_expires is not None
        and user.password_reset_expires > datetime.utcnow()
    )
    if not valid:
        user.password_reset_attempts = (user.password_reset_attempts or 0) + 1
        db.commit()
        raise HTTPException(status_code=400, detail="Code invalide ou expiré.")

    salt = secrets.token_hex(16)
    user.password_hash = f"{salt}${hash_password(req.password, salt)}"
    user.password_reset_code = None
    user.password_reset_expires = None
    user.password_reset_attempts = 0
    user.failed_attempts = 0
    user.locked_until = None
    user.api_token = None  # révoque toutes les sessions actives
    db.commit()
    return {"status": "reset"}


@router.post("/logout")
def logout(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.api_token = None
    db.commit()
    return {"status": "logged_out"}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


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
    return _user_out(user)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_password(req.new_password)
    salt, _, stored = user.password_hash.partition("$")
    if not hmac.compare_digest(hash_password(req.current_password, salt), stored):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")

    new_salt = secrets.token_hex(16)
    user.password_hash = f"{new_salt}${hash_password(req.new_password, new_salt)}"
    user.failed_attempts = 0
    user.locked_until = None
    db.commit()
    return {"status": "changed"}


@router.get("/brokers")
def list_brokers():
    enriched: dict[str, dict[str, list[dict]]] = {}
    for country, cats in BROKERS_BY_COUNTRY.items():
        enriched[country] = {
            "SGI": [_broker_meta(name, "SGI", country) for name in cats["SGI"]],
            "SGO": [_broker_meta(name, "SGO", country) for name in cats["SGO"]],
        }
    return {"brokers": enriched}
