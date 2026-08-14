"""Sécurité de la passerelle courtiers (Broker Connect).

- Tokens de session courtier : payload JSON en base64url signé en
  HMAC-SHA256 (SECRET_KEY). Chaque token est enregistré côté serveur
  (hash SHA-256) → révocation immédiate possible.
- Chaque appel vérifie : signature, expiration, session non révoquée,
  compte client actif. Rien n'est fiable côté client seul.
- PIN : PBKDF2-SHA256 (mêmes primitives que les codes patrimoine).
- Journalisation systématique des tentatives (succès/échec) et
  verrouillage après échecs répétés.
"""

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import settings
from ..models.broker_connect import BrokerClientAccount, BrokerLoginEvent, BrokerSession
from .security import hash_pin, verify_pin

logger = logging.getLogger(__name__)

TOKEN_PREFIX = "BR1."


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _sign(payload_b64: str) -> str:
    return hmac.new(settings.SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()


def issue_broker_token(client_account_id: int, db: Session, ip: str | None = None,
                       user_agent: str | None = None) -> tuple[str, BrokerSession]:
    """Crée une session courtier et renvoie (token, session)."""
    jti = uuid.uuid4().hex
    now = int(time.time())
    ttl = settings.BROKER_SESSION_TTL_SECONDS
    payload = {
        "sub": "broker_session",
        "baid": client_account_id,
        "jti": jti,
        "iat": now,
        "exp": now + ttl,
    }
    payload_b64 = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    token = f"{TOKEN_PREFIX}{payload_b64}.{_sign(payload_b64)}"

    session = BrokerSession(
        client_account_id=client_account_id,
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        ip=(ip or "")[:64],
        user_agent=(user_agent or "")[:200],
        expires_at=datetime.utcnow() + timedelta(seconds=ttl),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return token, session


def verify_broker_token(token: str, db: Session) -> BrokerSession:
    """Valide un token courtier : signature, expiration, révocation, compte actif."""
    if not token or not token.startswith(TOKEN_PREFIX):
        raise HTTPException(status_code=401, detail="Session courtier invalide")
    try:
        payload_b64, sig = token[len(TOKEN_PREFIX):].rsplit(".", 1)
        expected = _sign(payload_b64)
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad signature")
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=" * (-len(payload_b64) % 4)))
        if payload.get("sub") != "broker_session":
            raise ValueError("bad subject")
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Session courtier invalide")

    session = (db.query(BrokerSession)
               .filter(BrokerSession.token_hash == hashlib.sha256(token.encode()).hexdigest())
               .first())
    if not session or session.revoked_at is not None:
        raise HTTPException(status_code=401, detail="Session courtier révoquée")
    if session.expires_at and session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session courtier expirée")

    account = db.query(BrokerClientAccount).filter(
        BrokerClientAccount.id == session.client_account_id
    ).first()
    if not account or account.status != "active":
        raise HTTPException(status_code=401, detail="Compte courtier inactif")
    return session


def revoke_session(session: BrokerSession, db: Session) -> None:
    session.revoked_at = datetime.utcnow()
    db.commit()


def revoke_all_sessions(client_account_id: int, db: Session) -> None:
    db.query(BrokerSession).filter(
        BrokerSession.client_account_id == client_account_id,
        BrokerSession.revoked_at.is_(None),
    ).update({"revoked_at": datetime.utcnow()}, synchronize_session=False)
    db.commit()


def audit(db: Session, account_id: int | None, broker_name: str | None,
          account_number: str | None, success: bool, reason: str | None,
          ip: str | None = None, user_agent: str | None = None) -> None:
    try:
        db.add(BrokerLoginEvent(
            client_account_id=account_id,
            broker_name=(broker_name or "")[:120],
            account_number=account_number,
            success=success,
            reason=reason,
            ip=(ip or "")[:64],
            user_agent=(user_agent or "")[:200],
        ))
        db.commit()
    except Exception as e:  # le journal ne doit jamais casser l'API
        logger.warning(f"Broker audit failed: {e}")
        db.rollback()


def check_locked(account: BrokerClientAccount) -> None:
    if account.locked_until and account.locked_until > datetime.utcnow():
        remain = int((account.locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(
            status_code=423,
            detail=f"Compte temporairement verrouillé après plusieurs échecs. "
                   f"Réessayez dans {max(remain, 1)}s.",
        )


def register_failure(db: Session, account: BrokerClientAccount) -> None:
    """Échec de PIN : incrémente le compteur et verrouille le compte après
    BROKER_AUTH_MAX_ATTEMPTS échecs (durée BROKER_LOCK_MINUTES)."""
    account.failed_attempts = (account.failed_attempts or 0) + 1
    if account.failed_attempts >= settings.BROKER_AUTH_MAX_ATTEMPTS:
        account.locked_until = datetime.utcnow() + timedelta(minutes=settings.BROKER_LOCK_MINUTES)
        account.failed_attempts = 0
    db.commit()


def register_success(db: Session, account: BrokerClientAccount) -> None:
    account.failed_attempts = 0
    account.locked_until = None
    db.commit()


def check_account_pin(account: BrokerClientAccount, pin: str) -> bool:
    """Vérifie le PIN avec comparaison en temps constant (verify_pin → hmac)."""
    return bool(pin) and verify_pin(pin, account.pin_hash)


def mask_account_number(account_number: str) -> str:
    n = account_number or ""
    if len(n) <= 4:
        return "••••" + n
    return "•••• " + n[-4:]


def public_account(account: BrokerClientAccount, include_linked: bool = True) -> dict:
    """Sortie sécurisée : jamais de PIN, numéro masqué."""
    out = {
        "id": account.id,
        "broker_name": account.broker_name,
        "account_number_masked": mask_account_number(account.account_number),
        "holder_name": account.holder_name,
        "status": account.status,
        "cash_balance": round(account.cash_balance or 0, 2),
        "last_sync_at": account.last_sync_at.isoformat() if account.last_sync_at else None,
    }
    if include_linked:
        out["linked"] = account.linked_user_id is not None
        out["linked_user_id"] = account.linked_user_id
    return out


def generate_broker_ref(account: BrokerClientAccount) -> str:
    """Référence d'ordre côté courtier (unique, traçable)."""
    return f"{account.broker_name[:3].upper()}-{account.id}-{int(time.time() * 1000)}"
