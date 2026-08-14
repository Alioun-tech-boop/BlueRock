"""Implémentation Didit du provider KYC (API v3).

- Création de session : POST /v3/session/ (x-api-key, jamais côté navigateur).
- Webhooks : HMAC-SHA256 — X-Signature-V2 (canonical JSON) en priorité,
  X-Signature (octets bruts) en secours ; fenêtre de temps anti-rejeu.
- Résultat : GET /v3/session/{id}/decision/ (tableaux pluriels v3).
"""

import hashlib
import hmac
import json
import logging
import time
from typing import Any

import requests

from ..config import settings
from .kyc_provider import KycProvider, KycSession, KycEvent

logger = logging.getLogger(__name__)

# Workflow Didit « KYC + AML » — config par session, PAS un secret, PAS une env
# var (voir https://docs.didit.me) : passé dans le corps de POST /v3/session/.
WORKFLOW_ID = "4043fd4d-cc7f-44e0-9eeb-2346d8643dc6"

# Statuts exacts (case-sensitive) du fournisseur.
DIDIT_NOT_STARTED = "Not Started"
DIDIT_IN_PROGRESS = "In Progress"
DIDIT_RESUBMITTED = "Resubmitted"
DIDIT_APPROVED = "Approved"
DIDIT_DECLINED = "Declined"
DIDIT_IN_REVIEW = "In Review"
DIDIT_EXPIRED = "Expired"
DIDIT_ABANDONED = "Abandoned"
DIDIT_KYC_EXPIRED = "Kyc Expired"

FINAL_STATUSES = {DIDIT_APPROVED, DIDIT_DECLINED, DIDIT_IN_REVIEW, DIDIT_EXPIRED, DIDIT_ABANDONED, DIDIT_KYC_EXPIRED}


def _shorten_floats(obj: Any) -> Any:
    """Entiers au lieu de flottants « ronds » (canonical JSON Didit)."""
    if isinstance(obj, float) and obj.is_integer():
        return int(obj)
    if isinstance(obj, dict):
        return {k: _shorten_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_shorten_floats(v) for v in obj]
    return obj


def canonical_json(payload: dict) -> str:
    """Ré-encodage canonique signé par Didit : clés triées, JSON compact,
    Unicode préservé (ensure_ascii=False), flottants entiers raccourcis."""
    return json.dumps(_shorten_floats(payload), sort_keys=True, separators=(",", ":"), ensure_ascii=False)


class DiditProvider(KycProvider):
    name = "didit"

    def __init__(self):
        self.api_url = settings.DIDIT_API_URL.rstrip("/")
        self.api_key = settings.DIDIT_API_KEY or ""
        self.webhook_secret = settings.DIDIT_WEBHOOK_SECRET or ""
        self.workflow_id = WORKFLOW_ID
        self.skew = settings.DIDIT_WEBHOOK_TIMESTAMP_SKEW

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.webhook_secret)

    # ---------------------------------------------------------------- sessions

    def create_session(self, vendor_data: str, language: str) -> KycSession:
        if not self.configured:
            raise RuntimeError("Didit n'est pas configuré (DIDIT_API_KEY, DIDIT_WEBHOOK_SECRET)")
        resp = requests.post(
            f"{self.api_url}/v3/session/",
            headers={"Content-Type": "application/json", "x-api-key": self.api_key},
            json={
                "workflow_id": self.workflow_id,
                "vendor_data": vendor_data,
                "callback": settings.DIDIT_CALLBACK_URL,
                "callback_method": "both",
                "language": language if language in ("fr", "en") else None,
                "metadata": {"vendor_data": vendor_data},
            },
            timeout=30,
        )
        if resp.status_code >= 400:
            logger.error("Didit create_session failed: %s %s", resp.status_code, resp.text[:500])
            raise RuntimeError(f"Didit : création de session impossible ({resp.status_code})")
        data = resp.json()
        session_id = data.get("session_id") or data.get("id") or ""
        url = data.get("verification_url") or data.get("url") or ""
        if not session_id or not url:
            raise RuntimeError("Didit : réponse de création de session incomplète")
        return KycSession(
            provider_session_id=str(session_id),
            vendor_data=vendor_data,
            verification_url=url,
            session_token=data.get("session_token"),
            raw=data,
        )

    # ----------------------------------------------------------------- webhooks

    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        ts = headers.get("x-timestamp") or headers.get("X-Timestamp")
        try:
            if ts is None or abs(int(time.time()) - int(ts)) > self.skew:
                logger.warning("Didit webhook rejeté : timestamp absent ou trop ancien (%s)", ts)
                return False
        except (TypeError, ValueError):
            return False
        if not self.webhook_secret:
            return False
        secret = self.webhook_secret.encode("utf-8")

        sig_v2 = headers.get("x-signature-v2") or headers.get("X-Signature-V2")
        if sig_v2:
            try:
                canonical = canonical_json(json.loads(raw_body.decode("utf-8")))
                expected = hmac.new(secret, canonical.encode("utf-8"), hashlib.sha256).hexdigest()
                if hmac.compare_digest(expected, sig_v2):
                    return True
            except (ValueError, KeyError):
                pass

        sig = headers.get("x-signature") or headers.get("X-Signature")
        if sig:
            expected = hmac.new(secret, raw_body, hashlib.sha256).hexdigest()
            if hmac.compare_digest(expected, sig):
                return True

        logger.warning("Didit webhook rejeté : signature invalide")
        return False

    def parse_event(self, payload: dict) -> KycEvent:
        event_id = str(payload.get("event_id") or "")
        session_id = str(payload.get("session_id") or "")
        vendor_data = str(payload.get("vendor_data") or "")
        status = payload.get("status") or ""
        if not event_id or not session_id:
            raise ValueError("Payload Didit incomplet (event_id/session_id)")
        return KycEvent(
            provider_event_id=event_id,
            provider_session_id=session_id,
            vendor_data=vendor_data,
            status=status,
            payload=payload,
        )

    # ---------------------------------------------------------------- decision

    def fetch_decision(self, provider_session_id: str) -> dict | None:
        if not self.api_key:
            return None
        try:
            resp = requests.get(
                f"{self.api_url}/v3/session/{provider_session_id}/decision/",
                headers={"x-api-key": self.api_key},
                timeout=30,
            )
            if resp.status_code >= 400:
                logger.warning("Didit decision fetch %s: %s", resp.status_code, resp.text[:300])
                return None
            return resp.json()
        except requests.RequestException as e:
            logger.warning("Didit decision fetch error: %s", e)
            return None


def get_kyc_provider() -> DiditProvider:
    return DiditProvider()
