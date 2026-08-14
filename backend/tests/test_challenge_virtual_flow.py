"""Flux complet du défi permanent : inscription, portefeuille virtuel dédié,
ordres aux cours du marché, classement et profil public d'un participant.

Contexte : le trading (défi inclus) exige un KYC vérifié — le fixture crée
donc un utilisateur dédié avec un dossier KYC « verified », isolé de la base.
"""

import time
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.challenge import (
    Challenge, ChallengeEntry, ChallengePortfolio, ChallengeValueSnapshot,
    ChallengeTrade, ChallengePosition,
)
from app.models.kyc import UserKyc
from app.models.user import User
from app.routers.auth import get_current_user, get_optional_user
from app.services.challenge_seed import OPEN_CHALLENGE_NAME, ensure_open_challenge

TEST_EMAIL = f"challenge_pytest_{int(time.time())}_{uuid.uuid4().hex[:6]}@test.ai"


@pytest.fixture(scope="module")
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture(scope="module")
def challenge(db):
    ensure_open_challenge(db)
    ch = db.query(Challenge).filter(Challenge.name == OPEN_CHALLENGE_NAME).first()
    assert ch is not None, "défi ouvert introuvable"
    return ch


@pytest.fixture(scope="module")
def user(db, challenge):
    u = User(email=TEST_EMAIL, name="Test Défi", password_hash="x", account_type="demo")
    db.add(u)
    db.flush()
    db.add(UserKyc(user_id=u.id, status="verified"))
    db.commit()
    db.refresh(u)
    yield u
    for e in db.query(ChallengeEntry).filter(
        ChallengeEntry.challenge_id == challenge.id,
        ChallengeEntry.user_id == u.id,
    ).all():
        if e.portfolio:
            db.query(ChallengeTrade).filter(
                ChallengeTrade.portfolio_id == e.portfolio.id).delete()
            db.query(ChallengePosition).filter(
                ChallengePosition.portfolio_id == e.portfolio.id).delete()
        db.query(ChallengeValueSnapshot).filter(
            ChallengeValueSnapshot.entry_id == e.id).delete()
        db.delete(e)
    db.query(UserKyc).filter(UserKyc.user_id == u.id).delete()
    db.delete(u)
    db.commit()


@pytest.fixture(scope="module")
def client(user):
    def _override():
        return user

    app.dependency_overrides[get_current_user] = _override
    app.dependency_overrides[get_optional_user] = _override
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_full_virtual_challenge_flow(client, challenge, user):
    cid = challenge.id

    # 1. Détail : ouvert, règles, pas encore inscrit
    r = client.get(f"/api/community/challenges/{cid}")
    assert r.status_code == 200
    j = r.json()
    assert j["status"] in ("open", "live")
    assert len(j["rules"]) > 0
    assert j["joined"] is False
    assert j["starting_capital"] >= 10_000_000

    # 2. Inscription → portefeuille virtuel dédié
    r = client.post(f"/api/community/challenges/{cid}/join")
    assert r.status_code == 200, r.text
    assert r.json()["joined"] is True

    # 3. Portefeuille du défi : capital initial intact
    r = client.get(f"/api/community/challenges/{cid}/portfolio")
    assert r.status_code == 200
    j = r.json()
    assert j["cash"] >= 10_000_000

    # 4. Achat au cours du marché
    r = client.post(f"/api/community/challenges/{cid}/portfolio/orders",
                    json={"symbol": "SNTS", "side": "buy", "qty": 10})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["price"] > 0
    assert j["portfolio"]["cash"] < 10_000_000
    assert len(j["portfolio"]["positions"]) > 0

    # 5. Achat impossible si liquidités insuffisantes
    r = client.post(f"/api/community/challenges/{cid}/portfolio/orders",
                    json={"symbol": "SNTS", "side": "buy", "qty": 100_000_000})
    assert r.status_code == 409

    # 6. Vente au-delà des quantités détenues
    r = client.post(f"/api/community/challenges/{cid}/portfolio/orders",
                    json={"symbol": "SNTS", "side": "sell", "qty": 999})
    assert r.status_code == 409

    # 7. Vente partielle
    r = client.post(f"/api/community/challenges/{cid}/portfolio/orders",
                    json={"symbol": "SNTS", "side": "sell", "qty": 4})
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["portfolio"]["trades"][0]["side"] == "sell"

    # 8. Symbole inconnu
    r = client.post(f"/api/community/challenges/{cid}/portfolio/orders",
                    json={"symbol": "ZZZZ", "side": "buy", "qty": 1})
    assert r.status_code == 404

    # 9. Classement : notre participant identifié
    r = client.get(f"/api/community/challenges/{cid}/leaderboard")
    assert r.status_code == 200
    j = r.json()
    me = next((x for x in j["leaderboard"] if x.get("is_me")), None)
    assert me is not None, "participant absent du classement"
    assert me["perf"] is not None
    assert me["trades_count"] >= 2
    assert me["rank"] >= 1

    # 10. Profil public d'un participant
    r = client.get(f"/api/community/challenges/{cid}/users/{user.id}")
    assert r.status_code == 200
    j = r.json()
    assert j["handle"]
    assert j["rank"] >= 1

    # 11. Désinscription → portefeuille supprimé
    r = client.delete(f"/api/community/challenges/{cid}/join")
    assert r.status_code == 200, r.text
    assert r.json()["joined"] is False
    r = client.get(f"/api/community/challenges/{cid}/portfolio")
    assert r.status_code == 404
