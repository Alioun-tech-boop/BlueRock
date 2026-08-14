from datetime import datetime
import logging
import os
import threading
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.rate_limit import check_rate_limit
from ..core.supabase_auth import storage_signed_url, storage_upload
from ..database import get_db
from ..models.community import (
    CommunityUser,
    CommunityPost,
    CommunityFollow,
    CommunityReaction,
    CommunityComment,
    CommunityAttachment,
    CommunityCommentReaction,
)
from ..models.market import MarketData
from ..models.company import Company
from .auth import get_current_user, get_optional_user
from ..models.user import User

router = APIRouter(prefix="/api/community", tags=["community"])

logger = logging.getLogger(__name__)

AVATAR_URL = "https://ui-avatars.com/api/?name={handle}&background={color}&color=fff&size=96"

MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB

STORAGE_BUCKET = "uploads"
STORAGE_PREFIX = "community"

# Palette par défaut des profils démo (stables)
PALETTE = ["#7266D9", "#2E7CF6", "#00C853", "#F59E0B", "#EC4899", "#06B6D4", "#F97316", "#8B5CF6", "#14B8A6", "#E11D48"]


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
        "is_me": bool(current and current.id == u.id),
        "followers_count": len(u.followers),
        "following_count": len(u.following),
        "posts_count": len(u.posts),
        "is_following": bool(current and current.id != u.id and any(f.followed_id == u.id for f in current.following)),
    }


def _get_profile(db: Session, user: User) -> CommunityUser | None:
    """Profil communautaire en LECTURE seule (jamais créé sur un GET)."""
    if not user:
        return None
    return db.query(CommunityUser).filter(CommunityUser.user_id == user.id).first()


def _company_ctx(db: Session) -> dict[str, dict]:
    """Dernier point de marché + série de clôtures (30j) par symbole.
    Cache 60 s : la série est identique pour toutes les requêtes de la fenêtre."""
    import threading, time as _time
    now = _time.time()
    with _ctx_lock:
        if _ctx_cache and now - _ctx_cache["ts"] < _CTX_TTL:
            return _ctx_cache["data"]
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
    with _ctx_lock:
        _ctx_cache["ts"] = now
        _ctx_cache["data"] = ctx
    return ctx


_ctx_cache: dict = {}
_ctx_lock = threading.Lock()
_CTX_TTL = 60  # secondes


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
        "attachments": _attachments_out(p),
    }


def _attachment_public_url(a: CommunityAttachment) -> str:
    """URL publique des pièces jointes : signée (Supabase Storage) pour les
    médias/fichiers, brute pour les liens."""
    if a.kind == "link":
        return a.url or ""
    if a.kind in ("image", "video", "file") and a.url:
        signed = storage_signed_url(STORAGE_BUCKET, a.url)
        return signed or ""
    return ""


def _attachments_out(p: CommunityPost) -> list[dict]:
    return [
        {
            "id": a.id,
            "kind": a.kind,
            "url": _attachment_public_url(a),
            "name": a.name or "",
            "mime": a.mime or "",
        }
        for a in (p.attachments or [])
    ]


def _guess_media_kind(content_type: str, filename: str) -> str:
    ct = (content_type or "").lower()
    name = (filename or "").lower()
    if ct.startswith("image/") or name.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".svg", ".bmp")):
        return "image"
    if ct.startswith("video/") or name.endswith((".mp4", ".webm", ".mov", ".m4v", ".mkv", ".avi", ".quicktime")):
        return "video"
    return "file"


