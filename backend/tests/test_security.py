# -*- coding: utf-8 -*-
"""Tests d'intégration contre le serveur live (http://127.0.0.1:8000).

Couvre la sécurité mise en place : auth obligatoire sur les endpoints
sensibles, jeton avec expiration, rate limiting, admin token.
"""
import os
import time
import uuid

import httpx
import pytest

BASE = os.environ.get("BLUEROCK_TEST_URL", "http://127.0.0.1:8000")
ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")

client = httpx.Client(base_url=BASE, timeout=60)


def _email():
    return f"pytest{int(time.time())}{uuid.uuid4().hex[:6]}@test.ai"


def _register_user():
    data = {"email": _email(), "password": "Passw0rd!", "name": "Test Pytest", "mode": "demo"}
    r = client.post("/api/auth/register", json=data)
    assert r.status_code == 200, r.text
    return r.json()


class TestHealth:
    def test_health(self):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["status"] == "healthy"

    def test_docs_closed_or_open_consistent(self):
        r = client.get("/openapi.json")
        # DEBUG=true en dev -> ouvert ; en prod -> 404
        assert r.status_code in (200, 404)


class TestAuth:
    def test_register_login_me_flow(self):
        reg = _register_user()
        token = reg["token"]
        # format attendu : hex.exp
        assert len(token.split(".")) == 2
        hex_part, exp_part = token.split(".")
        assert len(hex_part) == 48
        assert exp_part.isdigit()
        # expiration dans ~7 jours
        assert abs(int(exp_part) - time.time() - 7 * 86400) < 3600

        r = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["email"] == reg["email"]

    def test_login_wrong_password_401(self):
        r = client.post("/api/auth/login", json={"email": _email(), "password": "wrong"})
        assert r.status_code == 401

    def test_me_without_token_401(self):
        r = client.get("/api/auth/me")
        assert r.status_code == 401

    def test_me_invalid_token_401(self):
        r = client.get("/api/auth/me", headers={"Authorization": "Bearer garbage.token"})
        assert r.status_code == 401


class TestProtectedEndpoints:
    def test_seed_without_admin_403(self):
        r = client.post("/api/seed/all")
        assert r.status_code == 403

    def test_seed_with_admin_token_ok(self):
        if not ADMIN_TOKEN:
            pytest.skip("ADMIN_TOKEN non défini")
        r = client.post("/api/seed/all", headers={"X-Admin-Token": ADMIN_TOKEN})
        assert r.status_code == 200

    def test_macro_seed_without_admin_403(self):
        r = client.post("/api/macro/seed")
        assert r.status_code == 403

    def test_ingestion_pdf_without_admin_403(self):
        r = client.post("/api/ingestion/pdf", files={"file": ("x.pdf", b"", "application/pdf")},
                        data={"company_id": 1, "fiscal_year": 2024})
        # la dépendance admin passe avant la lecture du fichier
        assert r.status_code == 403

    def test_market_refresh_without_token_401(self):
        r = client.post("/api/market/refresh")
        assert r.status_code == 401

    def test_analysis_ask_without_token_401(self):
        r = client.post("/api/analysis/ask", json={"question": "Bonjour"})
        assert r.status_code == 401

    def test_analysis_ask_with_token_ok(self):
        reg = _register_user()
        r = client.post("/api/analysis/ask",
                        headers={"Authorization": f"Bearer {reg['token']}"},
                        json={"question": "Que vaut ETIT ?"})
        assert r.status_code == 200, r.text
        assert r.json().get("answer") or r.json().get("response") or r.json().get("result")


class TestRateLimit:
    def test_refresh_rate_limited_after_5(self):
        reg = _register_user()
        headers = {"Authorization": f"Bearer {reg['token']}"}
        seen = []
        for _ in range(7):
            r = client.post("/api/market/refresh", headers=headers)
            seen.append(r.status_code)
        assert seen.count(429) >= 2, f"429 attendu après 5 requêtes/min, vu {seen}"


class TestPublicReads:
    def test_companies_list(self):
        r = client.get("/api/companies", params={"limit": 50})
        assert r.status_code == 200
        assert r.json()["total"] >= 40

    def test_company_full_has_synthetic_flag(self):
        r = client.get("/api/companies/1/full", params={"days": 90})
        assert r.status_code == 200
        assert "data_synthetic" in r.json()

    def test_market_overview_freshness(self):
        r = client.get("/api/market/overview")
        assert r.status_code == 200
        assert "freshness" in r.json()
        assert "latest_date" in r.json()["freshness"]

    def test_ingestion_statements_require_auth(self):
        r = client.get("/api/ingestion/statements", params={"company_id": 1})
        assert r.status_code == 401

    def test_financials_contain_no_synthetic_data(self):
        r = client.get("/api/companies/1/financials")
        assert r.status_code == 200
        data = r.json()
        # Aucune donnée générée ne doit être servie : s'il existe des états,
        # ils sont réels (is_synthetic=false) et exposent le flag.
        assert isinstance(data, list)
        if data:
            assert all("is_synthetic" in s for s in data)
            assert all(s.get("is_synthetic") is False for s in data)

    def test_company_full_has_no_synthetic_data(self):
        r = client.get("/api/companies/1/full", params={"days": 90})
        assert r.status_code == 200
        payload = r.json()
        assert "data_synthetic" in payload
        assert payload["data_synthetic"] is False
        assert payload["profile"] is None
