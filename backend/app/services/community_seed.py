"""Seed de la communauté : profils démo, posts sur les vraies sociétés BRVM.

Idempotent : ne crée rien si les profils démo existent déjà.
Le sentiment (bullish/bearish) et la série de cours des posts proviennent
des vraies données de marché en base (MarketData).
"""
import hashlib
import random
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.community import (
    CommunityUser,
    CommunityPost,
    CommunityShare,
    CommunityFollow,
    CommunityReaction,
    CommunityComment,
    CommunityProfessional,
)
from ..models.market import MarketData
from ..models.company import Company

PALETTE = ["#7266D9", "#2E7CF6", "#00C853", "#F59E0B", "#EC4899", "#06B6D4", "#F97316", "#8B5CF6", "#14B8A6", "#E11D48"]

PROFILES = [
    ("iamkingmh", "iamkingmh", "Trader de jour à Abidjan. Swing trading sur la BRVM.", True),
    ("Franck_Trader", "Franck Traoré", "Analyse technique & supports/résistances. Rigueur avant tout.", False),
    ("BRVM_Insider", "BRVM Insider", "Veille boursière quotidienne de l'UMOA.", True),
    ("DiarraInvest", "Mariam Diarra", "Gestion de portefeuille long terme, dividendes & valeur.", False),
    ("Koffi_Value", "Koffi N'Guessan", "Investissement de valeur : je vis sur les fondamentaux.", False),
    ("Awa_Bourse", "Awa Koné", "Épargnante devenue investisseuse. Je partage mon parcours.", False),
    ("Trader_Saly", "Saly Trader", "Scalping et intraday sur les valeurs liquides.", False),
    ("Bamba_Analyst", "Bamba Analyst", "Analyse fondamentale des sociétés de l'UEMOA.", False),
    ("Desk_Marches", "Desk Marchés", "La revue des marchés financiers ouest-africains.", True),
    ("Ella_Invest", "Ella Kaboré", "ESG et croissance. Investisseuse panafricaine.", False),
]

