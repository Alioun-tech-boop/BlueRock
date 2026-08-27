# BlueRock — Audit de l'état actuel (Architecture, Sécurité, Données)

> Audit initial réalisé le 17/08/2026 dans le cadre du programme de migration vers une
> plateforme financière professionnelle. Ce document décrit **l'existant** : aucune
> modification de code n'a été faite pour cet audit. Les sévérités (CRITICAL / HIGH /
> MEDIUM / LOW) sont attribuées avec la localisation `fichier:ligne`.

---

## 1. VUE D'ENSEMBLE

BlueRock est une plateforme d'investissement BRVM (Bourse Régionale des Valeurs
Mobilières, UEMOA) + NGX (Nigeria) : cotation temps réel, analyse fondamentale, IA,
portefeuilles virtuels/réels, défis, communauté, KYC, abonnement Pro, connexion
SGI (simulée).

| Composant | Technologie | Emplacement |
|---|---|---|
| Frontend | Next.js 14.0.4 (`output: export` statique), React 18, axios 1.6.2, @supabase/supabase-js 2.112, lightweight-charts 5.2, DOMPurify | `frontend/` |
| Backend | FastAPI 0.141.1, SQLAlchemy 2.0.51, APScheduler, Alembic 1.18.5, PyJWT 2.13, httpx, OpenAI 2.51 | `backend/` |
| Base de données | PostgreSQL 16 hébergée sur **Supabase** (distant, pooler `aws-0-eu-west-2.pooler.supabase.com`) | `DATABASE_URL` |
| Auth | Supabase Auth (GoTrue) : JWT ES256 vérifié par JWKS côté backend ; MFA TOTP ; OTP email ; migration legacy PBKDF2 | `backend/app/core/supabase_auth.py` |
| Paiements | Stripe via 6 Edge Functions Supabase (checkout, webhook, refund, subscribe, statuts) | `supabase/functions/` |
| KYC | Didit (vérification hébergée en iframe + webhooks signés HMAC) | `backend/app/services/didit_provider.py` |
| Hébergement | Render (backend Docker), Netlify (frontend statique), Supabase (DB + Auth + Storage + Edge Functions) | `render.yaml`, `netlify.toml` |
| CI/CD | GitHub Actions (lint + compile, tests en no-op `|| true`) | `.github/workflows/ci.yml` |
| Temps réel | **Aucun** WebSocket/SSE — polling HTTP uniquement | — |

---

## 2. FRONTEND (`frontend/`)

### 2.1 Framework & structure

- Next.js 14 avec `output: 'export'` (100 % statique, pas de SSR), pages dans
  `frontend/src/pages/` (~30 pages + sous-routes `ai-studio/*`, `patrimoine/*`).
- Styles : `globals.css` (thème « TradingView » legacy `--tv-*`), `design.css`,
  `desktop.css`, `responsive.css` + `<style jsx>` dispersés (~13× hex en dur).
- i18n : `src/lib/i18n.js`, ~362 clés FR/EN, helpers `fmtPrice/fmtCompact/fmtChange`.
- Charting maison : `components/MarketChart.js` (canvas, MA/RSI/MACD, dessin).

### 2.2 Routes (pages)

`index` (marché), `explorer`, `quote` (graphique/ordre), `companies`, `company`
(financiers/ratios/scorecard), `screen` (screener), `watchlist`, `portfolio`,
`patrimoine` + sous-routes (`apercu`, `allocation`, `plan`, `contributions`,
`projections`, `parametres`), `challenges`, `community`, `calendar`, `donnees`,
`brokers`, `compte-titre` (SGI), `kyc`, `paiement`, `premium`, `analyst`,
`ai-studio` + sous-routes (`backtest`, `risk`, `portfolio`, `performance`,
`evolution`, `decisions`, `health`, `activity`), `notifications`, `menu`,
`profile`, `login`, `chart`.

### 2.3 Gestion d'état & appels API

