from datetime import datetime, timedelta, timezone
import asyncio
import logging
import os
import re
import threading
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..core.rate_limit import check_rate_limit
from ..core.security import require_role, role_level, ROLE_LEVELS
from ..core.supabase_auth import storage_signed_url, storage_upload
from ..database import get_db, get_reader_db
from ..config import settings
from ..services.tier import is_pro as user_is_pro
from ..models.community import (
    CommunityUser,
    CommunityPost,
    CommunityShare,
    CommunityFollow,
    CommunityReaction,
    CommunityComment,
    CommunityAttachment,
    CommunityCommentReaction,
    CommunityDraft,
    CommunityGroup,
    CommunityMember,
    CommunityProfessional,
    CommunityReport,
    CommunityBadge,
    CommunityEvent,
    CommunityEventRegistration,
    CommunitySavedPost,
    CommunityPostSeen,
)
from ..models.market import MarketData
from ..models.company import Company
from ..models.planning import Notification
from ..models.payment import DepositOrder
from .auth import get_current_user, get_optional_user
from ..models.user import User, Portfolio, Position
from ..services.community_ai import (
    ai_toxicity_score,
    ai_is_toxic,
    ai_pulse_for,
    ai_buzz,
    ai_links_count,
)
from ..services.community_reputation import (
    BADGES as REP_BADGES,
    LEVELS as REP_LEVELS,
    compute_score,
    earned_codes,
    level_for,
    ReputationMetrics,
    sync_badges,
)

router = APIRouter(prefix="/api/community", tags=["community"])

logger = logging.getLogger(__name__)

AVATAR_URL = "https://ui-avatars.com/api/?name={handle}&background={color}&color=fff&size=96"

MAX_UPLOAD_SIZE = 25 * 1024 * 1024  # 25 MB

STORAGE_BUCKET = "uploads"

# Executor global pour _warm_attachments (évite 1000 threads à 100 RPS)
from concurrent.futures import ThreadPoolExecutor as _TPE
_WARM_EXECUTOR = _TPE(max_workers=8, thread_name_prefix="warm_attach")
STORAGE_PREFIX = "community"

# Palette par défaut des profils démo (stables)
PALETTE = ["#7266D9", "#2E7CF6", "#00C853", "#F59E0B", "#EC4899", "#06B6D4", "#F97316", "#8B5CF6", "#14B8A6", "#E11D48"]


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=600)


def _avatar(u: CommunityUser) -> str:
    """Avatar réel (photo uploadée) si disponible, sinon avatar généré par défaut."""
    av = u.user.avatar if u.user else None
    if av and av.startswith("data:image/"):
        return av
    return AVATAR_URL.format(handle=u.handle.replace(" ", "_"), color=(u.avatar_color or "#7266D9").lstrip("#"))


def _is_premium(u: CommunityUser | None) -> bool:
    """Abonné Premium (tier Pro active) — avantage communautaire (Phase 9)."""
    return bool(u and u.user and user_is_pro(u.user))


def _user_out(u: CommunityUser, current: CommunityUser | None = None) -> dict:
    return {
        "id": u.id,
        "handle": u.handle,
        "display_name": u.display_name,
        "bio": u.bio or "",
        "avatar": _avatar(u),
        "avatar_color": u.avatar_color,
        "verified": u.verified,
        "is_pro": bool(u.is_pro),
        "is_premium": _is_premium(u),
        "is_staff": _is_staff(u),
        "is_me": bool(current and current.id == u.id),
        "followers_count": len(u.followers),
        "following_count": len(u.following),
        "posts_count": len(u.posts),
        "reputation": u.reputation or 0,
        "level": level_for(u.reputation or 0)[0],
        "is_following": bool(current and current.id != u.id and any(f.followed_id == u.id for f in current.following)),
    }


def _get_profile(db: Session, user: User) -> CommunityUser | None:
    """Profil communautaire en LECTURE seule (jamais créé sur un GET)."""
    if not user:
        return None
    return (
        db.query(CommunityUser)
        .options(joinedload(CommunityUser.user), joinedload(CommunityUser.following))
        .filter(CommunityUser.user_id == user.id)
        .first()
    )


def _mod_guard(profile: CommunityUser) -> None:
    """Un membre banni (Phase 6) perd le droit d'écrire, réagir ou suivre."""
    if profile is None or profile.banned_at:
        raise HTTPException(status_code=403, detail="Votre compte communautaire est suspendu")


def _is_staff(profile: CommunityUser | None) -> bool:
    return bool(profile and profile.user and role_level(profile.user.role) >= role_level("compliance"))


def _refresh_reputation(db: Session, profile: CommunityUser) -> list[str]:
    """Recalcule le score de réputation d'un profil et synchronise ses badges.
    Retourne les codes de badges nouvellement obtenus (pour la notification)."""
    fresh = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.posts).joinedload(CommunityPost.reactions),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.shares),
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.badges),
        )
        .filter(CommunityUser.id == profile.id)
        .first()
    )
    if fresh is None:
        return []
    fresh.reputation = ReputationMetrics(db, fresh).score
    new_codes = sync_badges(db, fresh)
    return new_codes


def _ai_scan_post(db: Session, post: CommunityPost) -> bool:
    """Scan IA (Phase 7) : score de toxicité + masquage automatique éventuel.
    Retourne True si le post a été masqué. Idempotent (scan_at déjà posé)."""
    if post.scan_at:
        return False
    post.scan_at = datetime.now(timezone.utc)
    post.toxic_score = ai_toxicity_score(f"{post.title} {post.content or ''}")
    if post.hidden_at or not ai_is_toxic(f"{post.title} {post.content or ''}"):
        return False
    post.hidden_at = datetime.now(timezone.utc)
    db.add(CommunityReport(
        reporter_id=None,
        target_type="post",
        target_id=post.id,
        reason="other",
        details=f"Détection automatique IA (score {post.toxic_score or 0:.2f})",
    ))
    _notify(
        db,
        post.author.user_id if post.author else None,
        "Publication masquée automatiquement",
        "Notre modération IA a détecté un contenu pouvant enfreindre les règles de la communauté. Vous pouvez faire appel depuis le fil.",
        f"/community?post={post.id}",
    )
    return True


def _company_ctx(db: Session) -> dict[str, dict]:
    """Dernier point de marché + série de clôtures (30j) par symbole.
    Cache 300 s : la série est identique pour toutes les requêtes de la fenêtre.
    Requêtes indexées (uq_market_data_company_date, ix_market_data_date) pour
    éviter le scan/sort complet de market_data sur la base distante."""
    import threading
    import time as _time
    from sqlalchemy import text as _text
    now = _time.time()
    with _ctx_lock:
        if _ctx_cache and now - _ctx_cache["ts"] < _CTX_TTL:
            return _ctx_cache["data"]
    latest = db.execute(_text(
        """
        SELECT c.symbol, c.name, md.company_id, md.close_price, md.change_percent
        FROM companies c
        LEFT JOIN LATERAL (
            SELECT company_id, close_price, change_percent
            FROM market_data md
            WHERE md.company_id = c.id
            ORDER BY md.date DESC
            LIMIT 1
        ) md ON TRUE
        """
    )).all()
    recent = db.execute(_text(
        """
        SELECT company_id, close_price
        FROM market_data
        WHERE date >= (SELECT max(date) FROM market_data) - interval '60 days'
        ORDER BY company_id, date
        """
    )).all()
    series: dict[int, list] = {}
    for company_id, close_price in recent:
        if close_price is not None:
            series.setdefault(company_id, []).append(close_price)
    ctx: dict[str, dict] = {}
    for sym, name, company_id, close_price, change_percent in latest:
        ctx[sym] = {
            "name": name,
            "price": close_price,
            "change_percent": change_percent,
            "series": (series.get(company_id) or [])[-30:],
        }
    with _ctx_lock:
        _ctx_cache["ts"] = now
        _ctx_cache["data"] = ctx
    return ctx


_ctx_cache: dict = {}
_ctx_lock = threading.Lock()
_CTX_TTL = 300  # secondes

# Cache des URLs signées Supabase Storage : valides 3600 s, on rafraîchit à 3000 s
_signed_cache: dict = {}
_signed_lock = threading.Lock()
_SIGNED_TTL = 3000

# Cache des réponses du fil et des utilisateurs (Postgres distant lent).
# VIA SharedStore : Redis partagé si REDIS_URL configuré (multi-instances),
# sinon repli mémoire par processus (comportement mono-instance identique).
from ..core.shared_store import store as _shared_store

_FEED_TTL = 20   # secondes — fraîcheur acceptable pour un fil social
_USERS_TTL = 60
_FEED_PREFIX = "feed:"


def _cache_get(key: str):
    return _shared_store.cache_get(_FEED_PREFIX + key)


def _cache_set(key: str, payload) -> None:
    _shared_store.cache_set(_FEED_PREFIX + key, payload, _FEED_TTL)


def _cache_bust(prefix: str | None = None) -> None:
    """Invalide le cache du fil. `prefix` permet une invalidation ciblée
    (ex. "posts:" pour les flux) au lieu de tout vider — évite le thundering
    herd quand un utilisateur rocket/share/follow (écriture fréquente mais
    qui ne change pas le contenu du fil public). Partagé entre instances
    quand Redis est configuré."""
    if prefix is None:
        _shared_store.cache_delete_prefix(_FEED_PREFIX)
    else:
        _shared_store.cache_delete_prefix(_FEED_PREFIX + prefix)


def _feed_response(payload: dict, anonymous: bool) -> JSONResponse:
    """Enveloppe le payload du fil avec des en-têtes Cache-Control adaptés :
    les flux anonymes sont cachables publiquement (CDN / proxy), les flux
    authentifiés restent privés (contiennent l'état saved/reacted par user)."""
    if anonymous:
        headers = {"Cache-Control": "public, s-maxage=15, max-age=10, stale-while-revalidate=30"}
    else:
        headers = {"Cache-Control": "private, no-store"}
    return JSONResponse(payload, headers=headers)


def _bump_views(post_id: int) -> None:
    """Incrémente atomiquement le compteur de vues (UPDATE views=views+1) pour éviter lost-update."""
    try:
        from ..database import SessionLocal
        s = SessionLocal()
        try:
            s.query(CommunityPost).filter(CommunityPost.id == post_id).update(
                {CommunityPost.views: CommunityPost.views + 1}, synchronize_session=False
            )
            s.commit()
        finally:
            s.close()
    except Exception:
        logging.getLogger("community").exception("bump_views failed")


def _signed_url_cached(bucket: str, path: str) -> str:
    with _signed_lock:
        hit = _signed_cache.get(path)
        if hit and hit[0] > time.time():
            return hit[1]
    url = storage_signed_url(bucket, path) or ""
    with _signed_lock:
        _signed_cache[path] = (time.time() + _SIGNED_TTL, url)
    return url


def _warm_attachments(posts) -> None:
    """Pré-remplit le cache d'URLs signées en parallèle (executor global, pas par requête)."""
    paths = [
        a.url
        for p in posts
        for a in (p.attachments or [])
        if a.kind in ("image", "video", "file") and a.url
    ]
    if not paths:
        return
    try:
        list(_WARM_EXECUTOR.map(lambda path: _signed_url_cached(STORAGE_BUCKET, path), paths))
    except RuntimeError:
        # Executor shutdown (tests) → fallback séquentiel
        for path in paths:
            try:
                _signed_url_cached(STORAGE_BUCKET, path)
            except Exception:
                pass


def _batch_counts(db: Session, ids: list[int]) -> dict[int, dict]:
    """Compte réactions/commentaires/partages par publication en 3 requêtes
    agrégées (constant) au lieu de charger tout le graphe par publication
    (N+1) — indispensable à grande échelle."""
    out = {i: {"reactions": 0, "comments": 0, "shares": 0} for i in ids}
    specs = (
        (CommunityReaction, "reactions"),
        (CommunityComment, "comments"),
        (CommunityShare, "shares"),
    )
    for rel, key in specs:
        rows = (
            db.query(rel.post_id, func.count(rel.id))
            .filter(rel.post_id.in_(ids))
            .group_by(rel.post_id)
            .all()
        )
        for pid, c in rows:
            if pid in out:
                out[pid][key] = c
    return out


def _profile_posts(
    db: Session,
    profile_id: int,
    current: CommunityUser | None,
    offset: int,
    limit: int,
    include_hidden: bool,
):
    """Charge les publications d'un profil de façon paginée (au lieu de
    chargement eager de TOUT l'historique) et renvoie les totaux agrégés
    (rockets/partages/vues reçus) calculés en SQL — robuste pour un profil
    avec des milliers de publications."""
    q = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author).joinedload(CommunityUser.user),
            joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
            joinedload(CommunityPost.author).joinedload(CommunityUser.following),
            joinedload(CommunityPost.attachments),
        )
        .filter(CommunityPost.author_id == profile_id)
    )
    if not include_hidden:
        q = q.filter(CommunityPost.hidden_at.is_(None))
    posts = q.order_by(CommunityPost.created_at.desc()).offset(offset).limit(limit).all()
    ids = [p.id for p in posts]
    counts = _batch_counts(db, ids) if ids else {}
    reacted_ids = set()
    shared_ids = set()
    saved_ids = None
    if current is not None and ids:
        reacted_ids = {r[0] for r in db.query(CommunityReaction.post_id).filter(
            CommunityReaction.post_id.in_(ids), CommunityReaction.user_id == current.id).all()}
        shared_ids = {s[0] for s in db.query(CommunityShare.post_id).filter(
            CommunityShare.post_id.in_(ids), CommunityShare.user_id == current.id).all()}
        saved_ids = {sp[0] for sp in db.query(CommunitySavedPost.post_id).filter(
            CommunitySavedPost.post_id.in_(ids), CommunitySavedPost.user_id == current.id).all()}
    out_posts = [_post_out(p, _company_ctx(db), current, db, saved_ids, counts, reacted_ids, shared_ids) for p in posts]
    rockets = db.query(func.count(CommunityReaction.id)).join(
        CommunityPost, CommunityPost.id == CommunityReaction.post_id).filter(
        CommunityPost.author_id == profile_id).scalar() or 0
    shares = db.query(func.count(CommunityShare.id)).join(
        CommunityPost, CommunityPost.id == CommunityShare.post_id).filter(
        CommunityPost.author_id == profile_id).scalar() or 0
    views = db.query(func.coalesce(func.sum(CommunityPost.views), 0)).filter(
        CommunityPost.author_id == profile_id).scalar() or 0
    return out_posts, rockets, shares, int(views)


def _post_out(
    p: CommunityPost,
    company_ctx: dict[str, dict],
    current: CommunityUser | None = None,
    db: Session | None = None,
    saved_ids: set[int] | None = None,
    counts: dict[int, dict] | None = None,
    reacted_ids: set[int] | None = None,
    shared_ids: set[int] | None = None,
    seen_ids: set[int] | None = None,
) -> dict:
    cc = company_ctx.get(p.symbol) or {}
    # Signet : pré-calculé par lot (saved_ids) sinon requête ponctuelle fallback.
    if saved_ids is not None:
        saved = p.id in saved_ids
    elif current is not None and db is not None:
        saved = bool(db.query(CommunitySavedPost).filter(
            CommunitySavedPost.user_id == current.id,
            CommunitySavedPost.post_id == p.id,
        ).first())
    else:
        saved = False
    # Compteurs agrégés par lot (counts) sinon repli sur le chargement eager.
    if counts is not None:
        c = counts.get(p.id, {})
        rockets = c.get("reactions", 0)
        comments = c.get("comments", 0)
        shares = c.get("shares", 0)
    else:
        rockets = len(p.reactions)
        comments = len(p.comments)
        shares = len(p.shares)
    rocketed = (p.id in reacted_ids) if reacted_ids is not None else bool(
        current and any(r.user_id == current.id for r in p.reactions))
    shared = (p.id in shared_ids) if shared_ids is not None else bool(
        current and any(s.user_id == current.id for s in p.shares))
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
        "rockets": rockets,
        "comments": comments,
        "shares": shares,
        "views": p.views or 0,
        "hidden": bool(p.hidden_at),
        "rocketed": rocketed,
        "shared": shared,
        "saved": saved,
        "seen": (p.id in seen_ids) if seen_ids is not None else False,
        "attachments": _attachments_out(p),
    }


