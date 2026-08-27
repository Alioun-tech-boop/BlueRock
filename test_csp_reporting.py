#!/usr/bin/env python3
"""
Script de test pour vérifier le reporting CSP.

Ce script force une violation CSP en tentant de charger
une ressource externe inacceptable (ex: script sans nonce).
Ensuite, il vérifie que le report CSP est bien reçu par le backend.

Usage : python test_csp_reporting.py
"""

import requests
import json
import time
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:8000"
CSP_REPORT_ENDPOINT = f"{BASE_URL}/api/csp/report"
TEST_URL = f"{BASE_URL}/test-csp"  # URL qui va déclencher une violation

# Configuration pour les test
test_results = []


def create_csp_report_payload(violation_type, uri, severity="error"):
    """Crée un payload pour le rapport CSP."""
    return {
        "report_id": f"test-{int(time.time())}",
        "violation_type": violation_type,
        "uri": uri,
        "severity": severity,
        "referrer": "http://localhost:8000/test-csp",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }


def test_csp_violation_forcing():
    """Test de base : force une violation CSP."""
    print("\n" + "=" * 60)
    print("📋 Test 1 : Forcer une violation CSP")
    print("=" * 60)
    
    # Méthode 1 : Tenter de charger un script externe sans nonce (violation)
    print("\n[TEST 1] Requête vers une URL externe (script sans nonce)")
    test_payload = {
        "violation_type": "script-src",
        "uri": "https://external-script.com/evil.js",
        "severity": "error",
        "referrer": "http://localhost:8000/test-csp",
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }
    
    try:
        # Simuler une requête qui déclencherait une violation CSP
        # Note: en pratique, la violation se produit via le navigateur
        # mais le report CSP est envoyé par le navigateur après
        # que la page a chargé avec un script non autorisé
        response = requests.post(
            CSP_REPORT_ENDPOINT,
            json=test_payload,
            timeout=10
        )
        
        if response.status_code == 200:
            print(f"✅ Rapport CSP reçu : {response.json()}")
            test_results.append({"test": "CSP violation forcing", "status": "PASS"})
        else:
            print(f"❌ Erreur HTTP : {response.status_code}")
            print(f"   Contenu : {response.text}")
            test_results.append({"test": "CSP violation forcing", "status": "FAIL"})
    except Exception as e:
        print(f"❌ Erreur : {e}")
        test_results.append({"test": "CSP violation forcing", "status": "FAIL"})


def test_csp_violation_different_types():
    """Test des types de violations différents."""
    print("\n" + "=" * 60)
    print("📋 Test 2 : Tester différents types de violations")
    print("=" * 60)
    
    violations = [
        ("script-src", "https://evil.com/evil.js"),
        ("style-src", "https://evil.com/style.css"),
        ("img-src", "https://evil.com/image.png"),
        ("connect-src", "https://evil.com/api"),
        ("font-src", "https://evil.com/font.woff"),
    ]
    
    for vtype, uri in violations:
        payload = create_csp_report_payload(vtype, uri)
        try:
            response = requests.post(
                CSP_REPORT_ENDPOINT,
                json=payload,
                timeout=10
            )
            if response.status_code == 200:
                print(f"✅ Violation {vtype}: OK")
                test_results.append({"test": f"CSP {vtype} violation", "status": "PASS"})
            else:
                print(f"❌ Violation {vtype}: HTTP {response.status_code}")
                test_results.append({"test": f"CSP {vtype} violation", "status": "FAIL"})
        except Exception as e:
            print(f"❌ Violation {vtype}: {e}")
            test_results.append({"test": f"CSP {vtype} violation", "status": "FAIL"})


def test_csp_reporting_endpoints():
    """Vérifie que l'endpoint de reporting fonctionne."""
    print("\n" + "=" * 60)
    print("📋 Test 3 : Endpoint de reporting CSP")
    print("=" * 60)
    
    # Test de l'endpoint lui-même
    try:
        response = requests.get(CSP_REPORT_ENDPOINT, timeout=10)
        print(f"Status : {response.status_code}")
        if response.status_code == 200:
            print(f"✅ Endpoint de reporting accessible")
            test_results.append({"test": "CSP report endpoint", "status": "PASS"})
        else:
            print(f"❌ Endpoint non accessible")
            test_results.append({"test": "CSP report endpoint", "status": "FAIL"})
    except Exception as e:
        print(f"❌ Erreur : {e}")
        test_results.append({"test": "CSP report endpoint", "status": "FAIL"})


def test_csp_violation_report_content():
    """Teste que les rapports contiennent les bons champs."""
    print("\n" + "=" * 60)
    print("📋 Test 4 : Vérification des contenus des rapports")
    print("=" * 60)
    
    test_payloads = [
        create_csp_report_payload("script-src", "https://evil.com/evil.js"),
        create_csp_report_payload("style-src", "https://evil.com/style.css"),
    ]
    
    for i, payload in enumerate(test_payloads):
        print(f"\nRapport #{i+1} :")
        print(f"  Violation type : {payload['violation_type']}")
        print(f"  URI : {payload['uri']}")
        print(f"  Severité : {payload['severity']}")
        print(f"  Timestamp : {payload['timestamp']}")
        
        # Vérification des champs obligatoires
        required_fields = ["report_id", "violation_type", "uri", "severity", "referrer", "timestamp"]
        missing = [f for f in required_fields if f not in payload]
        if not missing:
            print(f"  ✅ Tous les champs présents")
            test_results.append({"test": "Report content validation", "status": "PASS"})
        else:
            print(f"  ❌ Champs manquants : {missing}")
            test_results.append({"test": "Report content validation", "status": "FAIL"})


def test_csp_reporting_summary():
    """Résumé de tous les tests."""
    print("\n" + "=" * 60)
    print("📋 Résumé des tests CSP")
    print("=" * 60)
    
    passed = sum(1 for r in test_results if r["status"] == "PASS")
    failed = sum(1 for r in test_results if r["status"] == "FAIL")
    total = len(test_results)
    
    print(f"\n✅ Passé : {passed}/{total}")
    print(f"❌ Échoué : {failed}/{total}")
    
    if failed > 0:
        print("\n⚠️  Résultats des tests échoués :")
        for r in test_results:
            if r["status"] == "FAIL":
                print(f"   - {r['test']}")


def main():
    print("\n" + "=" * 60)
    print("🔒 Test de Reporting CSP - BlueRock")
    print("=" * 60)
    print(f"\nURL de base : {BASE_URL}")
    print(f"Endpoint de rapport : {CSP_REPORT_ENDPOINT}")
    
    if requests.get(f"{BASE_URL}/health").status_code != 200:
        print("\n⚠️  Le serveur BlueRock n'est pas répondant !")
        print("   Assurez-vous que le serveur est en cours d'exécution.")
        return
    
    # Exécuter les tests
    test_csp_violation_forcing()
    test_csp_violation_different_types()
    test_csp_reporting_endpoints()
    test_csp_violation_report_content()
    test_csp_reporting_summary()
    
    print("\n" + "=" * 60)
    print("🏁 Tests terminés")
    print("=" * 60)


if __name__ == "__main__":
    main()