- État d'auth : `src/lib/auth.js` (AuthProvider React Context) ; `src/lib/accounts.js`
  (compte actif en localStorage).
- API : `src/services/api.js` — instance axios, `API_BASE` = `NEXT_PUBLIC_API_URL` ou
  **fallback `http://${hostname}:8000`** (HTTP en clair par défaut !), intercepteur
  requête (ajoute `Authorization: Bearer <token>`), intercepteur réponse 401
  (refresh unique dédupliqué, sinon événement `bluerock:session-expired` → logout).
- Cache : mémoire + **persistant** `bluerock_api_cache_v1` (localStorage) pour les
  GET publics, clé `u|a` ne distinguant **pas** les utilisateurs entre eux.

### 2.4 Authentification côté client

- `supabase.auth.signInWithPassword` ; fallback `POST /api/auth/legacy-login`
  (mot de passe PBKDF2, migration) ; MFA TOTP (`mfa.challenge/verify`) ; OTP email
  (`/api/auth/otp/send|verify`) ; reset via `resetPasswordForEmail` + `updatePassword`.
- `persistSession: true` → session Supabase complète (access + refresh) dans
  localStorage `supabase.auth.token` ; access_token dupliqué dans `bluerock_token`.

### 2.5 Stockage local (clés)

| Clé | Contenu | Fichier |
|---|---|---|
| `supabase.auth.token` | access_token + refresh_token (session complète) | supabase.js:8 |
| `bluerock_token` | access_token dupliqué | auth.js:83, api.js:143 |
| `bluerock_user` | profil (email, nom, broker, avatar base64) | auth.js:46 |
| `bluerock_broker_token` | token session SGI/courtier | compte-titre.js:19 |
| `bluerock_admin_token` | **token admin X-Admin-Token** (persisté) | company.js:23 |
| `bluerock_api_cache_v1` | cache GET publics persistant | api.js:55 |
| `bluerock_active_account`, `bluerock_portfolio_v1`, `bluerock_drawings_v1_*`, `bluerock_chat_v1`, `bluerock_favorites_v1`, `bluerock_lang` | préférences/état UI | divers |

### 2.6 Composants critiques

- `components/AiShell.js` + `components/AiBits.js` (studio IA, gating Pro via
  `lib/useAiStudio.js`), `lib/plan.js` (tier), `lib/features.js` (interrupteurs),
  `lib/sanitize.ts` (DOMPurify), `lib/physicsEngine.js`, `components/NetworkBanner.js`,
  `components/PatrimoineShell.js`, `components/ChallengesSection.js`.

---

## 3. BACKEND (`backend/`)

### 3.1 Framework & structure

- FastAPI 0.141.1 (Python 3.13), SQLAlchemy 2.0 (sync), APScheduler (jobs
  in-process : live feed 30 s, NGX 60 s, news 3 min, challenges 60 s, queue drain 5 s).
- Routers montés dans `app/main.py:177-197` : companies, analysis, market, seed,
  ingestion, macro, auth, portfolio, premium, brokers, community, challenges,
  notifications, broker_connect, kyc, kyc_webhook, admin_kyc, payments, subscription,
  ai, ai_admin.

### 3.2 Middlewares (ordre d'exécution, `main.py`)

1. `RequestLoggingMiddleware` (outermost) — log JSON par requête (event=http_request)
   avec X-Request-Id, **sans corps ni en-têtes**.
2. `AllowedHostsMiddleware` — validation Host (400 si refusé), `["*"]` en DEBUG.
3. `SecurityHeadersMiddleware` — CSP (connect-src `'self'` + brvm.org), nosniff, XFO,
   HSTS (prod), Permissions-Policy caméra Didit, cookie `csp_nonce` sans Secure.
4. `CORSMiddleware` — allow_origin_regex : localhost, IP LAN, `*.bluerock.ai`,
   `*.netlify.app` (en DEBUG les IP `\d+\.\d+\.\d+\.\d+`), `allow_credentials=False`.
