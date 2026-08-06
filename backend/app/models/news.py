from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from ..database import Base

class NewsItem(Base):
    """News marché agrégées (BRVM, presse, sociétés) persistées en base.

    Permet de conserver l'historique de l'année en cours au-delà du cache
    mémoire (200 items) de l'agrégateur temps réel.
    """
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    url_real = Column(String(600), unique=True, index=True, nullable=False)
    url = Column(String(600))
    title = Column(String(300))
    source = Column(String(100))
    category = Column(String(50))
    image = Column(String(600), default="")
    symbol = Column(String(20))
    published_at = Column(DateTime(timezone=True), index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
