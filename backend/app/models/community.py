from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, UniqueConstraint, Index, func
from sqlalchemy.orm import relationship
from ..database import Base


class CommunityUser(Base):
    __tablename__ = "community_users"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    handle = Column(String(40), unique=True, index=True, nullable=False)
    display_name = Column(String(120), nullable=False)
    bio = Column(String(400), default="")
    avatar_color = Column(String(7), default="#7266D9")
    verified = Column(Boolean, default=False)
    is_pro = Column(Boolean, default=False, nullable=False, index=True)  # professionnel vérifié (Phase 2)
    banned_at = Column(DateTime, nullable=True)  # exclu des écritures par la modération (Phase 6)
    reputation = Column(Integer, default=50, nullable=False)  # score de réputation (Phase 8)
    created_at = Column(DateTime, server_default=func.now())

    posts = relationship("CommunityPost", back_populates="author", cascade="all, delete-orphan")
    reactions = relationship("CommunityReaction", back_populates="user", cascade="all, delete-orphan")
    comments = relationship("CommunityComment", back_populates="author", cascade="all, delete-orphan")
    comment_reactions = relationship("CommunityCommentReaction", back_populates="user", cascade="all, delete-orphan")
    following = relationship(
        "CommunityFollow",
        foreign_keys="CommunityFollow.follower_id",
        back_populates="follower",
        cascade="all, delete-orphan",
    )
    followers = relationship(
        "CommunityFollow",
        foreign_keys="CommunityFollow.followed_id",
        back_populates="followed",
        cascade="all, delete-orphan",
    )
    memberships = relationship("CommunityMember", back_populates="user", cascade="all, delete-orphan")
    professional = relationship("CommunityProfessional", back_populates="user", cascade="all, delete-orphan", uselist=False)
    shares = relationship("CommunityShare", back_populates="user", cascade="all, delete-orphan")
    badges = relationship("CommunityBadge", back_populates="user", cascade="all, delete-orphan")
    saved_posts = relationship("CommunitySavedPost", back_populates="user", cascade="all, delete-orphan")
    events = relationship("CommunityEventRegistration", back_populates="user", cascade="all, delete-orphan")
    user = relationship("User", foreign_keys=[user_id])


class CommunityPost(Base):
    __tablename__ = "community_posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("community_groups.id"), nullable=True, index=True)  # publication de groupe (Phase 10)
    symbol = Column(String(20), index=True)
    sentiment = Column(String(10), default="bullish")  # bullish | bearish | neutral
    title = Column(String(240), nullable=False)
    content = Column(Text, default="")
    is_editor_pick = Column(Boolean, default=False)
    views = Column(Integer, default=0, nullable=False)  # lectures (Phase 5 — dashboard)
    hidden_at = Column(DateTime, nullable=True)  # masqué par la modération (Phase 6)
    scan_at = Column(DateTime, nullable=True)  # dernier scan IA (Phase 7)
    toxic_score = Column(Float, nullable=True)  # score de toxicité 0..1 (Phase 7)
    created_at = Column(DateTime, server_default=func.now())

    author = relationship("CommunityUser", back_populates="posts")
    group = relationship("CommunityGroup", back_populates="posts")
    reactions = relationship("CommunityReaction", back_populates="post", cascade="all, delete-orphan")
    comments = relationship("CommunityComment", back_populates="post", cascade="all, delete-orphan")
    attachments = relationship("CommunityAttachment", back_populates="post", cascade="all, delete-orphan")
    shares = relationship("CommunityShare", back_populates="post", cascade="all, delete-orphan")
    saved_by = relationship("CommunitySavedPost", back_populates="post", cascade="all, delete-orphan")


class CommunityShare(Base):
    """Partage (repost) d'une publication par un membre (Phase 3)."""
    __tablename__ = "community_shares"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_share"),)

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("CommunityPost", back_populates="shares")
    user = relationship("CommunityUser", back_populates="shares")


class CommunitySavedPost(Base):
    """Signet (publication enregistrée) par un membre (bouton Enregistrer)."""
    __tablename__ = "community_saved_posts"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_saved_pair"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("CommunityUser", back_populates="saved_posts")
    post = relationship("CommunityPost", back_populates="saved_by")


class CommunityPostSeen(Base):
    """Trace des publications déjà vues par un utilisateur (fil personnalisé :
    évite de réafficher en boucle les mêmes posts et priorise les contenus
    non lus)."""
    __tablename__ = "community_post_seen"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    seen_at = Column(DateTime, server_default=func.now())