def _attachment_public_url(a: CommunityAttachment) -> str:
    """URL publique des pièces jointes : signée (Supabase Storage) pour les
    médias/fichiers, brute pour les liens."""
    if a.kind == "link":
        return a.url or ""
    if a.kind in ("image", "video", "file") and a.url:
        if a.url.startswith("http://") or a.url.startswith("https://") or a.url.startswith("data:"):
            return a.url
        return _signed_url_cached(STORAGE_BUCKET, a.url) or a.url
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
    # Upload HTTP synchrone (httpx) hors de l'event loop : le handler async
    # ne bloque plus les autres requêtes pendant l'aller-retour Supabase.
    if not await asyncio.to_thread(storage_upload, STORAGE_BUCKET, storage_path, content, mime):
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


def _rank_foryou(posts: list, current: CommunityUser, db: Session, seen_ids: set[int]) -> list:
    """Personnalise le fil 'forYou' : priorise les contenus non lus et ceux
    liés aux centres d'intérêt de l'utilisateur (comptes suivis, communautés
    rejointes, titres détenus en portefeuille). On ne filtre pas agressivement
    — on réordonne seulement pour casser la répétitivité du fil."""
    if not posts:
        return posts
    following_ids = {f.followed_id for f in current.following}
    joined_group_ids = {
        m.group_id
        for m in db.query(CommunityMember).filter(CommunityMember.user_id == current.id).all()
    }
    holdings = set()
    if current.user_id:
        # Portfolios liés via user_portfolios (migration v2: Portfolio.user_id n'existe plus)
        from app.models.user import UserPortfolio as _UP
        pids = [r[0] for r in db.query(_UP.portfolio_id).filter(_UP.user_id == current.user_id).all()]
        if pids:
            holdings = {
                s.upper()
                for (s,) in db.query(Position.symbol).filter(Position.portfolio_id.in_(pids)).all()
            }
    now = datetime.now(timezone.utc)

    def score(p):
        s = 0.0
        if p.author_id in following_ids:
            s += 3.0
        if p.group_id is not None and p.group_id in joined_group_ids:
            s += 2.0
        if p.symbol and p.symbol.upper() in holdings:
            s += 2.0
        if p.is_editor_pick:
            s += 1.0
        if p.created_at:
            ca = p.created_at
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=timezone.utc)
            age = (now - ca).total_seconds() / 86400
        else:
            age = 0
        s += max(0.0, 7.0 - age)
        return s

    def _norm(p):
        ca = p.created_at
        if ca is None:
            return datetime.min.replace(tzinfo=timezone.utc)
        return ca if ca.tzinfo else ca.replace(tzinfo=timezone.utc)
    unseen = [p for p in posts if p.id not in seen_ids]
    seen = [p for p in posts if p.id in seen_ids]
    unseen.sort(key=lambda p: (score(p), _norm(p)), reverse=True)
    seen.sort(key=lambda p: (score(p), _norm(p)), reverse=True)
    return unseen + seen


@router.get("/posts")
def list_posts(
    tab: str = "forYou",
    q: str = Query("", max_length=120),
    symbol: str = Query("", max_length=12),
    sort: str = "recent",
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    cursor: int | None = Query(None, description="Pagination curseur: id du dernier post vu (plus efficace que offset pour grand offset)"),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_reader_db),
    request: Request = None,
):
    """Fil de publications : onglets, recherche (q), filtre symbole, tri
    (recent | rockets | shares). Le tri par popularité se fait en SQL sur les
    ids, puis les posts sont relus avec leurs chargements joints. Pagination
    par offset/limit (legacy) ou cursor (id) pour défilement infini efficace.
    Routé sur le réplica lecture + en-têtes Cache-Control pour CDN."""
    check_rate_limit(request, limit=120, window_seconds=60)  # lectures du fil : 120/min/IP
    current = _get_profile(db, user)
    sort = sort if sort in ("recent", "rockets", "shares") else "recent"
    sym = symbol.strip().upper()
    term = q.strip()
    # Cursor pagination: si cursor fourni, on ignore offset (efficace pour grands offsets)
    if cursor is not None:
        offset = 0
    key = f"posts:{tab}:{sym}:{term}:{sort}:{limit}:{offset}:{cursor}:{current.id if current else 0}:{bool(current and current.banned_at)}"
    cached = _cache_get(key)
    if cached is not None:
        return _feed_response(cached, current is None)
    filters = []
    # Phase 6 — contenu masqué par la modération : invisible publiquement,
    # sauf pour l'auteur (et le staff qui voit tout).
    if not _is_staff(current):
        filters.append(
            CommunityPost.hidden_at.is_(None)
            | (CommunityPost.author_id == (current.id if current else -1))
        )
    # Phase 10 — le fil ne montre que les publications des professionnels
    # certifiés (is_pro), hors publications de groupe (visibles uniquement
    # dans leur communauté, réservées aux membres).
    # Exception : la communauté officielle "Bluerock" (slug=bluerock) est gérée depuis l'admin
    # et ses posts doivent apparaître à la fois dans /community (groupe) et dans le fil.
    try:
        bluerock_group = db.query(CommunityGroup).filter(CommunityGroup.slug == "bluerock").first()
        bluerock_id = bluerock_group.id if bluerock_group else None
    except Exception:
        bluerock_id = None
    if bluerock_id is not None:
        from sqlalchemy import or_ as _or
        filters.append(_or(CommunityPost.group_id.is_(None), CommunityPost.group_id == bluerock_id))
    else:
        filters.append(CommunityPost.group_id.is_(None))
    filters.append(CommunityPost.author.has(CommunityUser.is_pro.is_(True)))
    if tab == "editorsPick":
        filters.append(CommunityPost.is_editor_pick.is_(True))
    elif tab == "following":
        if not current:
            return {"posts": []}
        followed_ids = [f.followed_id for f in current.following]
        if not followed_ids:
            return {"posts": []}
        filters.append(CommunityPost.author_id.in_(followed_ids))
    if sym:
        filters.append(CommunityPost.symbol == sym)
    if term:
        escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        like = f"%{escaped}%"
        filters.append(
            CommunityPost.title.ilike(like, escape="\\")
            | CommunityPost.content.ilike(like, escape="\\")
            | CommunityPost.symbol.ilike(like, escape="\\")
        )
    if cursor is not None:
        filters.append(CommunityPost.id < cursor)
    if sort in ("rockets", "shares"):
        rel = CommunityReaction if sort == "rockets" else CommunityShare
        ordered = (
            db.query(CommunityPost.id)
            .filter(*filters)
            .outerjoin(rel, rel.post_id == CommunityPost.id)
            .group_by(CommunityPost.id)
            .order_by(func.count(rel.id).desc(), CommunityPost.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        ids = [r[0] for r in ordered]
        if not ids:
            return {"posts": []}
        rows = (
            db.query(CommunityPost)
            .options(
                joinedload(CommunityPost.author).joinedload(CommunityUser.user),
                joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
                joinedload(CommunityPost.author).joinedload(CommunityUser.following),
                joinedload(CommunityPost.attachments),
            )
            .filter(CommunityPost.id.in_(ids))
            .all()
        )
        by_id = {p.id: p for p in rows}
        posts = [by_id[i] for i in ids if i in by_id]
    else:
        query = db.query(CommunityPost).options(
            joinedload(CommunityPost.author).joinedload(CommunityUser.user),
            joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
            joinedload(CommunityPost.author).joinedload(CommunityUser.following),
            joinedload(CommunityPost.attachments),
        )
        for f in filters:
            query = query.filter(f)
        posts = query.order_by(CommunityPost.created_at.desc()).offset(offset).limit(limit).all()
    _warm_attachments(posts)
    ctx = _company_ctx(db)
    ids = [p.id for p in posts]
    counts = _batch_counts(db, ids) if ids else {}
    reacted_ids = set()
    shared_ids = set()
    saved_ids = None
    seen_ids = set()
    if current is not None and ids:
        reacted_ids = {r[0] for r in db.query(CommunityReaction.post_id).filter(
            CommunityReaction.post_id.in_(ids), CommunityReaction.user_id == current.id).all()}
        shared_ids = {s[0] for s in db.query(CommunityShare.post_id).filter(
            CommunityShare.post_id.in_(ids), CommunityShare.user_id == current.id).all()}
        saved_ids = {sp[0] for sp in db.query(CommunitySavedPost.post_id).filter(
            CommunitySavedPost.post_id.in_(ids), CommunitySavedPost.user_id == current.id).all()}
        seen_ids = {v[0] for v in db.query(CommunityPostSeen.post_id).filter(
            CommunityPostSeen.post_id.in_(ids), CommunityPostSeen.user_id == current.id).all()}
    if tab == "forYou" and current is not None and sort == "recent":
        # _rank_foryou réordonne seulement la page courante; pour pagination par curseur on le désactive si cursor fourni
        # (sinon doublons/omissions inter-pages dues au réordonnancement)
        if cursor is None:
            posts = _rank_foryou(posts, current, db, seen_ids)
    payload = {"posts": [_post_out(p, ctx, current, db, saved_ids, counts, reacted_ids, shared_ids, seen_ids) for p in posts]}
    # Curseur pour pagination infinie (client passe ?cursor=lastId)
    if posts:
        payload["next_cursor"] = posts[-1].id
        payload["has_more"] = len(posts) == limit
    _cache_set(key, payload)
    return _feed_response(payload, current is None)


@router.get("/posts/{post_id}")
def get_post(
    post_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_reader_db),
    request: Request = None,
):
    """Détail d'une publication pour la page entière (réplica lecture)."""
    check_rate_limit(request, limit=120, window_seconds=60)
    current = _get_profile(db, user)
    p = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author).joinedload(CommunityUser.user),
            joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
            joinedload(CommunityPost.author).joinedload(CommunityUser.following),
            joinedload(CommunityPost.attachments),
        )
        .filter(CommunityPost.id == post_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    if p.hidden_at and not (_is_staff(current) or (current and p.author_id == current.id)):
        raise HTTPException(status_code=404, detail="Publication introuvable")
    if p.group_id is not None and not _post_group_visible(db, p, current):
        raise HTTPException(status_code=403, detail="Réservé aux membres de la communauté")
    _warm_attachments([p])
    ctx = _company_ctx(db)
    counts = _batch_counts(db, [post_id])
    reacted_ids = set()
    shared_ids = set()
    saved_ids = None
    if current is not None:
        reacted_ids = {r[0] for r in db.query(CommunityReaction.post_id).filter(
            CommunityReaction.post_id == post_id, CommunityReaction.user_id == current.id).all()}
        shared_ids = {s[0] for s in db.query(CommunityShare.post_id).filter(
            CommunityShare.post_id == post_id, CommunityShare.user_id == current.id).all()}
        saved_ids = {sp[0] for sp in db.query(CommunitySavedPost.post_id).filter(
            CommunitySavedPost.post_id == post_id, CommunitySavedPost.user_id == current.id).all()}
    return _feed_response({"post": _post_out(p, ctx, current, db, saved_ids, counts, reacted_ids, shared_ids)}, current is None)


@router.post("/posts/{post_id}/seen")
def mark_post_seen(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marque une publication comme vue par l'utilisateur courant (alimente le
    fil personnalisé : on priorise ensuite les contenus non lus)."""
    current = _get_profile(db, user)
    if current is None:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    exists = db.query(CommunityPostSeen.id).filter(
        CommunityPostSeen.post_id == post_id, CommunityPostSeen.user_id == current.id
    ).first()
    if not exists:
        db.add(CommunityPostSeen(user_id=current.id, post_id=post_id))
        db.commit()
    return {"ok": True}


@router.get("/discover")
def discover(
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Page découverte : symboles tendance, analystes populaires, choix de la
    rédaction, statistiques communautaires."""
    current = _get_profile(db, user)
    key = f"discover:{current.id if current else 0}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    from datetime import timedelta as _td
    # Symboles les plus commentés/partagés/réagis sur 30 jours
    trend_rows = (
        db.query(CommunityPost.symbol, func.count(CommunityPost.id).label("n"))
        .filter(
            CommunityPost.created_at >= datetime.now(timezone.utc) - _td(days=30),
            CommunityPost.hidden_at.is_(None),
        )
        .group_by(CommunityPost.symbol)
        .order_by(func.count(CommunityPost.id).desc())
        .limit(6)
        .all()
    )
    ctx = _company_ctx(db)
    trend = []
    for sym, n in trend_rows:
        cc = ctx.get(sym) or {}
        trend.append({
            "symbol": sym,
            "name": cc.get("name") or "",
            "price": cc.get("price"),
            "change_percent": cc.get("change_percent"),
            "posts": n,
        })
    # Analystes les plus réagis (rockets reçus sur leurs publications) —
    # les membres Premium sont prioritaires à éligibilité égale (Phase 9).
    top_rows = (
        db.query(
            CommunityPost.author_id,
            func.count(CommunityReaction.id).label("rockets_received"),
        )
        .join(CommunityReaction, CommunityReaction.post_id == CommunityPost.id)
        .filter(CommunityPost.hidden_at.is_(None))
        .group_by(CommunityPost.author_id)
        .order_by(func.count(CommunityReaction.id).desc())
        .limit(12)
        .all()
    )
    top = []
    if top_rows:
        ids = [author_id for author_id, _n in top_rows]
        prof_map = {
            p.id: p
            for p in db.query(CommunityUser)
            .options(joinedload(CommunityUser.user), joinedload(CommunityUser.followers))
            .filter(CommunityUser.id.in_(ids))
            .all()
        }
        ranked = []
        for author_id, n in top_rows:
            p = prof_map.get(author_id)
            if not p:
                continue
            ranked.append((_is_premium(p), p, n))
        ranked.sort(key=lambda t: (not t[0], -t[2]))
        for _prem, p, n in ranked[:6]:
            top.append({
                "id": p.id,
                "handle": p.handle,
                "display_name": p.display_name,
                "avatar": _avatar(p),
                "avatar_color": p.avatar_color,
                "is_pro": bool(p.is_pro),
                "is_premium": _is_premium(p),
                "verified": p.verified,
                "rockets_received": n,
                "is_following": bool(current and any(f.followed_id == p.id for f in current.following)),
            })
    editors = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author).joinedload(CommunityUser.user),
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.comments),
            joinedload(CommunityPost.attachments),
            joinedload(CommunityPost.shares),
        )
        .filter(CommunityPost.is_editor_pick.is_(True))
        .order_by(CommunityPost.created_at.desc())
        .limit(3)
        .all()
    )
    editors_warm = [p for p in editors if p.attachments]
    if editors_warm:
        _warm_attachments(editors_warm)
    stats = {
        "total_posts": db.query(func.count(CommunityPost.id)).scalar() or 0,
        "total_profiles": db.query(func.count(CommunityUser.id)).scalar() or 0,
        "posts_this_week": db.query(func.count(CommunityPost.id))
        .filter(CommunityPost.created_at >= datetime.now(timezone.utc) - _td(days=7))
        .scalar() or 0,
    }
    payload = {
        "trending_symbols": trend,
        "top_analysts": top,
        "editors_picks": [_post_out(p, ctx, current, db) for p in editors],
        "stats": stats,
    }
    _cache_set(key, payload)
    return payload


