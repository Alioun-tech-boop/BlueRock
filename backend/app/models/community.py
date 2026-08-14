from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, UniqueConstraint, func
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


class CommunityPost(Base):
    __tablename__ = "community_posts"

    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("community_users.id"), nullable=False, index=True)
    symbol = Column(String(20), index=True)
    sentiment = Column(String(10), default="bullish")  # bullish | bearish | neutral
    title = Column(String(240), nullable=False)
    content = Column(Text, default="")
    is_editor_pick = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())

    author = relationship("CommunityUser", back_populates="posts")
    reactions = relationship("CommunityReaction", back_populates="post", cascade="all, delete-orphan")
    comments = relationship("CommunityComment", back_populates="post", cascade="all, delete-orphan")
    attachments = relationship("CommunityAttachment", back_populates="post", cascade="all, delete-orphan")


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
