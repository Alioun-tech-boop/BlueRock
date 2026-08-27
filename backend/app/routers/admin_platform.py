"""Plateforme d'administration BlueRock — gestion de toute la plateforme.

Routage sous /api/admin (JWT + users.role >= admin, via require_admin).
Modules :
  - Stats (dashboard)
  - Utilisateurs : liste/recherche, changement de rôle, bannissement plateforme
  - Communauté : publications (masquer/restaurer/supprimer), groupes (suspendre/archiver)
  - KYC : stats + liste (complète admin_kyc : actions SGI dans brokers.py)
  - Contenu : news (modération), communiqués (CRUD)
"""

from datetime import datetime, timezone
from typing import Optional
import time

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..database import get_db, get_reader_db
from ..core.security import require_admin, ROLE_LEVELS, role_level
from ..models.user import User
from ..models.news import NewsItem
from ..models.announcement import Announcement
from ..models.community import CommunityPost, CommunityGroup, CommunityUser, CommunityReport, CommunityProfessional
from ..models.challenge import Challenge
from ..models.kyc import UserKyc

router = APIRouter(prefix="/api/admin", tags=["admin"])

VALID_ROLES = sorted(ROLE_LEVELS.keys(), key=lambda r: ROLE_LEVELS[r])

_trend_cache: dict = {}


class RoleUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=32)


class BanRequest(BaseModel):
    reason: str = Field(default="", max_length=255)


class GroupStatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=24)


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=2, max_length=255)
    body: Optional[str] = Field(default=None, max_length=20000)
    source: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(default="general", max_length=40)
    link_url: Optional[str] = Field(default=None, max_length=500)
    image: Optional[str] = Field(default=None, max_length=500)
    active: bool = True
    published_at: Optional[str] = None


def _user_admin_out(u: User, kyc_status: Optional[str] = None, kyc_ready: bool = False, community_banned: bool = False, is_pro: bool = False) -> dict:
    return {
        "id": u.id,
        "name": u.name,
        "email": u.email,
        "role": u.role,
        "tier": u.tier,
        "account_type": u.account_type,
        "email_verified": u.email_verified,
        "avatar": u.avatar,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_login": u.last_login.isoformat() if u.last_login else None,
        "banned_at": u.banned_at.isoformat() if u.banned_at else None,
        "banned_reason": u.banned_reason,
        "totp_enabled": u.totp_enabled,
        "kyc_status": kyc_status,
        "kyc_ready": kyc_ready,
        "community_banned": community_banned,
        "is_pro": is_pro,
    }


def _kyc_lookup(db: Session) -> dict[int, str]:
    rows = db.query(UserKyc.user_id, UserKyc.status).all()
    return {uid: status for uid, status in rows}


def _kyc_ready(db: Session) -> set[int]:
    rows = db.query(UserKyc.user_id).filter(UserKyc.status == "verified").all()
    return {uid for (uid,) in rows}


