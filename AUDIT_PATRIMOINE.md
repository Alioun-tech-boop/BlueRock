# Audit — Section « Plan patrimoine » (frontend + backend)

Date : 10/08/2026 — v2 : corrections appliquées (statut par point), à trier ensemble.

Périmètre lu en intégralité :
- `backend/app/routers/premium.py` (415 l.), `backend/app/services/premium.py` (545 l.),
  `backend/app/services/premium_tracking.py` (291 l.), `backend/app/services/rebalancer.py` (260 l.),
  `backend/app/models/planning.py` (74 l.), `backend/app/schemas/premium.py` (12 l.),
  `backend/app/routers/portfolio.py` (extraits : `_portfolio_by_id`, `_default_portfolio`,
  `demo_capacity_used`, `_portfolio_invested`), `backend/app/core/security.py` (PIN),
  `backend/app/main.py` (job planifié).
- Frontend : `src/pages/patrimoine.js`, `src/pages/patrimoine/{apercu,allocation,projections,
  contributions,parametres,plan}.js`, `src/components/{PatrimoineShell,PatrimoineEmpty,PlanForm}.js`,
  `src/lib/plan.js`, `src/services/api.js` (partie premium), `src/lib/i18n.js` (clés utilisées).

Vérifications (après corrections) : build Next.js complet ✓ (29 pages, aucune erreur) ;
backend uvicorn `--reload` actif sur :8000 (PID 27456) — import OK ; `/api/premium/plans-lite`
non authentifié → 401 (correct) ; dev server redémarré sur :3000 (PID 5232), `/patrimoine` → 200.

---

## 1. Haute priorité

### H1 — Faux « day_change » au premier suivi du plan — ✅ CORRIGÉ
- `backend/app/routers/premium.py:194-204` : le snapshot initial est créé sur le capital
  total (`value = invested = amount`, réserve comprise) ; `start_value` et `last_value`
  sont aussi émis sur `amount` (`premium.py:183-186`) ; commentaire du modèle mis à jour
  (`models/planning.py:32`). Le premier `day_change_pct` vaut désormais 0 (cours inchangés)
  et la courbe part d'un point plat.

### H2 — Annulation d'un plan protégé par code sans vérification du code — ✅ CORRIGÉ
- `backend/app/routers/premium.py:215-218` : `cancel_plan` exige désormais un `PinGuardRequest`
  et passe par `_require_pin` (même protection que link/unlink/rebalance).