@router.get("/suggestions")
def suggestions(
    limit: int = Query(5, ge=1, le=10),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Profils à suivre : exclut soi-même et les comptes déjà suivis, triés
    par le nombre de rockets reçus."""
    current = _get_profile(db, user)
    key = f"sugg:{limit}:{current.id if current else 0}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    base = (
        db.query(CommunityUser.id)
        .outerjoin(CommunityPost, CommunityPost.author_id == CommunityUser.id)
        .outerjoin(CommunityReaction, CommunityReaction.post_id == CommunityPost.id)
        .group_by(CommunityUser.id)
    )
    if current:
        followed = [f.followed_id for f in current.following]
        base = base.filter(CommunityUser.id != current.id)
        if followed:
            base = base.filter(CommunityUser.id.notin_(followed))
    rows = (
        base.order_by(
            func.count(CommunityReaction.id).desc(),
            func.count(CommunityPost.id).desc(),
        )
        .limit(limit)
        .all()
    )
    ids = [r[0] for r in rows]
    if not ids:
        return {"suggestions": []}
    profiles = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
        )
        .filter(CommunityUser.id.in_(ids))
        .all()
    )
    by_id = {p.id: p for p in profiles}
    ordered = [by_id[i] for i in ids if i in by_id]
    payload = {"suggestions": [_user_out(p, current) for p in ordered]}
    _cache_set(key, payload)
    return payload


@router.get("/users")
def list_users(
    search: str = "",
    pro_only: bool = False,
    limit: int = Query(30, ge=1, le=50),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    current = _get_profile(db, user)
    # Inclusion de current.id dans la clé pour éviter fuite is_following cross-user
    key = f"users:{search.strip()}:{limit}:{pro_only}:{current.id if current else 0}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    query = db.query(CommunityUser).options(
        joinedload(CommunityUser.followers),
        joinedload(CommunityUser.following),
        joinedload(CommunityUser.posts),
    )
    if search.strip():
        q = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        query = query.filter(
            CommunityUser.handle.ilike(f"%{q}%", escape="\\") | CommunityUser.display_name.ilike(f"%{q}%", escape="\\")
        )
    if pro_only:
        query = query.filter(CommunityUser.is_pro.is_(True))
    users = query.order_by(CommunityUser.verified.desc(), CommunityUser.id.asc()).limit(limit).all()
    payload = {"users": [_user_out(u, current) for u in users]}
    _shared_store.cache_set(_FEED_PREFIX + key, payload, _USERS_TTL)
    return payload


@router.get("/me")
def get_me(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    """Profil communautaire de l'utilisateur connecté + ses publications (paginnées)."""
    current = _get_or_create_profile(db, user)
    profile = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.user),
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
        )
        .filter(CommunityUser.id == current.id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    posts, rockets, shares, views = _profile_posts(db, current.id, current, offset, limit, True)
    user_out = _user_out(profile, current)
    user_out["rockets_received"] = rockets
    user_out["shares_received"] = shares
    user_out["views_received"] = views
    user_out["staff"] = role_level(user.role) >= role_level("compliance")
    return {
        "user": user_out,
        "posts": posts,
    }


@router.get("/users/{user_id}")
def get_user(
    user_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_reader_db),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    current = _get_profile(db, user)
    profile = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
        )
        .filter(CommunityUser.id == user_id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    # Phase 6 — masqués invisibles au public (l'auteur et le staff les voient)
    include_hidden = _is_staff(current) or (current and current.id == profile.id)
    posts, rockets, shares, views = _profile_posts(db, user_id, current, offset, limit, include_hidden)
    user_out = _user_out(profile, current)
    user_out["rockets_received"] = rockets
    user_out["shares_received"] = shares
    user_out["views_received"] = views
    return {
        "user": user_out,
        "posts": posts,
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
    _mod_guard(current)
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
        _refresh_reputation(db, target)
        db.commit()
        _cache_bust()
        return {"following": False}
    db.add(CommunityFollow(follower_id=current.id, followed_id=target.id))
    db.commit()
    _refresh_reputation(db, target)  # nouveau follower => réputation du suivi
    db.commit()
    _cache_bust()
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
    group_id: Optional[int] = Form(None),  # publication dans une communauté (Phase 10)
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 posts / min / IP
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
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

    # Phase 10 — droits de publication :
    #   - hors groupe : seuls les professionnels certifiés (is_pro) publient ;
    #   - dans un groupe : seuls l'admin (ou le créateur) publient.
    if group_id:
        group = _find_group(db, str(group_id))
        if not group:
            raise HTTPException(status_code=404, detail="Communauté introuvable")
        member = _member_row(db, group.id, current.id)
        if not member or member.status != "active":
            raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de cette communauté")
        if member.role not in GROUP_ADMIN_ROLES:
            raise HTTPException(status_code=403, detail="Seuls les administrateurs publient dans cette communauté")
    elif not current.is_pro:
        raise HTTPException(status_code=403, detail="Seuls les professionnels certifiés publient dans le fil")

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
        group_id=group_id,
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
    hidden = _ai_scan_post(db, post)
    new_badges = _refresh_reputation(db, current)
    db.commit()
    for code in new_badges:
        _notify(
            db,
            current.user_id,
            "Nouveau badge débloqué",
            f"Votre collection de réputation s'agrandit ({code}).",
            "/community",
        )
    db.commit()
    db.refresh(post)
    post = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.comments),
            joinedload(CommunityPost.attachments),
            joinedload(CommunityPost.shares),
        )
        .filter(CommunityPost.id == post.id)
        .first()
    )
    ctx = _company_ctx(db)
    _cache_bust()
    out = _post_out(post, ctx, current, db)
    if hidden:
        out["ai_hidden"] = True
    return out


class DraftPayload(BaseModel):
    symbol: str = ""
    sentiment: str = "bullish"
    title: str = ""
    content: str = ""
    link_url: str = ""
    link_title: str = ""