class CommunityFollow(Base):
    __tablename__ = "community_follows"
    __table_args__ = (UniqueConstraint("follower_id", "followed_id", name="uq_follow_pair"),)

    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    followed_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    follower = relationship("CommunityUser", foreign_keys=[follower_id], back_populates="following")
    followed = relationship("CommunityUser", foreign_keys=[followed_id], back_populates="followers")


class CommunityReaction(Base):
    __tablename__ = "community_reactions"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_reaction"),)

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("CommunityPost", back_populates="reactions")
    user = relationship("CommunityUser", back_populates="reactions")


class CommunityComment(Base):
    __tablename__ = "community_comments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    content = Column(String(600), nullable=False)
    hidden_at = Column(DateTime, nullable=True)  # masqué par la modération (Phase 6)
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("CommunityPost", back_populates="comments")
    author = relationship("CommunityUser", back_populates="comments")
    reactions = relationship("CommunityCommentReaction", back_populates="comment", cascade="all, delete-orphan")


class CommunityAttachment(Base):
    __tablename__ = "community_attachments"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("community_posts.id"), nullable=False, index=True)
    kind = Column(String(20), nullable=False)  # image | video | file | link
    url = Column(String(2000), nullable=False)  # chemin storage (image/video/file) ou URL réelle (link)
    name = Column(String(240), default="")
    mime = Column(String(120), default="")
    created_at = Column(DateTime, server_default=func.now())

    post = relationship("CommunityPost", back_populates="attachments")