5. `ResponseCacheMiddleware` (innermost) — cache mémoire GET publics,
   `NO_CACHE_PREFIXES` liste `/api/auth`, `/api/portfolio`, `/api/kyc`, `/api/ai`…
   mais **PAS `/api/admin`** (voir Sec-04).
6. **CSRF : défini (`core/csrf.py`) mais jamais monté** — aucune protection CSRF active.

### 3.3 Auth backend

- `core/supabase_auth.py` : `verify_supabase_jwt` (JWKS ES256, audience
  `authenticated`, issuer Supabase, leeway 30 s), clients admin (création utilisateur,
  set password, session password, storage signé TTL 1 h), bucket `uploads`.
- `routers/auth.py` : `get_current_user` (Header Bearer → claims → `_ensure_profile`,
  auto-création du profil `public.users` au 1er appel), `get_optional_user`,
  `/otp/send|verify` (codes OTP hashés SHA-256 avec SECRET_KEY, SharedStore Redis/mémoire),
  `/legacy-login` (PBKDF2 100k → migration Supabase), `/social-simulate` (désactivé
  par défaut), `/me` (GET/PUT), `/brokers` (catalogue statique).
- Tokens courtier SGI : `core/broker_auth.py` — token maison `BR1.` HMAC-SHA256,
  session en base `broker_sessions` (token_hash SHA-256, TTL 30 min, `revoked_at`),
  PIN haché PBKDF2.
- Admin : `core/security.py` `require_admin` — token statique unique `ADMIN_TOKEN`
  (comparation constante), sans rate limit ni audit.

### 3.4 Services (`app/services/`)

`broker_connect_seed`, `broker_sync` (synchronisation SGI simulée, unidirectionnelle),
`challenge_seed`, `community_seed`, `didit_provider` (signature HMAC webhook),
`economic_calendar`, `financial_store`, `job_worker` (queue KYC), `kyc_flow`,
`kyc_provider`, `llm` (OpenAI/Gemini), `logos`, `ngx_seed`, `order_engine` (exécution
d'ordres, moteur), `predictions`, `premium`, `premium_tracking`, `prices`,
`ratio_calculator`, `rebalancer`, `scoring`, `split_adjust`, `stat_pipeline`,
`stripe_http`, `tier` (tokens IA), `valuation`.

### 3.5 Scrapers (`app/scrapers/`)

`article_content`, `bfin_history`, `brvm_data`, `calendar_feed`, `cobac_extractor`,
`company_feed`, `financial_reports` (PDF officiels), `live_feed` (BRVM toutes les
30 s), `news_feed` (RSS), `ngx_feed`, `ngx_provider`, `pdf_extractor` (pdfplumber +
Tesseract), `persist`, `realtime_scraper`, `_http` (retry/backoff/jitter partagé).

### 3.6 Jobs / queue

- APScheduler in-process (BackgroundScheduler dans `main.py`), pas de Redis requis
  (SharedStore = mémoire par défaut, Redis si `REDIS_URL`).
- `core/job_queue.py` + `services/job_worker.py` : file d'emails et traitement KYC
  en tâche de fond.

---

## 4. BASE DE DONNÉES (PostgreSQL Supabase distant)

### 4.1 Moteur & accès

- PostgreSQL 16 sur Supabase (pooler transactionnel), TLS obligatoire.
- `backend/app/database.py` : pool SQLAlchemy borné (5+10), `pre_ping`, `recycle 300`.
- `init_db()` = `create_all` au démarrage **en plus** d'Alembic (double source de vérité
  du schéma).

### 4.2 Tables (modèles `app/models/`)