def _community_banned_lookup(db: Session, user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    rows = db.query(CommunityUser.user_id).filter(
        CommunityUser.user_id.in_(user_ids), CommunityUser.banned_at.isnot(None)).all()
    return {uid for (uid,) in rows}


def _pro_lookup(db: Session, user_ids: list[int]) -> set[int]:
    if not user_ids:
        return set()
    rows = db.query(CommunityUser.user_id).filter(
        CommunityUser.user_id.in_(user_ids), CommunityUser.is_pro.is_(True)).all()
    return {uid for (uid,) in rows}


def _ann_out(a: Announcement) -> dict:
    return {
        "id": a.id,
        "title": a.title,
        "body": a.body,
        "source": a.source,
        "category": a.category,
        "link_url": a.link_url,
        "image": a.image,
        "active": a.active,
        "published_at": a.published_at.isoformat() if a.published_at else None,
        "created_by": a.created_by_id,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _post_admin_out(p: CommunityPost, author_name: str, group_name: Optional[str], kyc: dict) -> dict:
    return {
        "id": p.id,
        "author_id": p.author_id,
        "author_name": author_name,
        "group_id": p.group_id,
        "group_name": group_name,
        "symbol": p.symbol,
        "sentiment": p.sentiment,
        "title": p.title,
        "content": (p.content or "")[:400],
        "views": p.views or 0,
        "rockets": len(p.reactions),
        "comments": len(p.comments),
        "hidden": bool(p.hidden_at),
        "is_editor_pick": p.is_editor_pick,
        "toxic_score": p.toxic_score,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


# ============================== Dashboard ==============================


@router.get("/stats")
def admin_stats(db: Session = Depends(get_reader_db), _=Depends(require_admin)):
    cached = _trend_cache.get("stats")
    if cached and cached[0] > time.time():
        return cached[1]
    users = db.query(func.count(User.id)).scalar() or 0
    banned = db.query(func.count(User.id)).filter(User.banned_at.isnot(None)).scalar() or 0
    posts = db.query(func.count(CommunityPost.id)).scalar() or 0
    posts_hidden = db.query(func.count(CommunityPost.id)).filter(CommunityPost.hidden_at.isnot(None)).scalar() or 0
    groups = db.query(func.count(CommunityGroup.id)).scalar() or 0
    news = db.query(func.count(NewsItem.id)).scalar() or 0
    announcements = db.query(func.count(Announcement.id)).filter(Announcement.active.is_(True)).scalar() or 0
    kyc_statuses = {s: 0 for s in (
        "not_started", "in_progress", "document_submitted", "verification_in_progress",
        "verified", "review_required", "rejected", "retry_required", "error",
    )}
    for status, count in db.query(UserKyc.status, func.count(UserKyc.id)).group_by(UserKyc.status).all():
        kyc_statuses[status] = count
    payload = {
        "users": users,
        "banned_users": banned,
        "posts": posts,
        "hidden_posts": posts_hidden,
        "groups": groups,
        "news": news,
        "active_announcements": announcements,
        "kyc": kyc_statuses,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    _trend_cache["stats"] = (time.time() + 120, payload)
    return payload


# ============================== Utilisateurs ==============================


@router.get("/users")
def admin_users_list(
    q: Optional[str] = Query(default=None, max_length=120),
    role: Optional[str] = Query(default=None, max_length=32),
    banned: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    query = db.query(User)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.name.ilike(like), User.email.ilike(like)))
    if role:
        if role not in ROLE_LEVELS:
            raise HTTPException(status_code=400, detail="Rôle invalide")
        query = query.filter(User.role == role)
    if banned is True:
        query = query.filter(User.banned_at.isnot(None))
    elif banned is False:
        query = query.filter(User.banned_at.is_(None))
    total = query.count()
    rows = query.order_by(User.id.desc()).offset(offset).limit(limit).all()
    kyc = _kyc_lookup(db)
    ready = _kyc_ready(db)
    cbanned = _community_banned_lookup(db, [u.id for u in rows])
    pros = _pro_lookup(db, [u.id for u in rows])
    return {
        "total": total,
        "items": [_user_admin_out(u, kyc.get(u.id), u.id in ready, u.id in cbanned, u.id in pros) for u in rows],
    }


@router.patch("/users/{uid}/role")
def admin_user_set_role(
    uid: int,
    payload: RoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    role = payload.role.lower()
    if role not in ROLE_LEVELS:
        raise HTTPException(status_code=400, detail="Rôle invalide")
    if role_level(role) > role_level(admin.role):
        raise HTTPException(status_code=403, detail="Impossible d'attribuer un rôle supérieur au vôtre")
    if user.id == admin.id and role_level(role) < role_level("admin"):
        raise HTTPException(status_code=400, detail="Impossible de rétrograder votre propre compte")
    user.role = role
    db.commit()
    return {"id": user.id, "role": user.role}


@router.post("/users/{uid}/ban")
def admin_user_ban(
    uid: int,
    payload: BanRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    if role_level(user.role) >= role_level(admin.role):
        raise HTTPException(status_code=403, detail="Impossible de bannir un compte de niveau égal ou supérieur")
    user.banned_at = datetime.now(timezone.utc)
    user.banned_reason = payload.reason.strip()[:255] or None
    # Connectivité admin <-> communauté : un ban plateforme mute aussi le
    # profil communautaire (CommunityUser.banned_at) — voir _mod_guard.
    cu = db.query(CommunityUser).filter(CommunityUser.user_id == user.id).first()
    if cu:
        cu.banned_at = user.banned_at
    db.commit()
    return {"id": user.id, "banned": True, "reason": user.banned_reason}


@router.post("/users/{uid}/unban")
def admin_user_unban(
    uid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    user = db.query(User).filter(User.id == uid).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    user.banned_at = None
    user.banned_reason = None
    cu = db.query(CommunityUser).filter(CommunityUser.user_id == user.id).first()
    if cu:
        cu.banned_at = None
    db.commit()
    return {"id": user.id, "banned": False}


class PromoteProRequest(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    category: str = Field(default="advisor", max_length=40)
    title: str = Field(default="", max_length=120)
    company: str = Field(default="", max_length=120)


@router.post("/users/promote-pro")
def admin_promote_pro(
    payload: PromoteProRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Promeut un utilisateur en professionnel vérifié (CommunityUser.is_pro)
    à partir de son email. Crée le profil communautaire et le dossier
    CommunityProfessional approuvé si nécessaire."""
    from ..services.audit import audit

    email = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user is None:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable pour cet email")

    cu = db.query(CommunityUser).filter(CommunityUser.user_id == user.id).first()
    if cu is None:
        base = "".join(ch if ch.isalnum() else "_" for ch in (user.name or email).lower())[:24] or "trader"
        handle = base
        i = 2
        while db.query(CommunityUser).filter(CommunityUser.handle == handle).first():
            handle = f"{base}_{i}"
            i += 1
        cu = CommunityUser(
            user_id=user.id,
            handle=handle,
            display_name=user.name or email.split("@")[0],
            is_pro=True,
        )
        db.add(cu)
        db.flush()
    else:
        cu.is_pro = True

    pro = db.query(CommunityProfessional).filter(CommunityProfessional.user_id == cu.id).first()
    if pro is None:
        pro = CommunityProfessional(
            user_id=cu.id,
            category=payload.category or "advisor",
            title=(payload.title or user.name or "Professionnel")[:120],
            company=(payload.company or "")[:120],
            status="approved",
            reviewed_by=admin.id,
            reviewed_at=datetime.now(timezone.utc),
        )
        db.add(pro)
    else:
        pro.status = "approved"
        pro.reviewed_by = admin.id
        pro.reviewed_at = datetime.now(timezone.utc)
    db.flush()

    audit(
        db,
        "professional.promote_admin",
        "community_professional",
        resource_id=pro.id,
        user_id=admin.id,
        actor_role=admin.role,
        meta={"email": user.email, "category": pro.category},
    )
    db.commit()
    return {
        "email": user.email,
        "user_id": user.id,
        "community_user_id": cu.id,
        "is_pro": True,
        "professional_id": pro.id,
    }


# ============================== Communauté : publications ==============================


@router.get("/posts")
def admin_posts_list(
    q: Optional[str] = Query(default=None, max_length=120),
    hidden: Optional[bool] = Query(default=None),
    group_id: Optional[int] = Query(default=None),
    symbol: Optional[str] = Query(default=None, max_length=12),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    query = db.query(CommunityPost).outerjoin(CommunityUser, CommunityUser.id == CommunityPost.author_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            CommunityPost.title.ilike(like),
            CommunityPost.content.ilike(like),
            CommunityUser.display_name.ilike(like),
        ))
    if hidden is True:
        query = query.filter(CommunityPost.hidden_at.isnot(None))
    elif hidden is False:
        query = query.filter(CommunityPost.hidden_at.is_(None))
    if group_id is not None:
        query = query.filter(CommunityPost.group_id == group_id)
    if symbol:
        query = query.filter(CommunityPost.symbol == symbol.upper())
    total = query.count()
    rows = query.order_by(CommunityPost.id.desc()).offset(offset).limit(limit).all()
    group_names = {g.id: g.name for g in db.query(CommunityGroup).filter(
        CommunityGroup.id.in_([p.group_id for p in rows if p.group_id])).all()}
    kyc = _kyc_lookup(db)
    return {
        "total": total,
        "items": [_post_admin_out(p, (p.author.display_name if p.author else "?"), group_names.get(p.group_id), kyc) for p in rows],
    }


@router.post("/posts/{pid}/hide")
def admin_post_hide(
    pid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    post = db.query(CommunityPost).filter(CommunityPost.id == pid).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    post.hidden_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": pid, "hidden": True}


@router.post("/posts/{pid}/unhide")
def admin_post_unhide(
    pid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    post = db.query(CommunityPost).filter(CommunityPost.id == pid).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    post.hidden_at = None
    db.commit()
    return {"id": pid, "hidden": False}


@router.delete("/posts/{pid}")
def admin_post_delete(
    pid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    post = db.query(CommunityPost).filter(CommunityPost.id == pid).first()
    if post is None:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    db.delete(post)
    db.commit()
    return {"id": pid, "deleted": True}


# ============================== Communauté : groupes ==============================


@router.get("/groups")
def admin_groups_list(
    q: Optional[str] = Query(default=None, max_length=120),
    status: Optional[str] = Query(default=None, max_length=24),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    query = db.query(CommunityGroup)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(CommunityGroup.name.ilike(like), CommunityGroup.slug.ilike(like)))
    if status:
        query = query.filter(CommunityGroup.status == status)
    total = query.count()
    rows = query.order_by(CommunityGroup.id.desc()).offset(offset).limit(limit).all()
    counts = dict(db.query(CommunityGroup.id, func.count(CommunityPost.id))
                  .outerjoin(CommunityPost, CommunityPost.group_id == CommunityGroup.id)
                  .group_by(CommunityGroup.id).all())
    return {
        "total": total,
        "items": [{
            "id": g.id,
            "name": g.name,
            "slug": g.slug,
            "category": g.category,
            "visibility": g.visibility,
            "status": g.status,
            "creator_id": g.creator_id,
            "is_paid": g.is_paid,
            "price_xof": g.price_xof,
            "posts_count": counts.get(g.id, 0),
            "created_at": g.created_at.isoformat() if g.created_at else None,
        } for g in rows],
    }


@router.patch("/groups/{gid}/status")
def admin_group_set_status(
    gid: int,
    payload: GroupStatusUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    group = db.query(CommunityGroup).filter(CommunityGroup.id == gid).first()
    if group is None:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    if payload.status not in ("active", "suspended", "archived"):
        raise HTTPException(status_code=400, detail="Statut invalide (active|suspended|archived)")
    group.status = payload.status
    db.commit()
    return {"id": gid, "status": group.status}


class GroupUpsert(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=120)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=60)
    is_paid: bool = False
    price_xof: int = Field(default=0, ge=0, le=10_000_000)
    status: str = Field(default="active", max_length=24)


class GroupBannerUpdate(BaseModel):
    banner: str = Field(default="", max_length=500)


def _slugify(s: str) -> str:
    import re as _re
    s = s.lower().strip()
    s = _re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:100] or "groupe"


@router.post("/groups")
def admin_group_create(
    payload: GroupUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    slug = _slugify(payload.slug or payload.name)
    base = slug
    i = 2
    while db.query(CommunityGroup).filter(CommunityGroup.slug == slug).first():
        slug = f"{base}-{i}"
        i += 1
    g = CommunityGroup(
        name=payload.name.strip(),
        slug=slug,
        description=payload.description,
        category=payload.category or "general",
        is_paid=payload.is_paid,
        price_xof=payload.price_xof if payload.is_paid else 0,
        status=payload.status if payload.status in ("active", "suspended", "archived") else "active",
        creator_id=admin.id,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    return {"id": g.id, "name": g.name, "slug": g.slug}


@router.delete("/groups/{gid}")
def admin_group_delete(
    gid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    from ..models.community import CommunityMember, CommunityPost
    g = db.query(CommunityGroup).filter(CommunityGroup.id == gid).first()
    if g is None:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    # Détache les posts (ne les supprime pas) et purge membres puis groupe.
    db.query(CommunityPost).filter(CommunityPost.group_id == gid).update({"group_id": None}, synchronize_session=False)
    db.query(CommunityMember).filter(CommunityMember.community_id == gid).delete(synchronize_session=False)
    db.delete(g)
    db.commit()
    return {"id": gid, "deleted": True}


@router.patch("/groups/{gid}/banner")
def admin_group_update_banner(
    gid: int,
    payload: GroupBannerUpdate,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Met à jour la photo de couverture (banner) d'une communauté."""
    group = db.query(CommunityGroup).filter(CommunityGroup.id == gid).first()
    if group is None:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    group.banner = payload.banner
    db.commit()
    return {"id": group.id, "banner": group.banner}


# ============================== Communauté : posts ==============================

class CommunityPostCreate(BaseModel):
    title: str = Field(min_length=3, max_length=240)
    content: str = Field(default="", max_length=5000)
    symbol: Optional[str] = Field(default=None, max_length=12)
    sentiment: str = Field(default="bullish", max_length=10)
    is_editor_pick: bool = False
    group_slug: Optional[str] = Field(default="bluerock", max_length=140)


@router.post("/community/posts")
def admin_community_post_create(
    payload: CommunityPostCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une publication dans la communauté Bluerock (ou autre groupe).

    Par défaut `group_slug=bluerock` : le post apparaît à la fois dans
    `GET /api/community/groups/bluerock/posts` (page communauté) et dans
    `GET /api/community/posts?tab=forYou` (fil d'actualité) grâce au filtre
    `group_id IS NULL OR group_id = bluerock_id`.
    """
    # Résout le groupe cible (Bluerock par défaut)
    group = None
    if payload.group_slug:
        group = db.query(CommunityGroup).filter(CommunityGroup.slug == payload.group_slug).first()
        if group is None:
            raise HTTPException(status_code=404, detail=f"Communauté '{payload.group_slug}' introuvable")

    # Profil communautaire de l'admin (crée si besoin, is_pro=True pour passer le filtre du fil)
    cu = db.query(CommunityUser).filter(CommunityUser.user_id == admin.id).first()
    if cu is None:
        base = "".join(ch if ch.isalnum() else "_" for ch in (admin.name or admin.email).lower())[:24] or "admin"
        handle = base
        i = 2
        while db.query(CommunityUser).filter(CommunityUser.handle == handle).first():
            handle = f"{base}_{i}"
            i += 1
        cu = CommunityUser(
            user_id=admin.id,
            handle=handle,
            display_name=admin.name or "Bluerock",
            is_pro=True,
            verified=True,
        )
        db.add(cu)
        db.flush()

    # Assure is_pro pour que le post passe le filtre du fil
    if not cu.is_pro:
        cu.is_pro = True

    post = CommunityPost(
        author_id=cu.id,
        group_id=group.id if group else None,
        symbol=payload.symbol.upper() if payload.symbol else None,
        sentiment=payload.sentiment if payload.sentiment in ("bullish", "bearish", "neutral") else "bullish",
        title=payload.title.strip(),
        content=payload.content or "",
        is_editor_pick=payload.is_editor_pick,
    )
    db.add(post)
    db.commit()
    db.refresh(post)
    return {
        "id": post.id,
        "title": post.title,
        "group_id": post.group_id,
        "group_slug": group.slug if group else None,
        "author_id": cu.id,
        "created_at": post.created_at.isoformat() if post.created_at else None,
    }


# ============================== Communauté : membres ==============================


@router.get("/community-users")
def admin_community_users(
    q: Optional[str] = Query(default=None, max_length=120),
    banned: Optional[bool] = Query(default=None),
    is_pro: Optional[bool] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_reader_db),
    _=Depends(require_admin),
):
    query = db.query(CommunityUser).outerjoin(User, User.id == CommunityUser.user_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(or_(
            CommunityUser.handle.ilike(like),
            CommunityUser.display_name.ilike(like),
            User.email.ilike(like),
        ))
    if banned is True:
        query = query.filter(CommunityUser.banned_at.isnot(None))
    elif banned is False:
        query = query.filter(CommunityUser.banned_at.is_(None))
    if is_pro is not None:
        query = query.filter(CommunityUser.is_pro.is_(is_pro))
    total = query.count()
    rows = query.order_by(CommunityUser.reputation.desc().nullslast(), CommunityUser.id.desc()).offset(offset).limit(limit).all()
    emails = {u.id: u.email for u in db.query(User).filter(User.id.in_([r.user_id for r in rows if r.user_id])).all()} if rows else {}
    return {
        "total": total,
        "items": [{
            "id": r.id,
            "user_id": r.user_id,
            "email": emails.get(r.user_id),
            "handle": r.handle,
            "display_name": r.display_name,
            "avatar_color": r.avatar_color,
            "verified": bool(r.verified),
            "is_pro": bool(r.is_pro),
            "banned": bool(r.banned_at),
            "reputation": r.reputation or 0,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows],
    }


@router.post("/community-users/{cuid}/ban")
def admin_community_user_ban(
    cuid: int,
    payload: BanRequest,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    cu = db.query(CommunityUser).filter(CommunityUser.id == cuid).first()
    if cu is None:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    cu.banned_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": cuid, "banned": True, "reason": payload.reason[:255]}


@router.post("/community-users/{cuid}/unban")
def admin_community_user_unban(cuid: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    cu = db.query(CommunityUser).filter(CommunityUser.id == cuid).first()
    if cu is None:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    cu.banned_at = None
    db.commit()
    return {"id": cuid, "banned": False}


@router.post("/community-users/{cuid}/verify")
def admin_community_user_verify(cuid: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    cu = db.query(CommunityUser).filter(CommunityUser.id == cuid).first()
    if cu is None:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    cu.verified = not bool(cu.verified)
    db.commit()
    return {"id": cuid, "verified": bool(cu.verified)}


@router.post("/community-users/{cuid}/toggle-pro")
def admin_community_user_toggle_pro(cuid: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    cu = db.query(CommunityUser).filter(CommunityUser.id == cuid).first()
    if cu is None:
        raise HTTPException(status_code=404, detail="Membre introuvable")
    cu.is_pro = not bool(cu.is_pro)
    db.commit()
    return {"id": cuid, "is_pro": bool(cu.is_pro)}


# ============================== Contenu : news ==============================


@router.get("/news")
def admin_news_list(
    q: Optional[str] = Query(default=None, max_length=120),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    query = db.query(NewsItem)
    if q:
        query = query.filter(NewsItem.title.ilike(f"%{q.strip()}%"))
    total = query.count()
    rows = query.order_by(NewsItem.published_at.desc().nullslast(), NewsItem.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "items": [{
            "id": n.id,
            "title": n.title,
            "source": n.source,
            "category": n.category,
            "symbol": n.symbol,
            "image": n.image,
            "url": n.url,
            "url_real": n.url_real,
            "published_at": n.published_at.isoformat() if n.published_at else None,
        } for n in rows],
    }


@router.delete("/news/{nid}")
def admin_news_delete(
    nid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    news = db.query(NewsItem).filter(NewsItem.id == nid).first()
    if news is None:
        raise HTTPException(status_code=404, detail="News introuvable")
    db.delete(news)
    db.commit()
    return {"id": nid, "deleted": True}


class NewsUpsert(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    url: Optional[str] = Field(default=None, max_length=600)
    image: Optional[str] = Field(default=None, max_length=600)
    source: Optional[str] = Field(default=None, max_length=120)
    category: str = Field(default="Presse", max_length=40)
    symbol: Optional[str] = Field(default=None, max_length=12)
    published_at: Optional[str] = None


def _news_out(n: NewsItem) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "url": n.url,
        "url_real": getattr(n, "url_real", None),
        "image": n.image,
        "source": n.source,
        "category": n.category,
        "symbol": n.symbol,
        "published_at": n.published_at.isoformat() if n.published_at else None,
    }


@router.post("/news")
def admin_news_create(
    payload: NewsUpsert,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """Crée une actualité manuelle (visible côté explorer/actualités)."""
    from ..models.market import Company
    published = None
    if payload.published_at:
        try:
            published = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            published = None
    if not published:
        published = datetime.now(timezone.utc)
    n = NewsItem(
        title=payload.title.strip(),
        url=payload.url,
        url_real=payload.url,
        image=payload.image,
        source=(payload.source or "BlueRock Admin")[:60],
        category=payload.category if payload.category in ("BRVM", "Presse", "Société") else "Presse",
        symbol=payload.symbol.upper() if payload.symbol else None,
        published_at=published,
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return _news_out(n)


@router.patch("/news/{nid}")
def admin_news_update(
    nid: int,
    payload: NewsUpsert,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    news = db.query(NewsItem).filter(NewsItem.id == nid).first()
    if news is None:
        raise HTTPException(status_code=404, detail="News introuvable")
    news.title = payload.title.strip()
    news.url = payload.url
    news.url_real = payload.url
    news.image = payload.image
    news.source = (payload.source or news.source or "BlueRock Admin")[:60]
    if payload.category in ("BRVM", "Presse", "Société"):
        news.category = payload.category
    news.symbol = payload.symbol.upper() if payload.symbol else news.symbol
    if payload.published_at:
        try:
            news.published_at = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    db.commit()
    db.refresh(news)
    return _news_out(news)


@router.post("/news/refresh")
def admin_news_refresh(_=Depends(require_admin)):
    """Force le re-scraping des flux d'actualités (BRVM/presse/sociétés)."""
    from ..scrapers.news_feed import news_feed
    news_feed.refresh(force=True)
    return {"status": "refreshing"}


# ============================== Contenu : communiqués ==============================

public_router = APIRouter(prefix="/api", tags=["public"])


@public_router.get("/announcements")
def public_announcements(
    limit: int = Query(default=6, ge=1, le=50),
    category: Optional[str] = Query(default=None, max_length=40),
    db: Session = Depends(get_db),
):
    """Communiqués actifs (affichés côté plateforme client)."""
    query = db.query(Announcement).filter(Announcement.active.is_(True))
    if category:
        query = query.filter(Announcement.category == category)
    rows = query.order_by(Announcement.published_at.desc().nullslast()).limit(limit).all()
    return {"items": [_ann_out(a) for a in rows]}


@router.get("/announcements")
def admin_announcements_list(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    rows = db.query(Announcement).order_by(Announcement.id.desc()).offset(offset).limit(limit).all()
    total = db.query(func.count(Announcement.id)).scalar() or 0
    return {"total": total, "items": [_ann_out(a) for a in rows]}


@router.post("/announcements")
def admin_announcement_create(
    payload: AnnouncementIn,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    published = None
    if payload.published_at:
        try:
            published = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            published = None
    if not published:
        published = datetime.now(timezone.utc)
    ann = Announcement(
        title=payload.title.strip(),
        body=payload.body,
        source=payload.source,
        category=payload.category,
        link_url=payload.link_url,
        image=payload.image,
        active=payload.active,
        published_at=published,
        created_by_id=admin.id,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _ann_out(ann)


@router.patch("/announcements/{aid}")
def admin_announcement_update(
    aid: int,
    payload: AnnouncementIn,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    ann = db.query(Announcement).filter(Announcement.id == aid).first()
    if ann is None:
        raise HTTPException(status_code=404, detail="Communiqué introuvable")
    ann.title = payload.title.strip()
    ann.body = payload.body
    ann.source = payload.source
    ann.category = payload.category
    ann.link_url = payload.link_url
    ann.image = payload.image
    ann.active = payload.active
    if payload.published_at:
        try:
            ann.published_at = datetime.fromisoformat(payload.published_at.replace("Z", "+00:00"))
        except ValueError:
            pass
    db.commit()
    db.refresh(ann)
    return _ann_out(ann)


@router.delete("/announcements/{aid}")
def admin_announcement_delete(
    aid: int,
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    ann = db.query(Announcement).filter(Announcement.id == aid).first()
    if ann is None:
        raise HTTPException(status_code=404, detail="Communiqué introuvable")
    db.delete(ann)
    db.commit()
    return {"id": aid, "deleted": True}


# ============================== Tendances (dashboard analytics) ==============================


@router.get("/stats/trend")
def admin_stats_trend(
    days: int = Query(default=30, ge=1, le=180),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Séries temporelles quotidiennes pour le dashboard (croissance
    utilisateurs, publications, KYC vérifiés, groupes). Aggrégé en SQL,
    cache court pour ne pas rescanner à chaque chargement."""
    key = f"trend:{days}"
    cached = _trend_cache.get(key)
    if cached and cached[0] > time.time():
        return cached[1]
    from datetime import timedelta as _td
    since = datetime.now(timezone.utc) - _td(days=days)
    series = []
    for i in range(days):
        day = (datetime.now(timezone.utc) - _td(days=days - 1 - i)).date()
        series.append({"date": day.isoformat()})
    # Comptes cumulés à la fin de chaque journée.
    users_curve = {
        r[0]: r[1] for r in db.query(
            func.date(User.created_at), func.count(User.id)).filter(
            User.created_at >= since).group_by(func.date(User.created_at)).all()
    }
    posts_curve = {
        r[0]: r[1] for r in db.query(
            func.date(CommunityPost.created_at), func.count(CommunityPost.id)).filter(
            CommunityPost.created_at >= since).group_by(func.date(CommunityPost.created_at)).all()
    }
    kyc_curve = {
        r[0]: r[1] for r in db.query(
            func.date(UserKyc.updated_at), func.count(UserKyc.id)).filter(
            UserKyc.status == "verified", UserKyc.updated_at >= since).group_by(
            func.date(UserKyc.updated_at)).all()
    }
    groups_curve = {
        r[0]: r[1] for r in db.query(
            func.date(CommunityGroup.created_at), func.count(CommunityGroup.id)).filter(
            CommunityGroup.created_at >= since).group_by(func.date(CommunityGroup.created_at)).all()
    }
    out = []
    cu = 0
    cp = 0
    ck = 0
    cg = 0
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_posts = db.query(func.count(CommunityPost.id)).scalar() or 0
    total_kyc = db.query(func.count(UserKyc.id)).filter(UserKyc.status == "verified").scalar() or 0
    total_groups = db.query(func.count(CommunityGroup.id)).scalar() or 0
    for s in series:
        d = s["date"]
        cu += users_curve.get(d, 0)
        cp += posts_curve.get(d, 0)
        ck += kyc_curve.get(d, 0)
        cg += groups_curve.get(d, 0)
        out.append({"date": d, "users": cu, "posts": cp, "kyc": ck, "groups": cg})
    # Normalise sur les totaux connus (les séries ne couvrent que `days` jours).
    if out:
        out[-1]["users"] = max(out[-1]["users"], total_users)
        out[-1]["posts"] = max(out[-1]["posts"], total_posts)
        out[-1]["kyc"] = max(out[-1]["kyc"], total_kyc)
        out[-1]["groups"] = max(out[-1]["groups"], total_groups)
    payload = {"days": days, "series": out}
    _trend_cache[key] = (time.time() + 120, payload)
    return payload


# ============================== File de modération (signalements communauté) ==============================


class ReportResolve(BaseModel):
    action: str = Field(default="dismiss", max_length=20)  # hide | delete | ban | dismiss
    note: str = Field(default="", max_length=500)


@router.get("/community-reports")
def admin_community_reports(
    status: str = Query(default="open", max_length=20),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _=Depends(require_admin),
):
    q = db.query(CommunityReport)
    if status and status != "all":
        q = q.filter(CommunityReport.status == status)
    total = q.count()
    rows = q.order_by(CommunityReport.created_at.desc()).offset(offset).limit(limit).all()
    items = []
    for r in rows:
        target_snippet = None
        if r.target_type == "post":
            p = db.query(CommunityPost).filter(CommunityPost.id == r.target_id).first()
            if p:
                target_snippet = {"id": p.id, "title": p.title, "author_id": p.author_id, "hidden": bool(p.hidden_at)}
        elif r.target_type == "user":
            cu = db.query(CommunityUser).filter(CommunityUser.id == r.target_id).first()
            if cu:
                target_snippet = {"id": cu.id, "handle": cu.handle, "display_name": cu.display_name}
        items.append({
            "id": r.id,
            "reporter_id": r.reporter_id,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "action": r.action,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "target": target_snippet,
        })
    return {"total": total, "items": items}


@router.post("/community-reports/{rid}/resolve")
def admin_community_report_resolve(
    rid: int,
    payload: ReportResolve,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    rep = db.query(CommunityReport).filter(CommunityReport.id == rid).first()
    if rep is None:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    action = payload.action
    if action not in ("hide", "delete", "ban", "dismiss"):
        raise HTTPException(status_code=400, detail="Action invalide")
    # Applique l'action de modération sur la cible (connectivité admin -> communauté).
    if action == "hide" and rep.target_type == "post":
        p = db.query(CommunityPost).filter(CommunityPost.id == rep.target_id).first()
        if p:
            p.hidden_at = datetime.now(timezone.utc)
    elif action == "delete" and rep.target_type == "post":
        p = db.query(CommunityPost).filter(CommunityPost.id == rep.target_id).first()
        if p:
            db.delete(p)
    elif action == "ban" and rep.target_type == "user":
        cu = db.query(CommunityUser).filter(CommunityUser.id == rep.target_id).first()
        if cu:
            cu.banned_at = datetime.now(timezone.utc)
    rep.status = "resolved"
    rep.action = action
    rep.note = payload.note.strip()[:500]
    rep.resolved_by = admin.id
    rep.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": rep.id, "status": "resolved", "action": action}


@router.post("/ngx/backfill")
def admin_ngx_backfill(
    days: int = Query(default=365, ge=30, le=3650),
    limit: int = Query(default=None, ge=1, le=300),
    provider: Optional[str] = Query(default=None, description="twelvedata | stooq | ngnmarket"),
    _=Depends(require_admin),
):
    """Backfill de l'historique OHLC NGX dans MarketData.

    Par défaut utilise la source alternative configurée (Twelve Data gratuit)
    pour contourner la limite du plan Free NGN Market. `provider=ngnmarket`
    tente l'historique natif (plan hobby+ requis).
    """
    from ..scrapers.ngx_feed import ngx_live_feed
    return ngx_live_feed.backfill(days=days, limit=limit, provider=provider)


# ============================== Challenges (admin) ==============================


class ChallengeUpsert(BaseModel):
    name: str = Field(min_length=3, max_length=160)
    tagline: Optional[str] = Field(default="", max_length=300)
    description: Optional[str] = Field(default="", max_length=5000)
    status: str = Field(default="upcoming", max_length=20)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    registration_end: Optional[str] = None
    prize_pool: float = Field(default=0, ge=0)
    prizes: Optional[str] = Field(default="")  # JSON string
    rules: Optional[str] = Field(default="")  # JSON string or plain lines
    max_participants: int = Field(default=0, ge=0)
    entry_fee: float = Field(default=0, ge=0)
    starting_capital: float = Field(default=10000000, ge=1000)
    is_featured: bool = False


def _parse_dt(s: Optional[str]):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None


def _challenge_admin_out(c: Challenge) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "tagline": c.tagline or "",
        "description": c.description or "",
        "status": c.status,
        "start_date": c.start_date.isoformat() if c.start_date else None,
        "end_date": c.end_date.isoformat() if c.end_date else None,
        "registration_end": c.registration_end.isoformat() if c.registration_end else None,
        "prize_pool": c.prize_pool or 0,
        "prizes": c.prizes or "",
        "rules": c.rules or "",
        "max_participants": c.max_participants or 0,
        "entry_fee": c.entry_fee or 0,
        "starting_capital": c.starting_capital or 10000000,
        "is_featured": bool(c.is_featured),
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@router.get("/challenges")
def admin_challenges_list(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.query(Challenge).order_by(Challenge.id.desc()).all()
    return {"total": len(rows), "items": [_challenge_admin_out(r) for r in rows]}


@router.post("/challenges")
def admin_challenge_create(payload: ChallengeUpsert, db: Session = Depends(get_db), _=Depends(require_admin)):
    if payload.status not in ("upcoming", "open", "live", "ended"):
        raise HTTPException(status_code=400, detail="Statut invalide (upcoming|open|live|ended)")
    c = Challenge(
        name=payload.name.strip(),
        tagline=(payload.tagline or "").strip(),
        description=payload.description or "",
        status=payload.status,
        start_date=_parse_dt(payload.start_date),
        end_date=_parse_dt(payload.end_date),
        registration_end=_parse_dt(payload.registration_end),
        prize_pool=payload.prize_pool,
        prizes=payload.prizes or "",
        rules=payload.rules or "",
        max_participants=payload.max_participants,
        entry_fee=payload.entry_fee,
        starting_capital=payload.starting_capital,
        is_featured=payload.is_featured,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return _challenge_admin_out(c)


@router.patch("/challenges/{cid}")
def admin_challenge_update(cid: int, payload: ChallengeUpsert, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(Challenge).filter(Challenge.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    if payload.status not in ("upcoming", "open", "live", "ended"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    c.name = payload.name.strip()
    c.tagline = (payload.tagline or "").strip()
    c.description = payload.description or ""
    c.status = payload.status
    c.start_date = _parse_dt(payload.start_date)
    c.end_date = _parse_dt(payload.end_date)
    c.registration_end = _parse_dt(payload.registration_end)
    c.prize_pool = payload.prize_pool
    c.prizes = payload.prizes or ""
    c.rules = payload.rules or ""
    c.max_participants = payload.max_participants
    c.entry_fee = payload.entry_fee
    c.starting_capital = payload.starting_capital
    c.is_featured = payload.is_featured
    db.commit()
    db.refresh(c)
    return _challenge_admin_out(c)


@router.delete("/challenges/{cid}")
def admin_challenge_delete(cid: int, db: Session = Depends(get_db), _=Depends(require_admin)):
    c = db.query(Challenge).filter(Challenge.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Défi introuvable")
    db.delete(c)
    db.commit()
    return {"id": cid, "deleted": True}