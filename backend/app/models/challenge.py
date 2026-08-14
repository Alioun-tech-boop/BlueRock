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
    entry_fee = Column(Float, default=0)           # frais de participation en FCFA (0 = gratuit)
    registration_end = Column(DateTime, nullable=True)  # fin des inscriptions (None = toujours ouvertes)
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
    # pending = paiement des frais en attente (aucun portefeuille créé) ;
    # paid = inscription effective (portefeuille virtuel créé) ;
    # refunded = frais remboursés après désinscription.
    status = Column(String(20), default="paid", nullable=False)
    order_id = Column(Integer, ForeignKey("deposit_orders.id"), nullable=True, index=True)
    snapshot = Column(Text, default="{}")  # JSON : positions {SYM: {qty, avg_price}} au moment de l'inscription
    joined_at = Column(DateTime, server_default=func.now())

    challenge = relationship("Challenge", back_populates="entries")
    portfolio = relationship("ChallengePortfolio", back_populates="entry", uselist=False,
                             cascade="all, delete-orphan")


class ChallengePortfolio(Base):
    """Portefeuille 100 % virtuel, dédié au défi : capital fictif + positions + historique."""
    __tablename__ = "challenge_portfolios"
    __table_args__ = (UniqueConstraint("entry_id", name="uq_challenge_portfolio_entry"),)

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("challenge_entries.id"), nullable=False, index=True)
    cash = Column(Float, default=0, nullable=False)   # liquidités virtuelles restantes
    created_at = Column(DateTime, server_default=func.now())

    entry = relationship("ChallengeEntry", back_populates="portfolio")
    positions = relationship("ChallengePosition", back_populates="portfolio",
                             cascade="all, delete-orphan")
    trades = relationship("ChallengeTrade", back_populates="portfolio",
                          cascade="all, delete-orphan")


class ChallengePosition(Base):
    __tablename__ = "challenge_positions"
    __table_args__ = (UniqueConstraint("portfolio_id", "symbol", name="uq_challenge_position"),)

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("challenge_portfolios.id"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    qty = Column(Float, default=0, nullable=False)
    avg_price = Column(Float, default=0, nullable=False)
    current_price = Column(Float, nullable=True)   # dernier cours de marché synchronisé (live BRVM, sinon clôture)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    portfolio = relationship("ChallengePortfolio", back_populates="positions")


class ChallengeTrade(Base):
    __tablename__ = "challenge_trades"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("challenge_portfolios.id"), nullable=False, index=True)
    symbol = Column(String(20), nullable=False)
    side = Column(String(10), nullable=False)  # buy | sell
    qty = Column(Float, nullable=False)
    price = Column(Float, nullable=False)
    total = Column(Float, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    portfolio = relationship("ChallengePortfolio", back_populates="trades")


class ChallengeValueSnapshot(Base):
    """Valeur quotidienne du portefeuille virtuel d'un inscrit (sparkline de performance)."""
    __tablename__ = "challenge_value_snapshots"
    __table_args__ = (UniqueConstraint("entry_id", "day", name="uq_challenge_snapshot"),)

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("challenge_entries.id"), nullable=False, index=True)
    day = Column(DateTime, nullable=False, index=True)   # début de journée
    value = Column(Float, default=0, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