| Domaine | Tables |
|---|---|
| Identity/User | `users` (auth_id UUID, tier, tokens IA, TOTP, verrouillage, reset), `user_portfolios` |
| Marché | `companies`, `sectors`, `market_data`, `dividends`, `macro_indicators` |
| Financier | `financial_statements`, `financial_line_items`, `financial_ratios` |
| Analyse | `analysis_reports`, `score_cards`, `valuations` |
| Portefeuille | `portfolios` (balance Float), `positions`, `orders` |
| Premium | `premium_plans`, `premium_snapshots`, `notifications` |
| Défis | `challenges`, `challenge_entries` |
| Communauté | `community_users`, `community_posts`, `community_follows`, `community_reactions`, `community_comments` |
| KYC | `user_kyc` (PII : NIF, id_number, revenus, PEP…), `kyc_verifications` (session Didit, décision JSON), `kyc_webhook_events` (idempotence), `kyc_documents` (**orpheline, jamais alimentée**) |
| Paiement | `deposit_orders` (Float, statuts pending/accepted…, credited flag) |
| SGI | `broker_client_accounts` (pin_hash, account_number clair), `broker_sessions`, `broker_login_events` |
| Broker dossier | `broker_accounts` (KYC SGI) |
| IA | `ai_strategies`, `ai_features`, `ai_models`, `ai_model_versions`, `ai_portfolios`, `ai_positions`, `ai_decisions`, `ai_decision_factors`, `ai_orders`, `ai_executions`, `ai_performance_snapshots`, `ai_risk_snapshots`, `ai_backtests`, `ai_backtest_results`, `ai_evolution_events`, `ai_health_snapshots`, `ai_benchmarks`, `ai_audit_logs`, `ai_data_quality`, `ai_risk_config`, `ai_stress_tests`, `ai_alerts` |
| Divers | `background_jobs` |

### 4.3 Migrations

- Alembic versionné : 7 migrations (`baseline_schema`, index/uniques market_data,
  AI studio core, AI risk, premium tiers, NGX, stripe/challenges).
- `init_db()` (create_all) toujours actif au démarrage → le schéma peut diverger
  des migrations.

### 4.4 Index & contraintes connus

- Uniques `(company_id, date)` sur market_data, `(company_id, fiscal_year)` sur
  financial_statements ; index sur FK principales.