def _draft_out(d: CommunityDraft) -> dict:
    return {
        "id": d.id,
        "symbol": d.symbol or "",
        "sentiment": d.sentiment or "bullish",
        "title": d.title or "",
        "content": d.content or "",
        "link_url": d.link_url or "",
        "link_title": d.link_title or "",
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("/drafts")
def list_drafts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Brouillons de l'utilisateur connecté (plus récent en premier)."""
    current = _get_or_create_profile(db, user)
    drafts = (
        db.query(CommunityDraft)
        .filter(CommunityDraft.user_id == current.id)
        .order_by(CommunityDraft.updated_at.desc())
        .all()
    )
    return {"drafts": [_draft_out(d) for d in drafts]}


@router.post("/drafts", response_model=None)
def create_draft(
    payload: DraftPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Crée un brouillon (ou met à jour si le plus récent n'est pas publié)."""
    check_rate_limit(request, limit=30, window_seconds=60)
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    draft = (
        db.query(CommunityDraft)
        .filter(CommunityDraft.user_id == current.id)
        .order_by(CommunityDraft.updated_at.desc())
        .first()
    )
    if draft is None:
        draft = CommunityDraft(user_id=current.id)
        db.add(draft)
    draft.symbol = (payload.symbol or "").strip().upper()[:20]
    draft.sentiment = payload.sentiment if payload.sentiment in ("bullish", "bearish", "neutral") else "bullish"
    draft.title = (payload.title or "").strip()[:240]
    draft.content = (payload.content or "").strip()[:3000]
    draft.link_url = (payload.link_url or "").strip()[:500]
    draft.link_title = (payload.link_title or "").strip()[:240]
    db.commit()
    db.refresh(draft)
    return _draft_out(draft)


@router.delete("/drafts/{draft_id}")
def delete_draft(
    draft_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    current = _get_or_create_profile(db, user)
    draft = (
        db.query(CommunityDraft)
        .filter(CommunityDraft.id == draft_id, CommunityDraft.user_id == current.id)
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Brouillon introuvable")
    db.delete(draft)
    db.commit()
    return {"deleted": True}


@router.post("/drafts/{draft_id}/publish")
async def publish_draft(
    draft_id: int,
    media: Optional[UploadFile] = File(None),
    file: Optional[UploadFile] = File(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Publie un brouillon en une publication réelle (le brouillon est supprimé)."""
    check_rate_limit(request, limit=10, window_seconds=60)
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    # Phase 10 — seuls les professionnels certifiés publient dans le fil.
    if not current.is_pro:
        raise HTTPException(status_code=403, detail="Seuls les professionnels certifiés publient dans le fil")
    draft = (
        db.query(CommunityDraft)
        .filter(CommunityDraft.id == draft_id, CommunityDraft.user_id == current.id)
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="Brouillon introuvable")
    symbol = (draft.symbol or "").upper()
    company = db.query(Company).filter(Company.symbol == symbol).first() if symbol else None
    if not company:
        raise HTTPException(status_code=422, detail="Symbole BRVM inconnu ou absent du brouillon")
    title = (draft.title or "").strip()
    if len(title) < 5:
        raise HTTPException(status_code=422, detail="Titre trop court (5 caractères minimum)")
    content = (draft.content or "").strip()
    attachments: list[CommunityAttachment] = []
    if media and media.filename:
        path, name, mime = await _store_upload(media)
        attachments.append(CommunityAttachment(
            kind=_guess_media_kind(mime, name), url=path, name=name, mime=mime,
        ))
    if file and file.filename:
        path, name, mime = await _store_upload(file)
        attachments.append(CommunityAttachment(kind="file", url=path, name=name, mime=mime))
    if draft.link_url:
        link_url = draft.link_url.strip()
        if link_url.lower().startswith(("http://", "https://")):
            attachments.append(CommunityAttachment(
                kind="link", url=link_url[:2000],
                name=(draft.link_title or "").strip()[:240] or link_url[:240],
            ))
    post = CommunityPost(
        author_id=current.id,
        symbol=symbol,
        sentiment=draft.sentiment or "bullish",
        title=title,
        content=content,
    )
    db.add(post)
    if attachments:
        db.flush()
        for a in attachments:
            a.post_id = post.id
        db.add_all(attachments)
    db.delete(draft)
    db.commit()
    db.refresh(post)
    hidden = _ai_scan_post(db, post)
    new_badges = _refresh_reputation(db, current)
    db.commit()
    for code in new_badges:
        _notify(
            db,
            current.user_id,
            "Nouveau badge débloqué",
            f"Votre collection de réputation s'agrandit ({code}).",
            "/community",
        )
    db.commit()
    db.refresh(post)
    post = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author),
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.comments),
            joinedload(CommunityPost.attachments),
            joinedload(CommunityPost.shares),
        )
        .filter(CommunityPost.id == post.id)
        .first()
    )
    ctx = _company_ctx(db)
    _cache_bust()
    out = _post_out(post, ctx, current, db)
    if hidden:
        out["ai_hidden"] = True
    return out


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
    _mod_guard(current)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    if post.group_id is not None and not _post_group_visible(db, post, current):
        raise HTTPException(status_code=403, detail="Réservé aux membres de la communauté")
    existing = (
        db.query(CommunityReaction)
        .filter(CommunityReaction.post_id == post.id, CommunityReaction.user_id == current.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        _cache_bust("posts:")
        count = (
            db.query(func.count(CommunityReaction.id))
            .filter(CommunityReaction.post_id == post.id)
            .scalar()
        ) or 0
        return {"rocketed": False, "rockets": count}
    db.add(CommunityReaction(post_id=post.id, user_id=current.id))
    db.commit()
    _refresh_reputation(db, post.author)  # rockets reçus => réputation de l'auteur
    db.commit()
    _cache_bust("posts:")
    count = (
        db.query(func.count(CommunityReaction.id))
        .filter(CommunityReaction.post_id == post.id)
        .scalar()
    ) or 0
    return {"rocketed": True, "rockets": count}


@router.post("/posts/{post_id}/share")
def share_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Partage (repost) d'une publication : bascule on/off."""
    check_rate_limit(request, limit=20, window_seconds=60)  # 20 partages / min / IP
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    if post.group_id is not None and not _post_group_visible(db, post, current):
        raise HTTPException(status_code=403, detail="Réservé aux membres de la communauté")
    existing = (
        db.query(CommunityShare)
        .filter(CommunityShare.post_id == post.id, CommunityShare.user_id == current.id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        _cache_bust("posts:")
        count = (
            db.query(func.count(CommunityShare.id))
            .filter(CommunityShare.post_id == post.id)
            .scalar()
        ) or 0
        return {"shared": False, "shares": count}
    author = post.author
    title = post.title[:80]
    db.add(CommunityShare(post_id=post.id, user_id=current.id))
    db.commit()
    _refresh_reputation(db, author)  # partages reçus => réputation de l'auteur
    db.commit()
    _cache_bust("posts:")
    if author and author.user_id and author.user_id != current.user_id:
        _notify(
            db,
            author.user_id,
            "Votre publication a été partagée",
            f"{current.display_name} a partagé « {title} »",
            link=f"/community?post={post.id}",
        )
        db.commit()
    count = (
        db.query(func.count(CommunityShare.id))
        .filter(CommunityShare.post_id == post.id)
        .scalar()
    ) or 0
    return {"shared": True, "shares": count}


@router.delete("/posts/{post_id}")
def delete_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Suppression d'une publication : auteur ou staff (modération)."""
    check_rate_limit(request, limit=30, window_seconds=60)
    current = _get_or_create_profile(db, user)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    is_staff = role_level(user.role) >= role_level("compliance")
    if post.author_id != current.id and not is_staff:
        raise HTTPException(status_code=403, detail="Vous n'êtes pas l'auteur de cette publication")
    title = post.title
    db.delete(post)  # cascade ORM : réactions, commentaires (+ réactions), pièces jointes, partages
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.post.delete",
        "community_post",
        resource_id=post_id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"staff": is_staff, "title": title[:240]},
    )
    db.commit()
    return {"deleted": True}


@router.post("/posts/{post_id}/save")
def save_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Enregistre / retire une publication des signets de l'utilisateur (toggle)."""
    check_rate_limit(request, limit=60, window_seconds=60)
    _mod_guard(_get_or_create_profile(db, user))
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    profile = _get_or_create_profile(db, user)
    existing = db.query(CommunitySavedPost).filter(
        CommunitySavedPost.user_id == profile.id,
        CommunitySavedPost.post_id == post_id,
    ).first()
    if existing:
        db.delete(existing)
        saved = False
    else:
        db.add(CommunitySavedPost(user_id=profile.id, post_id=post_id))
        saved = True
    db.commit()
    _cache_bust()
    return {"saved": saved}


@router.delete("/posts/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: int,
    comment_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Suppression d'un commentaire : auteur, auteur du post ou staff."""
    check_rate_limit(request, limit=30, window_seconds=60)
    current = _get_or_create_profile(db, user)
    comment = (
        db.query(CommunityComment)
        .filter(CommunityComment.id == comment_id, CommunityComment.post_id == post_id)
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Commentaire introuvable")
    is_staff = role_level(user.role) >= role_level("compliance")
    if comment.author_id != current.id and comment.post.author_id != current.id and not is_staff:
        raise HTTPException(status_code=403, detail="Vous ne pouvez pas supprimer ce commentaire")
    db.delete(comment)
    db.commit()
    _cache_bust()
    return {"deleted": True}


@router.get("/posts/{post_id}/comments")
def list_comments(post_id: int,
                  user: User | None = Depends(get_optional_user),
                  db: Session = Depends(get_db),
                  offset: int = Query(0, ge=0),
                  limit: int = Query(50, ge=1, le=200),
                  background_tasks: BackgroundTasks = None):
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    current = _get_profile(db, user)
    if post.group_id is not None and not _post_group_visible(db, post, current):
        raise HTTPException(status_code=403, detail="Réservé aux membres de la communauté")
    # Compteur de lectures (Phase 5) : le lecteur ouvre les commentaires => une vue.
    # L'auteur n'est pas compté ; les lecteurs anonymes comptent aussi.
    # Déplacé en tâche de fond pour ne pas bloquer/écrire sur une lecture (GET).
    if current is None or current.id != post.author_id:
        if background_tasks is not None:
            background_tasks.add_task(_bump_views, post.id)
        else:
            post.views = (post.views or 0) + 1
            db.commit()
    comments_q = db.query(CommunityComment).filter(CommunityComment.post_id == post_id)
    # Phase 6 — commentaires masqués : visibles uniquement pour leur auteur
    # et le staff (les autres voient un commentaire remplacé par un bandeau).
    if not _is_staff(current):
        comments_q = comments_q.filter(
            CommunityComment.hidden_at.is_(None)
            | (CommunityComment.author_id == (current.id if current else -1))
        )
    comments = (
        comments_q.options(
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
                    "avatar": _avatar(c.author),
                    "verified": c.author.verified,
                },
                "reactions": len(c.reactions),
                "reacted": bool(current and any(r.user_id == current.id for r in c.reactions)),
                "hidden": bool(c.hidden_at),
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
    _mod_guard(current)
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
        _cache_bust()
        count = (
            db.query(func.count(CommunityCommentReaction.id))
            .filter(CommunityCommentReaction.comment_id == comment.id)
            .scalar()
        ) or 0
        return {"reacted": False, "reactions": count}
    db.add(CommunityCommentReaction(comment_id=comment.id, user_id=current.id))
    db.commit()
    _cache_bust()
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
    _mod_guard(current)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    comment = CommunityComment(post_id=post.id, author_id=current.id, content=req.content.strip())
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _cache_bust()
    return {
        "id": comment.id,
        "content": comment.content,
        "created_at": comment.created_at.isoformat() if comment.created_at else None,
        "author": {
            "id": current.id,
            "handle": current.handle,
            "display_name": current.display_name,
            "avatar": _avatar(current),
            "verified": current.verified,
        },
        "reactions": 0,
        "reacted": False,
    }


# ---------------------------------------------------------------------------
# Phase 1 — Fondations : communautés (groupes), adhésions et rôles.
# Les rôles et permissions sont TOUJOURS résolus côté serveur (jamais depuis
# le client). L'appartenance est protégée par la contrainte UNIQUE
# (community_id, user_id).
# ---------------------------------------------------------------------------

GROUP_ROLE_LEVEL = {"member": 1, "moderator": 2, "admin": 3, "creator": 4}
GROUP_ADMIN_ROLES = {"creator", "admin"}
GROUP_MOD_ROLES = {"creator", "admin", "moderator"}
GROUP_VISIBILITIES = {"public", "private", "invite_only"}
GROUP_ASSIGNABLE_ROLES = {"member", "moderator", "admin"}


class GroupCreate(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=140)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="general", max_length=60)
    visibility: str = Field(default="public", max_length=20)
    rules: str = Field(default="", max_length=4000)
    is_paid: bool = False
    price_xof: Optional[int] = Field(default=None, ge=100)


class GroupUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=3, max_length=120)
    slug: Optional[str] = Field(default=None, max_length=140)
    description: Optional[str] = Field(default=None, max_length=2000)
    category: Optional[str] = Field(default=None, max_length=60)
    visibility: Optional[str] = Field(default=None, max_length=20)
    rules: Optional[str] = Field(default=None, max_length=4000)
    is_paid: Optional[bool] = None
    price_xof: Optional[int] = Field(default=None, ge=100)


class MemberInvite(BaseModel):
    profile_id: int


class MemberRoleUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=20)


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return slug[:60] or "communaute"


def _unique_slug(db: Session, name: str, group_id: int | None = None) -> str:
    base = _slugify(name)
    slug = base
    i = 2
    while True:
        existing = db.query(CommunityGroup).filter(CommunityGroup.slug == slug).first()
        if not existing or (group_id and existing.id == group_id):
            return slug
        slug = f"{base}-{i}"
        i += 1


def _find_group(db: Session, ref: str) -> CommunityGroup | None:
    q = db.query(CommunityGroup)
    if ref.isdigit():
        return q.filter(CommunityGroup.id == int(ref)).first()
    return q.filter(CommunityGroup.slug == ref.lower()).first()


def _member_row(db: Session, group_id: int, profile_id: int) -> CommunityMember | None:
    return (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == group_id, CommunityMember.user_id == profile_id)
        .first()
    )


def _active_member(db: Session, group: CommunityGroup, profile: CommunityUser) -> CommunityMember:
    row = _member_row(db, group.id, profile.id)
    if not row or row.status != "active":
        raise HTTPException(status_code=403, detail="Vous n'êtes pas membre de cette communauté")
    return row


def _require_role(db: Session, group: CommunityGroup, profile: CommunityUser, allowed: set[str]) -> CommunityMember:
    row = _active_member(db, group, profile)
    if row.role not in allowed:
        raise HTTPException(status_code=403, detail="Permission insuffisante")
    return row


def _group_visible_to(group: CommunityGroup, my_membership: CommunityMember | None) -> bool:
    """Visibilité d'un groupe pour un profil donné (membres seulement pour les
    communautés privées / sur invitation — les demandes en attente restent
    visibles pour suivre leur approbation)."""
    if group.visibility == "public":
        return True
    return bool(my_membership and my_membership.status in ("active", "pending", "invited"))


def _member_count_sql(db: Session, group_id: int) -> int:
    return (
        db.query(func.count(CommunityMember.id))
        .filter(CommunityMember.community_id == group_id, CommunityMember.status == "active")
        .scalar()
    ) or 0


def _group_payload(
    db: Session,
    g: CommunityGroup,
    member_count: int | None = None,
    my_membership: CommunityMember | None = None,
    detailed: bool = False,
) -> dict:
    visible = _group_visible_to(g, my_membership)
    active = bool(my_membership and my_membership.status == "active")
    payload = {
        "id": g.id,
        "slug": g.slug,
        "name": g.name,
        "description": g.description or "",
        "category": g.category,
        "visibility": g.visibility,
        "status": g.status,
        "avatar": g.avatar or "",
        "banner": g.banner or "",
        "banner_url": (g.banner if g.banner and (g.banner.startswith("http://") or g.banner.startswith("https://")) else _signed_url_cached(STORAGE_BUCKET, g.banner)) if g.banner else "",
        "member_count": member_count if member_count is not None else _member_count_sql(db, g.id),
        "posts_count": (
            db.query(func.count(CommunityPost.id)).filter(CommunityPost.group_id == g.id).scalar()
        ) or 0,
        "is_paid": bool(g.is_paid),
        "price_xof": g.price_xof,
        "my_role": my_membership.role if active else None,
        "is_member": active,
        "is_pending": bool(my_membership and my_membership.status == "pending"),
        "is_invited": bool(my_membership and my_membership.status == "invited"),
        "is_moderator": active and my_membership.role in GROUP_MOD_ROLES,
        "is_admin": active and my_membership.role in GROUP_ADMIN_ROLES,
        "creator": (
            {
                "id": g.creator.id,
                "handle": g.creator.handle,
                "display_name": g.creator.display_name,
                "avatar": _avatar(g.creator),
                "verified": g.creator.verified,
                "is_pro": bool(g.creator.is_pro),
            }
            if g.creator
            else None
        ),
        "admins": _group_admins_payload(db, g),
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }
    if detailed and visible:
        payload["rules"] = g.rules or ""
    return payload


def _group_admins_payload(db: Session, g: CommunityGroup) -> list[dict]:
    """Toutes les informations essentielles des administrateurs d'un groupe
    (créateur + admins) pour la carte de communauté (Phase 10)."""
    rows = (
        db.query(CommunityMember)
        .options(joinedload(CommunityMember.user).joinedload(CommunityUser.user))
        .filter(
            CommunityMember.community_id == g.id,
            CommunityMember.status == "active",
            CommunityMember.role.in_(("creator", "admin")),
        )
        .all()
    )
    prof_ids = [r.user_id for r in rows if r.user]
    pro_map: dict[int, CommunityProfessional | None] = {}
    if prof_ids:
        pro_rows = db.query(CommunityProfessional).filter(CommunityProfessional.user_id.in_(prof_ids)).all()
        pro_map = {p.user_id: p for p in pro_rows}
    out = []
    for r in rows:
        u = r.user
        if not u:
            continue
        out.append(
            {
                **{k: v for k, v in _user_out(u).items() if k not in ("is_me", "is_staff", "is_following")},
                "role": r.role,
                "pro": _pro_payload(pro_map.get(u.id)),
            }
        )
    return out


def _notify(db: Session, user_id: int | None, title: str, body: str, link: str | None = None) -> None:
    if not user_id:
        return
    try:
        db.add(Notification(user_id=user_id, type="system", title=title[:160], body=body, link=(link or "")[:200]))
    except Exception:
        logger.warning("notification create failed (user_id=%s)", user_id, exc_info=True)


def _creator_user_id(g: CommunityGroup) -> int | None:
    return g.creator.user_id if g.creator else None


def _post_group_visible(db: Session, post: CommunityPost, profile: CommunityUser | None) -> bool:
    """Une publication de groupe n'est visible que par un membre actif du groupe
    (l'auteur et le staff y ont toujours accès)."""
    if _is_staff(profile):
        return True
    if post.author_id == (profile.id if profile else -1):
        return True
    if not profile:
        return False
    membership = _member_row(db, post.group_id, profile.id)
    return bool(membership and membership.status == "active")


@router.get("/groups")
def list_groups(
    search: str = Query("", max_length=120),
    category: str = Query("", max_length=60),
    scope: str = Query("all", max_length=20),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Découverte de communautés (pagination + comptage en SQL, pas en Python).

    `scope` vaut l'un de : all | public | private | bluerock.
    - public   → communautés publiques
    - private  → communautés privées / sur invitation
    - bluerock → communautés animées par le staff BlueRock (créées par un staff)
    """
    current = _get_profile(db, user)
    key = f"groups:{search.strip().lower()}:{category.strip().lower()}:{scope}:{limit}:{offset}:{current.id if current else 0}"
    cached = _cache_get(key)
    if cached is not None:
        return cached
    query = db.query(CommunityGroup).filter(CommunityGroup.status != "archived")
    if search.strip():
        q = search.strip()
        query = query.filter(
            CommunityGroup.name.ilike(f"%{q}%")
            | CommunityGroup.slug.ilike(f"%{q}%")
            | CommunityGroup.description.ilike(f"%{q}%")
        )
    if category.strip():
        query = query.filter(CommunityGroup.category == category.strip().lower())
    if scope == "public":
        query = query.filter(CommunityGroup.visibility == "public")
    elif scope == "private":
        query = query.filter(CommunityGroup.visibility.in_(("private", "invite_only")))
    elif scope == "bluerock":
        staff_level = role_level("compliance")
        staff_roles = [r for r, lv in ROLE_LEVELS.items() if lv >= staff_level]
        staff_ids = (
            db.query(CommunityUser.id)
            .join(User, CommunityUser.user_id == User.id)
            .filter(User.role.in_(staff_roles))
        )
        query = query.filter(CommunityGroup.creator_id.in_(staff_ids))
    total = query.count()
    groups = query.order_by(CommunityGroup.created_at.desc()).offset(offset).limit(limit).all()
    if current is not None:
        member_group_ids = {
            m.community_id
            for m in db.query(CommunityMember)
            .filter(CommunityMember.user_id == current.id, CommunityMember.status == "active")
            .all()
        }
        groups = sorted(
            groups,
            key=lambda g: (g.id not in member_group_ids, -(g.created_at.timestamp() if g.created_at else 0)),
        )
    counts = dict(
        db.query(CommunityMember.community_id, func.count(CommunityMember.id))
        .filter(
            CommunityMember.community_id.in_([g.id for g in groups]),
            CommunityMember.status == "active",
        )
        .group_by(CommunityMember.community_id)
        .all()
    )
    payload = {
        "groups": [
            _group_payload(db, g, member_count=counts.get(g.id, 0), my_membership=_member_row(db, g.id, current.id) if current else None)
            for g in groups
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }
    _cache_set(key, payload)
    return payload


@router.post("/groups")
async def create_group(
    name: str = Form(...),
    slug: Optional[str] = Form(None),
    description: str = Form(""),
    category: str = Form("general"),
    visibility: str = Form("public"),
    rules: str = Form(""),
    is_paid: bool = Form(False),
    price_xof: Optional[int] = Form(None),
    banner: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 créations / min / IP
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    if not banner or not getattr(banner, "filename", ""):
        raise HTTPException(status_code=422, detail="Image de couverture obligatoire")
    banner_path, _banner_name, banner_mime = await _store_upload(banner)
    if not (banner_mime or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="La couverture doit être une image")
    visibility = visibility.strip().lower()
    if visibility not in GROUP_VISIBILITIES:
        raise HTTPException(status_code=422, detail="Visibilité invalide (public | private | invite_only)")
    if is_paid and not (price_xof and price_xof >= 100):
        raise HTTPException(status_code=422, detail="Prix invalide pour une communauté payante (minimum 100 FCFA)")
    slug = _unique_slug(db, (slug or "").strip() or name)
    group = CommunityGroup(
        name=name.strip(),
        slug=slug,
        description=(description or "").strip(),
        category=(category or "").strip().lower()[:60] or "general",
        visibility=visibility,
        rules=(rules or "").strip(),
        creator_id=current.id,
        is_paid=is_paid,
        price_xof=price_xof if is_paid else None,
        banner=banner_path,
    )
    db.add(group)
    db.flush()
    db.add(CommunityMember(community_id=group.id, user_id=current.id, role="creator", status="active"))
    db.commit()
    db.refresh(group)
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.create",
        "community_group",
        resource_id=group.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"slug": group.slug, "name": group.name, "visibility": group.visibility},
    )
    db.commit()
    return _group_payload(db, group, member_count=1, my_membership=_member_row(db, group.id, current.id), detailed=True)


@router.get("/groups/{ref}")
def get_group(
    ref: str,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    current = _get_profile(db, user)
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    my_membership = _member_row(db, group.id, current.id) if current else None
    if not _group_visible_to(group, my_membership):
        raise HTTPException(status_code=403, detail="Cette communauté est privée")
    return _group_payload(
        db,
        group,
        member_count=_member_count_sql(db, group.id),
        my_membership=my_membership,
        detailed=True,
    )


@router.get("/groups/{ref}/posts")
def list_group_posts(
    ref: str,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    admin_only: bool = Query(False),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Publications d'une communauté (Phase 10).

    Uniquement les membres actifs voient les publications du groupe ; les
    administrateurs (créateur + admins) publient, les autres membres peuvent
    réagir, commenter, partager et enregistrer. `admin_only` ne renvoie que les
    publications du/des administrateurs (vue « infos du groupe »)."""
    current = _get_profile(db, user)
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    my_membership = _member_row(db, group.id, current.id) if current else None
    if not (my_membership and my_membership.status == "active"):
        raise HTTPException(status_code=403, detail="Réservé aux membres de la communauté")
    query = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.author).joinedload(CommunityUser.user),
            joinedload(CommunityPost.author).joinedload(CommunityUser.followers),
            joinedload(CommunityPost.author).joinedload(CommunityUser.following),
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.comments),
            joinedload(CommunityPost.attachments),
            joinedload(CommunityPost.shares),
        )
        .filter(CommunityPost.group_id == group.id)
        .filter(CommunityPost.hidden_at.is_(None))
    )
    if admin_only:
        admin_ids = {
            m.user_id
            for m in db.query(CommunityMember).filter(
                CommunityMember.community_id == group.id,
                CommunityMember.role.in_(GROUP_ADMIN_ROLES),
                CommunityMember.status == "active",
            ).all()
        }
        if admin_ids:
            query = query.filter(CommunityPost.author_id.in_(admin_ids))
    total = query.count()
    posts = query.order_by(CommunityPost.created_at.desc()).offset(offset).limit(limit).all()
    _warm_attachments(posts)
    ctx = _company_ctx(db)
    return {
        "posts": [_post_out(p, ctx, current, db) for p in posts],
        "total": total,
        "offset": offset,
        "limit": limit,
        "can_post": bool(
            my_membership
            and my_membership.status == "active"
            and my_membership.role in GROUP_ADMIN_ROLES
        ),
        "member_count": _member_count_sql(db, group.id),
    }


@router.patch("/groups/{ref}")
def update_group(
    ref: str,
    req: GroupUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    _require_role(db, group, current, GROUP_ADMIN_ROLES)
    if req.name is not None:
        group.name = req.name.strip()[:120]
    if req.slug is not None:
        slug = _slugify(req.slug)
        if not slug:
            raise HTTPException(status_code=422, detail="Slug invalide")
        if db.query(CommunityGroup).filter(CommunityGroup.slug == slug, CommunityGroup.id != group.id).first():
            raise HTTPException(status_code=409, detail="Ce slug est déjà utilisé")
        group.slug = slug
    if req.description is not None:
        group.description = req.description.strip()[:2000]
    if req.category is not None:
        group.category = req.category.strip().lower()[:60] or "general"
    if req.visibility is not None:
        vis = req.visibility.strip().lower()
        if vis not in GROUP_VISIBILITIES:
            raise HTTPException(status_code=422, detail="Visibilité invalide (public | private | invite_only)")
        group.visibility = vis
    if req.rules is not None:
        group.rules = req.rules.strip()[:4000]
    if req.is_paid is not None:
        if req.is_paid and not (req.price_xof and req.price_xof >= 100):
            raise HTTPException(status_code=422, detail="Prix invalide pour une communauté payante (minimum 100 FCFA)")
        group.is_paid = req.is_paid
        group.price_xof = req.price_xof if req.is_paid else None
    db.commit()
    db.refresh(group)
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.update",
        "community_group",
        resource_id=group.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"fields": [k for k, v in req.model_dump().items() if v is not None]},
    )
    db.commit()
    return _group_payload(db, group, member_count=_member_count_sql(db, group.id), my_membership=_member_row(db, group.id, current.id), detailed=True)


@router.delete("/groups/{ref}")
def archive_group(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Suppression douce : la communauté passe au statut archived (l'historique
    des publications reste consultable par ses membres)."""
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    _require_role(db, group, current, GROUP_ADMIN_ROLES)
    group.status = "archived"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.archive",
        "community_group",
        resource_id=group.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"slug": group.slug},
    )
    db.commit()
    return {"archived": True, "slug": group.slug}


@router.post("/groups/{ref}/join")
def join_group(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=12, window_seconds=60)  # 12 adhésions / min / IP
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    if group.status != "active":
        raise HTTPException(status_code=403, detail="Cette communauté n'accepte plus de membres")
    current = _get_or_create_profile(db, user)
    row = _member_row(db, group.id, current.id)
    # Phase 10 — accès payant : adhésion conditionnée au paiement Stripe.
    if group.is_paid and not (row and row.status == "active"):
        return _paid_join_flow(db, group, current, user, request)
    if row:
        if row.status == "banned":
            raise HTTPException(status_code=403, detail="Vous avez été exclu de cette communauté")
        if row.status == "suspended":
            raise HTTPException(status_code=403, detail="Votre adhésion est suspendue")
        if row.status == "active":
            raise HTTPException(status_code=409, detail="Vous êtes déjà membre")
        if row.status == "invited":
            row.status = "active"
            db.commit()
            _cache_bust()
            from ..services.audit import audit
            audit(
                db,
                "community.join",
                "community_member",
                resource_id=row.id,
                user_id=user.id,
                actor_role=user.role,
                ip=request.client.host if request else None,
                user_agent=request.headers.get("user-agent") if request else None,
                meta={"group": group.slug, "accepted_invite": True},
            )
            db.commit()
            return {"joined": True, "role": row.role, "member_count": _member_count_sql(db, group.id)}
        if row.status == "pending":
            raise HTTPException(status_code=409, detail="Demande d'adhésion déjà envoyée — un administrateur doit l'approuver")
    if group.visibility != "public":
        # Phase 10 — communauté privée / sur invitation : une simple demande
        # d'adhésion est créée ; un administrateur l'approuve ou la refuse.
        row = CommunityMember(community_id=group.id, user_id=current.id, role="member", status="pending")
        db.add(row)
        db.flush()
        _cache_bust()
        from ..services.audit import audit
        audit(
            db,
            "community.request",
            "community_member",
            resource_id=row.id,
            user_id=user.id,
            actor_role=user.role,
            ip=request.client.host if request else None,
            user_agent=request.headers.get("user-agent") if request else None,
            meta={"group": group.slug, "pending": True},
        )
        _notify(db, _creator_user_id(group), "Demande d'adhésion", f"{current.display_name} souhaite rejoindre {group.name}.", f"/community?g={group.slug}")
        db.commit()
        return {"joined": False, "requested": True, "status": "pending"}
    _mod_guard(current)
    row = CommunityMember(community_id=group.id, user_id=current.id, role="member", status="active")
    db.add(row)
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.join",
        "community_member",
        resource_id=row.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug},
    )
    _notify(db, _creator_user_id(group), "Nouveau membre", f"{current.display_name} a rejoint {group.name}.", f"/community?g={group.slug}")
    db.commit()
    return {"joined": True, "role": "member", "member_count": _member_count_sql(db, group.id)}


def _paid_join_flow(db: Session, group: CommunityGroup, current: CommunityUser, user: User, request: Request) -> dict:
    """Adhésion à une communauté payante : crée un ordre de paiement Stripe
    (purpose group_fee) dont la confirmation active l'adhésion (Phase 10)."""
    from ..models.payment import DepositOrder
    # Un abandon / paiement en attente sur la même communauté réutilise l'ordre.
    existing = _member_row(db, group.id, current.id) if current else None
    if existing and existing.order_pending_id:
        order = db.query(DepositOrder).filter(DepositOrder.id == existing.order_pending_id).first()
        if order and order.status == "pending":
            url = _group_fee_checkout(db, order, user, request)
            db.commit()
            return {"joined": False, "requires_payment": True, "payment_url": url, "order_id": order.id}
    acc = db.query(Portfolio).join(Portfolio.user_portfolios).filter(
        Portfolio.user_portfolios.any(user_id=user.id)
    ).first()
    if acc is None:
        raise HTTPException(status_code=402, detail="Créez d'abord un portefeuille pour rejoindre cette communauté")
    txn = f"GR{uuid.uuid4().hex[:20]}".upper()
    order = DepositOrder(
        user_id=user.id,
        portfolio_id=acc.id,
        amount=group.price_xof or 0,
        currency="XOF",
        provider="stripe",
        provider_transaction_id=txn,
        purpose="group_fee",
        meta={"purpose": "group_fee", "group_id": group.id, "group_slug": group.slug},
        status="pending",
    )
    db.add(order)
    if existing is None:
        existing = CommunityMember(community_id=group.id, user_id=current.id, role="member", status="pending")
        db.add(existing)
    db.flush()
    existing.order_pending_id = order.id
    order.meta = {**(order.meta or {}), "community_member_id": existing.id}
    # Commit AVANT l'appel Edge : la connexion séparée de l'Edge Function doit
    # voir l'ordre (même règle que create_deposit).
    db.commit()
    try:
        url = _group_fee_checkout(db, order, user, request)
    except HTTPException:
        order.status = "failed"
        db.commit()
        raise
    db.commit()
    logger.info("Communauté payante : adhésion en attente de paiement (group=%s user=%s order=%s)",
                group.id, user.id, order.id)
    return {"joined": False, "requires_payment": True, "payment_url": url, "order_id": order.id}


def _group_fee_checkout(db: Session, order: DepositOrder, user: User, request: Request) -> str:
    """Crée la session de checkout Stripe pour l'accès à une communauté payante."""
    from ..config import settings
    from ..services import stripe_http
    if not settings.FEATURE_PAID_CHALLENGES_ENABLED:
        raise HTTPException(status_code=503, detail="Les communautés payantes sont indisponibles pour le moment")
    data = stripe_http.create_checkout(
        {
            "order_id": order.id,
            "amount": int(round(order.amount or 0)),
            "currency": order.currency or "XOF",
            "purpose": "group_fee",
            "description": order.meta or {},
        },
        user_jwt=_bearer_token(request),
    )
    return data.get("url") or ""


def _bearer_token(request: Request) -> str:
    return (request.headers.get("authorization") or "").replace("Bearer ", "").strip()


@router.post("/groups/{ref}/requests/{profile_id}/approve")
def approve_member_request(
    ref: str,
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    actor = _require_role(db, group, current, GROUP_ADMIN_ROLES)
    target = _member_row(db, group.id, profile_id)
    if not target or target.status != "pending":
        raise HTTPException(status_code=404, detail="Aucune demande d'adhésion en attente")
    if target.user_id == current.id:
        raise HTTPException(status_code=400, detail="Impossible d'approuver sa propre demande")
    target.status = "active"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.approve",
        "community_member",
        resource_id=target.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.user.handle if target.user else None},
    )
    _notify(db, target.user.user_id if target.user else None, "Demande acceptée", f"Votre demande d'adhésion à {group.name} a été acceptée.", f"/community?g={group.slug}")
    db.commit()
    return {"approved": True, "role": target.role, "member_count": _member_count_sql(db, group.id)}


@router.post("/groups/{ref}/requests/{profile_id}/reject")
def reject_member_request(
    ref: str,
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    actor = _require_role(db, group, current, GROUP_ADMIN_ROLES)
    target = _member_row(db, group.id, profile_id)
    if not target or target.status != "pending":
        raise HTTPException(status_code=404, detail="Aucune demande d'adhésion en attente")
    member_id = target.id
    db.delete(target)
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.reject",
        "community_member",
        resource_id=member_id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": profile_id},
    )
    return {"rejected": True, "profile_id": profile_id}


@router.post("/groups/{ref}/leave")
def leave_group(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=12, window_seconds=60)
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    row = _member_row(db, group.id, current.id)
    if not row or row.status != "active":
        raise HTTPException(status_code=409, detail="Vous n'êtes pas membre de cette communauté")
    if row.role == "creator":
        raise HTTPException(status_code=400, detail="Le créateur ne peut pas quitter — transférez la propriété ou archivez la communauté")
    member_id = row.id
    db.delete(row)
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.leave",
        "community_member",
        resource_id=member_id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug},
    )
    db.commit()
    return {"left": True, "member_count": _member_count_sql(db, group.id)}


