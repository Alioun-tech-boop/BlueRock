import secrets
from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "BlueRock - BRVM Financial Intelligence"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    DATABASE_URL: str = "postgresql://bluerock:bluerock123@localhost:5432/bluerock"
    SECRET_KEY: str = secrets.token_hex(32)
    OPENAI_API_KEY: Optional[str] = None
    BRVM_BASE_URL: str = "https://www.brvm.org"
    API_BASE_URL: str = "http://localhost:8000"

    # Sécurité
    ADMIN_TOKEN: Optional[str] = None
    ALLOWED_HOSTS: str = "localhost,127.0.0.1,.bluerock.ai"
    RATE_LIMIT_ENABLED: bool = True
    AUTH_TOKEN_TTL_SECONDS: int = 7 * 24 * 3600  # 7 jours
    AI_DAILY_QUOTA: int = 50  # questions IA / utilisateur / jour

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

    class Config:
        env_file = ".env"


settings = Settings()