- **Pas d'unicité** sur `(company_id, fiscal_year, statement_type, quarter)`
  (constaté à l'audit précédent, ingestion en 2 commits non atomique).

---

## 5. INFRASTRUCTURE

### 5.1 Hébergement actuel

- **Frontend** : Netlify (statique, `frontend/out`), CSP/headers dans `netlify.toml`,
  `NEXT_PUBLIC_API_URL=https://bluerock-api.onrender.com`.
- **Backend** : Render (Docker, plan free, mono-instance), `render.yaml` (envVars
  secrets `sync: false` = définis dans le dashboard), healthcheck `/api/health`.
- **DB** : Supabase (Postgres + Auth + Storage bucket `uploads` + 6 Edge Functions Stripe).
- **CDN** : aucun (Netlify edge par défaut), pas de Cloudflare actif.
- **Secrets** : `.env` local (gitignoré), variables Render dashboard, anon key dans
  le build frontend (public par nature).

### 5.2 CI/CD

- `.github/workflows/ci.yml` : compile python + `pytest || true` (les tests échouent
  sans erreur !) + `next lint`. Pas de déploiement automatisé, pas de secret scanning,
  pas de SAST.

### 5.3 Docker

- `docker-compose.yml` : postgres:16 (credentials en dur `bluerock123`),
  backend (bind-mount dev, DEBUG=true), frontend (nginx). `backend/Dockerfile` :
  non multi-stage selon l'audit précédent — à revérifier, healthcheck présent.

---

## 6. SÉCURITÉ — INVENTAIRE DES PROBLÈMES

### 6.1 🔴 CRITICAL

| ID | Problème | Impact | Localisation |
|---|---|---|---|
| SEC-01 | **Double crédit du solde** sur `POST /api/payments/orders/{id}/verify` : l'Edge `stripe-session-status` crédite déjà (activateOrder), le backend ré-applique avec un objet SQLAlchemy périmé (`credited=False` en mémoire) → crédit ×2 à chaque retour de checkout | Création monétaire | `backend/app/routers/payments.py:91-98,196-226` + `supabase/functions/_shared/activate.ts` |
| SEC-02 | **Dépôt gratuit sur comptes réels** : `POST /api/portfolio/accounts` permet de créer un compte `type="real"` sans KYC, et `POST .../deposit` crédite tout montant **sans paiement Stripe** (le plafond démo ne s'applique pas aux réels) | Création monétaire | `backend/app/routers/portfolio.py:357-394,410-427` |
| SEC-03 | **Crédit de wallet pour frais de défi** : `apply_payment_status` crédite `Portfolio.balance` pour tout ordre accepted sans vérifier `purpose` → un ordre `challenge_fee` « rembourse » automatiquement l'utilisateur | Création monétaire | `backend/app/routers/payments.py:91-98`, `challenges.py:527-539` |
| SEC-04 | **Bypass d'auth admin via cache HTTP** : `/api/admin/kyc` **n'est pas** dans `NO_CACHE_PREFIXES` → toute personne reçoit la réponse PII en cache pendant 60 s sans token | Fuite PII massive | `backend/app/core/http_cache.py:25-43,61-90` |
| SEC-05 | **JWT access + refresh en localStorage** (2 clés) sans cookie HttpOnly → vol par XSS unique de session durable (SGI + admin en plus) | Prise de contrôle | `frontend/src/lib/supabase.js:8`, `auth.js:83`, `api.js:214` |
| SEC-06 | **Fallback HTTP en clair** pour l'API (`http://${hostname}:8000`) si `NEXT_PUBLIC_API_URL` absent → mots de passe legacy + tokens + KYC en clair (MITM) | Interception | `frontend/src/services/api.js:4-8` |
| SEC-07 | **`print` de debug non conditionné** : les 40 premiers caractères du header `Authorization` (début du JWT, contient sub/email) journalisés en stderr à **chaque** requête authentifiée, en prod | Fuite token/PII en logs | `backend/app/routers/auth.py:361,425` |

### 6.2 🟠 HIGH

| ID | Problème | Localisation |
|---|---|---|
| SEC-08 | **Reset gratuit des tokens IA** : `verify_subscription` re-crédite 500 tokens à chaque appel, sans vérifier `status='accepted'`, sans rate limit | `backend/app/routers/subscription.py:109-138`, `services/tier.py:84-89` |
| SEC-09 | **Webhook Stripe sans contrôle `payment_status==='paid'`** (crédit possible sur `completed` non payé) | `supabase/functions/stripe-webhook/index.ts:34-50` |
| SEC-10 | **Pas d'idempotency key Stripe** (checkout sessions + refunds) → paiement double possible, double remboursement | `stripe-checkout/index.ts:62-86`, `stripe-subscribe/index.ts:50-63`, `stripe-refund/index.ts:41-43` |
| SEC-11 | **Purge totale des comptes SGI à chaque boot** (`delete` tous les `BrokerClientAccount/Session/LoginEvent` + détachement des portefeuilles) → destruction des données à chaque redémarrage, domaine inopérant (aucun endpoint de provisionnement) | `backend/app/main.py:628-639`, `services/broker_connect_seed.py:15-33` |
| SEC-12 | **SGI = simulation présentée comme passerelle réelle** : PIN et synchro 100 % locaux, positions « côté courtier » écrites par la plateforme elle-même, aucun appel externe, `broker_ref` locaux | `core/broker_auth.py`, `services/broker_sync.py:33-46` |
| SEC-13 | **Uploads PDF ingestion jamais supprimés** (fuite disque), SSRF résiduel sur `/api/market/news/article?url=` (bloque localhost mais pas 10.x/192.168.x/169.254.x) | `routers/ingestion.py:82-84`, `routers/market.py` |
| SEC-14 | **Token admin statique unique partagé** (`ADMIN_TOKEN`), aucun rate limit, aucune journalisation d'audit des actions admin ; endpoints `/api/ingestion/*`, `/api/seed/*`, `/api/admin/*`, `/api/ai/admin/*` | `core/security.py:15-20` |
| SEC-15 | **Mot de passe envoyé au fallback legacy** en clair (JSON) — TLS requis mais l'API peut tomber en HTTP (SEC-06) | `api.js:300`, `auth.js:151` |
| SEC-16 | **Pas de supersession/limite des sessions courtier** ; token SGI + admin persistés en localStorage sans expiration côté client | `core/broker_auth.py:42-68`, `compte-titre.js:19`, `company.js:23` |

### 6.3 🟡 MEDIUM

| ID | Problème | Localisation |
|---|---|---|
| SEC-17 | **Balance read-modify-write non atomique** (`SELECT balance` puis `UPDATE balance = balance + x`) sur 2 ordres concurrents | `_shared/activate.ts:70-80`, `payments.py:93-95` |
| SEC-18 | **Montants monétaires en `Float`** (arrondis, erreurs) au lieu de `Numeric`/centimes | `models/payment.py:21`, `models/user.py` (balance) |
| SEC-19 | **Documents KYC legacy** non servis mais laissés sur filesystem (`app/uploads/kyc/{user_id}/`), non chiffrés, sans politique de rétention ; table `kyc_documents` orpheline | `backend/app/uploads/kyc/`, `models/kyc.py:103-115` |
| SEC-20 | **Énumération de comptes SGI** via codes HTTP différents (401 vs 423), divulgation `linked_user_id` à des clients non authentifiés | `broker_connect.py:110-114`, `broker_auth.py:136-143,174-188` |
| SEC-21 | **Verrouillage abusable (DoS ciblé)** : 5 échecs PIN → verrouillage 15 min, contournable par rotation IP | `broker_auth.py:146-153` |
| SEC-22 | **Endpoints `/verify` (paiement + abonnement) sans rate limit** | `payments.py:196`, `subscription.py:109` |
| SEC-23 | **Absence de rate limiting** sur tous les endpoints KYC (`/didit/start` coûte une session Didit) et admin | `routers/kyc.py:164,171,250,280` |
| SEC-24 | **CORS Edge Functions `*`** + `verify_jwt=false` sur 4 fonctions (protégées par service key ou JWT manuel — acceptable mais à restreindre) | `supabase/functions/_shared/cors.ts`, `config.toml` |
| SEC-25 | **`/api/metrics` et `/api/health` publics** sans rate limit (cartographie des routes, état interne) | `main.py:1035-1060` |
| SEC-26 | **CSP backend `connect-src 'self' https://www.brvm.org`** (les appels vers Supabase/API externe depuis une page servie par le backend seraient bloqués) + cookie `csp_nonce` sans Secure ; `report-uri` mal monté (404) | `main.py:111-130` |
| SEC-27 | **Validation Pydantic insuffisante** sur KYC (énumérations libres, consentement auto-déclaré), `holdings` JSON non validé, `broker_name` libre, montants non bornés côté Edge | `kyc.py:126-204`, `broker_connect.py:210-223`, `brokers.py:29` |
| SEC-28 | **DB credentials en dur par défaut** (`bluerock:bluerock123@localhost`) et `DIDIT_CALLBACK_URL` localhost par défaut | `config.py:12,43` |

### 6.4 🟢 LOW

| ID | Problème |
|---|---|
| SEC-29 | Tests CI no-op (`pytest \|\| true`), pas de secret scanning/SAST/DAST |
| SEC-30 | `console.warn` frontend journalisant préfixe des tokens (`api.js:145,301`) |
| SEC-31 | Logout partiel : ne purge pas `bluerock_broker_token`, `bluerock_active_account`, cache API |
| SEC-32 | Cache persistant non isolé par utilisateur (clé `u|a`) |
| SEC-33 | Sessions/audit SGI jamais purgés (accumulation), `account_number` en clair dans `broker_login_events` |
| SEC-34 | TOCTOU sur `/link` SGI, commit intermédiaire par `audit()` |
| SEC-35 | N+1 résiduels + pas de pagination sur certains GET (performance/DoS doux) ; `ilike %search%` sans échappement |

### 6.5 Conformités vérifiées (points positifs à préserver)

- Signature webhook Stripe vérifiée (constructEvent) ; montants lus en base, jamais du client.
- Webhook Didit : HMAC double (canonical JSON + raw), fenêtre anti-rejeu 300 s,
  idempotence par event_id.
- JWT Supabase vérifié côté backend (JWKS, audience, issuer) ; aucun accès DB public.
- PIN SGI hachés PBKDF2 100k, tokens HMAC signés, sessions révocables serveur-side.
- `allow_credentials=False`, CORS regex restreint, `allowedDevOrigins` explicites.
- Les GET `/api/portfolio`, `/api/payments`, `/api/auth/*` sont exclus du cache HTTP.
- Gating Pro IA actif (`require_ai_pro`, 403 + `X-BlueRock-Code: plan_required`).
- Rate limiting présent sur login/OTP/ordres/community/market refresh (SharedStore).
- Aucun secret Stripe côté frontend ; `.env`/`.env.local` gitignorés (seul
  `.env.example` est versionné).

---

## 7. INVENTAIRE DES ROUTES API (préfixe `/api`)

### Public (lecture, cache TTL)
`/companies`, `/companies/sectors`, `/companies/top-performers`,
`/companies/{id}/ratios|financials|valuation|scorecard|market-data|full`,
`/market/overview|live|ngx|indices|sparklines|news|news/article|calendar|announcements|sectors`,
`/macro`, `/macro/latest`, `/analysis/screen`, `/auth/brokers`, `/health`, `/metrics`.

### Authentifié (JWT Supabase)
`/auth/me` (GET/PUT), `/portfolio/*` (complet : accounts, orders, positions, deposit,
withdraw, demo-activate), `/premium/*`, `/notifications/*`, `/kyc/*`, `/brokers/*`,
`/community/*` (posts, users, follow, react, comment), `/challenges/*`,
`/payments/deposit|orders|orders/{id}/verify`, `/subscription/*`,
`/analysis/ask`, `/analysis/companies/{id}/analyze|predict|report`,
`/ai/*` (studio : status, decisions, portfolio, performance, risk, alerts, exports…,
requiert Pro).

### Admin (`X-Admin-Token`)
`/seed/*`, `/ingestion/pdf|fetch|statements|summary`, `/macro/seed`,
`/admin/kyc*`, `/ai/admin/*`, `/brokers/{id}/review|progress`.

### Non authentifié (à auditer)
`/auth/otp/send|verify`, `/auth/legacy-login`, `/auth/social-simulate` (désactivé),
`/broker-connect/auth` (PIN, rate limit 5/min), `/webhooks/didit` (signature HMAC),
`/market/refresh` (auth + 5/min), `/csp/report`.

---

## 8. SERVICES EXTERNES

| Service | Usage | Clés |
|---|---|---|
| Supabase (Postgres + Auth + Storage + Edge) | DB, JWT, bucket `uploads`, Stripe Edge Functions | URL + anon (public) + **service role (backend only)** |
| Stripe | Checkout, webhook, refund, subscriptions | **Aucune clé dans le repo** (Edge Functions, secrets dashboard) |
| Didit | KYC hébergé | `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` |
| OpenAI / Gemini | Analyste IA, rapports | `OPENAI_API_KEY`, `GEMINI_API_KEY` (clé OpenAI retirée du repo à l'audit précédent) |
| BRVM / NGX / RSS | Données marché | `NGN_MARKET_API_KEY` |
| Brevo / SMTP Gmail | Emails transactionnels | `BREVO_API_KEY`, `SMTP_USER/PASS` |
| Redis (optionnel) | SharedStore partagé | `REDIS_URL` |

---

## 9. PLAN DE MIGRATION PROPOSÉ (adapté à l'existant)

Conformément à la mission, migration **progressive, contrôlée, réversible** sur
l'existant (pas de réécriture) :

1. **Phase 0 — Audit (ce document) + branche de migration + backup vérifié.**
2. **Phase 1 — CRITICAL monétaire/sécurité** : SEC-01/02/03 (idempotence dépôt
   rechargée + `purpose` + compte real verrouillé KYC), SEC-04 (admin hors cache),
   SEC-07 (retrait prints), SEC-05/06 (cookie HttpOnly en prod + HTTPS forcé),
   SEC-11 (fin de la purge au boot).
3. **Phase 2 — Environments** : dev/staging/prod séparés (DB, secrets, URLs).
4. **Phase 3 — Secrets** : fichier `docs/security/secrets-management.md`, préparation KMS.
5. **Phase 4 — Auth** : refresh rotatif Supabase natif, logout global, devices,
   historique de connexion, Argon2id côté legacy.
6. **Phase 5 — Authorization** : RBAC (USER/ANALYST/SUPPORT/COMPLIANCE/SECURITY/
   ADMIN/SUPER_ADMIN), permissions granulaires, fin du `require_admin` token unique.
7. **Phase 6 — User data** : DTO séparés du modèle, classification des données.
8. **Phase 7 — KYC** : purge `app/uploads/kyc`, rate limit, audit admin.
9. **Phase 8 — Portfolio service** : domaine isolé, ownership checks systématiques.
10. **Phase 9 — Ledger** : `ledger_accounts`/`ledger_entries`, double entrée,
    écritures correctives (au lieu de `UPDATE balance`).
11. **Phase 10 — Transaction Engine** : pipeline auth → authz → validation → risk →
    idempotency → transaction → ledger → external → confirmation → audit → notif.
12. **Phase 11 — Idempotency keys** sur ordres/dépôts/retraits/sync SGI.
13. **Phase 12 — SGI Connector** réel (interface, pas de credentials en clair) +
    **Reconciliation Engine** (écarts → RECONCILIATION_REQUIRED, jamais masqués).
14. **Phase 13 — Market Data pipeline** (ingestion validée + Redis + TTL).
15. **Phase 14 — Queues** (job_queue → worker réel) et **WebSocket** (prix, ordres).
16. **Phase 15 — Audit service** (events login/logout/ordres/admin, jamais de secrets).
17. **Phase 16 — Observability** (/health /ready /metrics, correlation_id).
18. **Phase 17 — API security** (validation stricte, pagination obligatoire,
    rate limiting multi-niveaux) + `docs/security/api-security.md`.
19. **Phase 18 — Cloudflare PREPARED (pas actif)** : `docs/infrastructure/cloudflare.md`.
20. **Phase 19+ — Tests sécurité, régression, perf, scaling, prod hardening.**

**Règle de passage** : chaque phase ne commence qu'avec tests verts, build OK,
aucune fonctionnalité critique cassée, backups vérifiés.

---

## 10. RISQUES RÉSIDUELS IMMÉDIATS (à traiter avant tout développement)

1. Le bug de login/session (déconnexion immédiate après connexion) doit être résolu
   et testé E2E — il bloque la validation de toutes les phases suivantes.
2. La console de debug `[AUTHDBG]` doit être retirée (fuite token en logs, SEC-07).
3. Aucun mot de passe n'est connu pour les comptes de test Supabase existants —
   prévoir un seed/test dédié hors production.
4. La base est l'instance Supabase **production** partagée avec le dev : la
   séparation d'environnements (Phase 2) est un prérequis de toutes les migrations.
