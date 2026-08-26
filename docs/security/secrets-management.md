# Gestion des secrets — BlueRock (Phase 3 du durcissement)

> Règle absolue : un secret ne se trouve JAMAIS dans le code, les logs,
> les réponses API, le frontend (hors clés designées publiques) ou git.

## 1. Inventaire des secrets & lieux de détention

| Secret | Détention | Rotation | Statut |
|---|---|---|---|
| `DATABASE_URL` (Postgres Supabase, pooler) | `backend/.env` + dashboard Render/`envVars sync:false` | à la rotation infra | actif |
| `SECRET_KEY` (signature OTP, CSRF, hash) | `.env` (obligatoire ≥ 32 octets hors DEBUG ; `config.py` refuse le démarrage sinon) | immédiate si fuite possible | actif |
| `SUPABASE_SERVICE_KEY` (role admin DB/Auth) | `.env` + Render dashboard + Edge Functions (env runtime) | immédiate si fuite | actif |
| `SUPABASE_ANON_KEY` | **public par design** (client) — portée restreinte par RLS Supabase ; seule une rotation liée au projet | projet | actif |
| `ADMIN_TOKEN` (endpoints admin legacy) | `.env` + Render dashboard — **en voie de suppression** (remplacé par RBAC JWT, voir `docs/security/rbac.md`) | immédiate | transition |
| `OPENAI_API_KEY`, `GEMINI_API_KEY` | `.env` + Render dashboard | semestrielle | actif |
| `NGN_MARKET_API_KEY` | `.env` + Render dashboard | semestrielle | actif |
| `DIDIT_API_KEY`, `DIDIT_WEBHOOK_SECRET` | `.env` + Render dashboard | semestrielle | actif |
| `BREVO_API_KEY`, `SMTP_PASS` | `.env` + Render dashboard | semestrielle | actif |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **uniquement** environnement des Edge Functions Supabase (dashboard) | semestrielle | actif |
| `BLUEROCK_SERVICE_KEY` (signature interne Edge) | environnement Edge Functions | semestrielle | actif |
| `REDIS_URL` | `.env` (vide = mémoire mono-instance) | rotation accès | optionnel |

**Exclusion confirmée par scan (17/08/2026)** : aucun pattern `sk_live_`,
`AKIA…`, `ghp_…`, `xox…`, `AIza…`, `sk-…`, clé privée, `postgresql://user:pass@…`
dans les 348 fichiers suivis par git (hors `.env.example` à valeurs factices).

## 2. Règles de détention

1. **Jamais dans git** — `.gitignore` couvre `.env`, `*.env.local`, `backups/`,
   `tools/`. Un secret commité par accident = incident → rotation immédiate + commit purgé.
2. **Jamais dans les logs** — les middlewares de log (RequestLogging) excluent
   corps et en-têtes ; les appels Stripe/Supabase loggent uniquement statut/durée.
   Les traces `[AUTHDBG]` (fuite JWT) ont été supprimées en Phase 1.
3. **Jamais dans les réponses API** — les payloads exposent uniquement les
   champs de présentation (voir DTO, Phase 6).
4. **Séparation des environnements** — dev/staging/prod ont des jeux de
   secrets distincts (Phase 2) ; `render.yaml` utilise `sync:false` pour que
   les valeurs vivent uniquement dans le dashboard.
5. **Backups chiffrés** — les dumps (`backups/`) sont hors git ; tout dump
   hors poste de dev doit être chiffré (voir infra).
6. **Moindre privilège** — la clé service role Supabase ne s'utilise que dans
   le backend (jamais frontend) ; les Edge Functions l'ont par injection
   runtime, pas par variable build.

## 3. Rotation

- **Immédiate** (incident présumé) : toute clé présente dans un log, une
  réponse, un commit, un message tiers (support, email).
- **Planifiée** : semestrielle pour les fournisseurs ; annuelle pour
  DATABASE_URL/SECRET_KEY ; à chaque départ de collaborateur disposant d'un
  accès dashboard.
- **Stripe** : rotation `STRIPE_WEBHOOK_SECRET` = re-déclarer l'endpoint chez
  Stripe (nouvelle signature), puis mise à jour de l'env de l'Edge Function.

## 4. CI — détection automatique

À activer en Phase 2 (environnements) :
- **Gitleaks** dans `.github/workflows/ci.yml` :
  `gitleaks detect --source . --redact --verbose` (fail on findings).
- Scan secret GitHub (Settings → Code security) actif sur `main`.

## 5. Réponse à incident de fuite (démarche)

1. Identifier la clé et son périmètre (ce qu'elle protège, depuis quand).
2. Révoquer immédiatement côté fournisseur (Supabase/Stripe/OpenAI…).
3. Purgrer l'historique git (BFG) si commité ; fouiller les logs serveurs
   (RequestLogging ne capture ni corps ni en-têtes → risque limité).
4. Générer un nouveau secret (`python -c "import secrets; print(secrets.token_hex(32))"`),
   déployer, vérifier les endpoints concernés.
5. Documenter l'incident dans `docs/security/incidents.md`.

## 6. Checklist pré-déploiement

- [ ] `git grep -E "sk_live|SUPABASE_SERVICE_KEY=<valeur>|postgresql://[^:@]+:[^@]+@"` vide
- [ ] `.env` absent de `git ls-files`
- [ ] Secrets Render définis dans le dashboard (pas dans render.yaml)
- [ ] `SECRET_KEY` ≥ 64 hex en prod (le démarrage est bloqué sinon)
- [ ] Scan Gitleaks vert dans la CI