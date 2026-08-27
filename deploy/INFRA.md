# Infra BlueRock — Redis, réplica DB, CDN

Préparé pour tenir des millions d'utilisateurs/jour. Trois couches, chacune
optionnelle et dégradable proprement (aucun SPOF introduit par ces changements).

## 1. Redis — cache partagé (fil + rate-limit)

- `backend/app/core/shared_store.py` : abstraction `store` (Redis si `REDIS_URL`
  défini, sinon fallback mémoire par process). **Même code en dev et en prod.**
- Le cache du fil communautaire (`/api/community/posts`) passe désormais par
  `store.cache_*` → partagé entre toutes les instances API (plus de cache
  éclaté par replica).
- Le rate-limit (`check_rate_limit`) est déjà Redis-backed.
- Config : `REDIS_URL=redis://redis:6379/0`. En prod : Upstash / Elasticache
  (avec auth + TLS). Éviction `allkeys-lru`, pas de persistance (cache pur).
- Le cache tolère une panne Redis : `store` retombe sur le fallback mémoire et
  l'app reste fonctionnelle (dégradation = plus de partage de cache, pas d'erreur).

## 2. Réplica lecture DB

- `backend/app/config.py` : `DATABASE_READER_URL` (optionnel).
- `backend/app/database.py` : `reader_engine` + dépendance `get_reader_db()`.
  Les endpoints GET chauds (`list_posts`, `get_post`, `get_user`,
  `admin_stats`) l'utilisent → déchargent le primaire en écriture.
- À grande échelle : pointer `DATABASE_READER_URL` sur le **read-pooler** de
  Supabase (p.ex. `:6543/bluerock?options=...`) ou un read-replica PG.
- Lag sub-second attendu (streaming replication). Les écritures et la création
  de profil (`get_me`) restent sur le **primaire** (`get_db`) pour éviter un
  profil fraîchement créé invisible.
- Pool borné (`SQL_POOL_SIZE=5`, `SQL_MAX_OVERFLOW=10`, `pool_recycle=300`,
  `pool_pre_ping`) → reste sous les limites du pooler Supabase.

## 3. CDN

- `backend/app/config.py` : `CDN_BASE_URL`, `STATIC_CACHE_MAX_AGE`.
- Edge (nginx / CloudFront / Cloudflare) : les flux anonymes du fil portent
  `Cache-Control: public, s-maxage=15` (émis par l'API via `_feed_response`),
  donc cachables au bord. Les flux authentifiés sont `private, no-store`.
- `nginx.conf` : `proxy_cache` dédié au fil + `Cache-Control` long sur
  `/_next/static` (builds Next.js immuables). C'est le principal gain CDN.
- Médias communauté : servis via Supabase Storage (URLs signées). Pour un CDN,
  exposer le bucket public derrière une zone `CDN_BASE_URL` et préfixer les URLs
  côté backend (`_attachment_public_url`) — à activer quand le bucket passe en
  public + purge par clé.

## Déploiement (docker-compose, dev/staging)

```
docker compose -f deploy/docker-compose.yml up -d --scale api=3
```

- `redis` : cache partagé.
- `db` : Postgres primaire (dev). Prod = Supabase (`DATABASE_URL`).
- `api` : N replicas (scale horizontal) derrière nginx.
- `nginx` : TLS, gzip, proxy_cache du fil, load-balancing.

## Ordre de montée en charge

1. Redis (enlève la pression DB sur le fil) — **fait**.
2. Réplica lecture (GET chauds hors primaire) — **fait** (à pointer en prod).
3. CDN (cache edge du fil + statics) — **fait** côté config + nginx.
4. Scale horizontal API (`--scale api=N`) derrière LB — docker-compose prêt.
5. File d'attente (celery/arq) pour les tâches lourdes (ingestion PDF, mails)
   si le primaire sature — prochaine étape recommandée.