class CommunityCommentReaction(Base):
    __tablename__ = "community_comment_reactions"
    __table_args__ = (UniqueConstraint("comment_id", "user_id", name="uq_comment_reaction"),)

    id = Column(Integer, primary_key=True, index=True)
    comment_id = Column(Integer, ForeignKey("community_comments.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())

    comment = relationship("CommunityComment", back_populates="reactions")
    user = relationship("CommunityUser", back_populates="comment_reactions")


class CommunityDraft(Base):
    """Brouillon d'analyse (Phase 5 — Création & dashboard).

    Un brouillon appartient à un profil communautaire ; la publication
    transforme le brouillon en CommunityPost (le brouillon est supprimé).
    """

    __tablename__ = "community_drafts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    symbol = Column(String(20), default="")
    sentiment = Column(String(10), default="bullish")
    title = Column(String(240), default="")
    content = Column(Text, default="")
    link_url = Column(String(500), default="")
    link_title = Column(String(240), default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("CommunityUser")


class CommunityGroup(Base):
    """Communauté (groupe) — Phase 1 Fondations.

    Un groupe a un créateur (rôle CREATOR) et des membres avec des rôles
    vérifiés côté serveur : member | moderator | admin | creator.
    """

    __tablename__ = "community_groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    slug = Column(String(140), unique=True, index=True, nullable=False)
    description = Column(Text, default="")
    category = Column(String(60), default="general", index=True)  # general | trading | sector | pro | challenge
    visibility = Column(String(20), default="public", index=True)  # public | private | invite_only
    status = Column(String(20), default="active", index=True)  # active | suspended | archived
    rules = Column(Text, default="")
    avatar = Column(String(500), default="")
    banner = Column(String(500), default="")
    creator_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    is_paid = Column(Boolean, default=False, nullable=False)  # accès payant (Phase 10)
    price_xof = Column(Integer, nullable=True)  # prix d'accès en FCFA si is_paid

    creator = relationship("CommunityUser", foreign_keys=[creator_id])
    members = relationship("CommunityMember", back_populates="community", cascade="all, delete-orphan")
    posts = relationship("CommunityPost", back_populates="group", cascade="all, delete-orphan")


class CommunityMember(Base):
    """Appartenance d'un profil communautaire à un groupe (Phase 1 Fondations).

    Contrainte UNIQUE(community_id, user_id) : impossible d'avoir deux
    enregistrements pour le même couple. Le rôle et le statut sont toujours
    résolus côté serveur, jamais depuis le client.
    """

    __tablename__ = "community_members"
    __table_args__ = (
        UniqueConstraint("community_id", "user_id", name="uq_community_member"),
        Index("ix_community_members_community_status", "community_id", "status"),
        Index("ix_community_members_community_role", "community_id", "role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("community_groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    role = Column(String(20), default="member", nullable=False)  # member | moderator | admin | creator
    status = Column(String(20), default="active", nullable=False)  # active | invited | pending | suspended | banned
    order_pending_id = Column(Integer, nullable=True)  # ordre de paiement d'accès payant en attente (Phase 10)
    created_at = Column(DateTime, server_default=func.now())

    community = relationship("CommunityGroup", back_populates="members")
    user = relationship("CommunityUser", back_populates="memberships")


class CommunityBadge(Base):
    """Badge de réputation débloqué automatiquement (Phase 8).

    La collection est dérivée de l'activité et de la qualité du profil ;
    les badges sont synchronisés côté serveur (jamais créés par le client).
    """

    __tablename__ = "community_badges"
    __table_args__ = (UniqueConstraint("user_id", "code", name="uq_user_badge"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id", ondelete="CASCADE"), nullable=False, index=True)
    code = Column(String(40), nullable=False)
    earned_at = Column(DateTime, server_default=func.now())

    user = relationship("CommunityUser", back_populates="badges")


class CommunityReport(Base):
    """Signalement d'un contenu ou d'un profil (Phase 6 — Modération & sécurité).

    Un signalement est créé par un membre (ou anonyme) sur une cible
    post | comment | user. Le staff le traite via la file de modération :
    hide (masquage), delete (suppression) ou dismiss (classement sans suite).
    """

    __tablename__ = "community_reports"
    __table_args__ = (Index("ix_community_reports_target", "target_type", "target_id"),)

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("community_users.id", ondelete="SET NULL"), nullable=True, index=True)
    target_type = Column(String(20), nullable=False)  # post | comment | user
    target_id = Column(Integer, nullable=False)
    reason = Column(String(60), nullable=False)  # spam | harassment | misinformation | other
    details = Column(String(600), default="")
    status = Column(String(20), default="open", nullable=False, index=True)  # open | resolved | dismissed
    action = Column(String(20), default="", nullable=False)  # hide | delete | dismiss | ban
    note = Column(String(500), default="")
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())

    reporter = relationship("CommunityUser", foreign_keys=[reporter_id])


class CommunityProfessional(Base):
    """Profil professionnel communautaire vérifié (Phase 2 — Professionnels).

    Workflow de vérification : pending → approved | rejected (décision d'un
    membre du staff, users.role >= compliance). Le badge est dérivé du champ
    CommunityUser.is_pro, maintenu à l'approbation/au rejet.
    """

    __tablename__ = "community_professionals"
    __table_args__ = (UniqueConstraint("user_id", name="uq_community_professional_user"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    # analyst | fund_manager | broker | advisor | economist | journalist | accountant | other
    category = Column(String(40), nullable=False)
    title = Column(String(120), nullable=False)
    company = Column(String(120), default="")
    license = Column(String(120), default="")
    certifications = Column(Text, default="")
    bio_pro = Column(Text, default="")
    website = Column(String(200), default="")
    status = Column(String(20), default="pending", nullable=False, index=True)  # pending | approved | rejected
    review_note = Column(String(500), default="")
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    submitted_at = Column(DateTime, server_default=func.now())
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    user = relationship("CommunityUser", back_populates="professional")


class CommunityEvent(Base):
    """Événement communautaire (Phase 9 — Événements & Premium).

    Créé et modéré par le staff (users.role >= compliance). Les événements
    premium_only sont accessibles aux abonnés Premium (tier Pro). L'inscription
    respecte la capacité : au-delà, le membre est placé en liste d'attente.
    """

    __tablename__ = "community_events"

    id = Column(Integer, primary_key=True, index=True)
    organizer_id = Column(Integer, ForeignKey("community_users.id", ondelete="SET NULL"), nullable=True, index=True)
    title = Column(String(180), nullable=False)
    description = Column(Text, default="")
    kind = Column(String(20), nullable=False)  # webinar | ama | meetup | workshop
    starts_at = Column(DateTime, nullable=False, index=True)
    ends_at = Column(DateTime, nullable=True)
    location = Column(String(200), default="")
    speakers = Column(Text, default="")
    agenda = Column(Text, default="")
    capacity = Column(Integer, nullable=True)
    premium_only = Column(Boolean, default=False, nullable=False)
    status = Column(String(20), default="published", nullable=False, index=True)  # draft | published | cancelled
    reminded_at = Column(DateTime, nullable=True)  # marqueur anti-doublon des rappels
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    organizer = relationship("CommunityUser", foreign_keys=[organizer_id])
    registrations = relationship("CommunityEventRegistration", back_populates="event", cascade="all, delete-orphan")


class CommunityEventRegistration(Base):
    """Inscription / désistement / attente à un événement (Phase 9).

    Contrainte UNIQUE(event_id, user_id) : une seule ligne par membre et par
    événement ; le statut fait foi (registered | waitlisted | cancelled).
    """

    __tablename__ = "community_event_registrations"
    __table_args__ = (UniqueConstraint("event_id", "user_id", name="uq_event_registration"),)

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("community_events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("community_users.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="registered", nullable=False)  # registered | waitlisted | cancelled
    created_at = Column(DateTime, server_default=func.now())

    event = relationship("CommunityEvent", back_populates="registrations")
    user = relationship("CommunityUser", back_populates="events")
