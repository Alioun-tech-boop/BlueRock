# BlueRock — Déploiement et internationalisation

## Résumé de l'audit « Graphique » (corrigé)

| Problème | Cause | Correctif appliqué |
|---|---|---|
| « Rien n'a changé » / pas de graphique sur téléphone | Serveur dev lié à 127.0.0.1 uniquement | `next dev -H 0.0.0.0` |
| Pas de graphique sur téléphone (LAN) | Pare-feu Windows bloquait 3000/8000 | Règles entrantes ajoutées (profils Private/Domaine/Public) |
| Pas de données via l'IP du PC | CORS backend n'autorisait que `localhost:3000` (wildcard non supporté par Starlette) | `allow_origin_regex` : IP LAN + sous-domaines `*.bluerock.ai` |
| API injoignable depuis le téléphone | `API_BASE` figée sur `http://localhost:8000` | Base résolue à l'exécution : `<hostname du site>:8000` si non-localhost |
| Graphique = toujours ETIT | Favoris vides → fallback ETIT | Favoris → dernier symbole consulté (localStorage `bluerock_last_symbol`) → ETIT |
| Favori obsolète → écran 404 (pas de graphique) | Symbole inconnu dans l'URL | Fallback automatique vers ETIT |
| Taps perdus pendant le chargement mobile | Boutons sans handler avant l'hydratation React | Navigation par vraies balises `<a>` (fonctionne sans JS) + push SPA si hydraté |
| Aucun moyen de choisir une autre action sur le graphique | — | Sélecteur d'action : tap sur le symbole → recherche (symbole/nom) → 47 valeurs |
| Zoom molette uniquement sur mobile | — | Pan tactile 1 doigt + pinch (déjà présent) |

## État de la machine (dev, réseau local)

- Frontend : `npx next dev -H 0.0.0.0 -p 3000` (écoute sur toutes interfaces, IP LAN : `192.168.100.32`)
- Backend : `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Téléphone : ouvrir `http://192.168.100.32:3000` (même WiFi). Si le téléphone est sur un autre réseau, les ports 3000/8000 doivent être routés.
- Attention : `output: 'export'` → `npm run build` corrompt `.next` du serveur dev → redémarrer `next dev` après chaque build.

## Déploiement à l'international

### 1. Architecture cible (production)

```
Téléphone/Web ──HTTPS──> CDN (frontend statique + cache API)
                              │
                    ┌─────────┴──────────┐
                    │  API (Docker)      │
                    │  uvicorn + gunicorn│
                    └─────────┬──────────┘
                    ┌─────────┴──────────┐
                    │  PostgreSQL 16     │
                    └────────────────────┘
```