async def _store_upload(upload: UploadFile) -> tuple[str, str, str]:
    """Stocke un média/fichier dans Supabase Storage.
    Retourne (chemin_storage, nom, mime). Lève HTTPException si invalide."""
    content = await upload.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Fichier vide")
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 Mo)")
    filename = os.path.basename(upload.filename or "fichier")
    safe_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    storage_path = f"{STORAGE_PREFIX}/{safe_name}"
    mime = (upload.content_type or "application/octet-stream").split(";")[0]
    if not storage_upload(STORAGE_BUCKET, storage_path, content, mime):
        logger.warning("Storage Supabase indisponible pour %s", storage_path)
        raise HTTPException(status_code=502, detail="Impossible de stocker le média")
    return storage_path, filename[:240], mime[:120]


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
    current = _get_profile(db, user)
    query = db.query(CommunityPost).options(
        joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
        joinedload(CommunityPost.author).joinedload(CommunityUser.following),
        joinedload(CommunityPost.reactions),
        joinedload(CommunityPost.comments),
        joinedload(CommunityPost.attachments),
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
    current = _get_profile(db, user)
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
            joinedload(CommunityUser.posts).joinedload(CommunityPost.attachments),
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
    current = _get_profile(db, user)
    profile = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.reactions),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.comments),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.author),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.attachments),
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
    request: Request = None,
):
    check_rate_limit(request, limit=30, window_seconds=60)  # 30 follow/unfollow / min / IP
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
async def create_post(
    symbol: str = Form(...),
    sentiment: str = Form("bullish"),
    title: str = Form(...),
    content: str = Form(""),
    media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    link_url: Optional[str] = Form(None),
    link_title: Optional[str] = Form(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 posts / min / IP
    current = _get_or_create_profile(db, user)
    symbol = symbol.upper()
    company = db.query(Company).filter(Company.symbol == symbol).first()
    if not company:
        raise HTTPException(status_code=422, detail="Symbole inconnu sur la BRVM")
    sentiment = sentiment if sentiment in ("bullish", "bearish", "neutral") else "bullish"
    title = (title or "").strip()
    content = (content or "").strip()
    if len(title) < 5:
        raise HTTPException(status_code=422, detail="Titre trop court (5 caractères minimum)")
    if len(content) > 3000:
        raise HTTPException(status_code=422, detail="Contenu trop long (3000 caractères maximum)")

    attachments: list[CommunityAttachment] = []
    if media and media.filename:
        path, name, mime = await _store_upload(media)
        attachments.append(CommunityAttachment(
            kind=_guess_media_kind(mime, name), url=path, name=name, mime=mime,
        ))
    if file and file.filename:
        path, name, mime = await _store_upload(file)
        attachments.append(CommunityAttachment(kind="file", url=path, name=name, mime=mime))
    if link_url:
        link_url = link_url.strip()
        if not link_url.lower().startswith(("http://", "https://")):
            raise HTTPException(status_code=422, detail="Lien invalide (http/https requis)")
        attachments.append(CommunityAttachment(
            kind="link", url=link_url[:2000], name=(link_title or "").strip()[:240] or link_url[:240],
        ))

    post = CommunityPost(
        author_id=current.id,
        symbol=symbol,
        sentiment=sentiment,
        title=title,
        content=content,
    )
    db.add(post)
    if attachments:
        db.flush()
        for a in attachments:
            a.post_id = post.id
        db.add_all(attachments)
    db.commit()
    db.refresh(post)
    post = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.comments),
            joinedload(CommunityPost.attachments),
        )
        .filter(CommunityPost.id == post.id)
        .first()
    )
    ctx = _company_ctx(db)
    return _post_out(post, ctx, current)


class ProfileUpdate(BaseModel):
    bio: str = Field(default="", max_length=400)


@router.put("/me")
def update_me(
    req: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Met à jour la biographie du profil communautaire connecté."""
    current = _get_or_create_profile(db, user)
    current.bio = req.bio.strip()[:400]
    db.commit()
    db.refresh(current)
    return _user_out(current, current)


@router.post("/posts/{post_id}/rocket")
def rocket_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=60, window_seconds=60)  # 60 rockets / min / IP
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
        count = (
            db.query(func.count(CommunityReaction.id))
            .filter(CommunityReaction.post_id == post.id)
            .scalar()
        ) or 0
        return {"rocketed": False, "rockets": count}
    db.add(CommunityReaction(post_id=post.id, user_id=current.id))
    db.commit()
    count = (
        db.query(func.count(CommunityReaction.id))
        .filter(CommunityReaction.post_id == post.id)
        .scalar()
    ) or 0
    return {"rocketed": True, "rockets": count}


@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int,
                  user: User | None = Depends(get_optional_user),
                  db: Session = Depends(get_db),
                  offset: int = Query(0, ge=0),
                  limit: int = Query(50, ge=1, le=200)):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    current = _get_profile(db, user)
    comments = (
        db.query(CommunityComment)
        .filter(CommunityComment.post_id == post_id)
        .options(
            joinedload(CommunityComment.author),
            joinedload(CommunityComment.reactions),
        )
        .order_by(CommunityComment.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    total = (
        db.query(func.count(CommunityComment.id))
        .filter(CommunityComment.post_id == post_id)
        .scalar()
    ) or 0
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
                "reactions": len(c.reactions),
                "reacted": bool(current and any(r.user_id == current.id for r in c.reactions)),
            }
            for c in comments
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/posts/{post_id}/comments/{comment_id}/react")
def react_comment(
    post_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=60, window_seconds=60)  # 60 réactions / min / IP
    current = _get_or_create_profile(db, user)
    comment = (
        db.query(CommunityComment)
        .filter(CommunityComment.id == comment_id, CommunityComment.post_id == post_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")
    existing = (
        db.query(CommunityCommentReaction)
        .filter(CommunityCommentReaction.comment_id == comment.id, CommunityCommentReaction.user_id == current.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        count = (
            db.query(func.count(CommunityCommentReaction.id))
            .filter(CommunityCommentReaction.comment_id == comment.id)
            .scalar()
        ) or 0
        return {"reacted": False, "reactions": count}
    db.add(CommunityCommentReaction(comment_id=comment.id, user_id=current.id))
    db.commit()
    count = (
        db.query(func.count(CommunityCommentReaction.id))
        .filter(CommunityCommentReaction.comment_id == comment.id)
        .scalar()
    ) or 0
    return {"reacted": True, "reactions": count}

@router.post("/posts/{post_id}/comments")
def add_comment(
    post_id: int,
    req: CommentCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=15, window_seconds=60)  # 15 commentaires / min / IP
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
        "reactions": 0,
        "reacted": False,
    }


