"""Journal d'audit applicatif (append-only).

Enregistre qui a fait quoi, quand, depuis où, sur quelle ressource.
Ne contient JAMAIS de secrets, de tokens, de mots de passe ni de contenu
PII complet (les identifiants de ressource suffisent à l'investigation ; les
détails PII restent dans les tables métier protégées).
"""

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from ..database import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    actor_role = Column(String(32), nullable=True)  # user | admin | legacy-admin | system
    action = Column(String(64), nullable=False, index=True)
    resource_type = Column(String(48), nullable=False, index=True)
    resource_id = Column(String(64), nullable=True, index=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(256), nullable=True)
    meta = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_audit_log_created_user", "created_at", "user_id"),
    )