- Frontend : `services/api.js` (`cancelPremiumPlan(id, payload)`), `components/PlanForm.js`
  (code demandé via `planPinRequired`, erreur serveur affichée dans `error-box`),
  `pages/patrimoine/apercu.js` (idem + `cancelErr` affiché, plus d'échec silencieux).

---

## 2. Priorité moyenne

### M1 — Hub surchargé : `/api/premium/plans` renvoie le payload complet par plan — ✅ CORRIGÉ
- `components/PatrimoineShell.js` : le hub (`section === 'hub'`) charge `plans-lite`, les
  pages détaillées chargent le payload complet.
- `backend/app/routers/premium.py` (`list_plans_lite`) : renvoie tous les statuts (cartes
  « annulé/nouveau » du hub) + nouveaux champs `issued_at` et `last_pnl_pct` (progression
  et PnL du hub).
- N+1 supprimé : `services/premium.py` `live_positions` passe de 4 requêtes par position à
  4 requêtes bulk (cours, ratios, scorecards, valuations).
- `pages/portfolio.js` : la liste « Lier » ne montre que les plans actifs (le endpoint
  renvoie désormais tous les statuts).

### M2 — `build_plan` ignore `plan_type` — ⏸ À TRANCHER (produit)
- `backend/app/routers/premium.py:151-153` (appel sans `plan_type`) ;
  `backend/app/services/premium.py:422-423` (signature sans `plan_type`).
- Pas corrigé : faire varier l'allocation selon l'objectif (épargne/retraite/études/
  succession) est une décision produit (profils de risque, contraintes de liquidité), pas
  une correction. Seuls les défauts frontend diffèrent aujourd'hui.

### M3 — `detail === 'no-valuations'` : code mort dans PlanForm — ✅ CORRIGÉ
- `backend/app/routers/premium.py:154-155` : le `ValueError` de `build_plan` (aucune
  valorisation exploitable) est désormais émis avec `detail="no-valuations"` — la branche
  i18n de `PlanForm.js:51` fonctionne enfin (message traduit FR/EN).

### M4 — Erreur réseau = état vide trompeur — ✅ CORRIGÉ
- `components/PatrimoineShell.js` : état `loadError` distinct (message + bouton Réessayer,
  clés i18n `patLoadError` / `patRetry` FR+EN) ; plus de confusion avec « aucun plan ».

### M5 — GET avec effets de bord — ✅ CORRIGÉ
- `backend/app/routers/premium.py` (`get_plan`) : plus de `track_plan` à la lecture ;
  valorisation par le job (3 h) ou `POST /plan/{id}/track`.

### M6 — Cibles de rééquilibrage calculées sur la valeur d'achat — ✅ CORRIGÉ
- `backend/app/services/rebalancer.py` : `adaptive_targets` utilise désormais la valeur de
  marché du compte (`_account_market_value` : cours du jour, fallback prix moyen), cohérent
  avec la valorisation suivie par `track_plan`.

### M7 — Ordres en attente filtrés par utilisateur, pas par portefeuille — ✅ CORRIGÉ
- `backend/app/services/rebalancer.py:173-178` : filtre ajouté sur `Order.portfolio_id`.

### M8 — Alerte « Mouvement fort » : variation depuis l'émission, pas journalière — ✅ CORRIGÉ
- `backend/app/services/premium_tracking.py` : nouvelle fonction `_close_pairs` (les 2
  derniers cours par symbole, 1 requête) ; l'alerte compare la dernière séance
  (`clôture précédente → clôture actuelle`), texte mis à jour (« en une séance »).
  Conséquence : objectif atteint et mouvement fort peuvent co-émettre (plus de `elif`).

### M9 — Pas de limite d'essais / verrouillage sur le code PIN — ✅ CORRIGÉ
- `backend/app/routers/premium.py` : compteur par utilisateur (mémoire) — 5 échecs
  consécutifs → verrouillage 5 minutes (HTTP 423, message FR explicite). Limite : cache
  mémoire par worker (suffisant en monoprocess démo).

### M10 — `unlink`/`rebalance` acceptent un plan non actif — ✅ CORRIGÉ
- `backend/app/routers/premium.py` : 409 « Seul un plan actif peut être délié / rééquilibré »
  (même comportement que `link`).

---

## 3. Basse priorité / UI

- **Gain négatif affiché « +-1 234 F »** — ✅ `allocation.js:36` et `contributions.js:26` :
  signe conditionnel.
- **Annulation silencieuse** — ✅ couvert par H2 (erreur affichée dans `apercu.js` et
  `PlanForm.js`).
- **Projections d'un plan annulé** — ⏸ conservé tel quel (le calendrier figé à l'émission
  reste informatif ; décision UI).
- **`plan_maturity_soon` répétée** — ⏸ fausse alerte : `_notify(..., None)` déduplique déjà
  pour toujours → une seule notification.
- **« 47 sociétés BRVM » en dur** — ✅ `i18n.js` (`premiumHero`) : libellé sans chiffre,
  FR + EN.

---

## 4. Points vérifiés — RAS

- **Sécurité** : tous les endpoints filtrent par `user_id` (pas d'IDOR) ; `managed_portfolio_id`
  re-vérifié via `UserPortfolio` ; PIN PBKDF2-HMAC-SHA256, sel aléatoire, 100 000 itérations.
- **Validation** : `PremiumPlanRequest` (amount > 0, horizon 1-30 ans, risk/plan_type whitelistés).
- **Notifications** : déduplication (24 h, ou illimitée pour les événements majeurs), envoi email
  en thread daemon avec retry, `link` cohérent (`/patrimoine`).
- **Performance tracking** : requêtes bulk `DISTINCT ON` (cours, scorecards, valuations) ;
  garde-fou décote ±90/300 (données PDF corrompues) dans `_build_candidates`.
- **Frontend** : `/api/premium` en `NO_CACHE` (api.js:38) ; timeouts 120 s sur emit/link/rebalance
  (build_plan appelle le LLM) ; `t()` fallback FR ; clés i18n FR/EN complètes pour la section.
- **Job planifié** : `_plan_tracking_job` toutes les 3 h (track + rebalance), snapshot limité à
  1/jour, rebalance uniquement sur comptes démo (`account.type != "real"`), pas d'achat au-delà
  de `DEMO_INVEST_LIMIT` ni du solde.

---

## 5. Reste à faire

1. **M2** — décider si `plan_type` doit influencer l'allocation (travail produit).
2. **Tester en conditions réelles** (compte de test) : émission, jour 1 (day_change = 0),
   liaison + PIN, annulation avec/sans code, verrouillage après 5 échecs, rééquilibrage.
3. Supprimer l'import `track_plan` de `get_plan` si plus rien ne l'utilise (il est encore
   utilisé par `POST /plan/{id}/track`) — RAS.
