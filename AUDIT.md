# AUDIT STRATÉGIQUE BLUEROCK — Plateforme d'investissement BRVM

> Objectif : faire de BlueRock **la plateforme n°1 mondiale d'investissement sur la BRVM**, au niveau des standards Silicon Valley (TradingView, eToro, Robinhood, Interactive Brokers).
> Audit réalisé sur l'espace de travail canonique `C:\Users\HP\Downloads\BlueRock` (la copie `Mon_kiosque\BlueRock` est obsolète — à supprimer pour éviter toute confusion).
> Priorités : **P0** = urgence (sécurité/intégrité), **P1** = 6 prochaines semaines, **P2** = 4-8 mois.

---

## 1. RÉSUMÉ EXÉCUTIF

### Verdict
BlueRock est un **prototype impressionnant mais inachevé** : une coquille mobile-first élégante (17 pages, graphique canvas maison, i18n FR/EN, auth démo/réel avec 10 courtiers, portefeuille et ordres validés) posée sur un backend qui mêle **vraies données BRVM (cours, indices) et données 100 % synthétiques (financiers, historique, dividendes)** présentées comme réelles. C'est le point n°1 qui empêche toute crédibilité de plateforme « n°1 » : **personne n'investit sur des états financiers fabriqués au hasard.**

### Les 10 actions les plus importantes (Top 10)
| # | Action | Impact | Priorité |
|---|---|---|---|
| 1 | **Révoquer la clé OpenAI réelle commitée dans `backend/.env`** + déplacer les secrets hors du repo | Critique — vol de clé = coût = XSS | P0 |
| 2 | **Marquer/écarter toutes les données synthétiques** (`is_synthetic`, provenance `SYNTHETIC`) et les exclure des écrans « réels » ; remplacer le random-walk et les états financiers inventés par des vraies données | Fondation de la crédibilité | P0 |
| 3 | **Fermer les endpoints à effet de bord publics** : `POST /api/seed/all`, `/api/market/refresh`, `/api/ingestion/pdf`, `/api/analysis/ask` → auth + rate limiting | Sécurité + coûts | P0 |
| 4 | **Tokens d'authentification avec expiration + refresh** ; rate limiting sur `/api/auth/login` ; cookies HttpOnly en prod | Sécurité compte = argent | P0 |
| 5 | **Supprimer le code mort dangereux** : `brvm_scraper.py` (fake data injectables), `brvm_real_data.json` (60 entrées dont 13 symboles corrompus), fallbacks factices de `pdf_extractor.py` | Intégrité | P0 |
| 6 | **Retry + backoff + jitter + rate limiting sur tous les scrapers** ; horodatage de fraîcheur exposé à l'UI | Fiabilité | P0 |
| 7 | **Migration Alembic réelle + contrainte d'unicité `(company_id, date)`** sur `MarketData` ; épingler `requirements.txt` | Reproductibilité | P0 |
| 8 | **Corriger les N+1** (`_enrich_company`, overview, financials, `ratio_calculator`) + cache Redis + pagination du screener | Performance | P1 |
| 9 | **Vraie donnée temps réel** : table intraday + diffusion WebSocket/SSE vers l'UI (fini le polling) | Différenciateur | P1 |
| 10 | **PWA + SEO + fonts + thème unique** : manifest, service worker, title/meta/og/sitemap, mode clair, design system unique | Professionnalisme | P1 |

---

## ⚡ AUDIT DU 03/08/2026 — ÉTAT ACTUEL VÉRIFIÉ (le « tous derniers »)

> Audit exécuté le 03/08/2026 : serveurs en marche (backend :8000, frontend :3000, Postgres :5432), 20/20 tests verts, données inspectées en base et via l'API live.

### Ce qui a changé depuis le 02/08 (bonnes nouvelles)

| Item | Constat vérifié aujourd'hui |
|---|---|
| **États financiers RÉELS ingérés** | 96 états (389 postes) pour ~30 sociétés : annuels 2024/2025, Q1 2026 (BICB, ECOC, NSBC, SDCC, SIBC), Q2 2026 (SNTS). `financial_synth=0`. 48 ratios calculés (SCRC : EPS 126,2 · P/E 29,3 · P/B 2,9). **La plateforme a désormais de vraies données fondamentales.** |
| Clé OpenAI | `OPENAI_API_KEY` **vide** (retirée) ✅ ; `SECRET_KEY`/`ADMIN_TOKEN` présents (64/68 chars) |
| Tests | **20/20 pytest verts** (relancés : auth, 403/401, rate limit 429, fraîcheur, zéro synthétique) ✅ |
| Lint frontend | `next lint` : **0 erreur** (warnings `<img>`/hooks seulement) ✅ |
| Live BRVM | 47 prix scrapés, statut **LIVE**, scheduler 30 s actif ; news 60 items (10 BRVM + 40 presse) ; logos 45/47 en `/static/logos/` ✅ |
| Vieux code | `brvm_scraper.py`, `brvm_real_data.json` absents ✅ ; copie `Mon_kiosque\BlueRock` **supprimée** ✅ |

### Problèmes trouvés aujourd'hui (à corriger)

