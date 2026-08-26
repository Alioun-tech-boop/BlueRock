# Rapport de durcissement — BlueRock (lots A–I)

Date : 2026-08-17 — Branche : `migration/phase1-critical`

## Périmètre
Durcissement « défense en profondeur » complet appliqué sur le backend FastAPI,
le frontend Next.js et la base Supabase (PostgreSQL distante), sans rebuild.

## Lots réalisés

### A. Secrets
- Scan de 348 fichiers suivis par git : aucun secret (Stripe live, AWS, GitHub,
  Google, chaînes de connexion PostgreSQL avec mot de passe).
- Document `docs/security/secrets-management.md` : inventaire, rotation, checklist pré-déploiement.

### B. Rate limiting global (middleware)
- Nouveau `backend/app/core/rate_limit_middleware.py` : **240 req/min/IP** global
  + règles par préfixe (`/api/auth` 20/min, `/api/kyc` 10/min, `/api/admin` 10/min,
  `/api/payments` 15/min, `/api/ai` 30/min, `/api/portfolio` 45/min…).
- Monté **le plus externe** dans `main.py` (juste après le RequestLoggingMiddleware) :
  toute requête est comptée avant routing.
- Les endpoints sensibles gardent leurs gardes locales (`check_rate_limit`).

### C. RBAC
- Colonne `users.role` : `user | analyst | support | compliance | security | admin | super_admin`.
- `require_admin` = RBAC **d'abord** (JWT `role`) + fallback `ADMIN_TOKEN` (transition).
- Fabrique `require_role(min_role)` + ordre `ROLE_LEVELS`.
- Migration `e5f7a1b3c9d2_rbac_roles_and_session_invalidation.py` appliquée (remote).

### D. Invalidation de session
- Colonne `users.session_valid_from` (timestamptz NOT NULL défaut now()).
- `get_current_user` rejette tout JWT dont `iat < session_valid_from` → 401.
- `POST /api/auth/logout` : set `session_valid_from=now()` + écriture audit log.
- Frontend : logout = API logout + `supabase.auth.signOut()` + purge
  `bluerock_token`/`bluerock_admin_token`/`bluerock_broker_token` (sessionStorage).

### E. Validation stricte + verrous
- `OrderRequest` : symbole `^[A-Za-z0-9._\-]+$`, `buy|sell`, qty ≤ 1e6, prix ≤ 1e9.
- `AccountRequest`, `AmountRequest` (≤ 1e9), `ChallengeOrderRequest` : mêmes bornes.
- `with_for_update()` sur dépôt / retrait / placement d'ordre → aucune course solde.

### F. Ledger double entrée
- Modèles `LedgerAccount` / `LedgerEntry` (`idempotency_key` UNIQUE).
- Service `record_ledger_entries` (idempotent) + `journal_deposit`,
  `journal_withdraw`, `journal_investment` (buy/sell).
- Intégration : crédit Stripe (`payments.py`), dépôt/retrait/`_execute` (`portfolio.py`) —
  écriture ledger **avant** mise à jour du solde.
- Migration `a2b4c6d8e0f1_ledger_double_entry.py` appliquée (remote).

### G. KYC / uploads
- Suppression de `backend/app/uploads/kyc/` (45 placeholders PNG 1×1) ; plus
  aucune écriture de code vers ce dossier. Aucun fichier utilisateur exécutable.

### H. Audit log + readiness
- Modèle `AuditLog` + helper `audit()` (filtre des clés `password`, `token`,
  `pin`, `authorization`) + migration `f3e5d7a9b1c3_audit_log.py` appliquée (remote).
- Événements tracés : `logout`, `deposit_requested`, `deposit_confirmed`,
  `demo_deposit`, `withdraw`, `order_placed` (avec IP + user-agent).
- `GET /api/health/ready` : DB + migrations à jour (`current == head`).

### I. Bornes de listes & pagination
- Endpoints paginés déjà bornés (`ge`/`le`) vérifiés : companies (≤300), screening
  (≤200), community (≤50/200), notifications, top performers.
- `GET /api/market/news` borné `Query(50, ge=1, le=200)` (était 500 sans borne).

## Corrections bonus (bugs latents révélés par la suite de tests)
- `auth.py` : `logger` utilisé sans import → `NameError` → 500 au lieu de 401
  sur les requêtes sans token (pré-existant).
- `pytest.ini` : exclusion de `tests/test_broker_connect_flow.py` (script
  module-level connecté à la base, non pytest) qui interrompait la collection.
- `tests/test_challenge_virtual_flow.py` : étape 409 ajustée — qty 100M rejetée en
  422 (borne sécurité, corrélée au Lot E) ; nouveau **409** réaliste calculé sur
  le prix du marché.

## Vérifications
| Contrôle | Résultat |
|---|---|
| `python -m compileall -q app` + `import app.main` | OK |
| pytest (serveur live :8001, `BLUEROCK_TEST_URL`) | **18 passed, 3 skipped, 0 failed** |
| `npm run build` (Next.js) | OK (chunks produits) |
| `GET /api/health` | healthy (DB ok) |
| `GET /api/health/ready` | ready — migrations `f3e5d7a9b1c3 == head` |
| Scan secrets fichiers suivis | propre |
| Backup PostgreSQL `backups/bluerock_backup_2026-08-17.dump` | vérifié (1705 objets) |

## Relance du backend
Le serveur live précédent (ex-PID 20428) n'est plus joignable pour kill
(port 8000, objet dans une autre session). La validation finale s'est faite sur
`127.0.0.1:8001` (processus 14532/21440, démarré sans `--reload`). Une relance
propre de l'instance de production sur 8000 devra passer par un arrêt manuel du
processus 20428 puis `uvicorn app.main:app --port 8000` (sans `--reload`).

## Restes recommandés (backlog)
1. Promouvoir en base le rôle admin sur le compte opérateur (id 25) — one-shot.
2. `correlation_id` global + journalisation structurée (observabilité).
3. Rotation `ADMIN_TOKEN` avant mise en prod + suppression du fallback legacy
   une fois les comptes RBAC promus.
4. Redéploiement Supabase : `stripe-webhook` (guard `payment_status === 'paid'`).
5. Réévaluation : seuil global 240/min + quotas fin par IP à régler sur le trafic réel.