@router.post("/groups/{ref}/invite")
def invite_member(
    ref: str,
    req: MemberInvite,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=20, window_seconds=60)  # 20 invitations / min / IP
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    _require_role(db, group, current, GROUP_MOD_ROLES)
    target = db.query(CommunityUser).filter(CommunityUser.id == req.profile_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if target.id == current.id:
        raise HTTPException(status_code=400, detail="Impossible de s'inviter soi-même")
    existing = _member_row(db, group.id, target.id)
    if existing:
        if existing.status == "banned":
            raise HTTPException(status_code=403, detail="Ce profil est exclu de la communauté")
        if existing.status == "active":
            raise HTTPException(status_code=409, detail="Déjà membre")
        if existing.status == "invited":
            raise HTTPException(status_code=409, detail="Déjà invité")
        if existing.status == "suspended":
            raise HTTPException(status_code=409, detail="Membre suspendu — rétablissez-le d'abord")
    row = CommunityMember(community_id=group.id, user_id=target.id, role="member", status="invited")
    db.add(row)
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.invite",
        "community_member",
        resource_id=row.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.handle},
    )
    _notify(db, target.user_id, "Invitation", f"{current.display_name} vous invite à rejoindre {group.name}.", f"/community?g={group.slug}")
    db.commit()
    return {"invited": True, "member_count": _member_count_sql(db, group.id)}


@router.post("/groups/{ref}/invites/accept")
def accept_invite(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    if group.status != "active":
        raise HTTPException(status_code=403, detail="Cette communauté n'accepte plus de membres")
    current = _get_or_create_profile(db, user)
    row = _member_row(db, group.id, current.id)
    if not row or row.status != "invited":
        raise HTTPException(status_code=404, detail="Aucune invitation en attente")
    row.status = "active"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.accept",
        "community_member",
        resource_id=row.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug},
    )
    _notify(db, _creator_user_id(group), "Invitation acceptée", f"{current.display_name} a rejoint {group.name}.", f"/community?g={group.slug}")
    db.commit()
    return {"accepted": True, "role": row.role, "member_count": _member_count_sql(db, group.id)}


@router.post("/groups/{ref}/invites/decline")
def decline_invite(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    row = _member_row(db, group.id, current.id)
    if not row or row.status != "invited":
        raise HTTPException(status_code=404, detail="Aucune invitation en attente")
    member_id = row.id
    db.delete(row)
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.decline",
        "community_member",
        resource_id=member_id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug},
    )
    db.commit()
    return {"declined": True}


