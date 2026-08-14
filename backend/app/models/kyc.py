"""KYC — vérification d'identité unique pour tous les utilisateurs.

Le dossier KYC (identité + profil investisseur) est unique : il peut être
transmis à n'importe quelle SGI lors de l'ouverture d'un compte.

Le moteur de vérification d'identité est externe (Didit). Le statut KYC
n'est mis à jour qu'à partir d'événements fiables (webhooks signés) du
fournisseur — jamais depuis le navigateur.
"""

from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import relationship
from ..database import Base

# Statuts KYC BlueRock (indépendants des statuts SGI et des statuts Didit) :
#   not_started            — aucun dossier
#   in_progress            — session de vérification créée
#   document_submitted     — document d'identité soumis (checks en cours)
#   verification_in_progress — vérifications (liveness / face match) en cours
#   verified               — identité vérifiée par le fournisseur
#   review_required        — vérification supplémentaire nécessaire
#   rejected               — vérification refusée
#   retry_required         — le processus peut être recommencé
#   error                  — erreur technique de vérification


class UserKyc(Base):
    __tablename__ = "user_kyc"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)

    user = relationship("User")

    # Statut du dossier (statuts BlueRock, voir ci-dessus)
    status = Column(String, nullable=False, default="not_started")
    submitted_at = Column(DateTime, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    verified_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)

    verifications = relationship(
        "KycVerification", back_populates="kyc",
        cascade="all, delete-orphan", order_by="KycVerification.id",
    )

    # Étape 1 — identité
    account_type = Column(String, default="particulier")  # particulier | entreprise
    civility = Column(String, nullable=True)              # m | mme
    last_name = Column(String, nullable=True)             # nom de famille
    first_name = Column(String, nullable=True)            # prénom(s)
    full_name = Column(String, nullable=True)             # agrégat "nom prénom(s)" (legacy / recaps)
    gender = Column(String, nullable=True)                # male | female
    birth_date = Column(String, nullable=True)
    birth_place = Column(String, nullable=True)
    nationality = Column(String, nullable=True)
    marital_status = Column(String, nullable=True)        # single | married | divorced | widowed
    nif = Column(String, nullable=True)

    # Entreprise (personne morale)
    company_name = Column(String, nullable=True)
    company_rc = Column(String, nullable=True)
    company_nif = Column(String, nullable=True)

    # Étape 2 — pièce d'identité
    id_type = Column(String, nullable=True)               # cni | passeport | ninea | npi
    id_number = Column(String, nullable=True)
    id_issue_date = Column(String, nullable=True)
    id_expiry_date = Column(String, nullable=True)

    # Étape 2 — coordonnées
    address = Column(String, nullable=True)
    city = Column(String, nullable=True)
    country = Column(String, nullable=True)
    phone = Column(String, nullable=True)

    # Étape 3 — situation financière
    profession = Column(String, nullable=True)
    employer = Column(String, nullable=True)
    monthly_income = Column(String, nullable=True)        # tranche: <250k | 250k-500k | 500k-1m | 1m-3m | >3m
    source_of_funds = Column(String, nullable=True)       # salaire | entreprise | epargne | investissements | succession | autre
    is_pep = Column(Boolean, default=False, nullable=False)      # personne politiquement exposée
    tax_residence = Column(String, nullable=True)

    # Étape 4 — profil investisseur
    invest_experience = Column(String, nullable=True)     # none | lt1 | 1-3 | 3-5 | gt5 (années)
    invest_objectives = Column(String, nullable=True)     # growth | income | balanced | speculation
    invest_knowledge = Column(String, nullable=True)      # none | basic | good | expert
    risk_tolerance = Column(String, nullable=True)        # low | medium | high
    invest_horizon = Column(String, nullable=True)        # lt1 | 1-3 | 3-5 | gt5 (années)

    # Étape 5 — validation
    signature_name = Column(String, nullable=True)
    consent = Column(Boolean, default=False, nullable=False)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    documents = relationship("KycDocument", back_populates="kyc",
                             cascade="all, delete-orphan", order_by="KycDocument.id")


class KycDocument(Base):
    __tablename__ = "kyc_documents"

    id = Column(Integer, primary_key=True, index=True)
    kyc_id = Column(Integer, ForeignKey("user_kyc.id"), nullable=False, index=True)
    doc_type = Column(String, nullable=False, index=True)
    original_name = Column(String, nullable=False)
    stored_name = Column(String, nullable=False)
    content_type = Column(String, nullable=True)
    size = Column(Integer, default=0)
    uploaded_at = Column(DateTime, server_default=func.now())

    kyc = relationship("UserKyc", back_populates="documents")


class KycVerification(Base):
    """Session de vérification chez le fournisseur (Didit) — 1..n par dossier.

    Chaque session est rattachée sans ambiguïté à un utilisateur BlueRock
    (vendor_data = "br_<user_id>"). Un utilisateur ne peut jamais accéder à
    la vérification d'un autre utilisateur.
    """

    __tablename__ = "kyc_verifications"

    id = Column(Integer, primary_key=True, index=True)
    kyc_id = Column(Integer, ForeignKey("user_kyc.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    provider = Column(String, nullable=False, default="didit")
    provider_session_id = Column(String, nullable=False, unique=True, index=True)
    vendor_data = Column(String, nullable=False, index=True)
    session_status = Column(String, nullable=True)   # statut exact du fournisseur
    verification_url = Column(String, nullable=True)  # URL du flux hébergé (iframe)
    decision = Column(Text, nullable=True)           # JSON brut du résultat
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, nullable=True, onupdate=func.now())

    kyc = relationship("UserKyc", back_populates="verifications")


class KycWebhookEvent(Base):
    """Journal d'événements webhook du fournisseur — idempotence.

    L'événement est enregistré avant traitement ; un même event_id reçu deux
    fois (retry, fan-out) ne déclenche qu'un seul traitement.
    """

    __tablename__ = "kyc_webhook_events"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, default="didit")
    provider_event_id = Column(String, nullable=False, unique=True, index=True)
    provider_session_id = Column(String, nullable=False, index=True)
    vendor_data = Column(String, nullable=True, index=True)
    webhook_type = Column(String, nullable=True)
    status = Column(String, nullable=True)
    payload = Column(Text, nullable=True)            # JSON brut
    processed = Column(Boolean, default=False, nullable=False)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
