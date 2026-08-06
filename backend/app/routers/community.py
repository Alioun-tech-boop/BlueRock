from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.community import (
    CommunityUser,
    CommunityPost,
    CommunityFollow,
    CommunityReaction,
    CommunityComment,
)
from ..models.market import MarketData
from ..models.company import Company
from .auth import get_current_user, get_optional_user
from ..models.user import User

router = APIRouter(prefix="/api/community", tags=["community"])

AVATAR_URL = "https://ui-avatars.com/api/?name={handle}&background={color}&color=fff&size=96"

# Palette par défaut des profils démo (stables)
PALETTE = ["#7266D9", "#2E7CF6", "#00C853", "#F59E0B", "#EC4899", "#06B6D4", "#F97316", "#8B5CF6", "#14B8A6", "#E11D48"]


class PostCreate(BaseModel):
    symbol: str = Field(min_length=2, max_length=20)
    sentiment: str = "bullish"
    title: str = Field(min_length=5, max_length=240)
    content: str = Field(default="", max_length=3000)


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=600)


def _avatar(handle: str, color: str) -> str:
    return AVATAR_URL.format(handle=handle.replace(" ", "_"), color=color.lstrip("#") or "7266D9")


def _user_out(u: CommunityUser, current: CommunityUser | None = None) -> dict:
    return {
        "id": u.id,
        "handle": u.handle,
        "display_name": u.display_name,
        "bio": u.bio or "",
        "avatar": _avatar(u.handle, u.avatar_color),
        "avatar_color": u.avatar_color,
        "verified": u.verified,
        "followers_count": len(u.followers),
        "following_count": len(u.following),
        "posts_count": len(u.posts),
        "is_following": bool(current and current.id != u.id and any(f.followed_id == u.id for f in current.following)),
    }


def _company_ctx(db: Session) -> dict[str, dict]:
    """Dernier point de marché + série de clôtures (30j) par symbole."""
    rows = (
        db.query(MarketData, Company)
        .join(Company, Company.id == MarketData.company_id)
        .order_by(MarketData.date.desc())
        .limit(2000)
        .all()
    )
    ctx: dict[str, dict] = {}
    for md, comp in rows:
        sym = comp.symbol
        c = ctx.setdefault(sym, {"name": comp.name, "price": None, "change_percent": None, "series": []})
        if c["price"] is None:
            c["price"] = md.close_price
            c["change_percent"] = md.change_percent
        if len(c["series"]) < 30:
            c["series"].append(md.close_price)
    for sym in ctx:
        ctx[sym]["series"] = list(reversed(ctx[sym]["series"]))
    return ctx


def _post_out(p: CommunityPost, company_ctx: dict[str, dict], current: CommunityUser | None = None) -> dict:
    cc = company_ctx.get(p.symbol) or {}
    return {
        "id": p.id,
        "author": _user_out(p.author, current),
        "symbol": p.symbol,
        "company_name": cc.get("name") or p.symbol,
        "sentiment": p.sentiment,
        "title": p.title,
        "content": p.content or "",
        "is_editor_pick": p.is_editor_pick,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "price": cc.get("price"),
        "change_percent": cc.get("change_percent"),
        "series": cc.get("series") or [],
        "rockets": len(p.reactions),
        "comments": len(p.comments),
        "rocketed": bool(current and any(r.user_id == current.id for r in p.reactions)),
    }


