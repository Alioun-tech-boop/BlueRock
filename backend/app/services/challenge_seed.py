import json
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ..models.challenge import (
    Challenge, ChallengeEntry, ChallengePortfolio, ChallengePosition,
    ChallengeTrade, ChallengeValueSnapshot,
)

LEGACY_CHALLENGE_NAMES = [
    "Sika Invest Challenge · Saison 1",
    "Flash Rallye BRVM",
    "Défi Dividendes",
]

# Noms historiques erronés (variantes de casse/sautée pendant les migrations)
# à purger : ce sont des doublons des défis officiels ci-dessous.
DANGLING_CHALLENGE_NAMES = [
    "Bluerock Invest Competition",   # doublon de "BlueRock Invest Competition"
    "BlueRock Invest Compétition",
]

COMPETITION_NAME = "BlueRock Invest Competition"
COMPETITION_START = datetime(2026, 11, 1, 0, 0, 0)
COMPETITION_END = datetime(2027, 5, 1, 0, 0, 0)
COMPETITION_REG_END = COMPETITION_END - timedelta(days=30)
COMPETITION_ENTRY_FEE = 100
COMPETITION_STARTING_CAPITAL = 1000000
COMPETITION_PRIZE_POOL = 5000000


def seed_challenges(db: Session) -> dict:
    if db.query(Challenge).count() > 0:
        return {"status": "skipped", "challenges": 0}
    return ensure_open_challenge(db)


def prune_legacy_challenges(db: Session) -> dict:
    """Supprime les défis de démonstration obsolètes ou dupliqués
    (toutes les tables liées). Idempotent."""
    names = LEGACY_CHALLENGE_NAMES + DANGLING_CHALLENGE_NAMES
    removed = 0
    for ch in db.query(Challenge).filter(Challenge.name.in_(names)).all():
        entry_ids = [e.id for e in ch.entries]
        if entry_ids:
            db.query(ChallengeValueSnapshot).filter(
                ChallengeValueSnapshot.entry_id.in_(entry_ids)
            ).delete(synchronize_session=False)
            portfolio_ids = [p.id for p in db.query(ChallengePortfolio).filter(
                ChallengePortfolio.entry_id.in_(entry_ids)).all()]
            if portfolio_ids:
                db.query(ChallengeTrade).filter(
                    ChallengeTrade.portfolio_id.in_(portfolio_ids)
                ).delete(synchronize_session=False)
                db.query(ChallengePosition).filter(
                    ChallengePosition.portfolio_id.in_(portfolio_ids)
                ).delete(synchronize_session=False)
                db.query(ChallengePortfolio).filter(
                    ChallengePortfolio.entry_id.in_(entry_ids)
                ).delete(synchronize_session=False)
            db.query(ChallengeEntry).filter(
                ChallengeEntry.id.in_(entry_ids)
            ).delete(synchronize_session=False)
        db.delete(ch)
        removed += 1
    if removed:
        db.commit()
    return {"status": "pruned", "removed": removed}


OPEN_CHALLENGE_NAME = "Portefeuille Virtuel BRVM · Saison 1"


def ensure_open_challenge(db: Session) -> dict:
    """Défi permanent, toujours ouvert : portefeuille 100 % virtuel dédié au défi.
    Idempotent : recrée si absent, répare si le statut ou la date de fin ont dérivé."""
    now = datetime.now()
    ch = db.query(Challenge).filter(Challenge.name == OPEN_CHALLENGE_NAME).first()
    created = False
    if ch is None:
        ch = Challenge(
            name=OPEN_CHALLENGE_NAME,
            tagline=(
                "Un portefeuille virtuel de 10 000 000 FCFA pour vous entraîner "
                "sans risque sur la BRVM, à tout moment."
            ),
            description=(
                "Défi permanent et toujours ouvert : chaque participant reçoit "
                "un capital fictif de 10 000 000 FCFA dans un portefeuille "
                "100 % dédié au défi. Passez vos ordres aux cours du marché, "
                "suivez votre performance en temps réel et grimpez au classement. "
                "Les meilleurs gestionnaires du classement général sont récompensés."
            ),
            status="open",
            start_date=now - timedelta(days=1),
            end_date=None,
            prize_pool=0,
            prizes=json.dumps([
                {"rank": 1, "amount": 750000, "label": "1ère place"},
                {"rank": 2, "amount": 450000, "label": "2ème place"},
                {"rank": 3, "amount": 300000, "label": "3ème place"},
            ], ensure_ascii=False),
            rules=json.dumps([
                "Défi permanent : inscrivez-vous et désinscrivez-vous quand vous le souhaitez.",
                "Chaque inscription ouvre un portefeuille virtuel de 10 000 000 FCFA, distinct de votre portefeuille réel.",
                "Les ordres sont exécutés instantanément au cours du marché (flux BRVM temps réel, sinon dernière clôture).",
                "Le classement est basé sur la performance (%) de votre portefeuille virtuel depuis son ouverture.",
                "La performance = valeur actuelle (liquidités + positions au cours) ÷ capital initial.",
                "Les positions sont valorisées en continu ; votre courbe de performance est visible sur votre profil.",
                "La manipulation du marché ou des cours entraîne une exclusion immédiate.",
                "Désinscription : votre portefeuille virtuel est remis à zéro et réinitialisé à 10 000 000 FCFA à la réinscription.",
            ], ensure_ascii=False),
            max_participants=0,
            starting_capital=10000000,
            is_featured=True,
        )
        db.add(ch)
        created = True
    else:
        ch.status = "open"
        ch.end_date = None
        ch.start_date = ch.start_date or (now - timedelta(days=1))
    db.commit()
    return {"status": "created" if created else "repaired", "challenge_id": ch.id}


