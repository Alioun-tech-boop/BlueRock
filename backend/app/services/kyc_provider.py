"""Provider KYC modulaire.

BlueRock s'appuie sur un moteur externe de vérification d'identité (Didit
aujourd'hui). L'ensemble des interactions se fait via cette interface afin de
pouvoir remplacer le fournisseur sans modifier le parcours utilisateur ni la
logique métier (statuts, webhooks, dossier).

Les statuts BlueRock et les statuts du fournisseur restent strictement
séparés : seul le webhook signé du fournisseur fait évoluer le statut KYC.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class KycSession:
    """Session de vérification créée chez le fournisseur."""

    provider_session_id: str
    vendor_data: str
    verification_url: str
    session_token: str | None = None
    raw: dict | None = None


@dataclass
class KycEvent:
    """Événement normalisé reçu du fournisseur (après vérification HMAC)."""

    provider_event_id: str
    provider_session_id: str
    vendor_data: str
    status: str          # statut exact du fournisseur (ex: "Approved")
    payload: dict


class KycProvider(ABC):
    """Interface commune : session + webhook + résultat."""

    name = "provider"

    @abstractmethod
    def create_session(self, vendor_data: str, language: str) -> KycSession:
        """Crée (ou réutilise) une session de vérification chez le fournisseur."""

    @abstractmethod
    def verify_webhook(self, headers: dict, raw_body: bytes) -> bool:
        """Vérifie l'authenticité d'un webhook (HMAC + fraîcheur du timestamp)."""

    @abstractmethod
    def parse_event(self, payload: dict) -> KycEvent:
        """Normalise un payload de webhook déjà vérifié."""

    @abstractmethod
    def fetch_decision(self, provider_session_id: str) -> dict | None:
        """Récupère le résultat détaillé d'une vérification (API fournisseur)."""