@router.get("/groups/{ref}/invites")
def list_invites(
    ref: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    _require_role(db, group, current, GROUP_ADMIN_ROLES)
    rows = (
        db.query(CommunityMember)
        .filter(CommunityMember.community_id == group.id, CommunityMember.status == "invited")
        .options(joinedload(CommunityMember.user))
        .order_by(CommunityMember.created_at.desc())
        .all()
    )
    return {
        "invites": [
            {
                "profile_id": r.user_id,
                "handle": r.user.handle,
                "display_name": r.user.display_name,
                "avatar": _avatar(r.user),
                "verified": r.user.verified,
                "invited_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.get("/groups/{ref}/members")
def list_members(
    ref: str,
    role: str = Query("", max_length=20),
    status: str = Query("active", max_length=20),
    pro_only: bool = False,
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_profile(db, user)
    my_membership = _member_row(db, group.id, current.id) if current else None
    if not _group_visible_to(group, my_membership):
        raise HTTPException(status_code=403, detail="Cette communauté est privée")
    is_admin = bool(my_membership and my_membership.status == "active" and my_membership.role in GROUP_ADMIN_ROLES)
    if status not in ("active", "invited", "pending", "suspended", "banned") or (status != "active" and not is_admin):
        raise HTTPException(status_code=403, detail="Permission insuffisante pour voir ces statuts")
    query = db.query(CommunityMember).filter(CommunityMember.community_id == group.id)
    if role.strip():
        query = query.filter(CommunityMember.role == role.strip().lower())
    query = query.filter(CommunityMember.status == status)
    if pro_only:
        query = query.join(CommunityUser, CommunityUser.id == CommunityMember.user_id).filter(CommunityUser.is_pro.is_(True))
    total = query.count()
    rows = (
        query.options(joinedload(CommunityMember.user))
        .order_by(CommunityMember.created_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "members": [
            {
                "profile_id": r.user_id,
                "handle": r.user.handle,
                "display_name": r.user.display_name,
                "avatar": _avatar(r.user),
                "verified": r.user.verified,
                "is_pro": bool(r.user.is_pro),
                "pro": _pro_payload(r.user.professional) if getattr(r.user, "professional", None) else None,
                "role": r.role,
                "status": r.status,
                "joined_at": r.created_at.isoformat() if r.created_at else None,
                "is_me": bool(current and r.user_id == current.id),
            }
            for r in rows
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
        "my_role": my_membership.role if my_membership and my_membership.status == "active" else None,
    }


@router.patch("/groups/{ref}/members/{profile_id}/role")
def set_member_role(
    ref: str,
    profile_id: int,
    req: MemberRoleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    actor = _require_role(db, group, current, GROUP_ADMIN_ROLES)
    role = req.role.strip().lower()
    if role not in GROUP_ASSIGNABLE_ROLES:
        raise HTTPException(status_code=422, detail="Rôle invalide (member | moderator | admin)")
    target = _member_row(db, group.id, profile_id)
    if not target or target.status != "active":
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.role == "creator":
        raise HTTPException(status_code=400, detail="Impossible de modifier le rôle du créateur")
    if actor.role == "admin" and (target.role == "admin" or role == "admin"):
        raise HTTPException(status_code=403, detail="Seul le créateur gère les admins")
    target.role = role
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.role",
        "community_member",
        resource_id=target.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.user.handle, "role": role},
    )
    db.commit()
    return {"role": role, "profile_id": profile_id}


@router.post("/groups/{ref}/members/{profile_id}/suspend")
def suspend_member(
    ref: str,
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    actor = _require_role(db, group, current, GROUP_ADMIN_ROLES)
    target = _member_row(db, group.id, profile_id)
    if not target or target.status != "active":
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.role == "creator":
        raise HTTPException(status_code=400, detail="Impossible de suspendre le créateur")
    if actor.role == "admin" and target.role == "admin":
        raise HTTPException(status_code=403, detail="Seul le créateur gère les admins")
    target.status = "suspended"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.suspend",
        "community_member",
        resource_id=target.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.user.handle},
    )
    _notify(db, target.user.user_id if target.user else None, "Adhésion suspendue", f"Votre adhésion à {group.name} a été suspendue.", None)
    db.commit()
    return {"suspended": True, "profile_id": profile_id}


@router.post("/groups/{ref}/members/{profile_id}/ban")
def ban_member(
    ref: str,
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    actor = _require_role(db, group, current, GROUP_ADMIN_ROLES)
    target = _member_row(db, group.id, profile_id)
    if not target or target.status != "active":
        raise HTTPException(status_code=404, detail="Membre introuvable")
    if target.role == "creator":
        raise HTTPException(status_code=400, detail="Impossible de bannir le créateur")
    if actor.role == "admin" and target.role == "admin":
        raise HTTPException(status_code=403, detail="Seul le créateur gère les admins")
    target.status = "banned"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.ban",
        "community_member",
        resource_id=target.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.user.handle},
    )
    _notify(db, target.user.user_id if target.user else None, "Exclu de la communauté", f"Vous avez été exclu de {group.name}.", None)
    db.commit()
    return {"banned": True, "profile_id": profile_id}


@router.post("/groups/{ref}/members/{profile_id}/restore")
def restore_member(
    ref: str,
    profile_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    group = _find_group(db, ref)
    if not group:
        raise HTTPException(status_code=404, detail="Communauté introuvable")
    current = _get_or_create_profile(db, user)
    _require_role(db, group, current, GROUP_ADMIN_ROLES)
    target = _member_row(db, group.id, profile_id)
    if not target or target.status not in ("suspended", "banned"):
        raise HTTPException(status_code=409, detail="Ce membre n'est ni suspendu ni banni")
    target.status = "active"
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "community.restore",
        "community_member",
        resource_id=target.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"group": group.slug, "target": target.user.handle},
    )
    db.commit()
    return {"restored": True, "profile_id": profile_id}


# ---------------------------------------------------------------------------
# Phase 2 — Professionnels : profils professionnels vérifiés, workflow de
# vérification par le staff (users.role >= compliance), badge Pro, filtres.
# ---------------------------------------------------------------------------

PRO_CATEGORIES = {"analyst", "fund_manager", "broker", "advisor", "economist", "journalist", "accountant", "other"}
PRO_STATUSES = {"pending", "approved", "rejected"}


def _valid_website(url: str) -> bool:
    return url == "" or url.lower().startswith(("http://", "https://"))


class ProfessionalApply(BaseModel):
    category: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=2, max_length=120)
    company: str = Field(default="", max_length=120)
    license: str = Field(default="", max_length=120)
    certifications: str = Field(default="", max_length=500)
    bio_pro: str = Field(default="", max_length=1000)
    website: str = Field(default="", max_length=200)


class ReviewDecision(BaseModel):
    note: str = Field(default="", max_length=500)


def _pro_payload(p: CommunityProfessional | None) -> dict | None:
    """Payload public d'un profil professionnel (champs d'identité uniquement)."""
    if not p:
        return None
    return {
        "category": p.category,
        "title": p.title,
        "company": p.company or "",
        "license": p.license or "",
        "certifications": p.certifications or "",
        "bio_pro": p.bio_pro or "",
        "website": p.website or "",
        "status": p.status,
        "review_note": p.review_note or "",
        "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
        "reviewed_at": p.reviewed_at.isoformat() if p.reviewed_at else None,
    }


@router.post("/professional/apply")
def apply_professional(
    req: ProfessionalApply,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    check_rate_limit(request, limit=5, window_seconds=60)  # 5 demandes / min / IP
    category = req.category.strip().lower()
    if category not in PRO_CATEGORIES:
        raise HTTPException(status_code=422, detail="Catégorie professionnelle invalide")
    if not _valid_website(req.website.strip()):
        raise HTTPException(status_code=422, detail="Site web invalide (http/https requis)")
    current = _get_or_create_profile(db, user)
    pro = db.query(CommunityProfessional).filter(CommunityProfessional.user_id == current.id).first()
    if pro:
        if pro.status == "approved":
            raise HTTPException(status_code=409, detail="Votre profil professionnel est déjà vérifié")
        if pro.status == "pending":
            raise HTTPException(status_code=409, detail="Demande en attente de vérification")
        pro.category = category
        pro.title = req.title.strip()[:120]
        pro.company = req.company.strip()[:120]
        pro.license = req.license.strip()[:120]
        pro.certifications = req.certifications.strip()[:500]
        pro.bio_pro = req.bio_pro.strip()[:1000]
        pro.website = req.website.strip()[:200]
        pro.status = "pending"
        pro.review_note = ""
        pro.reviewed_by = None
        pro.reviewed_at = None
    else:
        pro = CommunityProfessional(
            user_id=current.id,
            category=category,
            title=req.title.strip()[:120],
            company=req.company.strip()[:120],
            license=req.license.strip()[:120],
            certifications=req.certifications.strip()[:500],
            bio_pro=req.bio_pro.strip()[:1000],
            website=req.website.strip()[:200],
            status="pending",
        )
        db.add(pro)
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "professional.apply",
        "community_professional",
        resource_id=pro.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"category": category, "title": req.title},
    )
    db.commit()
    return {"applied": True, "pro": _pro_payload(pro)}


@router.get("/professional/me")
def my_professional(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current = _get_or_create_profile(db, user)
    pro = db.query(CommunityProfessional).filter(CommunityProfessional.user_id == current.id).first()
    return {"pro": _pro_payload(pro)}


@router.get("/professionals")
def list_professionals(
    search: str = Query("", max_length=120),
    category: str = Query("", max_length=40),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_reader_db),
):
    """Annuaire public des professionnels vérifiés (approved uniquement)."""
    current = _get_profile(db, user)
    followed_ids = {f.followed_id for f in current.following} if current else set()
    query = db.query(CommunityProfessional).filter(CommunityProfessional.status == "approved")
    if search.strip():
        q = search.strip()
        query = query.filter(
            CommunityProfessional.title.ilike(f"%{q}%")
            | CommunityProfessional.company.ilike(f"%{q}%")
            | CommunityProfessional.user.has(CommunityUser.display_name.ilike(f"%{q}%"))
            | CommunityProfessional.user.has(CommunityUser.handle.ilike(f"%{q}%"))
        )
    if category.strip():
        query = query.filter(CommunityProfessional.category == category.strip().lower())
    total = query.count()
    rows = (
        query.options(joinedload(CommunityProfessional.user))
        .order_by(CommunityProfessional.reviewed_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "professionals": [
            {
                "profile_id": p.user_id,
                "handle": p.user.handle,
                "display_name": p.user.display_name,
                "avatar": _avatar(p.user),
                "verified": p.user.verified,
                "is_following": bool(current and p.user_id in followed_ids),
                "pro": _pro_payload(p),
            }
            for p in rows
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.get("/professional/reviews")
def list_reviews(
    status: str = Query("pending", max_length=20),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
):
    status = status.strip().lower()
    if status not in PRO_STATUSES:
        raise HTTPException(status_code=422, detail="Statut invalide (pending | approved | rejected)")
    query = db.query(CommunityProfessional).filter(CommunityProfessional.status == status)
    total = query.count()
    rows = (
        query.options(joinedload(CommunityProfessional.user))
        .order_by(CommunityProfessional.submitted_at.asc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "reviews": [
            {
                "profile_id": p.user_id,
                "handle": p.user.handle,
                "display_name": p.user.display_name,
                "avatar": _avatar(p.user),
                "verified": p.user.verified,
                "review_note": p.review_note or "",
                "submitted_at": p.submitted_at.isoformat() if p.submitted_at else None,
                "pro": _pro_payload(p),
            }
            for p in rows
        ],
        "total": total,
        "offset": offset,
        "limit": limit,
    }


@router.post("/professional/reviews/{profile_id}/approve")
def approve_review(
    profile_id: int,
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    target = db.query(CommunityUser).filter(CommunityUser.id == profile_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    pro = (
        db.query(CommunityProfessional)
        .filter(CommunityProfessional.user_id == target.id, CommunityProfessional.status == "pending")
        .first()
    )
    if not pro:
        raise HTTPException(status_code=404, detail="Aucune demande en attente pour ce profil")
    pro.status = "approved"
    pro.reviewed_by = staff.id
    pro.reviewed_at = datetime.utcnow()
    target.is_pro = True
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "professional.approve",
        "community_professional",
        resource_id=pro.id,
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"profile": target.handle, "category": pro.category},
    )
    _notify(
        db,
        target.user_id,
        "Profil professionnel vérifié",
        f"Votre profil est vérifié : badge Pro attribué ({pro.category}).",
        "/community",
    )
    db.commit()
    return {"approved": True, "profile_id": profile_id, "pro": _pro_payload(pro)}


@router.post("/professional/reviews/{profile_id}/reject")
def reject_review(
    profile_id: int,
    req: ReviewDecision,
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    target = db.query(CommunityUser).filter(CommunityUser.id == profile_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    pro = (
        db.query(CommunityProfessional)
        .filter(CommunityProfessional.user_id == target.id, CommunityProfessional.status == "pending")
        .first()
    )
    if not pro:
        raise HTTPException(status_code=404, detail="Aucune demande en attente pour ce profil")
    note = req.note.strip()[:500]
    pro.status = "rejected"
    pro.review_note = note
    pro.reviewed_by = staff.id
    pro.reviewed_at = datetime.utcnow()
    target.is_pro = False
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "professional.reject",
        "community_professional",
        resource_id=pro.id,
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"profile": target.handle, "note": note},
    )
    _notify(
        db,
        target.user_id,
        "Demande professionnelle refusée",
        (f"Votre demande professionnelle a été refusée : {note}" if note else "Votre demande professionnelle a été refusée."),
        "/community",
    )
    db.commit()
    return {"rejected": True, "profile_id": profile_id}


# ---------------------------------------------------------------------------
# Phase 6 — Modération & sécurité : signalements, file de modération, bannissement.
# ---------------------------------------------------------------------------

REPORT_REASONS = {"spam", "harassment", "misinformation", "other"}
REPORT_TYPES = {"post", "comment", "user"}


class ReportCreate(BaseModel):
    target_type: str
    target_id: int
    reason: str
    details: str = Field(default="", max_length=600)


class ResolveCreate(BaseModel):
    action: str  # hide | delete | dismiss | ban
    note: str = Field(default="", max_length=500)


def _resolve_report_target(db: Session, target_type: str, target_id: int):
    """Résout la cible signalée en (CommunityPost | CommunityComment | CommunityUser)."""
    if target_type == "post":
        return db.query(CommunityPost).filter(CommunityPost.id == target_id).first()
    if target_type == "comment":
        return db.query(CommunityComment).filter(CommunityComment.id == target_id).first()
    return db.query(CommunityUser).filter(CommunityUser.id == target_id).first()


def _report_target_out(db: Session, target_type: str, target_id: int) -> dict:
    """Aperçu de la cible pour la file de modération (sans coût excessif)."""
    base = {"target_type": target_type, "target_id": target_id, "exists": True, "hidden": False}
    if target_type == "post":
        post = db.query(CommunityPost).filter(CommunityPost.id == target_id).first()
        if not post:
            base["exists"] = False
            return base
        base.update({
            "symbol": post.symbol or "",
            "title": post.title,
            "content": (post.content or "")[:280],
            "hidden": bool(post.hidden_at),
            "author": {"id": post.author_id, "handle": post.author.handle, "display_name": post.author.display_name},
            "created_at": post.created_at.isoformat() if post.created_at else None,
        })
    elif target_type == "comment":
        comment = db.query(CommunityComment).filter(CommunityComment.id == target_id).first()
        if not comment:
            base["exists"] = False
            return base
        base.update({
            "content": comment.content[:280],
            "hidden": bool(comment.hidden_at),
            "post_id": comment.post_id,
            "author": {"id": comment.author_id, "handle": comment.author.handle, "display_name": comment.author.display_name},
            "created_at": comment.created_at.isoformat() if comment.created_at else None,
        })
    else:
        user = db.query(CommunityUser).filter(CommunityUser.id == target_id).first()
        if not user:
            base["exists"] = False
            return base
        base.update({
            "handle": user.handle,
            "display_name": user.display_name,
            "avatar": _avatar(user),
            "banned": bool(user.banned_at),
            "is_pro": bool(user.is_pro),
            "posts_count": len(user.posts),
        })
    return base


@router.post("/reports")
def create_report(
    req: ReportCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Signale un contenu (post/commentaire) ou un profil à la modération."""
    check_rate_limit(request, limit=10, window_seconds=60)  # 10 signalements / min / IP
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    target_type = req.target_type.strip().lower()
    if target_type not in REPORT_TYPES:
        raise HTTPException(status_code=422, detail="Type de signalement invalide")
    reason = req.reason.strip().lower()
    if reason not in REPORT_REASONS:
        raise HTTPException(status_code=422, detail="Motif invalide (spam | harassment | misinformation | other)")
    target = _resolve_report_target(db, target_type, req.target_id)
    if not target:
        raise HTTPException(status_code=404, detail="Cible introuvable")
    # Pas d'auto-signalement : post/commentaire dont on est l'auteur, ou son propre profil.
    if target_type == "post" and target.author_id == current.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas signaler votre propre publication")
    if target_type == "comment" and target.author_id == current.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas signaler votre propre commentaire")
    if target_type == "user" and target.id == current.id:
        raise HTTPException(status_code=400, detail="Vous ne pouvez pas signaler votre propre profil")
    existing = (
        db.query(CommunityReport)
        .filter(
            CommunityReport.reporter_id == current.id,
            CommunityReport.target_type == target_type,
            CommunityReport.target_id == req.target_id,
            CommunityReport.status == "open",
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="Ce contenu est déjà signalé par vous")
    report = CommunityReport(
        reporter_id=current.id,
        target_type=target_type,
        target_id=req.target_id,
        reason=reason,
        details=(req.details or "").strip()[:600],
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return {"id": report.id, "status": report.status}


@router.get("/moderation/queue")
def moderation_queue(
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    request: Request = None,
):
    """File de modération : signalements ouverts, les plus anciens d'abord."""
    reports = (
        db.query(CommunityReport)
        .options(joinedload(CommunityReport.reporter))
        .filter(CommunityReport.status == "open")
        .order_by(CommunityReport.created_at.asc())
        .limit(limit)
        .all()
    )
    return {
        "reports": [
            {
                "id": r.id,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "reason": r.reason,
                "details": r.details or "",
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "reporter": {
                    "id": r.reporter.id if r.reporter else None,
                    "handle": r.reporter.handle if r.reporter else "anonyme",
                    "display_name": r.reporter.display_name if r.reporter else "Anonyme",
                },
                "target": _report_target_out(db, r.target_type, r.target_id),
            }
            for r in reports
        ],
        "total": len(reports),
    }


@router.post("/moderation/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    req: ResolveCreate,
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Traite un signalement : masquer, supprimer, bannir (profil) ou classer sans suite."""
    report = db.query(CommunityReport).filter(CommunityReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Signalement introuvable")
    if report.status != "open":
        raise HTTPException(status_code=409, detail="Signalement déjà traité")
    action = req.action.strip().lower()
    note = (req.note or "").strip()[:500]
    target_type = report.target_type
    if action not in ("hide", "delete", "dismiss", "ban"):
        raise HTTPException(status_code=422, detail="Action invalide (hide | delete | dismiss | ban)")
    if action == "ban" and target_type != "user":
        raise HTTPException(status_code=422, detail="Le bannissement ne s'applique qu'aux profils")
    target = _resolve_report_target(db, target_type, report.target_id)
    if target is None:
        # Cible déjà supprimée : on classe le signalement, rien d'autre à faire.
        report.status = "dismissed"
        report.action = action
        report.note = note
        report.resolved_by = staff.id
        report.resolved_at = datetime.now(timezone.utc)
        db.commit()
        return {"resolved": True, "status": report.status}

    if target_type == "user":
        if action == "ban":
            target.banned_at = datetime.now(timezone.utc)
            status = "resolved"
        else:
            status = "dismissed"
    else:
        if action == "hide":
            target.hidden_at = datetime.now(timezone.utc)
            status = "resolved"
            if target_type == "post":
                _notify(
                    db,
                    target.author.user_id,
                    "Publication masquée",
                    "Votre publication a été masquée par la modération. Vous pouvez la consulter mais elle n'est plus visible par les autres membres.",
                    "/community",
                )
        elif action == "delete":
            db.delete(target)
            status = "resolved"
        else:
            status = "dismissed"
    report.status = status
    report.action = action
    report.note = note
    report.resolved_by = staff.id
    report.resolved_at = datetime.now(timezone.utc)
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        f"moderation.{action}",
        "community_report",
        resource_id=report.id,
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"target_type": target_type, "target_id": report.target_id, "note": note, "reason": report.reason},
    )
    db.commit()
    return {"resolved": True, "status": status, "action": action}


@router.post("/moderation/users/{user_id}/ban")
def ban_user(
    user_id: int,
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Bannit un profil communautaire : il conserve ses contenus visibles mais
    ne peut plus écrire, réagir ou suivre (Phase 6)."""
    target = db.query(CommunityUser).filter(CommunityUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    target.banned_at = datetime.now(timezone.utc)
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "moderation.ban",
        "community_user",
        resource_id=target.id,
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"handle": target.handle},
    )
    db.commit()
    return {"banned": True, "user_id": user_id}


@router.post("/moderation/users/{user_id}/unban")
def unban_user(
    user_id: int,
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    target = db.query(CommunityUser).filter(CommunityUser.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    if not target.banned_at:
        return {"banned": False, "user_id": user_id}
    target.banned_at = None
    db.flush()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "moderation.unban",
        "community_user",
        resource_id=target.id,
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"handle": target.handle},
    )
    _notify(
        db,
        target.user_id,
        "Accès rétabli",
        "Votre suspension communautaire a été levée. Vous pouvez à nouveau publier.",
        "/community",
    )
    db.commit()
    return {"banned": False, "user_id": user_id}


@router.get("/moderation/history")
def moderation_history(
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    limit: int = Query(50, ge=1, le=100),
    request: Request = None,
):
    """Historique des décisions de modération (résolues et classées)."""
    reports = (
        db.query(CommunityReport)
        .filter(CommunityReport.status != "open")
        .order_by(CommunityReport.resolved_at.desc())
        .limit(limit)
        .all()
    )
    from ..models.user import User as _User
    resolver_ids = {r.resolved_by for r in reports if r.resolved_by}
    resolvers = {
        u.id: u.name
        for u in db.query(_User).filter(_User.id.in_(resolver_ids)).all()
    } if resolver_ids else {}
    return {
        "history": [
            {
                "id": r.id,
                "target_type": r.target_type,
                "target_id": r.target_id,
                "reason": r.reason,
                "action": r.action or "",
                "note": r.note or "",
                "status": r.status,
                "resolved_by": resolvers.get(r.resolved_by, ""),
                "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in reports
        ],
        "total": len(reports),
    }


# ---------------------------------------------------------------------------
# Phase 7 — IA communautaire : Pulse (opinion par symbole), Watch (tendances),
# modération assistée (scan de toxicité) et appel de l'auteur.
# ---------------------------------------------------------------------------


@router.get("/ai/pulse")
def ai_pulse(
    symbol: str = Query("", max_length=12),
    days: int = Query(30, ge=1, le=90),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Condensation IA de l'opinion communautaire sur un symbole :
    momentum (-100..+100, sentiment pondéré par l'engagement), répartition
    des sentiments et buzz (volume relatif au marché)."""
    sym = symbol.strip().upper()
    if not sym:
        raise HTTPException(status_code=422, detail="Symbole requis")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        db.query(CommunityPost)
        .options(
            joinedload(CommunityPost.reactions),
            joinedload(CommunityPost.shares),
        )
        .filter(
            CommunityPost.symbol == sym,
            CommunityPost.hidden_at.is_(None),
            CommunityPost.created_at >= since,
        )
        .order_by(CommunityPost.created_at.desc())
        .limit(300)
        .all()
    )
    ctx = _company_ctx(db)
    pulse = ai_pulse_for(rows)
    # Buzz : volume du symbole comparé au volume moyen de tous les symboles.
    counts = (
        db.query(CommunityPost.symbol, func.count(CommunityPost.id))
        .filter(
            CommunityPost.hidden_at.is_(None),
            CommunityPost.created_at >= since,
        )
        .group_by(CommunityPost.symbol)
        .all()
    )
    avg = (sum(c for _, c in counts) / len(counts)) if counts else 0.0
    top = sorted(
        rows,
        key=lambda p: len(p.reactions) + len(p.shares) + (p.views or 0),
        reverse=True,
    )[:3]
    return {
        "symbol": sym,
        "company_name": (ctx.get(sym) or {}).get("name") or sym,
        "days": days,
        "pulse": pulse,
        "buzz": ai_buzz(len(rows), avg),
        "top_posts": [
            {
                "id": p.id,
                "title": p.title,
                "sentiment": p.sentiment,
                "rockets": len(p.reactions),
                "shares": len(p.shares),
                "views": p.views or 0,
            }
            for p in top
        ],
    }


@router.get("/ai/watch")
def ai_watch(
    days: int = Query(30, ge=1, le=90),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Classement IA des symboles les plus actifs : score combiné
    momentum (opinion pondérée) + buzz (volume)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    counts = (
        db.query(CommunityPost.symbol, func.count(CommunityPost.id).label("n"))
        .filter(
            CommunityPost.hidden_at.is_(None),
            CommunityPost.created_at >= since,
        )
        .group_by(CommunityPost.symbol)
        .order_by(func.count(CommunityPost.id).desc())
        .limit(12)
        .all()
    )
    avg = (sum(c for _, c in counts) / len(counts)) if counts else 0.0
    ctx = _company_ctx(db)
    ranked = []
    for sym, n in counts:
        rows = (
            db.query(CommunityPost)
            .options(joinedload(CommunityPost.reactions), joinedload(CommunityPost.shares))
            .filter(
                CommunityPost.symbol == sym,
                CommunityPost.hidden_at.is_(None),
                CommunityPost.created_at >= since,
            )
            .limit(200)
            .all()
        )
        pulse = ai_pulse_for(rows)
        buzz = ai_buzz(n, avg)
        ranked.append({
            "symbol": sym,
            "name": (ctx.get(sym) or {}).get("name") or sym,
            "momentum": pulse["momentum"],
            "bullish_pct": pulse["bullish_pct"],
            "bearish_pct": pulse["bearish_pct"],
            "posts": n,
            "buzz": buzz,
            "score": round(pulse["momentum"] * 0.5 + buzz * 5.0, 1),
        })
    ranked.sort(key=lambda r: r["score"], reverse=True)
    return {"watch": ranked[:6], "days": days}


@router.post("/ai/scan")
def ai_scan_batch(
    staff: User = Depends(require_role("compliance")),
    db: Session = Depends(get_db),
    limit: int = Query(200, ge=1, le=500),
    request: Request = None,
):
    """Scan IA rétroactif : analyse les publications non encore scannées
    (scan_at NULL) et masque automatiquement les contenus toxiques
    (signalement anonyme + notification à l'auteur)."""
    posts = (
        db.query(CommunityPost)
        .options(joinedload(CommunityPost.author).joinedload(CommunityUser.user))
        .filter(CommunityPost.scan_at.is_(None))
        .order_by(CommunityPost.created_at.desc())
        .limit(limit)
        .all()
    )
    hidden = 0
    for p in posts:
        if _ai_scan_post(db, p):
            hidden += 1
    db.commit()
    _cache_bust()
    from ..services.audit import audit
    audit(
        db,
        "ai.scan",
        "community_post",
        user_id=staff.id,
        actor_role=staff.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"scanned": len(posts), "hidden": hidden},
    )
    db.commit()
    return {"scanned": len(posts), "hidden": hidden}


@router.post("/posts/{post_id}/appeal")
def appeal_post(
    post_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Appel d'un auteur dont la publication a été masquée (IA ou staff) :
    crée un signalement ouvert, prioritaire dans la file de modération."""
    check_rate_limit(request, limit=3, window_seconds=60)  # 3 appels / min / IP
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    post = db.query(CommunityPost).filter(CommunityPost.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="Publication introuvable")
    if post.author_id != current.id:
        raise HTTPException(status_code=403, detail="Seul l'auteur peut faire appel")
    if not post.hidden_at:
        raise HTTPException(status_code=400, detail="Cette publication n'est pas masquée")
    existing = (
        db.query(CommunityReport)
        .filter(
            CommunityReport.target_type == "post",
            CommunityReport.target_id == post.id,
            CommunityReport.status == "open",
        )
        .first()
    )
    if existing:
        if existing.reporter_id is None:
            # Signalement automatique IA : l'appel s'y rattache (le staff
            # verra les deux informations dans un seul rapport).
            existing.reporter_id = current.id
            existing.details = "Appel de l'auteur : demande de réexamen du masquage"
            db.commit()
            return {"appealed": True, "post_id": post.id, "updated": True}
        raise HTTPException(status_code=409, detail="Un signalement est déjà ouvert sur cette publication")
    db.add(CommunityReport(
        reporter_id=current.id,
        target_type="post",
        target_id=post.id,
        reason="other",
        details="Appel de l'auteur : demande de réexamen du masquage",
    ))
    db.commit()
    return {"appealed": True, "post_id": post.id}


# ---------------------------------------------------------------------------
# Réputation (Phase 8)
# ---------------------------------------------------------------------------

_REP_BADGE_KEYS = {code: (label_key, goal_key) for code, label_key, goal_key in REP_BADGES}


def _badge_out(b) -> dict:
    return {
        "code": b.code,
        "label_key": _REP_BADGE_KEYS.get(b.code, ("repBadgeUnknown", "repGoalUnknown"))[0],
        "goal_key": _REP_BADGE_KEYS.get(b.code, ("repBadgeUnknown", "repGoalUnknown"))[1],
        "earned_at": b.earned_at.isoformat() if b.earned_at else None,
    }


def _rep_payload(db: Session, profile: CommunityUser) -> dict:
    fresh = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.posts).joinedload(CommunityPost.reactions),
            joinedload(CommunityUser.posts).joinedload(CommunityPost.shares),
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.badges),
        )
        .filter(CommunityUser.id == profile.id)
        .first()
    )
    if fresh is None:
        fresh = profile
    m = ReputationMetrics(db, fresh)
    lvl, key = level_for(m.score)
    nxt = None
    for threshold, l, k in REP_LEVELS:
        if m.score < threshold:
            nxt = {"score": threshold, "level": l, "level_key": k}
            break
    return {
        "score": m.score,
        "level": lvl,
        "level_key": key,
        "next": nxt,
        "badges": [_badge_out(b) for b in (fresh.badges or [])],
        "metrics": {
            "posts_visible": m.posts_visible,
            "posts_hidden": m.posts_hidden,
            "rockets_received": m.rockets_received,
            "shares_received": m.shares_received,
            "views_received": m.views_received,
            "followers": m.followers,
            "max_post_rockets": m.max_post_rockets,
            "resolved_by_me": m.resolved_by_me,
        },
    }


@router.get("/reputation")
def my_reputation(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Réputation personnelle : score recalculé + badges synchronisés."""
    current = _get_or_create_profile(db, user)
    new_badges = _refresh_reputation(db, current)
    db.commit()
    for code in new_badges:
        _notify(
            db,
            current.user_id,
            "Nouveau badge débloqué",
            f"Votre collection de réputation s'agrandit ({code}).",
            "/community",
        )
    db.commit()
    payload = _rep_payload(db, current)
    payload["new_badges"] = new_badges
    payload["user"] = _user_out(current, current)
    return payload


@router.get("/reputation/{user_id}")
def user_reputation(
    user_id: int,
    db: Session = Depends(get_db),
):
    """Réputation publique d'un profil (lecture seule)."""
    profile = (
        db.query(CommunityUser)
        .options(joinedload(CommunityUser.badges))
        .filter(CommunityUser.id == user_id)
        .first()
    )
    if not profile:
        raise HTTPException(status_code=404, detail="Profil introuvable")
    payload = _rep_payload(db, profile)
    payload["user"] = _user_out(profile, None)
    return payload


_LEADERBOARD_CACHE: dict = {}


@router.get("/leaderboard")
def leaderboard(
    limit: int = 20,
    db: Session = Depends(get_db),
):
    """Classement public des membres par score de réputation (recalculé à chaud
    par requêtes groupées, cache 5 min pour éviter les recalculs de 30 s)."""
    limit = max(1, min(limit, 50))
    now = time.time()
    cached = _LEADERBOARD_CACHE.get("data")
    if cached and now - _LEADERBOARD_CACHE.get("ts", 0) < 300:
        return {"leaderboard": cached[:limit]}
    profiles = (
        db.query(CommunityUser)
        .options(
            joinedload(CommunityUser.badges),
            joinedload(CommunityUser.posts),
            joinedload(CommunityUser.followers),
            joinedload(CommunityUser.following),
        )
        .filter(CommunityUser.banned_at.is_(None))
        .all()
    )
    ids = [p.id for p in profiles]
    if not ids:
        _LEADERBOARD_CACHE["data"] = []
        _LEADERBOARD_CACHE["ts"] = now
        return {"leaderboard": []}
    by_author: dict[int, list[CommunityPost]] = {}
    for p in profiles:
        by_author.setdefault(p.id, []).extend(p.posts)
    post_ids = [x.id for xs in by_author.values() for x in xs]
    rockets_by_post = dict(
        db.query(CommunityReaction.post_id, func.count(CommunityReaction.id))
        .filter(CommunityReaction.post_id.in_(post_ids))
        .group_by(CommunityReaction.post_id)
        .all()
    )
    shares_by_post = dict(
        db.query(CommunityShare.post_id, func.count(CommunityShare.id))
        .filter(CommunityShare.post_id.in_(post_ids))
        .group_by(CommunityShare.post_id)
        .all()
    )
    follower_counts = dict(
        db.query(CommunityFollow.followed_id, func.count(CommunityFollow.id))
        .filter(CommunityFollow.followed_id.in_(ids))
        .group_by(CommunityFollow.followed_id)
        .all()
    )
    user_ids = [p.user_id for p in profiles if p.user_id]
    resolved_counts = {}
    if user_ids:
        resolved_counts = dict(
            db.query(CommunityReport.resolved_by, func.count(CommunityReport.id))
            .filter(CommunityReport.resolved_by.in_(user_ids))
            .group_by(CommunityReport.resolved_by)
            .all()
        )
    rows = []
    for p in profiles:
        mine = by_author.get(p.id, [])
        visible = [x for x in mine if not x.hidden_at]
        hidden_n = len(mine) - len(visible)
        rockets = sum(rockets_by_post.get(x.id, 0) for x in visible)
        shares = sum(shares_by_post.get(x.id, 0) for x in visible)
        views = sum(x.views or 0 for x in visible)
        max_rockets = max((rockets_by_post.get(x.id, 0) for x in visible), default=0)
        followers = follower_counts.get(p.id, 0)
        score = compute_score(
            posts_visible=len(visible),
            posts_hidden=hidden_n,
            rockets_received=rockets,
            shares_received=shares,
            views_received=views,
            followers=followers,
            is_pro=bool(p.is_pro),
            verified=bool(p.verified),
            banned=False,
            max_post_rockets=max_rockets,
        )
        lvl, key = level_for(score)
        earned = earned_codes(
            posts_visible=len(visible),
            rockets_received=rockets,
            max_post_rockets=max_rockets,
            followers=followers,
            is_pro=bool(p.is_pro),
            resolved_by_me=resolved_counts.get(p.user_id, 0),
        )
        rows.append({
            "rank": 0,
            "user": _user_out(p, None),
            "score": score,
            "level": lvl,
            "level_key": key,
            "badges_count": len(earned),
        })
    rows.sort(key=lambda r: (-r["score"], r["user"]["id"]))
    for i, r in enumerate(rows):
        r["rank"] = i + 1
    _LEADERBOARD_CACHE["data"] = rows
    _LEADERBOARD_CACHE["ts"] = now
    return {"leaderboard": rows[:limit]}


# ---------------------------------------------------------------------------
# Événements communautaires + avantages Premium (Phase 9)
# ---------------------------------------------------------------------------

EVENT_KINDS = {"webinar", "ama", "meetup", "workshop"}


class EventCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=180)
    description: str = Field(default="", max_length=4000)
    kind: str = Field("webinar", max_length=20)
    starts_at: str = Field(..., max_length=40)
    ends_at: str = Field(default="", max_length=40)
    location: str = Field(default="", max_length=200)
    speakers: str = Field(default="", max_length=2000)
    agenda: str = Field(default="", max_length=4000)
    capacity: Optional[int] = Field(default=None, ge=1, le=10000)
    premium_only: bool = Field(default=False)


class EventUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=180)
    description: Optional[str] = Field(default=None, max_length=4000)
    kind: Optional[str] = Field(default=None, max_length=20)
    starts_at: Optional[str] = Field(default=None, max_length=40)
    ends_at: Optional[str] = Field(default=None, max_length=40)
    location: Optional[str] = Field(default=None, max_length=200)
    speakers: Optional[str] = Field(default=None, max_length=2000)
    agenda: Optional[str] = Field(default=None, max_length=4000)
    capacity: Optional[int] = Field(default=None, ge=1, le=10000)
    premium_only: Optional[bool] = Field(default=None)
    status: Optional[str] = Field(default=None, max_length=20)


def _parse_event_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Date invalide (format ISO attendu)")
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _event_out(
    db: Session,
    ev: CommunityEvent,
    current: CommunityUser | None = None,
    counts: dict | None = None,
    wait: dict | None = None,
    mine: dict | None = None,
) -> dict:
    active = [r for r in ev.registrations if r.status in ("registered", "waitlisted")]
    attendees = counts.get(ev.id, len(active)) if counts is not None else len(active)
    waitlisted = wait.get(ev.id, 0) if wait is not None else len([r for r in active if r.status == "waitlisted"])
    my_status = None
    if mine is not None:
        my_status = mine.get(ev.id)
    elif current:
        r = next((r for r in ev.registrations if r.user_id == current.id), None)
        my_status = r.status if r else None
    return {
        "id": ev.id,
        "title": ev.title,
        "description": ev.description or "",
        "kind": ev.kind,
        "starts_at": ev.starts_at.isoformat() if ev.starts_at else None,
        "ends_at": ev.ends_at.isoformat() if ev.ends_at else None,
        "location": ev.location or "",
        "speakers": ev.speakers or "",
        "agenda": ev.agenda or "",
        "capacity": ev.capacity,
        "premium_only": bool(ev.premium_only),
        "status": ev.status,
        "attendees": attendees,
        "waitlisted": waitlisted,
        "full": bool(ev.capacity and attendees >= ev.capacity),
        "my_status": my_status,
        "organizer": _user_out(ev.organizer, current) if ev.organizer else None,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


def _events_reminders(db: Session) -> None:
    """Rappels lazzy : les événements publiés qui débutent sous 60 minutes
    notifient leurs inscrits une seule fois (marqueur reminded_at)."""
    now = datetime.utcnow()
    due = (
        db.query(CommunityEvent)
        .options(joinedload(CommunityEvent.registrations).joinedload(CommunityEventRegistration.user))
        .filter(
            CommunityEvent.status == "published",
            CommunityEvent.starts_at >= now,
            CommunityEvent.starts_at <= now + timedelta(hours=1),
            CommunityEvent.reminded_at.is_(None),
        )
        .all()
    )
    if not due:
        return
    for ev in due:
        ev.reminded_at = now
        for r in ev.registrations:
            if r.status == "registered" and r.user and r.user.user_id:
                _notify(
                    db,
                    r.user.user_id,
                    "Événement imminent",
                    f"« {ev.title} » commence dans moins d'une heure.",
                    "/community?events",
                )
    db.commit()


@router.get("/events")
def list_events(
    kind: str = Query("", max_length=20),
    upcoming: bool = Query(True),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Agenda public : événements publiés, à venir d'abord, avec participation."""
    _events_reminders(db)
    current = _get_profile(db, user)
    query = db.query(CommunityEvent).filter(CommunityEvent.status == "published")
    if kind.strip():
        query = query.filter(CommunityEvent.kind == kind.strip().lower())
    if upcoming:
        query = query.filter(CommunityEvent.starts_at >= datetime.utcnow())
    total = query.count()
    events = query.order_by(CommunityEvent.starts_at.asc()).offset(offset).limit(limit).all()
    ids = [e.id for e in events]
    counts: dict = {}
    wait: dict = {}
    mines: dict = {}
    if ids:
        counts = dict(
            db.query(CommunityEventRegistration.event_id, func.count(CommunityEventRegistration.id))
            .filter(
                CommunityEventRegistration.event_id.in_(ids),
                CommunityEventRegistration.status.in_(("registered", "waitlisted")),
            )
            .group_by(CommunityEventRegistration.event_id)
            .all()
        )
        wait = dict(
            db.query(CommunityEventRegistration.event_id, func.count(CommunityEventRegistration.id))
            .filter(
                CommunityEventRegistration.event_id.in_(ids),
                CommunityEventRegistration.status == "waitlisted",
            )
            .group_by(CommunityEventRegistration.event_id)
            .all()
        )
        if current:
            mines = {
                r.event_id: r.status
                for r in db.query(CommunityEventRegistration)
                .filter(
                    CommunityEventRegistration.event_id.in_(ids),
                    CommunityEventRegistration.user_id == current.id,
                )
                .all()
            }
    return {
        "events": [_event_out(db, e, current, counts, wait, mines) for e in events],
        "total": total,
    }


@router.get("/events/{event_id}")
def get_event(
    event_id: int,
    user: User | None = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Détail d'un événement (publié ; le staff voit aussi les brouillons)."""
    current = _get_profile(db, user)
    ev = (
        db.query(CommunityEvent)
        .options(joinedload(CommunityEvent.organizer))
        .filter(CommunityEvent.id == event_id)
        .first()
    )
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    if ev.status != "published" and not _is_staff(current):
        raise HTTPException(status_code=404, detail="Événement introuvable")
    return _event_out(db, ev, current)


@router.post("/events")
def create_event(
    payload: EventCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Création d'un événement par le staff (rôle compliance ou supérieur)."""
    current = _get_or_create_profile(db, user)
    if not _is_staff(current):
        raise HTTPException(status_code=403, detail="Réservé au staff de la communauté")
    if payload.kind.strip().lower() not in EVENT_KINDS:
        raise HTTPException(status_code=400, detail="Type d'événement invalide")
    starts_at = _parse_event_dt(payload.starts_at)
    if not starts_at:
        raise HTTPException(status_code=400, detail="Date de début requise")
    ends_at = _parse_event_dt(payload.ends_at)
    if ends_at and ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="La fin doit suivre le début")
    ev = CommunityEvent(
        organizer_id=current.id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        kind=payload.kind.strip().lower(),
        starts_at=starts_at,
        ends_at=ends_at,
        location=payload.location.strip(),
        speakers=payload.speakers.strip(),
        agenda=payload.agenda.strip(),
        capacity=payload.capacity,
        premium_only=bool(payload.premium_only),
        status="published",
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    from ..services.audit import audit
    audit(
        db,
        "community.event.create",
        "community_event",
        resource_id=ev.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"title": ev.title[:180], "kind": ev.kind, "premium_only": bool(ev.premium_only)},
    )
    db.commit()
    return _event_out(db, ev, current)


@router.patch("/events/{event_id}")
def update_event(
    event_id: int,
    payload: EventUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Mise à jour d'un événement par le staff (contenu, dates, statut)."""
    current = _get_or_create_profile(db, user)
    if not _is_staff(current):
        raise HTTPException(status_code=403, detail="Réservé au staff de la communauté")
    ev = db.query(CommunityEvent).filter(CommunityEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    changes = payload.model_dump(exclude_unset=True)
    if "kind" in changes and changes["kind"] and changes["kind"].strip().lower() not in EVENT_KINDS:
        raise HTTPException(status_code=400, detail="Type d'événement invalide")
    if "starts_at" in changes:
        starts_at = _parse_event_dt(changes["starts_at"])
        if not starts_at:
            raise HTTPException(status_code=400, detail="Date de début requise")
        ev.starts_at = starts_at
    if "ends_at" in changes:
        ev.ends_at = _parse_event_dt(changes["ends_at"])
    if ev.ends_at and ev.starts_at and ev.ends_at <= ev.starts_at:
        raise HTTPException(status_code=400, detail="La fin doit suivre le début")
    for field in ("title", "description", "location", "speakers", "agenda", "capacity", "premium_only"):
        if field in changes:
            setattr(ev, field, changes[field])
    if "status" in changes:
        if changes["status"] not in ("published", "draft", "cancelled"):
            raise HTTPException(status_code=400, detail="Statut invalide")
        ev.status = changes["status"]
    db.commit()
    db.refresh(ev)
    from ..services.audit import audit
    audit(
        db,
        "community.event.update",
        "community_event",
        resource_id=ev.id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"fields": sorted(changes.keys())},
    )
    db.commit()
    return _event_out(db, ev, current)


@router.delete("/events/{event_id}")
def delete_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Suppression d'un événement par le staff (les inscriptions suivent)."""
    current = _get_or_create_profile(db, user)
    if not _is_staff(current):
        raise HTTPException(status_code=403, detail="Réservé au staff de la communauté")
    ev = db.query(CommunityEvent).filter(CommunityEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    title = ev.title
    db.delete(ev)  # cascade : inscriptions
    db.commit()
    from ..services.audit import audit
    audit(
        db,
        "community.event.delete",
        "community_event",
        resource_id=event_id,
        user_id=user.id,
        actor_role=user.role,
        ip=request.client.host if request else None,
        user_agent=request.headers.get("user-agent") if request else None,
        meta={"title": title[:180]},
    )
    db.commit()
    return {"deleted": True}


@router.post("/events/{event_id}/register")
def register_event(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Inscription (ou désinscription) d'un membre à un événement.
    Les événements premium_only exigent l'abonnement Premium ; au-delà de la
    capacité, le membre est placé en liste d'attente."""
    check_rate_limit(request, limit=20, window_seconds=60)
    current = _get_or_create_profile(db, user)
    _mod_guard(current)
    ev = db.query(CommunityEvent).filter(CommunityEvent.id == event_id).first()
    if not ev or ev.status == "cancelled":
        raise HTTPException(status_code=404, detail="Événement introuvable")
    if ev.status != "published":
        raise HTTPException(status_code=400, detail="L'événement n'est pas ouvert aux inscriptions")
    if ev.premium_only and not _is_premium(current):
        raise HTTPException(
            status_code=403,
            detail="Cet événement est réservé aux membres Premium (abonnement Pro).",
        )
    if ev.starts_at and ev.starts_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="L'événement a déjà commencé")
    reg = (
        db.query(CommunityEventRegistration)
        .filter(
            CommunityEventRegistration.event_id == ev.id,
            CommunityEventRegistration.user_id == current.id,
        )
        .first()
    )
    active = (
        db.query(func.count(CommunityEventRegistration.id))
        .filter(
            CommunityEventRegistration.event_id == ev.id,
            CommunityEventRegistration.status.in_(("registered", "waitlisted")),
        )
        .scalar()
    ) or 0
    if reg:
        if reg.status == "cancelled":
            # Réinscription : rejoint l'événement ou la file d'attente
            reg.status = "waitlisted" if (ev.capacity and active >= ev.capacity) else "registered"
            db.commit()
            return {"event_id": ev.id, "status": reg.status, "registered": True, "toggle": False}
        if reg.status == "waitlisted":
            # Déjà en attente : promu si une place s'est libérée, sinon no-op
            if ev.capacity and active >= ev.capacity:
                db.commit()
                return {"event_id": ev.id, "status": "waitlisted", "registered": False, "toggle": False}
            reg.status = "registered"
            db.commit()
            return {"event_id": ev.id, "status": "registered", "registered": True, "toggle": False}
        reg.status = "cancelled"  # bascule : désinscription
        db.commit()
        return {"event_id": ev.id, "status": "cancelled", "registered": False, "toggle": True}
    waitlisted = bool(ev.capacity and active >= ev.capacity)
    new_reg = CommunityEventRegistration(event_id=ev.id, user_id=current.id,
                                         status="waitlisted" if waitlisted else "registered")
    db.add(new_reg)
    db.commit()
    if not waitlisted and ev.organizer and ev.organizer.user_id and ev.organizer.user_id != current.user_id:
        _notify(
            db,
            ev.organizer.user_id,
            "Nouvelle inscription",
            f"{current.display_name} s'est inscrit à « {ev.title} ».",
            f"/community?events",
        )
        db.commit()
    return {"event_id": ev.id, "status": new_reg.status, "registered": True, "toggle": False,
            "waitlisted": waitlisted}


@router.post("/events/{event_id}/cancel")
def cancel_event_registration(
    event_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Désinscription explicite d'un membre à un événement."""
    current = _get_or_create_profile(db, user)
    ev = db.query(CommunityEvent).filter(CommunityEvent.id == event_id).first()
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    reg = (
        db.query(CommunityEventRegistration)
        .filter(
            CommunityEventRegistration.event_id == ev.id,
            CommunityEventRegistration.user_id == current.id,
        )
        .first()
    )
    if not reg or reg.status == "cancelled":
        return {"event_id": ev.id, "status": "cancelled"}
    reg.status = "cancelled"
    db.commit()
    return {"event_id": ev.id, "status": "cancelled"}


