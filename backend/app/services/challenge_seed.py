import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.challenge import Challenge


def seed_challenges(db: Session) -> dict:
    if db.query(Challenge).count() > 0:
        return {"status": "skipped", "challenges": 0}

    now = datetime.now()

    live = Challenge(
        name="Sika Invest Challenge · Saison 1",
        tagline="La ligue des gestionnaires BRVM : qui fera fructifier son portefeuille le plus vite ?",
        description=(
            "Composez et gérez votre portefeuille virtuel sur la BRVM pendant 4 semaines. "
            "Le classement se met à jour en continu sur la performance de votre portefeuille démo. "
            "Les 3 meilleurs gestionnaires repartent avec les prix."
        ),
        status="open",
        start_date=now - timedelta(days=6),
        end_date=now + timedelta(days=22),
        prize_pool=1500000,
        prizes=json.dumps([
            {"rank": 1, "amount": 750000, "label": "1ère place"},
            {"rank": 2, "amount": 450000, "label": "2ème place"},
            {"rank": 3, "amount": 300000, "label": "3ème place"},
        ], ensure_ascii=False),
        rules=json.dumps([
            "Inscription gratuite, ouverte à tout compte démo.",
            "Le classement est basé sur le rendement de votre portefeuille depuis votre inscription.",
            "Les ventes réalisées pendant le défi sont prises en compte dans le capital.",
            "Toute manipulation du marché entraîne une exclusion immédiate.",
        ], ensure_ascii=False),
        max_participants=500,
        starting_capital=10000000,
        is_featured=True,
    )

    upcoming = Challenge(
        name="Flash Rallye BRVM",
        tagline="Un sprint de 7 jours sur les valeurs les plus volatiles.",
        description=(
            "Défi éclair d'une semaine : prenez position dès l'ouverture, le meilleur rendement gagne. "
            "Idéal pour les traders aguerris."
        ),
        status="upcoming",
        start_date=now + timedelta(days=10),
        end_date=now + timedelta(days=17),
        prize_pool=600000,
        prizes=json.dumps([
            {"rank": 1, "amount": 350000, "label": "1ère place"},
            {"rank": 2, "amount": 250000, "label": "2ème place"},
        ], ensure_ascii=False),
        rules=json.dumps([
            "Défi réservé aux comptes démo.",
            "Durée : 7 jours ouvrés.",
        ], ensure_ascii=False),
        max_participants=300,
        starting_capital=10000000,
        is_featured=False,
    )

    ended = Challenge(
        name="Défi Dividendes",
        tagline="Misez sur les rendements de dividende de la BRVM.",
        description="Défi terminé : les participants devaient maximiser leur rendement en dividendes et plus-values.",
        status="ended",
        start_date=now - timedelta(days=60),
        end_date=now - timedelta(days=32),
        prize_pool=900000,
        prizes=json.dumps([
            {"rank": 1, "amount": 500000, "label": "1ère place"},
            {"rank": 2, "amount": 250000, "label": "2ème place"},
            {"rank": 3, "amount": 150000, "label": "3ème place"},
        ], ensure_ascii=False),
        rules=json.dumps(["Inscription libre sur compte démo."], ensure_ascii=False),
        max_participants=0,
        starting_capital=10000000,
        winners=json.dumps([
            {"rank": 1, "handle": "InvestisseurAguerri", "perf": 14.8},
            {"rank": 2, "handle": "Yasmine_B", "perf": 11.2},
            {"rank": 3, "handle": "BaobabCapital", "perf": 9.4},
        ], ensure_ascii=False),
        is_featured=False,
    )

    db.add_all([live, upcoming, ended])
    db.commit()
    return {"status": "seeded", "challenges": 3}
