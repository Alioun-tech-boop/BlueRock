# Tests de Reporting CSP - BlueRock

Ce dossier contient des scripts pour tester le système de reporting CSP (Content Security Policy) de l'application BlueRock.

## Fichiers

| Fichier | Description |
|---------|-------------|
| `test_csp_reporting.py` | Script Python pour tester l'endpoint de reporting CSP |
| `test-csp-browser.js` | Script JavaScript pour déclencher de vraies violations CSP dans le navigateur |
| `test-csp-violations.html` | Page HTML complète pour tester manuellement les violations CSP |

---

## 🧪 Comment tester

### 1. Test Python (Backend API)

```bash
# S'assurer que le serveur backend tourne
cd backend
python -m uvicorn app.main:app --reload

# Dans un autre terminal, lancer le test
python test_csp_reporting.py
```

**Ce que fait le test Python :**
- Envoie des rapports CSP simulés à `/api/csp/report`
- Teste différents types de violations (script-src, style-src, img-src, etc.)
- Vérifie que l'endpoint répond correctement
- Affiche un résumé des tests

---

### 2. Test Navigateur (Vraies violations CSP)

**Option A : Via la page HTML**
```bash
# Dans le dossier frontend
cd frontend
npm run dev

# Ouvrir dans le navigateur :
# http://localhost:3000/test-csp-violations.html
```

**Option B : Intégrer le script dans une page existante**
```html
<!-- Dans votre layout/page principale -->
<script src="/test-csp-browser.js"></script>

<!-- Puis dans la console navigateur : -->
cspTest.runAllTests()
```

**Ce que fait le test navigateur :**
- Déclenche de VRAIES violations CSP (script sans nonce, ressources externes, eval())
- Le navigateur envoie automatiquement les rapports à `/api/csp/report`
- Vérifie que les violations sont bien bloquées par le CSP
- Teste aussi l'envoi manuel de rapports

---

## 🔧 Configuration requise

### Backend (FastAPI)
Le middleware CSP doit être configuré dans `backend/app/main.py` :

```python
# Le middleware doit inclure :
"report-uri /api/csp/report;"
```

Et l'endpoint de reporting doit exister :

```python
@app.post("/api/csp/report")
async def csp_report(report: CSPViolationReport):
    # Sauvegarder / traiter le rapport
    return {"status": "reported"}
```

### Frontend (Next.js)
Le CSP du frontend doit être configuré pour déclencher des violations testables :

```html
<!-- Dans _document.js ou _app.js -->
<meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    report-uri /api/csp/report;
">
```

> **Important** : Pour tester les violations, **NE PAS** inclure `'unsafe-inline'` ni les nonces dans les tests.

---

## 📊 Résultat attendu

### Console navigateur (F12)
```
🔍 CSP Violation Test - Starting...

📋 TEST 1: Script inline sans nonce
📋 TEST 2: Ressource externe interdite
📋 TEST 3: eval() - violation unsafe-eval
📋 TEST 4: Function constructor - violation unsafe-eval
📋 TEST 5: Style inline sans nonce

✅ Tests déclenchés. Vérifiez la console pour les violations CSP.
📊 Les rapports CSP devraient être envoyés à : /api/csp/report
```

### Logs backend
```
INFO:     127.0.0.1:54321 - "POST /api/csp/report HTTP/1.1" 200 OK
```

### Fichier de logs (si configuré)
```
csp-1234567890.123,script-src,https://evil.example.com/evil.js,error,http://localhost:3000/test,2024-01-15T10:30:00.000Z
```

---

## ✅ Checklist de validation

- [ ] Backend démarre sans erreur
- [ ] Endpoint `/api/csp/report` accessible (GET/POST)
- [ ] Test Python : `python test_csp_reporting.py` → Tous les tests PASS
- [ ] Page HTML accessible : `http://localhost:3000/test-csp-violations.html`
- [ ] Clics sur les boutons déclenchent des violations dans la console
- [ ] Rapports reçus par le backend (vérifier logs)
- [ ] En production : violation réelle (ex: injection XSS) déclenche un rapport

---

## 🚨 Dépannage

| Problème | Solution |
|----------|----------|
| "Endpoint not found" | Vérifier que la route `/api/csp/report` est bien définie dans main.py |
| "CORS error" | Ajouter l'origine dans CORS middleware ou utiliser `allow_origin_regex` |
| "Aucun rapport reçu" | Vérifier que le CSP inclut `report-uri /api/csp/report;` |
| "Tests Python échouent" | Vérifier que le serveur backend tourne sur le bon port |

---

## 🔐 Sécurité

**NE PAS** laisser ces fichiers en production :
- `test-csp-violations.html` - accessible publiquement
- `test-csp-browser.js` - déclenche des violations
- `test_csp_reporting.py` - peut être utilisé pour spammer l'endpoint

```bash
# Supprimer avant déploiement production
rm frontend/public/test-csp-violations.html
rm frontend/public/test-csp-browser.js
rm test_csp_reporting.py
```