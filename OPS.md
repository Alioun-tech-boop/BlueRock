# BlueRock — Runbook opérationnel

Guide d'exploitation de l'API BlueRock (production). Complète `DEPLOYMENT.md`
(build/déploiement initial) et `AUDIT.md` (stratégie de passage à l'échelle).

## 1. Architecture actuelle (prod)

```
Clients ──HTTPS──> Render (free, 1 instance web)
                     │  uvicorn 1 worker + APScheduler (worker intégré)
                     ├── Redis Upstash (rate limit, OTP, verrous jobs)
                     ├── Supabase PostgreSQL (données + file de jobs)
                     └── Brevo API (emails transactionnels)
```

- **Stateless multi-instance** : tout l'état partagé passe par Redis
  (`SHARED_STORE`). Ajouter une instance = juste déployer un 2e service.
- **File de jobs durable** : table `background_jobs` (PostgreSQL). Le drainer
  tourne toutes les 5 s avec `FOR UPDATE SKIP LOCKED` + verrou distribué —
  plusieurs instances ne se marchent pas dessus.
- **Cache HTTP mémoire** : endpoints publics (overview, companies, live…)
  avec TTL 60–300 s ; les write/endpoints sensibles ne sont jamais cachés.

## 2. Déploiement

```powershell
# 1. Commit + push
git push origin main
# 2. Déployer explicitement (autoDeploy: no)
& "C:\Users\HP\AppData\Local\Temp\opencode\render-cli\render.exe" deploys create srv-d9q067e417fc73f9naag --confirm
# 3. Vérifier
Invoke-RestMethod https://bluerock-api.onrender.com/api/health
# attendre {"status":"healthy","database":"ok","redis":"connected"}
```

- **Migration DB** (Alembic) : le schéma est versionné. Après un merge avec
  une nouvelle migration :
  ```powershell
  $env:ALEMBIC_DATABASE_URL="postgresql://user:pass@host:5432/postgres"
  python -m alembic upgrade head   # depuis backend/
  ```
  Idempotent, transactionnel. Vérifier : `alembic current`.

## 3. Observabilité

| Endpoint | Usage |
|---|---|
| `GET /api/health` | Probe de survie : statut, version, DB, Redis, uptime, compteurs |
| `GET /api/metrics` | Format Prometheus text (compteurs req/s, latence, jobs, emails) |
| Logs | Dashboard Render, lignes JSON `event=http_request` + `X-Request-Id` |

- Chaque requête est journalisée en JSON avec `request_id` (header
  `X-Request-Id` corrélé) : temps total, statut, IP, user-agent.
- **Heartbeat (optionnel)** : poser `HEARTBEAT_URL` (URL type healthchecks.io)
  → l'instance pinge toutes les `HEARTBEAT_INTERVAL` s (défaut 600 s), avec
  `/fail` si DB ou Redis est KO. Alerte "dead man's switch" sans coût.

## 4. Test de charge — résultats (prod, plan free)

```
python scripts/load_test.py [durée_sec] [concurrence]
```

| Concurrence | Débit | Latence p50 | Latence p95 | Erreurs |
|---|---|---|---|---|
| 20 | 60,8 req/s | ~230 ms | ~400–750 ms | 0 % |
| 40 | 17,7 req/s | ~2 000 ms | ~3 700–5 400 ms | 0 % |

Lecture : à 20 requêtes simultanées l'instance free tient ~60 req/s sans
erreur (latence ~200 ms = surtout le RTT réseau). Au-delà, la file d'attente
de threads sature (p50 → 2 s). **Le plafond d'une instance free est ~50–60
req/s** : pour plus, multiplier les instances (stateless) derrière un CDN.

## 5. Limites du plan free (0 €) et paliers

| Ressource | Free | Note |
|---|---|---|
| Uptime | 750 h/mois | web + worker 24/7 dépassent ; scale = une instance payante |
| RAM / CPU | 512 MB / ~0,1 CPU | warm-up lissé (threads daemon) ; ~45 s de cold start au réveil |
| Sommeil | ~15 min sans trafic | 1er appel après réveil ~7 s |
| Bande passante | 100 GB/mois | le CDN Cloudflare réduit la charge |
| Upstash Redis | 256 MB, 10 000 cmd/jour | suffisant à l'usage actuel |
| Brevo | 300 emails/mois | vérifier le quota avant campagnes |

Palier multi-instance payant : dès que le CPU/latence deviennent limitants
(≥ 60 req/s soutenus), passer à une instance Standard et ajouter des
réplicas — le code est déjà stateless.

## 6. Variables d'environnement clés

`DATABASE_URL` (Supabase pooler), `REDIS_URL` (Upstash), `BREVO_API_KEY`,
`SECRET_KEY` (≥ 32 car.), `ALLOWED_HOSTS`, `ADMIN_TOKEN`, `DEBUG=false`,
`WORKER_JOBS=1` (scheduler sur cette instance), `SQL_POOL_SIZE`/`SQL_MAX_OVERFLOW`
(défauts 5/10 — ne pas dépasser les 60 connexions du pooler),
`HEARTBEAT_URL` (optionnel).

## 7. Procédures

- **Instance KO / redeploy** : relancer `render.exe deploys create … --confirm`.
- **Réveil / perf dégradée après inactivité** : normal (cold start free).
- **Emails non partis** : consulter `background_jobs` (`status=pending/failed`),
  vérifier le quota Brevo, puis relancer via le drainer (il re-essaie seul).
- **Incident DB** : `/api/health` → `database=unreachable` ; la file de jobs
  attend en `pending` et reprend après retour de la DB (backoff 30 s × essais).
- **Env vars** : dashboard Render → Environnement ; en vigueur au prochain deploy.

## 8. Coût actuel

0 €/mois : Render free, Supabase free, Upstash Redis free, Brevo free,
NGN Market API free. (Le domaine `bluerock.ai` et Cloudflare restent à
confirmer par le propriétaire.)
