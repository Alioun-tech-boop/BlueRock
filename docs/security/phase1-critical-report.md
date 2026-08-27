# Phase 1 — Bridage des vulnérabilités CRITICAL (rapport)

> Branche : `migration/phase1-critical` — Date : 17/08/2026
> Périmètre : fixes de sécurité de niveau CRITICAL (monnaie + auth + cache)
> + préparation de la migration (branche, backup). Aucune fonctionnalité
> ajoutée ; les flux existants sont préservés.

---

## 1. Base de migration

- **Branche git** : `migration/phase1-critical` créée depuis `main`
  (worktree préexistant non commité laissé en l'état, hors périmètre).
- **Backup** : `backups/bluerock_backup_2026-08-17.dump` (custom format,
  pg_dump PostgreSQL 18), **vérifié** — 1705 objets listés par `pg_restore -l`.
  Gitignoré (`backups/`).

## 2. Fixes appliqués

| ID | Problème | Correctif | Fichiers |
|---|---|---|---|
| SEC-01 | Double crédit `payments/verify` (objet SQLAlchemy périmé + Edge) | Crédit **atomique** : `db.refresh(order)` puis UPDATE conditionnel `WHERE credited = false` (1 ligne gagnée = seul créditeur) + `with_for_update()` sur le portefeuille | `backend/app/routers/payments.py` |
| SEC-02 | Compte réel sans KYC + dépôt gratuit en crédit direct | Compte `real` interdit sans KYC vérifié (`kyc_verified`, pattern challenges.py) ; dépôt direct sur compte réel refusé (403) — seule la voie `/api/payments/deposit` (Stripe) reste valable | `backend/app/routers/portfolio.py` |
| SEC-03 | Crédit wallet abusif via `challenge_fee` | Le crédit balance est réservé aux ordres `purpose='deposit'` ; les `challenge_fee` sont marqués `accepted` sans toucher au solde (gérés par l'Edge : inscription paid + portefeuille virtuel) | `backend/app/routers/payments.py` |
| SEC-04 | `/api/admin/kyc` re-servi par le cache HTTP sans token | `/api/admin`, `/api/payments`, `/api/subscription`, `/api/challenges` ajoutés à `NO_CACHE_PREFIXES` | `backend/app/core/http_cache.py` |
| SEC-07 | JWT en clair dans les logs (prints `[AUTHDBG]`) | Suppression des prints dans `_claims_from_token` et `get_current_user` | `backend/app/routers/auth.py` |
| SEC-05/16 | Tokens (utilisateur, SGI, admin) persistants en localStorage | Migration vers **sessionStorage** (effacés à la fermeture du navigateur) ; purge complète au logout/déconnexion (token Supabase, broker, admin, compte actif, cache API) | `frontend/src/lib/auth.js`, `services/api.js`, `pages/company.js`, `pages/compte-titre.js` |
| SEC-06 | Fallback API en clair `http://<hostname>:8000` | Le fallback HTTP est limité à localhost (dev) ; hors dev, en l'absence de `NEXT_PUBLIC_API_URL`, les appels sont relatifs (même origine, HTTPS) | `frontend/src/services/api.js` |
| SEC-09 | Webhook Stripe créditait des sessions **non payées** | `checkout.session.completed` ignoré si `payment_status !== 'paid'` | `supabase/functions/stripe-webhook/index.ts` |
| SEC-22 | `/api/payments/orders/{id}/verify` sans rate limit | Rate limit 10/min ajouté (même règle que `/deposit`) | `backend/app/routers/payments.py` |
| SEC-11 | Purge destructrice des comptes SGI à **chaque boot** | Suppression de l'appel automatique au démarrage ; la purge reste disponible en one-shot manuel | `backend/app/main.py` |
| SEC-30 | `console.warn` journalisant le préfixe du token | Retiré de l'intercepteur axios | `frontend/src/services/api.js` |

## 3. Vérifications

| Vérification | Résultat |
|---|---|
| `python -m compileall backend/app` | OK |
| `python -m compileall app` (venv backend) | OK |
| Import `app.main` (venv backend) | OK |
| `pytest tests --ignore=tests/test_security.py` (venv backend) | 1 passed (36 warnings, préexistants) |
| `npm run build` (frontend) | OK (export statique complet) |
| `node --check` sur les fichiers JS modifiés | OK |
| `npm run lint` | Bloqué par souci d'outillage préexistant (parser @typescript-eslint manquant) — non lié aux changements |

Note : le « test » SGI `backend/tests/test_broker_connect_flow.py` est un script
d'exercice (exécution au module level, crée des données en base), pas un test
pytest — il n'est pas collecté (le seul test pytest collecté est le flux défi
virtuel).

## 4. Points d'attention / à traiter ensuite

- **Nettoyage encodage** : `auth.js` et `compte-titre.js` contenaient avant
  cette phase des caractères corrompus (encodage Windows-1252 détecté) —
  réécrits en UTF-8 pur.
- **Le login utilisateur reste à valider E2E** (bug de déconnexion immédiate
  constaté avant cette phase) — cf. audit, section 10.
- **SEC-05 veut un vrai fix** en Phase 4 : cookies HttpOnly + refresh côté
  backend ; sessionStorage n'est qu'une atténuation.
- **Données historiques suspectes** : double crédit/ordres abusifs passés
  (SEC-01/02/03) restent dans la base — prévoir une passe de réconciliation
  avant de réhabiliter les soldes réels (Phase 9/10 Ledger).
- **Secrets** : penser à redéployer les Edge Functions (`supabase functions
  deploy stripe-webhook`) pour que le contrôle `payment_status` soit actif en
  production.

## 5. Fichiers modifiés (diff vs main)

```
backend/app/core/http_cache.py        # SEC-04 (+ admin, payments, subscription, challenges)
backend/app/main.py                   # SEC-11 (purge boot désactivée)
backend/app/routers/auth.py           # SEC-07 (prints retirés)
backend/app/routers/payments.py       # SEC-01, SEC-03, SEC-22 (crédit atomique + rate limit)
backend/app/routers/portfolio.py      # SEC-02 (KYC réel + dépôt direct bloqué)
frontend/src/lib/auth.js              # SEC-05/16 (sessionStorage + purge)
frontend/src/services/api.js          # SEC-05/06/30 (getToken, fallback localhost, warn retiré)
frontend/src/pages/company.js         # SEC-16 (token admin → sessionStorage)
frontend/src/pages/compte-titre.js    # SEC-16 (token SGI → sessionStorage)
supabase/functions/stripe-webhook/index.ts  # SEC-09 (payment_status === 'paid')
backups/bluerock_backup_2026-08-17.dump    # backup vérifié (gitignoré)
docs/architecture-current-state.md    # audit de référence
docs/security/phase1-critical-report.md   # ce rapport
```