def ensure_competition_challenge(db: Session) -> dict:
    """Défi « BlueRock Invest Competition » : compétition payante (100 FCFA),
    1 000 000 FCFA virtuels par participant, 6 mois, le plus gros bénéfice gagne."""
    ch = db.query(Challenge).filter(Challenge.name == COMPETITION_NAME).first()
    created = False
    if ch is None:
        ch = Challenge(
            name=COMPETITION_NAME,
            tagline=(
                "La grande compétition d'investissement BlueRock : 1 000 000 FCFA "
                "virtuels, 6 mois de trading, le plus gros bénéfice gagne."
            ),
            description=(
                "Compétition ouverte à tous : participez pour 100 FCFA et recevez "
                "un capital virtuel de 1 000 000 FCFA à faire fructifier sur la BRVM. "
                "La compétition s'ouvre le 1er novembre 2026 et dure 6 mois. "
                "Les inscriptions sont ouvertes dès aujourd'hui et se terminent "
                "un mois avant la clôture. Le participant ayant réalisé le plus "
                "gros bénéfice remporte le premier prix."
            ),
            status="upcoming",
            start_date=COMPETITION_START,
            end_date=COMPETITION_END,
            registration_end=COMPETITION_REG_END,
            entry_fee=COMPETITION_ENTRY_FEE,
            prize_pool=COMPETITION_PRIZE_POOL,
            prizes=json.dumps([
                {"rank": 1, "amount": 3000000, "label": "1ère place"},
                {"rank": 2, "amount": 1500000, "label": "2ème place"},
                {"rank": 3, "amount": 500000, "label": "3ème place"},
            ], ensure_ascii=False),
            rules=json.dumps([
                "La participation est conditionnée au paiement de 100 FCFA, débités de votre compte.",
                "Chaque compétiteur reçoit 1 000 000 FCFA virtuels pour investir sur la BRVM.",
                "La compétition se déroule du 1er novembre 2026 au 30 avril 2027 (6 mois).",
                "Les inscriptions sont ouvertes dès aujourd'hui et se clôturent un mois avant la fin.",
                "Le classement est basé sur le bénéfice réalisé : le plus gros bénéfice gagne.",
                "Le 1er prix est de 3 000 000 FCFA, le 2ème de 1 500 000 FCFA, le 3ème de 500 000 FCFA.",
                "Les ordres sont exécutés au cours du marché (flux BRVM temps réel, sinon dernière clôture).",
                "Toute manipulation du marché entraîne une exclusion immédiate, sans remboursement.",
            ], ensure_ascii=False),
            max_participants=0,
            starting_capital=COMPETITION_STARTING_CAPITAL,
            is_featured=False,
        )
        db.add(ch)
        created = True
    else:
        ch.status = "upcoming"
        ch.start_date = COMPETITION_START
        ch.end_date = COMPETITION_END
        ch.registration_end = COMPETITION_REG_END
        ch.entry_fee = COMPETITION_ENTRY_FEE
        ch.starting_capital = COMPETITION_STARTING_CAPITAL
        ch.prize_pool = COMPETITION_PRIZE_POOL
    db.commit()
    return {"status": "created" if created else "repaired", "challenge_id": ch.id}