# (auteur, symbole, titre, contenu, editor_pick)
POSTS_TEMPLATE = [
    (
        "iamkingmh",
        "ETIT",
        "ETIT — Belle dynamique, volume en hausse",
        "Le titre confirme sa reprise avec des volumes en nette augmentation. Le franchissement des moyennes mobiles 20 et 50 valide le scénario haussier. Je reste acheteur tant que le support des 45 000 FCFA tient.",
        False,
    ),
    (
        "Franck_Trader",
        "SNTS",
        "SNTS — Retour sur support, biais acheteur sur le moyen terme",
        "SNTS teste un support majeur après la consolidation des dernières semaines. Le RSI repasse au-dessus de 40, ce qui suggère un essoufflement de la vente. Objectif de rebond : la MM50. Stop sous 18 500 FCFA.",
        False,
    ),
    (
        "DiarraInvest",
        "BOAC",
        "BOAC — Résultats solides, le ratio valeur/prix reste attractif",
        "Banque de référence en Côte d'Ivoire. Le rendement du dividende reste supérieur à la moyenne du marché et les ratios de capitalisation demeurent sains. Idéal pour un portefeuille patrimonial.",
        True,
    ),
    (
        "Bamba_Analyst",
        "SGBC",
        "SGBC — La marge nette soutient la valorisation",
        "Analyse des états financiers : la marge nette s'améliore d'exercice en exercice. La valorisation par les ratios de rentabilité (ROE, ROA) reste en ligne avec le secteur. Achat progressif conseillé.",
        False,
    ),
    (
        "BRVM_Insider",
        "SLBC",
        "SLBC — Le secteur des boissons reste défensif",
        "Dans un environnement incertain, SLBC conserve un profil défensif : cash-flow récurrents, positions de trésorerie confortables et politique de dividende régulière. Une valeur à garder dans les portefeuilles.",
        True,
    ),
    (
        "Koffi_Value",
        "UNLC",
        "UNLC — Décote à surveiller après la publication",
        "La baisse post-publication crée une opportunité : le cours revient sur ses moyennes de long terme alors que les fondamentaux restent stables. Marge de sécurité intéressante pour un horizon 12 mois.",
        False,
    ),
    (
        "Trader_Saly",
        "ORAC",
        "ORAC — Volatilité à exploiter sur les séances",
        "Les écarts de prix s'élargissent sur ORAC depuis la hausse des volumes. Les niveaux de 18 000/19 000 FCFA offrent des points d'entrée intéressants en intraday. Discipline obligatoire.",
        False,
    ),
    (
        "Awa_Bourse",
        "SPHC",
        "SPHC — L'agro-industrie, une histoire de patience",
        "J'accumule SPHC dans mon portefeuille : les cycles du caoutchouc et de l'huile soutiennent l'activité. Le dividende vient rémunérer l'attente. Un bon exemple d'investissement long terme.",
        False,
    ),
    (
        "Desk_Marches",
        "TTLC",
        "TTLC — L'énergie distribue, le marché apprécie",
        "Revue de la semaine : TTLC reste l'une des valeurs les plus rémunératrices de la cote. Le rendement servi est l'un des plus élevés du compartiment distribution. Le titre attire les investisseurs de rendement.",
        True,
    ),
    (
        "Ella_Invest",
        "NEIC",
        "NEIC — Rebond technique après le point bas",
        "NEIC vient de rebondir sur son plus bas annuel. Le mouvement semble technique avant tout, la prudence reste de mise tant que la tendance de fond n'est pas confirmée. Je surveille la MM20.",
        False,
    ),
    (
        "Bamba_Analyst",
        "PALC",
        "PALC — Palmier : la production soutient les marges",
        "Les volumes produits restent dynamiques et la société demeure bien positionnée sur son marché régional. Le PER se situe dans la moyenne du secteur avec un rendement de dividende attractif.",
        False,
    ),
    (
        "Franck_Trader",
        "BOAB",
        "BOAB — Triangle ascendant en formation",
        "Configuration chartiste intéressante sur BOAB : un triangle ascendant se dessine depuis deux mois. Une sortie au-dessus de la résistance ouvrirait un objectif de +8 %. Volume de confirmation à surveiller.",
        False,
    ),
    (
        "iamkingmh",
        "SIVC",
        "SIVC — Nouveaux plus hauts, la tendance s'accélère",
        "Le titre enchaîne les sommets avec des volumes soutenus. Le momentum est clairement en faveur des acheteurs. Tant que le canal haussier est respecté, je reste long.",
        False,
    ),
    (
        "DiarraInvest",
        "CIEC",
        "CIEC — Services publics : une électricité de valeur",
        "Monopole de fait et besoins structurels en énergie : CIEC combine stabilité des revenus et visibilité du dividende. Une allocation de conviction pour les profils prudents.",
        True,
    ),
    (
        "Koffi_Value",
        "ONTBF",
        "ONTBF — Télécoms : le yield compense la stagnation",
        "La croissance est limitée mais le dividende reste élevé et régulier. Pour un investisseur de valeur, le rendement servi justifie à lui seul la détention de la ligne.",
        False,
    ),
    (
        "Ella_Invest",
        "SMBC",
        "SMBC — Le sucre, un marché qui se redresse",
        "Les cours du sucre et les volumes exportés soutiennent la trajectoire de SMBC. Je renforce ma position sur les replis, la valorisation restant raisonnable face aux pairs de la zone UEMOA.",
        False,
    ),
]


def _deterministic(s: str, lo: int, hi: int) -> int:
    digest = int(hashlib.md5(s.encode()).hexdigest(), 16)
    return lo + (digest % (hi - lo + 1))


