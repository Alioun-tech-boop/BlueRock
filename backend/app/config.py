import secrets
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "BlueRock - BRVM Financial Intelligence"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql://bluerock:bluerock123@localhost:5432/bluerock"
    # Pool SQLAlchemy : borné pour rester sous les limites du pooler Supabase
    # (max_overflow inclus). pre_ping + recycle évitent les connexions mortes
    # après idle timeout du pooler.
    SQL_POOL_SIZE: int = 5
    SQL_MAX_OVERFLOW: int = 10
    SQL_POOL_RECYCLE: int = 300
    SECRET_KEY: str = secrets.token_hex(32)
    OPENAI_API_KEY: Optional[str] = None
    GEMINI_API_KEY: Optional[str] = None
    GEMINI_MODEL: str = "gemini-flash-latest"
    BRVM_BASE_URL: str = "https://www.brvm.org"
    API_BASE_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"
    FINANCIAL_SYNC_ENABLED: bool = True  # False en dev → pas d'ingestion PDF au démarrage

    # Supabase (auth JWT, storage, admin API)
    SUPABASE_URL: Optional[str] = None
    SUPABASE_ANON_KEY: Optional[str] = None
    SUPABASE_SERVICE_KEY: Optional[str] = None
    SUPABASE_JWT_REFRESH: int = 300  # cache JWKS (s)

    # Didit — moteur de vérification d'identité (KYC)
    # Vide = vérification Didit désactivée (le parcours KYC n'est pas disponible).
    DIDIT_API_KEY: Optional[str] = None
    DIDIT_WEBHOOK_SECRET: Optional[str] = None
    DIDIT_API_URL: str = "https://verification.didit.me"
    # Origine du flux hébergé (iframe) — autorisée par le CSP + Permissions-Policy.
    # Les sessions sont hébergées sur verify.didit.me (pas l'API verification.didit.me).
    DIDIT_FRAME_ORIGIN: str = "https://verify.didit.me"
    # URL de retour BlueRock après la vérification (le statut y est ajouté en query).
    DIDIT_CALLBACK_URL: str = "http://localhost:3000/kyc?didit=return"
    # Fenêtre de tolérance (s) pour le timestamp des webhooks (anti-rejeu).
    DIDIT_WEBHOOK_TIMESTAMP_SKEW: int = 300

    # Paiements Stripe via Supabase Edge Functions.
    # Le backend ne détient aucune clé Stripe : il crée les ordres pending
    # et délègue la création du checkout au client Stripe des Edge Functions.
    # URL de retour après paiement (le webhook confirme le crédit).
    STRIPE_RETURN_URL: str = "http://localhost:3000/portfolio?pay=return"
    # URL de base des Edge Functions Supabase (dérivée de SUPABASE_URL si vide).
    SUPABASE_FUNCTIONS_URL: Optional[str] = None
    # Bornes transactionnelles des dépôts (XOF).
    DEPOSIT_MIN_AMOUNT: float = 100
    DEPOSIT_MAX_AMOUNT: float = 950_000
    # Devise des dépôts (BRVM) — XOF.
    DEPOSIT_CURRENCY: str = "XOF"

    # NGX (Nigerian Exchange) — fournisseur de données NGN Market API.
    # Clé gratuite : https://ngnmarket.com/developer (plan Free : 3 000 appels/mois,
    # prix rafraîchis ~20 min pendant la séance 09:00-16:00 WAT).
    # Vide = flux NGX désactivé (les sociétés restent au catalogue avec prix de
    # référence jusqu'à ce qu'une clé soit configurée).
    NGN_MARKET_API_KEY: Optional[str] = None
    NGN_MARKET_API_URL: str = "https://api.ngnmarket.com/v1"
    NGX_ENABLED: bool = True
    # Solde de départ et plafond d'investissement des portefeuilles NGX démo (NGN).
    NGX_DEMO_BALANCE: float = 50_000_000
    NGX_DEMO_INVEST_LIMIT: float = 25_000_000

    # Sécurité
    ADMIN_TOKEN: Optional[str] = None
    ALLOWED_HOSTS: str = "localhost,127.0.0.1,.bluerock.ai"
    RATE_LIMIT_ENABLED: bool = True
    # Redis partagé entre instances (rate limit, codes OTP, échecs PIN, locks
    # de jobs). Vide = store en mémoire par processus (comportement mono-instance).
    # Recommandé : Upstash Redis Free (0 €, 256 MB, 10 000 cmd/jour).
    REDIS_URL: Optional[str] = None
    # IPs des reverse-proxies de confiance (ex: "10.0.0.1,10.0.0.2").
    # Si vide, le header X-Forwarded-For est ignoré (anti-spoofing).
    TRUST_PROXY_IPS: str = ""
    AUTH_TOKEN_TTL_SECONDS: int = 7 * 24 * 3600  # 7 jours
    AI_DAILY_QUOTA: int = 50  # questions IA / utilisateur / jour (legacy, remplacé par les tokens)

    # Offres d'abonnement : Basic (gratuit) vs Pro (toutes bourses).
    TIER_BASIC: str = "basic"
    TIER_PRO: str = "pro"
    # Tokens IA mensuels par tier (1 question = 1 token).
    AI_TOKENS_BASIC: int = 50
    AI_TOKENS_PRO: int = 500
    # Abonnement Pro : prix mensuel (XOF) facturé par Stripe (mode subscription).
    SUBSCR_PRO_PRICE: float = 4900
    SUBSCR_CURRENCY: str = "XOF"
    # URL de retour après le checkout d'abonnement (webhook confirme le passage Pro).
    SUBSCR_RETURN_URL: str = "http://localhost:3000/premium?subscribe=return"

    # Fonctionnalités temporairement indisponibles (interrupteurs).
    # False = la fonctionnalité est masquée côté UI et refusée côté API.
    # Réactivables à tout moment via .env, sans redéploiement.
    FEATURE_SUBSCRIPTION_ENABLED: bool = True      # abonnement Pro (offre payante)
    FEATURE_BROKER_ACCOUNTS_ENABLED: bool = True   # ouverture de compte-titre réel (SGI)
    FEATURE_KYC_ENABLED: bool = True               # parcours de vérification d'identité
    FEATURE_PAID_CHALLENGES_ENABLED: bool = True   # défis à inscription payante

    # Politique de mot de passe
    PASSWORD_MIN_LENGTH: int = 8
    PASSWORD_REQUIRE_COMPLEXITY: bool = True  # minuscule + majuscule + chiffre + caractère spécial

    # Vérification email
    EMAIL_VERIFY_TTL_SECONDS: int = 15 * 60  # code valide 15 min
    EMAIL_VERIFY_MAX_ATTEMPTS: int = 5       # échecs avant régénération du code
    EMAIL_VERIFY_RESEND_SECONDS: int = 60    # délai min entre deux envois

    # Verrouillage de compte
    LOGIN_MAX_ATTEMPTS: int = 5              # échecs avant verrouillage
    LOGIN_LOCK_MINUTES: int = 15             # durée du verrouillage

    # Passerelle courtiers (Broker Connect)
    BROKER_SESSION_TTL_SECONDS: int = 1800        # session courtier : 30 min
    BROKER_AUTH_MAX_ATTEMPTS: int = 5            # échecs de PIN avant verrouillage
    BROKER_LOCK_MINUTES: int = 15                # durée du verrouillage

    # Réinitialisation de mot de passe
    PASSWORD_RESET_TTL_SECONDS: int = 15 * 60
    PASSWORD_RESET_MAX_ATTEMPTS: int = 5

    # 2FA TOTP
    TOTP_ISSUER: str = "BlueRock"
    TOTP_DIGITS: int = 6
    TOTP_PERIOD: int = 30
    RECOVERY_CODE_COUNT: int = 8

    # SMTP (vide = emails désactivés, codes loggés en console en dev)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASS: Optional[str] = None
    SMTP_FROM: Optional[str] = None
    SMTP_STARTTLS: bool = True
    SMTP_TIMEOUT: int = 15

    # Brevo (transactionnel) — si BREVO_API_KEY est défini, les emails sont
    # envoyés via l'API Brevo (fiabilité IP cloud), sinon via SMTP.
    BREVO_API_KEY: Optional[str] = None
    BREVO_API_URL: str = "https://api.brevo.com/v3"

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"


settings = Settings()


if not settings.DEBUG and not (settings.SECRET_KEY and len(settings.SECRET_KEY) >= 32):
    import logging
    logging.getLogger(__name__).critical(
        "SECRET_KEY absent ou trop court dans l'environnement de production : "
        "les codes OTP et protections seraient invalidés à chaque redémarrage."
    )
    raise RuntimeError("SECRET_KEY doit être défini (>= 32 caractères) hors mode DEBUG")