**P0 — Intégrité des données :**
1. **Message faux servi au public** : `/api/market/overview` renvoie `freshness.note = "l'historique 2020-2026 et les états financiers sont des données de démonstration synthétiques"` (`backend/app/routers/market.py:162`) — **l'inverse de la vérité** depuis l'ingestion des vrais PDF. À corriger : « états financiers réels (source : rapports officiels des émetteurs) ».
2. **Le live feed écrit le week-end** (`live_feed._persist_db`) : la base contient des lignes pour **dimanche 02/08** et lundi 03/08 (mêmes prix ×2), et **la clôture réelle du vendredi 31/07 (dernière séance) n'existe plus** → historique = 2 points identiques, `prev_close`, sparklines, P/E et graphiques faussés. Ajouter un garde « jour ouvré » (pas de persistance samedi/dimanche/férié) + ne jamais écraser la dernière séance réelle.
3. **`volume` codé en dur à 0** (`live_feed._persist_db`, `realtime_scraper.update_db_prices`) → marché affiché sans liquidité.

**P1 — Fonctionnement :**
4. **`/api/analysis/screen` renvoie `[]`** : le screener inner-jointe les ScoreCards, or `scorecards=0` en base → lancer `analyze` sur les ~30 sociétés à états réels (ou un job batch) pour générer scorecards + valuations + rapports ; la page Screen et Top Performers resteront vides tant que ce n'est pas fait.
5. **N+1 résiduel** dans `_prefetch_context` : la boucle « Résultat net » fait ~1 requête par société ayant des états (~30 requêtes).
6. **Pas d'unicité** `(company_id, fiscal_year, statement_type, quarter)` sur `financial_statements` + ingestion en 2 commits (non atomique).
7. **SSRF résiduel** : `GET /api/market/news/article?url=` est public et ne bloque que `localhost/127.0.0.1/::1/0.0.0.0` — un attaquant peut sonder `169.254.169.254`, `10.x`, `192.168.x` → restreindre aux domaines publics (allowlist) ou bloquer les plages privées.
8. **Community = faux social** : `community.js` contient toujours des posts fictifs (« iamkingmh », « Franck_Trader ») avec graphiques SVG fabriqués et dates en dur — retirer tant qu'il n'y a pas de vrais utilisateurs.
9. **PWA incomplète** : `manifest.json` avec mojibake (« BlueRock ? »), icône = data-URI unique, **aucun service worker** → pas d'offline malgré la promesse du déploiement.
10. **CI incomplète** : le job pytest de `ci.yml` est un no-op (`echo … || true`) — les tests d'intégration ne tournent jamais en CI.
11. **Fonts** : le `<link>` Google Fonts est dans `_app.js` (warning Next.js) → le déplacer dans `_document.js`.

**P2 — Rappel roadmap :** trading calendar (voir P0-2), intraday + WebSocket/SSE, cookies HttpOnly, Alembic versionné, tests frontend (aucun), volume réel, historique reconstitué jour par jour.

### État de la base (Postgres, vérifié)

`companies=47 · market_data=94 (2 j × 47, 100 % BRVM_LIVE, 0 synthétique) · financial_statements=96 (0 synthétique) · financial_line_items=389 · financial_ratios=48 · dividends=0 · scorecards=0 · valuations=0 · analysis_reports=0 · users=25 (2 « réel ») · orders=14 · positions=4 · macro=36`

---

## ⚙️ STATUT DES CORRECTIFS (mise à jour du 02/08/2026)

| # Top10 | Action | Statut |
|---|---|---|
| 1 | Clé OpenAI commitée | ✅ Retirée de `.env` (vide) — **la clé `sk-proj-…` doit être révoquée dans la console OpenAI** ; `.gitignore` ajouté |
| 2 | Données synthétiques marquées | ✅ **100 % purgées** : suppression en base (80 699 lignes `is_synthetic` : historique 2020→2026, 705 états financiers, 236 dividendes, 48 ratios, 52 scorecards, 52 valorisations, 51 rapports IA) ; `seed.py` réécrit (ne crée plus que les 47 sociétés réelles, zéro génération) ; profils fictifs (`_demo_company_profile`) supprimés → `profile: null` ; `analyze`/`predict` → 422 tant qu'aucun état financier réel n'est ingéré (PDF officiels) ; états vides explicites côté UI (profil, financiers, actionnaires, analyse IA) ; badge « Données démo » conservé par précaution si une future ingestion marquait du contenu |
| 3 | Endpoints publics à effet de bord | ✅ `seed/*` + `ingestion/pdf` + `macro/seed` → `X-Admin-Token` ; `market/refresh` → auth + 5/min/IP ; `analysis/ask` → auth + 10/min/IP + quota 50/j/utilisateur ; `analyze` → auth ; `statements` → auth |
| 4 | Tokens avec expiration | ✅ `{hex}.{exp}` TTL 7 j (`AUTH_TOKEN_TTL_SECONDS`) + fallback tokens legacy ; rate limit login 10/15 min/IP (cookie HttpOnly = P2, non bloquant) |
| 5 | Code mort dangereux | ✅ `brvm_scraper.py`, `brvm_real_data.json` supprimés ; fallbacks factices `pdf_extractor` remplacés par erreurs explicites (422/500) |
| 6 | Scrapers fiables | ✅ retry/backoff+jitter partagé (`scrapers/_http.py`), throttle 0,4-1,2 s sur les 47 fiches, aucun prix 0/négatif persisté, `freshness` exposé dans `/api/market/overview` |
| 7 | Migrations/contraintes | ✅ Uniques `(company_id, date)` et `(company_id, fiscal_year)` + `is_synthetic` via `_ensure_schema()` (Alembic versionné = P2, schéma idempotent suffit) ; `requirements.txt` épinglé, 7 dépendances mortes retirées (celery, prophet, langchain, langchain-openai, redis, alembic, pandas) + recharts (front) |
| 8 | N+1 + perf | ✅ `_prefetch_context` (liste 47 sociétés : ~7 requêtes au lieu de ~250), top-performers batché, `joinedload` financials, `RatioCalculator` en 1-2 requêtes, screener paginé (skip/limit ≤ 200), TTL caches existants conservés (overview 5 min, live feed mémoire) |
| 9 | Temps réel | ⏳ Polling conservé ; WebSocket/SSE = P1 roadmap (table intraday en dépend) |
| 10 | PWA/SEO/fonts | ✅ manifest.json, meta description/OG/theme-color, fonts Inter + JetBrains Mono chargées, ESLint configuré ; mode clair et service worker = P2 |