def seed_community(db: Session) -> dict:
    # Ne reseede pas si la communauté a déjà été nettoyée (on garde seulement les vrais membres)
    # On vérifie s'il existe déjà des posts ou des membres réels : si oui, on ne recrée pas les fictifs
    if db.query(CommunityUser).count() > 0:
        # Si Bluerock existe, c'est que la communauté a été initialisée et nettoyée
        return {"status": "skipped", "message": "Communauté déjà initialisée (nettoyée)"}

    users: dict[str, CommunityUser] = {}
    for handle, display_name, bio, verified in PROFILES:
        u = CommunityUser(
            handle=handle,
            display_name=display_name,
            bio=bio,
            avatar_color=PALETTE[len(users) % len(PALETTE)],
            verified=verified,
        )
        db.add(u)
        users[handle] = u
    db.flush()

    # Cours réels (dernier point + variation 30j) pour le sentiment
    rows = (
        db.query(Company, MarketData)
        .join(MarketData, MarketData.company_id == Company.id)
        .order_by(Company.symbol.asc(), MarketData.date.desc())
        .all()
    )
    trend: dict[str, float] = {}
    for comp, md in rows:
        prev = trend.get(comp.symbol)
        if prev is None:
            trend[comp.symbol] = md.change_percent or 0.0
    last_date = max((md.date for _, md in rows), default=None)

    posts: dict[str, CommunityPost] = {}
    for idx, (handle, symbol, title, content, editor) in enumerate(POSTS_TEMPLATE):
        change = trend.get(symbol, 0.0)
        sentiment = "bullish" if change >= 0 else "bearish"
        post = CommunityPost(
            author_id=users[handle].id,
            symbol=symbol,
            sentiment=sentiment,
            title=title,
            content=content,
            is_editor_pick=editor,
            created_at=(last_date - timedelta(days=idx * 3, hours=idx % 8)) if last_date else None,
        )
        db.add(post)
        posts[(handle, symbol)] = post
    db.flush()

    # Professionnels démo (Phase 2) : 2 vérifiés + 1 en attente
    for handle, category, title, company, approved in [
        ("iamkingmh", "analyst", "Analyste marché & chartiste", "Indépendant", True),
        ("DiarraInvest", "fund_manager", "Gestionnaire de portefeuille", "Diarra Gestion", True),
        ("Koffi_Value", "advisor", "Conseiller en investissement", "KVA Conseil", False),
    ]:
        cu = users.get(handle)
        if cu:
            db.add(
                CommunityProfessional(
                    user_id=cu.id,
                    category=category,
                    title=title,
                    company=company,
                    status="approved" if approved else "pending",
                    reviewed_at=datetime.utcnow() if approved else None,
                    bio_pro=cu.bio or "",
                )
            )
            cu.is_pro = approved
    db.flush()

    # Follows : chaque profil suit les 3 précédents (effet réseau)
    handles = list(users.keys())
    for i, handle in enumerate(handles):
        for j in (i - 1, i - 2, i - 3):
            if j >= 0:
                db.add(CommunityFollow(follower_id=users[handles[j]].id, followed_id=users[handle].id))
    db.flush()

    # Réactions (rockets) + commentaires déterministes
    all_posts = list(posts.values())
    for i, p in enumerate(all_posts):
        target = _deterministic(f"rockets-{p.id}", 2, 9)
        others = [u for h, u in users.items() if h not in POSTS_TEMPLATE[i][:1]]
        random.seed(p.id)
        random.shuffle(others)
        for u in others[:target]:
            db.add(CommunityReaction(post_id=p.id, user_id=u.id))
    comment_texts = [
        "Analyse très claire, merci pour le partage.",
        "Je suis d'accord sur le scénario, je vais surveiller ce support.",
        "Intéressant ! Vous voyez un objectif précis ?",
        "Belle lecture technique, on en redemande.",
        "Je partage votre vision sur le moyen terme.",
    ]
    for i, p in enumerate(all_posts):
        for k in range(_deterministic(f"comments-{p.id}", 0, 4)):
            author = users[handles[(i + k + 1) % len(handles)]]
            db.add(
                CommunityComment(
                    post_id=p.id,
                    author_id=author.id,
                    content=comment_texts[k % len(comment_texts)],
                    created_at=(p.created_at + timedelta(hours=2 + k)) if p.created_at else None,
                )
            )
    # Partages (Phase 3) : chaque post repartagé par 1 à 3 autres profils
    for i, p in enumerate(all_posts):
        for k in range(_deterministic(f"shares-{p.id}", 1, 4)):
            user = users[handles[(i + k + 1) % len(handles)]]
            db.add(
                CommunityShare(
                    post_id=p.id,
                    user_id=user.id,
                    created_at=(p.created_at + timedelta(hours=5 + k)) if p.created_at else None,
                )
            )

    db.commit()
    return {
        "status": "success",
        "users": len(users),
        "posts": len(posts),
        "message": f"Communauté initialisée : {len(users)} profils, {len(posts)} posts sur données réelles",
    }
