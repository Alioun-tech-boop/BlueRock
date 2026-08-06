from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship
from ..database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(160), nullable=False)
    tagline = Column(String(300), default="")
    description = Column(Text, default="")
    status = Column(String(20), nullable=False, default="upcoming")  # upcoming | open | live | ended
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    prize_pool = Column(Float, default=0)          # total des prix (FCFA)
    prizes = Column(Text, default="")              # JSON : [{"rank": 1, "amount": 500000, "label": "..."}]
    rules = Column(Text, default="")               # JSON : liste de règles
    max_participants = Column(Integer, default=0)  # 0 = illimité
    starting_capital = Column(Float, default=10000000)  # capital fictif de base pour les inscrits sans positions
    winners = Column(Text, default="")             # JSON pour les défis terminés
    is_featured = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    entries = relationship("ChallengeEntry", back_populates="challenge", cascade="all, delete-orphan")


class ChallengeEntry(Base):
    __tablename__ = "challenge_entries"
    __table_args__ = (UniqueConstraint("challenge_id", "user_id", name="uq_challenge_entry"),)

    id = Column(Integer, primary_key=True, index=True)
    challenge_id = Column(Integer, ForeignKey("challenges.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    snapshot = Column(Text, default="{}")  # JSON : positions {SYM: {qty, avg_price}} au moment de l'inscription
    joined_at = Column(DateTime, server_default=func.now())

    challenge = relationship("Challenge", back_populates="entries")