**Autres items réalisés** : docs API fermées si `DEBUG=false` · TrustedHost + SecurityHeaders (CSP, nosniff, XFO, HSTS) · guard 401 global côté front (redirect `/login`) · Top5/Flop5 localisés · `community.js` nettoyé (posts BRVM : ETIT/SNTS) · Dockerfiles multi-stage (backend + frontend nginx) + healthchecks · `docker-compose.yml` aligné (redis retiré) · CI GitHub Actions · `DEPLOYMENT.md` mis à jour · **20 tests pytest verts** (auth, 401/403, rate limit, fraîcheur, absence totale de données synthétiques).

---

## 2. ÉTAT DES LIEUX HONNÊTE : RÉEL vs SYNTHÉTIQUE

C'est LA question que tout investisseur se posera. Tableau de vérité :

| Donnée | Statut actuel | Détail |
|---|---|---|
| Cours de clôture 47 titres | ✅ Réel | Scraping `brvm.org` (snapshot 2026-07-31, live feed toutes les 30 s en séance) |
| Indices BRVM-C/30/PRES | ✅ Réel (partiellement utilisé) | Le vrai jeu d'indices existe dans `brvm_real_data.json`… **mais n'est chargé par aucun module** |
| Capitalisation, volume journée | ⚠️ Réel mais partiel | `value` échangée = `null` pour 47/47 ; volume live = 0 codé en dur |
| Historique quotidien 2020→2026 | ✅ **Purgé** | 80 699 lignes synthétiques supprimées ; seuls les points réels scrapés restent (le vrai historique sera reconstitué jour par jour) |
| États financiers 2020-2024 | ✅ **Purgés** | 705 états synthétiques supprimés ; la plateforme n'affiche plus aucun état inventé — uniquement les PDF officiels ingérés (is_synthetic=false) |
| Dividendes | ✅ **Purgés** | 236 lignes inventées (dates « 1er juin / 15 juillet ») supprimées |
| Ratios/score/valorisation/prédictions | ✅ **Désactivés sans données réelles** | `analyze`/`predict` → 422 tant que les états réels ne sont pas ingérés ; écrans UI affichent « Données indisponibles » |
| News | ✅ Réelles | RSS BRVM + Google + Bing, mais non persistées (perdues au restart) |
| Macro (PIB, inflation, BCEAO) | ⚠️ Hardcodé/figé | Valeurs de référence fixes ; EUR/FCFA 655,957 correct mais pas de $, NGN… |
| Analyse IA | ⚠️ Vraie API OpenAI mais contexte restreint + fallback textes figés | Fallback rule-based renvoie le même texte pour toutes les sociétés |

**Conséquence : le scoring, la valorisation, les prédictions et l'IA sont désormais **désactivés** tant que de vrais états financiers ne sont pas ingérés (422 explicite côté API, « Données indisponibles » côté UI) — plus aucun calcul sur du bruit aléatoire. La prochaine étape est d'alimenter la plateforme avec les rapports financiers réels des émetteurs (ingestion PDF admin déjà en place).**

---

## 3. AUDIT PAR SECTION

### 3.1 Données & Scrapers (`app/scrapers/`)

**Ce qui est bon :** sélection de 47 symboles exacte ; snapshot réel structuré (`brvm_real_snapshot.json` : 47 actions avec 13 champs + overview avec 7 indices sectoriels) ; `live_feed` avec cadence adaptative séance/hors-séance et statuts LIVE/STALE/OFFLINE ; news multi-sources isolées par try/except ; SSRF bloqué sur `article_content.py` ; cache TTL 5 min.

