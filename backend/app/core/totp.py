"""Authentification à deux facteurs TOTP (RFC 6238) + codes de secours.

TOTP implémenté via pyotp (algorithme standard, compatible Google
Authenticator / Authy / 1Password / FreeOTP...). Codes de secours hachés
(PBKDF2) — jamais stockés en clair.
"""
import hashlib
import secrets
import string

import pyotp
from fastapi import HTTPException

from ..config import settings


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    """Vérifie un code TOTP avec une tolérance de ±1 fenêtre (30s)."""
    if not secret or not code:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit() or len(code) != settings.TOTP_DIGITS:
        return False
    totp = pyotp.TOTP(secret, digits=settings.TOTP_DIGITS, interval=settings.TOTP_PERIOD)
    return totp.verify(code, valid_window=1)


def generate_recovery_codes(count: int | None = None) -> list[str]:
    """Génère des codes de secours lisibles, format XXXX-XXXX."""
    n = count or settings.RECOVERY_CODE_COUNT
    alphabet = string.ascii_uppercase + string.digits
    alphabet = alphabet.replace("O", "").replace("0", "").replace("I", "").replace("L", "")
    codes: list[str] = []
    seen: set[str] = set()
    while len(codes) < n:
        raw = "".join(secrets.choice(alphabet) for _ in range(8))
        code = f"{raw[:4]}-{raw[4:]}"
        if code in seen:
            continue
        seen.add(code)
        codes.append(code)
    return codes


def hash_recovery_code(code: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", code.encode(), code.encode(), 50_000).hex()


def verify_recovery_code(stored_hashes: str | None, code: str) -> bool:
    """Vérifie un code de secours contre la liste hachée.

    Les codes stockés sont séparés par '\n'. Le code vérifié est retiré
    (usage unique). Retourne (ok, hashes_restants).
    """
    if not stored_hashes or not code:
        return False
    code = code.strip().upper().replace(" ", "")
    if len(code) == 8:
        code = f"{code[:4]}-{code[4:]}"
    hashes = [h for h in stored_hashes.split("\n") if h]
    for h in hashes:
        if secrets.compare_digest(h, hash_recovery_code(code)):
            hashes.remove(h)
            return True
    return False


def consume_recovery_code(stored_hashes: str | None, code: str) -> str | None:
    """Vérifie ET consomme un code de secours (usage unique).

    Retourne la chaîne des hashes restants (ou ""), None si code invalide.
    """
    if not stored_hashes or not code:
        return None
    code = code.strip().upper().replace(" ", "")
    if len(code) == 8:
        code = f"{code[:4]}-{code[4:]}"
    hashes = [h for h in stored_hashes.split("\n") if h]
    for h in hashes:
        if secrets.compare_digest(h, hash_recovery_code(code)):
            hashes.remove(h)
            return "\n".join(hashes)
    return None


def check_email_attempts(attempts: int, max_attempts: int) -> None:
    """Limite le nombre d'essais de codes (vérification email / reset)."""
    if attempts >= max_attempts:
        raise HTTPException(
            status_code=429,
            detail="Trop de tentatives de code. Veuillez demander un nouveau code.",
        )
