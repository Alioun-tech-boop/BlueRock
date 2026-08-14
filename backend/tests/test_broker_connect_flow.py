import json
from datetime import datetime, timedelta

from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.core.security import hash_pin
from app.models.broker_connect import BrokerClientAccount, BrokerLoginEvent, BrokerSession
from app.models.user import User
from app.routers.auth import get_current_user

db = SessionLocal()
fake = db.query(User).filter(User.id == 2).first()
print("fake user:", fake.id, fake.email)


def _override():
    return fake


app.dependency_overrides[get_current_user] = _override

# Compte créé à la volée pour le test : le seed des comptes démo SGI a été
# retiré de l'application, le flux est donc exercé avec un compte dédié au test.
TEST_PIN = "654321"
TEST_ACCOUNT_NUMBER = "BR99999999"
account = BrokerClientAccount(
    broker_name="SGI Africabourse",
    account_number=TEST_ACCOUNT_NUMBER,
    holder_name="Testeur Flow",
    pin_hash=hash_pin(TEST_PIN),
    cash_balance=12_500_000,
    holdings=json.dumps([{"symbol": "SIBC", "qty": 10, "avg_price": 8200}]),
    status="active",
    created_at=datetime.utcnow() - timedelta(days=365),
)
db.add(account)
db.commit()
db.refresh(account)

c = TestClient(app)

# 1. Auth mauvais PIN -> 401
r = c.post("/api/broker-connect/auth", json={
    "broker_name": "SGI Africabourse", "account_number": TEST_ACCOUNT_NUMBER, "pin": "999999"})
print("auth bad pin:", r.status_code, r.json()["detail"])

# 2. Auth bon PIN
r = c.post("/api/broker-connect/auth", json={
    "broker_name": "SGI Africabourse", "account_number": TEST_ACCOUNT_NUMBER, "pin": TEST_PIN})
j = r.json()
print("auth ok:", r.status_code, j["ok"], "| masked:", j["account"]["account_number_masked"])
tok = j["broker_token"]

# 3. Session
r = c.get("/api/broker-connect/session", headers={"X-Broker-Token": tok})
print("session:", r.status_code, r.json()["account"]["broker_name"])

# 4. Link
r = c.post("/api/broker-connect/link", headers={"X-Broker-Token": tok})
j = r.json()
print("link:", r.status_code, j.get("ok"), "| portfolio:", j.get("portfolio", {}).get("name"),
      "| balance:", j.get("portfolio", {}).get("balance"),
      "| positions:", j.get("portfolio", {}).get("position_count"))

# 5. Link une 2e fois (idempotent)
r = c.post("/api/broker-connect/link", headers={"X-Broker-Token": tok})
print("link again:", r.status_code, r.json().get("ok"))

# 6. Status
r = c.get("/api/broker-connect/status")
print("status:", r.status_code, "linked count:", len(r.json()["linked"]))

# 7. Statement
r = c.get("/api/broker-connect/statement", headers={"X-Broker-Token": tok})
j = r.json()["statement"]
print("statement:", r.status_code, "| holdings:", len(j["holdings"]),
      "| cash:", j["cash_balance"], "| total:", j["total_value"])

# 8. Sync
r = c.post("/api/broker-connect/sync", headers={"X-Broker-Token": tok})
print("sync:", r.status_code, "synced:", r.json().get("synced"))

# 9. Ordre sur le portefeuille lié -> broker_ref estampillé
pf_id = c.get("/api/broker-connect/status").json()["linked"][0]["portfolio"]["id"]
r = c.post("/api/portfolio/orders", json={
    "symbol": "SIBC", "side": "sell", "qty": 10, "price": 24000,
    "account_id": pf_id})
print("order:", r.status_code, r.json().get("ok"))
orders = c.get(f"/api/portfolio?account_id={pf_id}").json()["orders"]
refs = [o["broker_ref"] for o in orders if o.get("broker_ref")]
print("broker_refs:", refs[:2])

# 10. Unlink
r = c.post("/api/broker-connect/unlink", headers={"X-Broker-Token": tok})
print("unlink:", r.status_code, r.json().get("unlinked"))

# 11. Token révoqué -> 401
r = c.get("/api/broker-connect/session", headers={"X-Broker-Token": tok})
print("revoked session:", r.status_code, r.json()["detail"])

# Nettoyage du compte de test (et de ses dépendances).
db.query(BrokerLoginEvent).filter(
    BrokerLoginEvent.account_number == TEST_ACCOUNT_NUMBER
).delete(synchronize_session=False)
db.query(BrokerSession).filter(
    BrokerSession.client_account_id == account.id
).delete(synchronize_session=False)
db.query(BrokerClientAccount).filter(
    BrokerClientAccount.id == account.id
).delete(synchronize_session=False)
db.commit()
db.close()