**Problèmes majeurs :**
1. **Zéro retry/backoff/jitter** sur tous les scrapers (seul le RSS BRVM a 3 essais). Un Cloudflare bloque la 1ère requête = journée de données perdue.
2. **Sélecteurs CSS fragiles** (`.item` + spans, `tbody tr.views-row`) : toute refonte du site BRVM casse le pipeline **en silence** (retourne `{}` ou saute des titres).
3. **Valeurs 0 persistées au lieu de NULL** (`close_price=s["close"] or 0`, `volume=0` codé en dur) → pollue graphiques et ratio-calculs.
4. **Pas de hiérarchie de sources** : `BRVM_REAL` / `BRVM_LIVE` / `SCRAPER_BRVM` s'écrasent mutuellement sans règle claire.
5. **Pas de validation Pydantic** des sorties scraper — erreurs silencieuses partout.
6. **`MarketData` = 1 ligne/jour/société** : le live de 9h30 écrase celui de 14h → aucune trace intraday.
7. Week-end/jours fériés : des données de la veille peuvent être datées « aujourd'hui » (pas de calendrier de négociation).
8. **Code mort dangereux** : `brvm_scraper.py` (fallback fake `_get_fake_market_data()` avec des symboles qui ne sont PAS des tickers BRVM, indices codés en dur) et `brvm_real_data.json` (60 entrées, 13 symboles corrompus type « B », « BANKOF ») — sources d'erreur accidentelle.

**Suggestions P0/P1 :**
- [ ] Supprimer `brvm_scraper.py` et `brvm_real_data.json` (ou les normaliser : symboles canoniques, pays non vides, price cohérent).
- [ ] Ajouter une couche `retry(3, backoff exponentiel + jitter)` + User-Agent rotation + throttle 1 req/2 s sur tous les scrapers.
- [ ] Valider chaque sortie avec des modèles Pydantic ; échouer fort plutôt que silencieusement (log + statut `STALE`).
- [ ] Ne jamais persister 0 : `None` → colonne nullable ; `coalesce` côté API.
- [ ] Exposer `scraped_at`/`is_stale` dans chaque réponse pour que l'UI affiche « Données du 31/07 17:30 ».
- [ ] Table `trading_calendar` (jours ouvrés BRVM + fériés) pour ne jamais écrire sur un jour non négocié.
- [ ] Stocker les news en base (`News` avec source, url canonique, date) pour historique + recherche + notifs.

### 3.2 Backend API & Services

**Endpoints (8 routeurs, tous montés) :** companies (9 endpoints), market (overview/indices/sectors/live/news/announcements/refresh…), analysis (ask/analyze/predict/report/screen), macro, auth (register/login/me/brokers), portfolio (positions/orders), seed, ingestion (pdf/statements/summary).

**Performance :**
- **N+1 massifs** : `_enrich_company` (par société : `func.max(date)` + requête) ; `market/overview` (requête Company par titre) ; `financials` (line_items lazy) ; `ratio_calculator.get_line_item` (≈30 requêtes `ilike` par société/année).
- **Zéro cache** (Redis déclaré dans config et requirements mais **jamais utilisé** ; pas de `Cache-Control`).
- `screen` : jointures `FinancialRatio`+`ScoreCard` **sans filtre fiscal_year** → doublons (explosion cartésienne) ; pas de pagination.
- `ilike %search%` sans échappement `%`/`_` → scans inutilisables (DoS doux).
- **Index manquants** : pas d'index `(company_id, date)` ; pas d'unicité → doublons possibles.

**Modèles financiers :**
- **Scoring** (`scoring.py`) : seuils binaires arbitraires **non calibrés par secteur** (les banques — 16 des 47 titres — sont massacrées sur D/E ; les Utilities pénalisées sur P/E). Données manquantes → **note neutre 5.0** (une société sans données reçoit un « BB » : trompeur). `management_score` fabriqué, `momentum_score` jamais rempli, `_scale_value` = code mort, « AAA » quasi inatteignable (9.5/10).
- **Prédictions** (`predictions.py`) : régression linéaire sur 3-5 points annuels ; la « confidence » = `|pente|/moyenne ×100` plafonnée à 95 — **ce n'est pas une confiance statistique** ; `RandomForestRegressor`/`pickle` importés jamais utilisés ; prédictions verrouillées sur 2023 en fallback ; société en perte → prédictions incohérentes.
- **Valorisation** (`valuation.py`) : WACC 10 %, croissance terminale 3 %, Buffett `×(1.10)^10 / 0.065` **codés en dur** ; target price = P/E moyen (défaut 10) × 1.1 arbitraire ; moyenne simple des 4 méthodes ; pas de scénarios/sensibilité ; EV/EBITDA jamais écrit.
- **Ratios** (`ratio_calculator.py`) : ~30 requêtes par société ; **les ratios bancaires (NIM, cost of risk, L/D, tier-1) déclarés dans le modèle ne sont JAMAIS calculés** (50 % du marché est bancaire !) ; `get_total` additionne passif+actif sans distinction.
- **IA** (`ai/analyst.py`) : gpt-4 avec contexte (société + ratios + scorecard + valorisation) mais **sans cours actuel ni secteur de référence** ; fallback rule-based = textes figés identiques pour toutes les sociétés ; `confidence_score=7.5` codé en dur ; prompt injection non traitée ; erreur OpenAI renvoyée brute au client ; **pas de budget/quota** (question illimitée → coût illimité).