- **Frontend** : l'app est déjà en `output: 'export'` → déployer `out/` sur un CDN/static host (Vercel, Netlify, Cloudflare Pages, ou un simple serveur statique avec cache). Coût de latence mondial ≈ 0 (fichiers statiques).
- **API** : une instance par région (ex. Europe + Afrique de l'Ouest), ou une seule instance + CDN de cache. Docker recommandé.
- **HTTPS obligatoire** : Caddy (auto TLS) ou nginx + Let's Encrypt.

### 2. Configuration

| Variable | Où | Valeur |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Build frontend | `https://api.bluerock.ai` |
| `DATABASE_URL` | Backend | `postgresql://user:pass@host:5432/bluerock` |
| `DEBUG` | Backend | `false` en prod (ferme `/docs` et `/openapi.json`, pas de détails verbeux) |
| `SECRET_KEY` | Backend | Générer : `python -c "import secrets; print(secrets.token_hex(32))"` (un défaut aléatoire est utilisé si absent) |
| `ADMIN_TOKEN` | Backend | `python -c "import secrets; print(secrets.token_hex(32))"` — protège `/api/seed/*`, `/api/ingestion/pdf`, `/api/macro/seed` (header `X-Admin-Token`) |
| `OPENAI_API_KEY` | Backend | Optionnel — sans clé, l'analyste IA répond en mode hors-ligne |
| `ALLOWED_HOSTS` | Backend | `localhost,127.0.0.1,.bluerock.ai` |
| CORS | `backend/app/main.py` | `allow_origin_regex` → `https://[a-z0-9.-]+\.bluerock\.ai` (déjà préparé) |

### 3. Mise en production concrète

```bash
# Frontend (build statique)
npm run build                # produit out/
# servir out/ + cache CDN

# Backend
docker build -t bluerock-api .
docker run -d -p 8000:8000 \
  -e DATABASE_URL=postgres://... \
  -e DEBUG=false \
  bluerock-api
# uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

### 4. Internationalisation (hors Afrique de l'Ouest)

- **Devise** : aujourd'hui tout est en FCFA (code `XOF`). Pour ouvrir d'autres marchés : ajouter un champ `currency`/`exchange` par société et formater via `Intl.NumberFormat(locale, { style: 'currency', currency: 'XOF' })`.
- **Fuseaux horaires** : les horaires 9h–17h30 sont encodés en dur (`preopen/postclose` dans i18n) ; les passer en config serveur (`market.tz`) → `Africa/Abidjan`.
- **Langues** : le dictionnaire FR/EN de `frontend/src/lib/i18n.js` est prêt ; ajouter des locales (es, pt, ar…) = copier le bloc `en` et traduire.
- **Dates/heures** : `toLocaleTimeString('fr-FR')` en dur dans quote.js — centraliser avec la locale active.
- **Format des nombres** : `fmtPrice/fmtCompact` dans i18n.js sont déjà dépendants de la langue.

### 5. Sécurité & fiabilité

- Ne jamais exposer le port 3000 (dev) en production ; seul l'API sur 8000 derrière HTTPS.
- **Sécurité API implémentée** : jetons avec expiration (TTL 7 j par défaut, `AUTH_TOKEN_TTL_SECONDS`), rate limiting mémoire (login 10/15 min/IP, `/api/market/refresh` 5/min/IP, `/api/analysis/ask` 10/min/IP + quota quotidien par utilisateur), endpoints d'écriture derrière `X-Admin-Token` (seed, ingestion PDF, macro), headers de sécurité (CSP, nosniff, X-Frame-Options, HSTS en prod) et TrustedHost. En prod : `DEBUG=false` ferme `/docs` et `/openapi.json`.
- **Données synthétiques** : **plus aucune** — tout le contenu généré (historique 2020-2026, états financiers, dividendes, scores, profils) a été purgé de la base et de `seed.py`. La plateforme ne sert que des données réelles BRVM (cours, indices, news, calendrier) ; les états financiers arrivent exclusivement par l'ingestion des PDF officiels (admin, `is_synthetic=false`). Les endpoints d'analyse/prédiction renvoient 422 tant que ces états ne sont pas ingérés.
- Secrets dans un `.env` jamais commité (exclu via `.gitignore`).
- Healthcheck : `GET /api/health` (existe) + restart policy Docker (healthcheck Docker intégré au Dockerfile backend).
- Logs : `be-news.log` / `fe-dev.log` sont des solutions dev → journald ou stdout + collecteur (Loki/ELK).
- Sauvegardes PostgreSQL automatiques (pg_dump quotidien).
- Le scraper live BRVM : en prod, un seul worker cron/systemd (pas de duplication si plusieurs instances API). Les scrapers intègrent retry/backoff avec jitter et ne persistent jamais un prix invalide (0/négatif).
- Tests : `cd backend && python -m pytest tests` (19 tests d'intégration : auth, 403/401, rate limiting, fraîcheur).

### 6. Qualité d'expérience pour l'international

- Le feed BRVM est un marché africain ; pour d'autres marchés, prévoir un adaptateur de données (schéma `MarketData` : date, open, high, low, close, volume — compatible).
- Le champ `open_price` est NULL dans les données actuelles — le schéma le tolère (graphique en chandeliers « hollow » + fallbacks).
- PWA (manifest + service worker) pour l'accès mobile en zones à faible connectivité — le design est déjà mobile-first.
