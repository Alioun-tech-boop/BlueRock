from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, func
from ..database import Base


class Announcement(Base):
    """Communiqué éditorial géré par l'administration (plateforme admin).

    Affiché côté client (page d'accueil, fil, etc.) via /api/announcements.
    """

    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=True)
    source = Column(String(120), nullable=True)
    category = Column(String(40), nullable=False, default="general")  # general | market | feature | event
    link_url = Column(String(500), nullable=True)
    image = Column(String(500), nullable=True)
    active = Column(Boolean, default=True, nullable=False, server_default="true")
    published_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)