**Ingestion PDF** (`ingestion.py`) : **sans aucune auth** ; fichiers uploadés jamais supprimés (fuite disque) ; `currency="XOF"` forcée ; double commit non atomique (ratios incohérents en cas de panne) ; `get_ingestion_summary` a une condition toujours vraie (`next(v for v in result if v["symbol"] or True, {})`).

**Suggestions P0/P1 :**
- [ ] Ajouter `selectinload`/jointures + un endpoint `GET /api/companies/{id}/full` déjà appelé par le front (tout regrouper en 3-4 requêtes max).
- [ ] Migrations Alembic réelles (le dossier `versions/` est vide ; `create_all` en startup ne migre pas) ; contrainte `UniqueConstraint(company_id, date)` ; index sur `(company_id, fiscal_year)` pour ratios/scorecards.
- [ ] Score : calibration **par secteur** (seuils normalisés Z-score par univers), données manquantes → `null` affiché « Données indisponibles » (jamais 5.0), ajouter `momentum_score` réel (rendement 3M/6M/12M), retirer `management_score` (ou le baser sur la gouvernance réelle), publier un **backtest de la note** (performance des titres notés AAA vs BBB).
- [ ] Prédictions : vraies statistiques (R², intervalle de confiance 95 %, erreur std), backtest public, alternatives (ARIMA, Prophet déjà installé), prédiction des **autres** : CA, EPS, dividende, cash-flow.
- [ ] Valorisation : paramètres documentés + scénarios (pessimiste/base/optimiste) + sensibilité WACC/graphique + comparaison de pairs (médianes sectorielles P/E, P/B, rendement).
- [ ] Ratio calculator : calculer les ratios bancaires (au moins : produit net bancaire, marge nette d'intérêt, taux de créances douteuses, RWA si disponible), cache par (société, année), upsert idempotent.
- [ ] IA : ajouter cours actuel + historique 1 an + secteur + news récentes au contexte ; exiger `max_length` sur `question` (ex. 500) + quota par utilisateur (ex. 50/jour) + rate limit ; citations des sources (quels ratios, quelle période) ; fallback qui utilise **vraiment** les données.
- [ ] Ingestion : auth admin + suppression du fichier après succès + transaction unique + `fiscal_year` borné (2000-2100) + validation de cohérence (total bilan = somme).

### 3.3 Sécurité (⚠️ P0 immédiat)

| Risque | Localisation | Urgence |
|---|---|---|
| **Clé OpenAI réelle commitée** (`sk-proj-…` 164 chars) + mot de passe Postgres + SECRET_KEY dans `backend/.env` | `backend/.env` | **CRITIQUE — révoquer la clé dès maintenant** (console OpenAI), la regénérer en variable d'environnement déployée |
| `POST /api/seed/all`, `/api/market/refresh`, `/api/ingestion/pdf`, `/api/analysis/ask` **publiques** | routers | Critique (re-seed destructeur, scraping externalisé = DoS, coûts OpenAI illimités) |
| Tokens d'auth **sans expiration**, stockés en `localStorage` (vol par XSS) | `auth.py`, `auth.js` | Élevé — passer en cookie HttpOnly SameSite=Strict + refresh token rotatif + TTL (ex. 7 j) |
| **Aucun rate limiting** (`/api/auth/login` = brute-force ; `/ask` = coût) | global | Élevé |
| `DEBUG=True` par défaut, `/docs` exposé, `--reload` dans le Dockerfile | config.py, Dockerfile | Moyen |
| CORS regex `[0-9.]+` accepte tout hôte-IP ; `allow_methods=["*"]` | main.py | Moyen — restreindre à la liste exacte de domaines |
| Pas de HTTPS, pas de `TrustedHostMiddleware`, pas de security headers (HSTS, CSP, X-Frame-Options) | main.py | Moyen |
| `SECRET_KEY` par défaut « bluerock-secret-key… » | config.py | Moyen |
| Versions obsolètes : `fastapi==0.104.1` (nov. 2023), `pydantic==2.5.2`, `scikit-learn==1.3.2`, `langchain==0.0.340` — vulnérabilités connues non patchées ; `celery/redis/prophet/langchain` déclarés jamais utilisés ; `alembic` en double | requirements.txt | Moyen |
| Sécurité des mots de passe : PBKDF2 100k itérations ✅ (bien) mais pas de 2FA, pas de blocage après échecs | auth.py | P1 |

**Suggestions P0 :**
- [ ] `.env` → ne jamais committer ; `SECRETS` en variables d'environnement ou secret manager (Vault/SSM) ; ajouter `.gitignore` (`.env`, `*.log`, `uploads/`, `*.db`).
- [ ] Rate limiting par IP : `slowapi` (login 5/min, ask 10/min/IP + quota/jour/utilisateur, refresh 2/min).
- [ ] Auth : tokens à expiration (payload avec `exp`), endpoint `/auth/refresh` (rotation), invalidation au logout ; en prod : cookie HttpOnly.
- [ ] Protection seed : `POST /api/seed/all` → admin uniquement (env `ADMIN_TOKEN`) ; en prod, seed ne passe que par un script de déploiement.
- [ ] `DEBUG` depuis env, fermer `/docs` en prod (`docs_url=None` si `DEBUG=false`).
- [ ] `TrustedHostMiddleware` + headers de sécurité (via middleware simple ou Caddy/nginx) ; HTTPS obligatoire.
- [ ] Épingler les versions (pip freeze) ; supprimer les dépendances mortes ; mettre à jour FastAPI/Pydantic (backward-compat testée).
- [ ] Désactiver le fallback fake de `pdf_extractor` (retourner une erreur explicite) et les fallbacks factices des scrapers.

### 3.4 Frontend — pages (17 pages mobile-first)

**Flux fonctionnels déjà solides (vérifiés E2E cette session) :** quote (canvas chart, zoom, pan, indicateurs MA/RSI/MACD, picker 47 actions, achat/vente avec position), portfolio (positions API, P&L, migration localStorage), auth (login/register démo/réel + 10 courtiers), menu (compte, courtiers, logout), login (2 modes, erreurs), watchlist (favoris localStorage), explorer, donnees (macro), brokers (10 courtiers), company (financiers, ratios, scorecard, valorisation, prédictions).

**Faiblesses transversales :**
1. **Pas d'état d'erreur global** : la plupart des pages font `.catch(() => {})` → backend down = écrans « — » silencieux (index, watchlist, portfolio, screen…). Seule `login.js` affiche ses erreurs. → Créer une `ErrorBoundary` + composant « Erreur de connexion / Réessayer » + `aria-live`.
2. **Pas de cache/état serveur** : chaque page refait ses fetchs au mount ; la TopBar + la page refont les mêmes appels (dupliqués). → Adopter SWR ou React Query (stale-while-revalidate, refetch on focus, mutation optimiste).
3. **Pas de temps réel côté UI** : polling 30 s uniquement sur le live feed ; les tableaux de cotations ne bougent jamais. → WebSocket/SSE (voir 5.2).
4. **Accessibilité quasi nulle** : lignes `<tr onClick>` sans role/tabIndex, cartes `<div onClick>`, tabs sans ARIA, boutons sans aria-label, tailles tactiles < 44 px par endroits. Screen readers inutilisables.
5. **Textes non localisés** : suffixes « FCFA » en dur (company, portfolio, quote), « Top 5 / Flop 5 » (index, explorer), badge « PLATINUM » (brokers), noms de secteurs FR (watchlist), messages d'erreur backend FR affichés bruts en EN (login). → Wrapper `t()` partout + mapping d'erreurs backend → clés i18n.
6. **`community.js` = contenu mock hors-sujet** (« EURUSD — Pression baissière », BTC sur une app BRVM, dates figées « 30 juil. ») — pire carte à jouer publiquement : du faux social.
7. **États vides** : companies (aucun message si recherche vide), screen (aucun état vide/erreur).
8. **Redirection `?next=`** ok pour login, mais pas de garde inverse (page login accessible quand connecté → se rediriger).

**Suggestion de priorisation UI (par impact) :**
- [ ] **P1 — Screener complet** : multi-filtres combinables (secteur, P/E, P/B, rendement, score, cap, variation), tri par colonnes, sauvegarde d'univers, export CSV, lien direct vers quote.
- [ ] **P1 — Alertes de prix** : seuil prix/variation, notifications in-app + push (Web Push/PWA) + email + Telegram/WhatsApp (canal roi en Afrique de l'Ouest).
- [ ] **P1 — Watchlist serveur** : favoris synchronisés par compte (table `watchlist`) au lieu de localStorage seul, avec prix live + alertes par titre.
- [ ] **P1 — Portefeuille enrichi** : rendement global (XIRR), performance par position, historique des ordres UI (déjà en API), export CSV/PDF, vue « liquidités ».
- [ ] **P2 — Graphique pro** : période intraday, types d'ordres (market/limit/stop) simulés, indicateurs supplémentaires (Bollinger, ATR), partage d'image, plein écran.
- [ ] **P2 — Community BRVM réelle** : discussions par société/secteur, profils, « idées » avec justification, modération, classements de paper trading — alimentées par de VRAIS utilisateurs, en FR/EN.
- [ ] **P2 — Onboarding** : questionnaire de profil, tutoriel guidé de 4 étapes, glossaire BRVM (lexique : PER, dividende, OPA…), mode démo récompensé par 500 000 FCFA virtuels (déjà : compte démo).

### 3.5 Design system, i18n, thème

**Constat :** deux design systems coexistent : le legacy « TradingView » (`--tv-*` dans globals.css, composants desktop morts : Sidebar, TopBar, StockTable, ScoreCardView…) et le thème mobile « dark pur » hex en dur répété ~13× dans les `<style jsx>`. Palette : vert `#00C853`, rouge `#FF4D4F`, noir `#000`, cartes `#141414`, violet `#8b5cf6`, jaune `#facc15` — cohérente mais non centralisée. **Les fonts Inter/JetBrains Mono sont déclarées mais jamais chargées** (public/ vide) → aucune identité typographique.

**i18n :** excellent socle — 2 langues (fr/en), ~362 clés synchronisées, helpers `fmtPrice/fmtCompact/fmtChange/timeAgo` localisés, fallback correct. Manques : pas de sélecteur de langue dans l'UI (clé `bluerock_lang` jamais écrite), ~127 clés mortes, 14 clés dupliquées, pré-render 100 % FR (flash FR pour les EN au chargement), mojibake de build sur Windows (« CommunautǸ » dans out/index.html).

**Suggestions :**
- [ ] **P1 — Design system unique** : variables CSS centrales (`--color-up/--color-down/--bg/--card/--text/--muted/--accent`), migrer les `<style jsx>` vers des classes globales, purger le thème `--tv-*` et les composants morts (~10 composants + ~127 clés i18n + recharts inutilisée).
- [ ] **P1 — Typographie** : charger Inter + JetBrains Mono (next/font ou self-host WOFF2) — identité immédiate.
- [ ] **P1 — Sélecteur de langue** (FR/EN, bientôt ES/PT/AR/Wolof/Swahili) dans le menu + `Accept-Language` + HTML `lang` dynamique.
- [ ] **P2 — Mode clair** : variables `[data-theme="light"]`, respect de `prefers-color-scheme`, toggle dans le menu.
- [ ] **P2 — Accessibilité** : focus visible, `aria-label` sur tous les boutons icon, rôles table/tab, contraste AA, tailles tactiles ≥ 44 px, `prefers-reduced-motion`.

### 3.6 Performance, SEO, PWA

- **Bundles** : ~490 KB brut / ~150 KB gzip par page (normal pour Next 14 export) ; pas de code-splitting au niveau des features lourdes ; images non optimisées (`unoptimized: true`, logos bruts du backend en HTTP).
- **SEO : quasi nul.** Pas de `<title>`, meta description, og:, canonical, sitemap.xml, robots.txt ; URLs en query string (`/company?id=2`) ; `lang="fr"` en dur. → Pour une plateforme « mondiale » : SSR (revenir de `output: export` à un serveur Node ou Vercel), routes propres (`/actions/ETIT`, `/entreprises/stbc`), sitemap, données structurées (FinancialProduct/Organization), blog/news indexables.
- **PWA : inexistante** (public/ vide). → manifest + service worker + icônes + theme-color : BlueRock installable et utilisable hors-ligne (l'Afrique de l'Ouest = réseau mobile instable : **la PWA offline est un différenciateur majeur**).
- **Mobile : solide** (BottomNav, 100dvh, safe-area) mais pas de gestes de « pull-to-refresh », pas d'optimisation des tailles tactiles partout, fonts 10-13 px par endroits.

### 3.7 Auth & Portefeuille (état actuel — bon socle)

- ✅ Register/login (démo/réel), 10 courtiers, PBKDF2 100k, ordres buy/sell validés (409 sans position / quantité), positions moyennes pondérées, migration localStorage→API, `getMe()` au boot, i18n complète.
- ⚠️ Tokens sans expiration ; pas de refresh ; pas de 2FA ; pas de blocage brute-force ; compte démo sans plafond ni « reset » ; pas de KYC (le « réel » est déclaratif).
- **Pour aller loin :** profil complet (avatar, pays, devise), historique de performance par compte, paper trading avec classements/missions, KYC numérique (carte d'identité + selfie) pour le réel, connexion aux courtiers par API/CSV (à terme), 2FA TOTP + SMS, export RGPD, journal d'audit des ordres.

### 3.8 Déploiement & Ops

- `docker-compose.yml` : Postgres 16 ✅ + Redis 7 ✅ (mais Redis inutilisé) + healthchecks DB ✅ ; mais backend en bind-mount dev, `DEBUG=true`, `npm run dev` dans l'image frontend, pas de `restart`, pas de healthcheck backend/frontend, pas de limites ressources, pas de non-root.
- Dockerfiles : pas multi-stage, `npm install` sans lockfile, `--reload` en CMD, pas de HEALTHCHECK.
- `DEPLOYMENT.md` : bonnes bases (CORS, IP LAN) mais **pas de CI/CD, pas de HTTPS concret, pas de CDN, pas de monitoring/alerting, pas de sauvegardes automatisées, pas de gestion de secrets, pas de scaling**.
- Backend : scheduler in-process (en multi-instance → scrapings doublés ; pas de verrou distribué via Redis).

**Suggestions :**
- [ ] **P0/P1 — Prod propre** : images multi-stage (node build + node-slim run ; python build + slim run), `npm ci`, CMD `next start` / uvicorn sans reload, non-root user, HEALTHCHECK, `restart: unless-stopped`, limites resources, healthcheck compose backend+frontend.
- [ ] **P1 — CI/CD** : GitHub Actions (lint + tests backend pytest + build frontend + docker build + push registry) puis déploiement par tag.
- [ ] **P1 — Monitoring** : Sentry (front+back) + métriques Prometheus + dashboards + alertes (uptime, latence, coût OpenAI/jour, échecs scrapers).
- [ ] **P1 — Sauvegardes** : pg_dump quotidien vers object storage, test de restauration mensuel.
- [ ] **P2 — Cache & scaling** : Redis pour API + scrapers (verrou distribué, cache), workers Celery pour scraping/IA, horizontal scaling backend.

### 3.9 Qualité, tests, données

- **Aucun test** côté backend (aucun `test_*.py`) ni frontend ; pas de lint configuré (`next lint` sans .eslintrc) ; pas de CI.
- Le `seed` destructif (purge MarketData) + non déterministe (`hash()` salé par processus) rend l'environnement incohérent entre machines.
- `requirements.txt` non épinglé → builds non reproductibles.

**Suggestions :**
- [ ] **P0 — Épingler les versions** (pip freeze) et `package-lock.json` (existe déjà ? sinon `npm install --package-lock-only`).
- [ ] **P1 — Tests** : pytest pour auth, portfolio, scoring (golden cases), scrapers (avec fixtures HTML), API (httpx AsyncClient + base de test) ; Vitest + Testing Library pour les pages critiques (quote, login, portfolio) ; E2E Playwright (léger, 5 flux).
- [ ] **P1 — Lint** : ESLint + Prettier, CI sur chaque PR.
- [ ] **P2 — Backtest public des scores/prédictions** : tableau « précision de nos recommandations » (comme les algorithmes d'investissement sérieux) — confiance = rétention.

---

## 4. ROADMAP « PLATEFORME N°1 BRVM » — 3 PHASES

### Phase 1 — Fondations crédibles (0-6 semaines) — « On peut nous faire confiance »
Sécurité (clé OpenAI, rate limiting, expiration tokens, endpoints protégés) → données réelles uniquement (financiers marqués/supprimés du synthétique, provenance, fraîcheur affichée) → scrapers fiables (retry, backoff, validation) → migrations + index + unicité → N+1 + cache → tests CI → dépôt propre (purge code mort, .env ignoré, fonts, design system unifié, i18n complète).

### Phase 2 — Expérience professionnelle (6-16 semaines) — « On vit le marché »
Intraday + WebSocket temps réel → screener complet → alertes (in-app/push/email/Telegram/WhatsApp) → watchlist serveur → portefeuille enrichi (XIRR, historique UI, CSV) → scoring calibré par secteur + backtest → IA avec citations + quotas → PWA offline → onboarding + glossaire → SEO (SSR, routes propres) → dashboard admin (ingestion vérifiée).

### Phase 3 — Mondialisation (4-8 mois) — « La référence de l'investissement africain »
Corporate actions + dividendes réels → multi-devises (FCFA/€/$ + FX BCEAO + autres marchés) → extension aux autres bourses africaines (NGX Lagos, GSE Accra, BVC Casablanca, JSE) → API publique + SDK (developer.bluerock.ai) → social trading + leaderboards → KYC numérique + ordres réels via courtiers → applications iOS/Android (React Native) → marque : content marketing, newsletter hebdo, données indexées par Google.

---

## 5. DIFFÉRENCIATEURS « N°1 MONDIAL » À CONSTRUIRE

1. **Vérité des données** : provenance affichée (« source BRVM, 31/07 17:30 »), aucun chiffre inventé, états financiers vérifiés PDF par PDF. C'est le différenciateur n°1 : **personne ne fait ça proprement sur la BRVM aujourd'hui.**
2. **Alertes WhatsApp/Telegram/SMS** : là où les plateformes SV font du push in-app, l'Afrique de l'Ouest vit sur WhatsApp. Canal direct → rétention massive.
3. **IA analyste qui cite ses sources** (« P/E de 4,2 × contre médiane bancaire de 6,8 ×, d'après l'état financier 2024 ») + rapport PDF exportable. L'IA sans sources = gadget.
4. **PWA hors-ligne** : graphiques et portefeuille consultables sans réseau (région à bande passante limitée).
5. **Paper trading social** : défis mensuels, classements, partage de portefeuilles virtuels — boucle virale avant l'argent réel.
6. **Éducation intégrée** : chaque terme de l'UI lié au glossaire, tutoriels vidéo, webinar hebdo.
7. **API publique** : être LE terminal de données BRVM pour développeurs et fintechs (revenu B2B potentiel).

---

## 6. CHECKLIST FINALE (P0 — à faire cette semaine)

- [x] Révoquer la clé OpenAI (console OpenAI) et la regénérer hors du repo
- [x] `.gitignore` : `.env`, `*.log`, `uploads/`, `*.db`, `out/`, `.next/`
- [x] Supprimer `brvm_scraper.py` (fake) + fallbacks factices `pdf_extractor`
- [x] Purger toutes les données synthétiques (historique, états, dividendes, scores, profils) et supprimer leur génération
- [x] Protéger `POST /seed/all`, `/market/refresh`, `/ingestion/pdf`, `/analysis/ask`
- [x] Tokens avec expiration + rate limiting login/ask
- [x] Fermer `/docs` en prod, `DEBUG` depuis env, `TrustedHostMiddleware`
- [x] Épingler `requirements.txt` ; supprimer les dépendances mortes
- [x] Index `(company_id, date)` + unicité + migrations Alembic initiales
- [x] Ne jamais persister 0 (None), afficher la fraîcheur des données dans l'UI
- [x] Retry/backoff/jitter sur les scrapers + validation Pydantic des sorties
- [ ] Purger la copie obsolète `Mon_kiosque\BlueRock` pour éviter toute confusion
