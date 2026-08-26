"""Moteur de réputation communautaire (Phase 8).

Le score récompense l'activité (posts, propres relations) et la qualité
(rockets, partages, lecture, suivi, statut pro), et pénalise l'abus
(contenu masqué par la modération, ban). Les badges sont dérivés d'objectifs
explicites et synchronisés côté serveur.

Référence de niveau : Niveau 1 (>=0) → Niveau 10 (>=1100).
"""
from sqlalchemy import func


# ---------------------------------------------------------------------------
# Niveaux & titres (clés i18n résolues côté front)
# ---------------------------------------------------------------------------

LEVELS = [
    (0, 1, "repL1"),
    (60, 2, "repL2"),
    (100, 3, "repL3"),
    (160, 4, "repL4"),
    (240, 5, "repL5"),
    (340, 6, "repL6"),
    (460, 7, "repL7"),
    (600, 8, "repL8"),
    (800, 9, "repL9"),
    (1100, 10, "repL10"),
]

BADGES = [
    ("first_post", "repBadgeFirst", "repGoalFirst"),
    ("analyst_10", "repBadgeAnalyst10", "repGoalAnalyst10"),
    ("writer_30", "repBadgeWriter30", "repGoalWriter30"),
    ("liked_50", "repBadgeLiked50", "repGoalLiked50"),
    ("liked_200", "repBadgeLiked200", "repGoalLiked200"),
    ("viral_50", "repBadgeViral", "repGoalViral"),
    ("influencer_50", "repBadgeInfl50", "repGoalInfl50"),
    ("influencer_200", "repBadgeInfl200", "repGoalInfl200"),
    ("pro_verified", "repBadgePro", "repGoalPro"),
    ("guardian_5", "repBadgeGuardian", "repGoalGuardian"),
]


def level_for(score: int) -> tuple[int, str]:
    """(niveau, clé titre) pour un score donné."""
    score = max(0, int(score or 0))
    out = LEVELS[0]
    for threshold, lvl, key in LEVELS:
        if score >= threshold:
            out = (lvl, key)
    return out


def compute_score(
    posts_visible: int = 0,
    posts_hidden: int = 0,
    rockets_received: int = 0,
    shares_received: int = 0,
    views_received: int = 0,
    followers: int = 0,
    is_pro: bool = False,
    verified: bool = False,
    banned: bool = False,
    max_post_rockets: int = 0,
) -> int:
    """Score de réputation à partir de compteurs agrégés (pur, sans session)."""
    s = (
        50
        + posts_visible * 2
        + rockets_received * 3
        + shares_received * 2
        + min(views_received // 10, 120)
        + followers * 1
        + (25 if is_pro else 0)
        + (15 if verified else 0)
        - posts_hidden * 15
        - (60 if banned else 0)
    )
    return max(0, int(s))


def earned_codes(
    posts_visible: int = 0,
    rockets_received: int = 0,
    max_post_rockets: int = 0,
    followers: int = 0,
    is_pro: bool = False,
    resolved_by_me: int = 0,
) -> set[str]:
    """Badges mérités à partir de compteurs agrégés (pur, sans session)."""
    codes = set()
    if posts_visible >= 1:
        codes.add("first_post")
    if posts_visible >= 10:
        codes.add("analyst_10")
    if posts_visible >= 30:
        codes.add("writer_30")
    if rockets_received >= 50:
        codes.add("liked_50")
    if rockets_received >= 200:
        codes.add("liked_200")
    if max_post_rockets >= 50:
        codes.add("viral_50")
    if followers >= 50:
        codes.add("influencer_50")
    if followers >= 200:
        codes.add("influencer_200")
    if is_pro:
        codes.add("pro_verified")
    if resolved_by_me >= 5:
        codes.add("guardian_5")
    return codes


class ReputationMetrics:
    """Répartition détaillée d'un profil (pour affichage + scoring)."""

    def __init__(self, db, profile):
        self.db = db
        self.profile = profile
        posts = [p for p in profile.posts if not p.hidden_at]
        done = [p for p in profile.posts if p.hidden_at is not None]
        self.posts_visible = len(posts)
        self.posts_hidden = len(done)
        self.rockets_received = sum(len(p.reactions) for p in posts)
        self.shares_received = sum(len(p.shares) for p in posts)
        self.views_received = sum(p.views or 0 for p in posts)
        self.followers = len(profile.followers)
        self.max_post_rockets = max((len(p.reactions) for p in posts), default=0)
        self.resolved_by_me = (
            db.query(func.count(CommunityReportRow.id))
            .filter(CommunityReportRow.resolved_by == profile.user_id)
            .scalar()
        ) or 0

    @property
    def score(self) -> int:
        return compute_score(
            posts_visible=self.posts_visible,
            posts_hidden=self.posts_hidden,
            rockets_received=self.rockets_received,
            shares_received=self.shares_received,
            views_received=self.views_received,
            followers=self.followers,
            is_pro=bool(self.profile.is_pro),
            verified=bool(self.profile.verified),
            banned=bool(self.profile.banned_at),
            max_post_rockets=self.max_post_rockets,
        )

    @property
    def earned_codes(self) -> set[str]:
        return earned_codes(
            posts_visible=self.posts_visible,
            rockets_received=self.rockets_received,
            max_post_rockets=self.max_post_rockets,
            followers=self.followers,
            is_pro=bool(self.profile.is_pro),
            resolved_by_me=self.resolved_by_me,
        )


class CommunityReportRow:  # placeholder importé tardivement, évite l'import circulaire
    pass


from ..models.community import CommunityReport as _CR  # noqa: E402

CommunityReportRow = _CR


def compute_reputation(db, profile) -> int:
    """Score de réputation courant (lecture seule, sans écriture)."""
    return ReputationMetrics(db, profile).score


def sync_badges(db, profile) -> list[str]:
    """Synchronise les badges du profil : insère les nouveaux, retourne leur code.
    Identification par code (contrainte UNIQUE user+code)."""
    from ..models.community import CommunityBadge
    metrics = ReputationMetrics(db, profile)
    earned = metrics.earned_codes
    existing = set(b.code for b in (profile.badges or []))
    new_codes = sorted(earned - existing)
    for code in new_codes:
        db.add(CommunityBadge(user_id=profile.id, code=code))
    if new_codes:
        db.commit()
        db.refresh(profile)
    return new_codes