def _get_or_create_profile(db: Session, user: User) -> CommunityUser:
    profile = db.query(CommunityUser).filter(CommunityUser.user_id == user.id).first()
    if profile:
        return profile
    handle = "".join(ch if ch.isalnum() else "_" for ch in user.name.lower())[:24] or "trader"
    base = handle
    i = 2
    while db.query(CommunityUser).filter(CommunityUser.handle == handle).first():
        handle = f"{base}_{i}"
        i += 1
    profile = CommunityUser(
        user_id=user.id,
        handle=handle,
        display_name=user.name,
        bio="",
        avatar_color=PALETTE[(user.id or 0) % len(PALETTE)],
        verified=False,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/posts")
def list_posts(
    tab: str = "forYou",
    limit: int = Query(20, ge=1, le=50),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user) if user else None
    query = db.query(CommunityPost).options(
        joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
        joinedload(CommunityPost.author).joinedload(CommunityUser.following),
        joinedload(CommunityPost.reactions),
        joinedload(CommunityPost.comments),
    )
    if tab == "editorsPick":
        query = query.filter(CommunityPost.is_editor_pick.is_(True))
    elif tab == "following":
        if not current:
            return {"posts": []}
        followed_ids = [f.followed_id for f in current.following]
        query = query.filter(CommunityPost.author_id.in_(followed_ids)) if followed_ids else query.filter(False)
    posts = query.order_by(CommunityPost.created_at.desc()).limit(limit).all()
    ctx = _company_ctx(db)
    return {"posts": [_post_out(p, ctx, current) for p in posts]}


@router.get("/users")
def list_users(
    search: str = "",
    limit: int = Query(30, ge=1, le=50),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user) if user else None
    query = db.query(CommunityUser).options(
        joinedload(CommunityUser.followers),
        joinedload(CommunityUser.following),
        joinedload(CommunityUser.posts),
    )
    if search.strip():
        q = search.strip()
        query = query.filter(
            CommunityUser.handle.ilike(f"%{q}%") | CommunityUser.display_name.ilike(f"%{q}%")
        )
    users = query.order_by(CommunityUser.verified.desc(), CommunityUser.id.asc()).limit(limit).all()
    return {"users": [_user_out(u, current) for u in users]}


@router.get("/me")
def get_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Profil communautaire de l'utilisateur connecté + ses publications."""
    current = _get_or_create_profile(db, user)
    profile = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.reactions),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.comments),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.author),
        )
        .filter(CommunityUser.id == current.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    ctx = _company_ctx(db)
    posts = sorted(profile.posts, key=lambda p: p.created_at or datetime.min, reverse=True)
    user_out = _user_out(profile, current)
    user_out["rockets_received"] = sum(len(p.reactions) for p in profile.posts)
    return {
        "user": user_out,
        "posts": [_post_out(p, ctx, current) for p in posts],
    }


@router.get("/users/{user_id}")
def get_user(user_id: int, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    current = _get_or_create_profile(db, user) if user else None
    profile = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.reactions),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.comments),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.author),
        )
        .filter(CommunityUser.id == user_id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    ctx = _company_ctx(db)
    posts = sorted(profile.posts, key=lambda p: p.created_at or datetime.min, reverse=True)
    return {
        "user": _user_out(profile, current),
        "posts": [_post_out(p, ctx, current) for p in posts],
    }


@router.post("/users/{user_id}/follow")
def follow_user(
    user_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user)
    target = db.query(CommunityUser).filter(CommunityUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="Impossible de se suivre soi-même")
    existing = (
        db.query(CommunityFollow)
        .filter(CommunityFollow.follower_id == current.id, CommunityFollow.followed_id == target.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"following": False}
    db.add(CommunityFollow(follower_id=current.id, followed_id=target.id))
    db.commit()
    return {"following": True}


@router.post("/posts")
def create_post(
    req: PostCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user)
    symbol = req.symbol.upper()
    company = db.query(Company).filter(Company.symbol == symbol).first()
    if not company:
        raise HTTPException(status_code=422, detail="Symbole inconnu sur la BRVM")
    sentiment = req.sentiment if req.sentiment in ("bullish", "bearish", "neutral") else "bullish"
    post = CommunityPost(
        author_id=current.id,
        symbol=symbol,
        sentiment=sentiment,
        title=req.title.strip(),
        content=req.content.strip(),
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    ctx = _company_ctx(db)
    return _post_out(post, ctx, current)


@router.post("/posts/{post_id}/rocket")
def rocket_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    existing = (
        db.query(CommunityReaction)
        .filter(CommunityReaction.post_id == post.id, CommunityReaction.user_id == current.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"rocketed": False, "rockets": max(0, len(post.reactions) - 1)}
    db.add(CommunityReaction(post_id=post.id, user_id=current.id))
    db.commit()
    return {"rocketed": True, "rockets": len(post.reactions) + 1}


@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int, db: Session = Depends(get_db)):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    comments = (
        db.query(CommunityComment)
        .filter(CommunityComment.post_id == post_id)
        .options(joinedload(CommunityComment.author))
        .order_by(CommunityComment.created_at.asc())
        .all()
    )
    return {
        "comments": [
            {
                "id": c.id,
                "content": c.content,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "author": {
                    "id": c.author.id,
                    "handle": c.author.handle,
                    "display_name": c.author.display_name,
                    "avatar": _avatar(c.author.handle, c.author.avatar_color),
                    "verified": c.author.verified,
                },
            }
            for c in comments
        ]
    }


@router.post("/posts/{post_id}/comments")
def add_comment(
    post_id: int,
    req: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    comment = CommunityComment(post_id=post.id, author_id=current.id, content=req.content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return {
        "id": comment.id,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "author": {
            "id": current.id,
            "handle": current.handle,
            "display_name": current.display_name,
            "avatar": _avatar(current.handle, current.avatar_color),
            "verified": current.verified,
        },
    }


