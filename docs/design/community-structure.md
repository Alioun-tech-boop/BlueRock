# BLUEROCK COMMUNITY — MAQUETTE DE STRUCTURE & ARCHITECTURE D'INFORMATION

> **Méthode** : on dessine d'abord les BLOCS (sidebar → header → main → rails → sections → cartes → grilles → espacements → navigation). La couleur et les effets ne sont qu'une application finale (§35).
> **Objectif** : une plateforme financière avec la richesse fonctionnelle d'un réseau social, la précision d'une fintech et la densité d'une plateforme de marché — mais une STRUCTURE inflexible.
> Cette doc décrit l'**évolution structurée de la Community existante** : elle s'appuie sur les composants actuels (`FeedSection`, `DiscoverSection`, `CommunityGroupsSection`, `ProfessionalSection`, `EventsSection`, `ReputationSection`, `ModerationSection`, `AiPulseSection`, `MyPostsSection`) et assemble un shell applicatif à 3 zones.

---

## 0. LÉGENDE COMMUNE DES MAQUETTES

```
Échelle : 1 caractère ≈ 8 pixels (Inter 14 px) · les largeurs annotées sont en px
[H]    = header sticky (reste en haut pendant le scroll)
[SC]   = zone scrollable verticale
⟶     = scroll horizontal (carrousel, tabs)
▼      = continuation du scroll vertical
► X.N  = référence de section d'écran (voir légende sous chaque maquette)
(ST)   = élément sticky (reste visible dans le viewport)
░░░░   = zone de remplissage / espace vide (jamais grillé)
```

**Règle d'or scroll (§31)** : un SEUL scroll principal — la colonne Main. La sidebar est pleine hauteur sans scroll interne (contenu calibré pour tenir), le rail droit est sticky sans scroll propre, les cartes ne scrollent jamais. Scroll horizontal uniquement : tabs, communautés à découvrir, tendances.

---

## 1. SYSTÈME DE GRILLE & ESPACEMENT

### 1.1 Échelle d'espacement (base 4 px)
```
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96
```
Affectation :
- Padding page desktop : `24` | page mobile : `16`
- Gap inter-sections dans le feed : `16` | entre colonnes principales : `24`
- Padding cartes : `16` (compact `12` en cartes internes)
- Gap inter-éléments d'une carte : `12` (serré `8`)

### 1.2 Grille de colonnes (desktop 1440)
```
┌─────────────┬──────────────────────────────┬────────────┐
│ SIDEBAR 256 │ MAIN (max 720)    GAP 24     │RIGHT 320   │
│ (32 car.)   │ (90 car. max)                │ (40 car.)  │
└─────────────┴──────────────────────────────┴────────────┘
total colonnes + gaps = 256 + 720 + 24 + 320 = 1320
espace restant 120 → marges latérales 60 de chaque côté (rail collé à droite du bloc)
```
- Large écran 1440+ : le bloc `main+rail` reste centré dans l'espace après la sidebar ; on n'agrandit **pas** les cartes (§30) — on augmente la densité ou l'aération marginale.
- Tablet 768–1023 : sidebar repliée à 72 (icônes) ou masquée, rail supprimé, main pleine largeur (max 720 centré).

### 1.3 Breakpoints
| Nom | Plage | Comportement |
|---|---|---|
| Mobile | < 768 px | bottom nav 5, header compact, tabs & carrousel horizontaux, rail intégré au fil |
| Tablette | 768–1023 px | sidebar icônes 72 px, pas de rail, main max 720 |
| Desktop | 1024–1439 px | shell 3 zones complet |
| Large desktop | ≥ 1440 px | idem, densité/espacement rééquilibrés |

### 1.4 Hauteurs de référence (desktop)
| Zone | Hauteur |
|---|---|
| Header global | 64 px (sticky) |
| Ligne de tabs community | 44 px (sticky sous le header) |
| Composer compact | 96 px (48 + rangée d'actions 48) |
| Carte post | auto (contenu) |
| Cover community | 200 px |
| Cover profil | 160 px |
| Bottom nav mobile | 64 px + safe-area |

---

## 2. SHELL GLOBAL — DESKTOP (structure matricielle)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ [H] 64px   Community            [ ⌘K  Rechercher…        ]    🔔  ✉  👤       │
├──────┬───────────────────────────────────────────┬───────────────────────────┤
│      │                                           │                           │
│ 256  │         MAIN 720 max                       │       RIGHT 320 (ST)      │
│ FIXE │         [SC]  SEUL SCROLL DE LA PAGE       │       sticky top 80        │
│      │   ░░░░░                                   │   ░░░░░                   │
│      │   ░░░░░                                   │   ░░░░░                   │
│      └──────────────  GAP 24  ──────────────────┘                           │
│   NAV GLOBALE      (feed scroll infini ici)        (blocs compacts, pas de    │
│   ▶ COMMUNITY                                     scroll propre)              │
└────────────────────────────────────────────────────────────────────────────────┘
```
- **Header global** : indépendant de la sidebar, pleine largeur. Titre de section à gauche, recherche centre (⌘K), actions à droite. Sticky.
- **Sidebar** : fixe, pleine hauteur, service de navigation globale (app BLUEROCK) + section « Mes communautés ». Contenu volontairement limité (§2 spec).
- **Main** : seule zone à défiler ; contient le flux complet de la page active.
- **Right** : contextuel (widgets), sticky dans le viewport, jamais de scroll propre, se replie naturellement.

---

## 3. ÉCRANS PRIORITAIRES (10)

### ▼ 01 — COMMUNITY HOME · DESKTOP

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│[H] Community              [ ⌘K  Rechercher un profil, une société… ]      🔔  ✉  👤      │ 64
├───────────┬────────────────────────────────────────────────────────────┬──────────────────┤
│ SIDEBAR   │  MAIN (720 max) — SEUL SCROLL                               │ RIGHT (320) ST  │
│ FIXE 256  │                                                            │                  │
│           │ (1) ┌ COMMUNITY ─────────────────────────────────────────┐  │ (1) PERSONNALITÉS│
│ ◆ BLUEROCK│    │ Community                                           │  │    À SUIVRE     │
│           │    │ Le réseau social financier de Bluerock.             │  │  ─────────────  │
│ NAVIGATION│    │ 24K Communautés · 180K Membres · 1,2M analyses      │  │ ◉ Aïssatou D.   │
│ GLOBALE   │    └────────────────────────────────────────────────────┘  │   CFA Analyste  │
│           │                                                            │        [Suivre] │
│ ▸ Dashboard│ (2) ┌ TABS ────────────────────────────────────────────┐  │ ◉ Ibrahim K.    │
│ ▸ Marchés │    │ Pour vous│ Abonnement│ Communauté│ Pro │ Tend │ Évén│  │   Trader        │
│ ▸ Watchlist│   └──────────────────────────────────────────────────────┘  │        [Suivre] │
│ ▸ Portefeuille│ (3) ┌ COMMUNITÉS À DÉCOUVRIR            [Voir tout →] ┐ │ ◉ Fatou M.      │
│ ▸ Actualités │    ├─⟶ carrousel horizontal (cartes 208×168 px) ⟶────┤ │   Analyste IA   │
│ ▸ AI Studio │    │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │ │        [Suivre] │
│ ▸ COMMUNITY►│    │ │ IA & Fin│ │ BRVM Inv│ │ Trading │ │ ESG BRVM│  │ │                  │
│ ▸ Notifications│ │ 12,4 K   │ │ 8,7 K   │ │  5,4 K  │ │ 3,1 K   │  │ │ (2) TENDANCES     │
│ ▸ Messages  │    │ [Rejoindre]│ [Rejoindre]│ [Rejoindre]│ [Rejoindre]│ │ ─────────────    │
│             │    │ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │ │ #SONATEL +2,4%  │
│ MES COMM.   │    └─────────────────────────────────────────────────────┘│ #BRVM   +0,8%  │
│ ・IA & Fin. │ (4) ┌ CREATE POST ─────────────────────────────────────┐ │ #IA     +1,2%  │
│ ・BRVM Inv. │    │ ◉ Partager une analyse, une question…            │ │ #ETH    −1,1%  │
│ ・Trading   │    ├───────────────────────────────────────────────────┤ │                  │
│            │    │ [Analyse] [Graphique] [Média] [Sondage]   [Publier]│ │ (3) ÉVÉNEMENTS   │
│            │    └─────────────────────────────────────────────────────┘│ ─────────────    │
│ Pro: ✓     │ (5) ┌ POST ─────────────────────────────────────────────┐│ ● Webinar       │
│ avatar nom │    │ ◉ Amina S. ✓  Analyste · 2h  [SONATEL]       ⋯    ││   Finance       │
│            │    │ SONATEL : perspectives positives pour 2026        ││   19:00 [Insc.] │
│            │    │ L'expansion data compense la pression du FCFA…     ││ ○ AMA Marchés   │
│            │    │ ┌ FINANCIAL EMBED (natif) ─────────────────────┐  ││   Sam. [Insc.] │
│            │    │ │ SONATEL  24 850 XOF      +2,45 %            │  ││                  │
│            │    │ │          [chart 1J…1A] — 160 px             │  ││ (4) ACTIVITÉ     │
│            │    │ │ PER 14,2 · Yield 4,8% · MCap 325 Md F CFA  │  ││ ─────────────    │
│            │    │ └─────────────────────────────────────────────┘  ││ ◉◉◉◉ 4 public.   │
│            │    │ ♥ 128   💬 24   ⇗ Partager   🔖                 │  ││    récentes      │
│            │    └────────────────────────────────────────────────────┘│                  │
│            │ (5) ┌ POST ────────────────────────────────────────────┐│                  │
│            │    │ …                                                 ││                  │
│            │    └────────────────────────────────────────────────────┘│                  │
│            │       ▼  infinite scroll (IntersectionObserver, +3 posts)│                  │
└───────────┴────────────────────────────────────────────────────────────┴──────────────────┘

Selon §5 l'ordre du feed est STRICT : (1) header → (2) tabs → (3) découverte → (4) composer → (5) posts.
Interactions : tabs filtrent le feed ; carrousel swipe/wheel ; composer focus → rangées d'actions dépliées ;
actions post → micro-retour 200ms (Rocket bleu, Bookmark sauvegarde, Partager).
```

### ▼ 02 — COMMUNITY HOME · MOBILE (recomposé, jamais réduit)

```
┌────────────────────────────────────────┐
│[H] BLUEROCK                    🔔  👤  │ 48
├────────────────────────────────────────┤
│ [ ⌕  Rechercher…                 ]     │ 44
├────────────────────────────────────────┤
│ Pour vous│ Suivis│ Comm.│ Tendances  → │ 44  tabs scroll horizontal
├────────────────────────────────────────┤
│ ⌈IA & Finance⌉ ⌈BRVM Investors⌉ ⌈Trad ⌉│ 96  carrousel communautés
│                    → scroll horizontal │      cartes 148×96
├────────────────────────────────────────┤
│ ◉  Partager une analyse…          ➤   │ 48  composer compact (pas de page)
├────────────────────────────────────────┤
│ [POST 1]                               │
│ ◉ Amina S. ✓  Analyste · 2h       ⋯   │
│ SONATEL : perspectives positives       │
│ [SONATEL  embed miniature]             │
│ ♥128  💬24  ⇗  🔖                      │
├────────────────────────────────────────┤
│ [POST 2]                               │
│ [POST 3]                               │
│        ▼  scroll infini                 │
├────────────────────────────────────────┤
│ ◻ Accueil │ ◻ Marchés │ ◉ Community │ ◻ Portfolio │ ◻ Profil │ 64+safe
└────────────────────────────────────────┘
Interactions : bottom nav = vrai changement de zone ; FAB non requis (composer déjà en tête de fil) ;
switch onglet = recomposition du fil ; rail inexistant ici → widget Tendances replié entre 2 posts.
```

### ▼ 03 — COMMUNITY DETAIL · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H]  Communauté › IA & Finance                                       🔔  ✉  👤     │ 64
├────────────────────────────────────────────────────────────────────────────────────┤
│ COVER 200px  — bannière identité (image abstraite data/marché, dégradé bleu discret)│
│                                                                                    │
│                    ◉◉  Avatar 96px (chevauche 40px la limite du cover)             │
├────────────────────────────────────────────────────────────────────────────────────┤
│  IA & Finance ✓                       @ia-finance                        [Partager]│
│  COMMUNIAUTÉ VÉRIFIÉE · 12 400 membres · 3 800 publications · lancée en 2024      │
│  Description courte (2 lignes max, cliquable → À propos)                            │
├────────────────────────────────────────────────────────────────────────────────────┤
│ [ST] TABS : Accueil │ Publications │ Membres │ Événements │ À propos   (sous header)│
├──────────────────────────────────┬─────────────────────────────────────────────────┤
│ MAIN 720 — publications (SC)     │ INFO 320 (ST)                                    │
│                                  │  ADMINISTRATEURS                                 │
│  CO (+)  Partager dans la comm.  │   ◉ Aïssatou D.   fondatrice                     │
│                                  │   ◉ Ibrahim K.    modérateur                     │
│  [POST 1]  Amina S. ✓ · 3h       │  RÈGLES                                         │
│  [POST 2]  Ibrahim K. · 6h       │   1. Sources et données requises                 │
│  [POST 3]  ▸ épinglé             │   2. Pas de promotion illicite                   │
│                                  │                                                  │
│  ▼ scroll infini                 │  MEMBRES ACTIFS (12 400)                         │
│                                  │   ◉◉◉◉◉◉◉◉  +124 cette semaine                  │
│                                  │  CATÉGORIE                                       │
│                                  │   [IA & Finance] [BRVM]                         │
└──────────────────────────────────┴─────────────────────────────────────────────────┘
Structure §16 : cover (200) → identité → actions alignées droite → nav tabs sticky →
contenu 2 colonnes (feed dominant / info contextuelle sticky).
Priorité §32 : identité → contenu → membres → informations secondaires.
```

### ▼ 04 — COMMUNITY DETAIL · MOBILE

```
┌────────────────────────────────────────┐
│ COVER 160px                            │
│     ◉●  avatar 80px (chevauche 32px)   │
├────────────────────────────────────────┤
│ IA & Finance ✓                 [Rejoindre]│
│ 12 400 membres · 3 800 posts           │
│ Description (2 lignes)                 │
├────────────────────────────────────────┤
│ Accueil│Publi.│Membres│Évén.│À pro  →  │ 44  tabs scroll
├────────────────────────────────────────┤
│ [POST 1]⋯                              │
│ [POST 2]⋯                              │
│ ▼                                      │
├────────────────────────────────────────┤
│  Info (drawer) : Admins / Règles /      │
│  Membres — bouton « Infos » en tête     │
├────────────────────────────────────────┤
│ bottom nav 5 items (Community actif)    │
└────────────────────────────────────────┘
§28 : infos secondaires DANS un drawer, jamais une colonne serrée.
```

### ▼ 05 — PROFESSIONAL PROFILE · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Professionnel › Amina Sow                                        🔔  ✉  👤     │ 64
├────────────────────────────────────────────────────────────────────────────────────┤
│ COVER 160px (dégradé bleu discret)                                                  │
│         ◉◉  avatar 96px  chevauche 40px                                            │
├────────────────────────────────────────────────────────────────────────────────────┤
│  Amina Sow ✓                [✉ Message] [✓ Suivi]        SCORE  OUTIL  FIABILITÉ   │
│  @amina — Analyste senior BRVM     · Abidjan             87      94     91        │
│  Spécialités : Télécoms · Banques · Data                     barre de progression  │
│  4 200 followers · 128 analyses · 48 rockets reçus                                │
├────────────────────────────────────────────────────────────────────────────────────┤
│ [ST] TABS : Publications │ Commentaires │ Communautés │ Badges                    │
├──────────────────────────────────┬─────────────────────────────────────────────────┤
│ MAIN 720 — Publications (SC)     │ INFO 320 (ST)                                    │
│                                  │  À PROPOS                                       │
│  [POST 1] Amina · 2h            │  Analyste sénior, 9 ans de couverture            │
│   SONATEL : perspectives 2026    │  BRVM. Ex-CTA, data-geek.                       │
│   [embed SONATEL]                │                                                  │
│   ♥128 💬24 ⇗ 🔖                 │  COMMUNAUTÉS                                     │
│                                  │   ◉ IA & Finance   ◉ BRVM Investors            │
│  [POST 2] · 2j                   │                                                  │
│  [POST 3] ▸ épinglé · 5j         │  EXPERTISE                                       │
│                                  │   [Télécoms] [Banques] [Data] [IA]              │
│  ▼                              │  BADGES                                          │
│                                  │   ✓ Fiabilité   ✓ Pertinence                    │
└──────────────────────────────────┴─────────────────────────────────────────────────┘
Structure §21 : cover→header→stats→nav→contenu 2 colonnes ; publications dominantes.
Toute ligne chiffrée en tabular-nums ; « Suivre »→« Suivi ✓ » 200 ms.
```

### ▼ 06 — DISCOVERY · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Découvrir            [ ⌘K  Rechercher…          ]                🔔  ✉  👤     │ 64
├───────────┬───────────────────────────────────────────────────────────────────────┤
│ SIDEBAR   │  MAIN (max 1000) — seul scroll                                        │
│ FIXE 256  │                                                                        │
│           │  DÉCOUVRIR                                                             │
│           │  Explorer profils, communautés, analyses.                                │
│ (idem     │                                                                        │
│  shell)   │  [ ⌕ Recherche locale…  ]  [Filtres: Finance▾ IA▾ BRVM▾] [Tri: Pert.▾] │
│           │                                                                        │
│           │  COMMUNAUTÉS POPULAIRES                                                │
│           │  ┌─────────┬─────────┬─────────┐                                      │
│           │  │ IA & Fin│ BRVM Inv│ Trading │  ← grille 3 col. identiques           │
│           │  │ 12,4 K  │ 8,7 K   │ 5,4 K   │     (jamais un feed agrandi §14)      │
│           │  │ [Rejoindre]  [Rejoindre]  [Rejoindre]                              │
│           │  └─────────┴─────────┴─────────┘                                      │
│           │                                                                        │
│           │  PROFESSIONNELS POPULAIRES                                             │
│           │  ┌─────────┬─────────┬─────────┐                                      │
│           │  │ ◉ Aïssatou │ ◉ Ibrahim │ ◉ Fatou │   3 col.                         │
│           │  │ CFA Analyste│ Trader  │ Analyste IA│  avatar 64, nom, badge,        │
│           │  │ [Suivre]   [Suivre]   [Suivre]   │  profession, spécialité,         │
│           │  └─────────┴─────────┴─────────┘      followers                        │
│           │                                                                        │
│           │  ANALYSES POPULAIRES                                                   │
│           │  ┌─────────┬─────────┬─────────┬─────────┐                             │
│           │  │ [post]  │ [post]  │ [post]  │ [post]  │  grid 4 col. compact        │
│           │  └─────────┴─────────┴─────────┴─────────┘                             │
│           └────────────────────────────────────────────────────────────────────────┘
Grille = language de la page ; pas de colonne latérale droite (elle est intégrée aux cartes).
Section par type (communautés → pros → analyses) = navigation descendante logique.
```

### ▼ 07 — COMMUNITIES DIRECTORY · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Communautés            [ ⌘K  Rechercher…          ]              🔔  ✉  👤     │ 64
├───────────┬───────────────────────────────────────────────────────────────────────┤
│ SIDEBAR   │  MAIN (max 1000)                                                       │
│ FIXE 256  │                                                                        │
│           │  COMMUNATÉS                                                            │
│           │  340 communautés actives sur la BRVM                                     │
│           │                                                                        │
│           │  [ ⌕ Rechercher une communauté… ]  [Catégorie ▾] [Tri: Membres ▾]      │
│           │                                                                        │
│           │  ┌─────────┬─────────┬─────────┐                                       │
│           │  │ IA & Fin│ BRVM Inv│ Trading │   ← GRID 3 colonnes fixes             │
│           │  │ 12,4 K  │ 8,7 K   │ 5,4 K   │     (grand écran : 4 max §15)         │
│           │  │ desc…   │ desc…   │ desc…   │                                       │
│           │  │ [Rejoindre]  [Rejoindre]  [Rejoindre]                              │
│           │  └─────────┴─────────┴─────────┘                                       │
│           │  ┌─────────┬─────────┬─────────┐                                       │
│           │  │ ESG BRVM │ Éco.    │ Crypto  │                                      │
│           │  └─────────┴─────────┴─────────┘                                       │
│           │  …  pagination / « Afficher plus »                                      │
│           │                                                                        │
│           └────────────────────────────────────────────────────────────────────────┘
Cartes à largeur IDENTIQUE (grid template, pas auto-fill flottant).
Filtres : catégorie (Finance/Trading/IA/Économie/Entrepreneuriat/ESG/BRVM) + tri.
```

### ▼ 08 — COMMUNITY ADMIN DASHBOARD · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Admin · IA & Finance                                           🔔  ✉  👤       │ 64
├───────────┬───────────────────────────────────────────────────────────────────────┤
│ ADMIN NAV │  DASHBOARD — IA & Finance                                              │
│ (72px)    │                                                                        │
│  ▸ Overview│  4 STAT CARDS                                                        │
│  ▸ Posts   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  ▸ Members │  │ Membres  │ │ Croissance│ │ Engagement│ │ Publications│             │
│  ▸ Moderation│  12 400    │ │ +3,2 %/30j│ │ 24,8 %   │ │ 3 800    │                │
│  ▸ Events  │  │  ▲▲      │ │  ▲ ▲     │ │ barre    │ │  ▲ ▲    │                │
│  ▸ Analytics│  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │
│  ▸ Settings │                                                                      │
│             │  GRAPH PRINCIPAL — CROISSANCE (360×220)                              │
│  ┌ Admin  ┐ │  ┌───────────────────────────────────────┐                          │
│  │ back to │ │  │   [chart lignes: membres 90 jours]   │                          │
│  │ community│ │  └───────────────────────────────────────┘                          │
│  └────────┘ │                                                                      │
│             │  DEUX COLONNES                                                        │
│             │  ┌─────────────────────┐  ┌────────────────────┐                    │
│             │  │ Activité récente    │  │ Top publications   │                    │
│             │  │ ◉ Amina a publié 5m │  │ 1. SONATEL 2026     │                    │
│             │  │ ◉ Ibrahim a rejoint 3h│ │ 2. BoA : dividende │                    │
│             │  │ ◉ join +12           │  │ 3. ETF émergent    │                    │
│             │  └─────────────────────┘  └────────────────────┘                    │
│             └───────────────────────────────────────────────────────────────────────┘
§18 : nav admin DISTINCTE de la nav Bluerock. Layout réutilisé par tous les sous-écrans
admin (Posts=table, Members=table+recherche, Events=liste, Analytics=charts,
Settings=formulaires) — seul le panneau central change.
```

### ▼ 09 — POST DETAIL · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Publication                                    [Retour au fil]   🔔  ✉  👤     │ 64
├───────────┬───────────────────────────────────────────────────────────────────────┤
│ SIDEBAR   │  MAIN 720 — seul scroll                                                │
│ FIXE 256  │                                                                        │
│           │  ┌ POST (plein) ────────────────────────────────────────────────────┐ │
│           │  │ ◉ Amina S. ✓  Analyste · 2h   [SONATEL]                  ⋯      │ │
│           │  │ SONATEL : perspectives positives pour 2026                       │ │
│           │  │ L'expansion data compense la pression du FCFA…                   │ │
│           │  │ ┌ FINANCIAL EMBED ─────────────────────────────────────────┐    │ │
│           │  │ │ SONATEL 24 850 XOF  +2,45 %        [1J][1M][3M][6M][1A] │    │ │
│           │  │ │        [chart 220px]                                    │    │ │
│           │  │ │ PER 14,2 · Yield 4,8% · MCap 325 Md · Vol. 1,24 M      │    │ │
│           │  │ └─────────────────────────────────────────────────────────┘    │ │
│           │  │ ♥ 128   💬 24   ⇗ Partager   🔖                               │ │
│           │  └───────────────────────────────────────────────────────────────┘ │
│           │                                                                      │
│           │  COMMENTAIRES (24)   [composer : ◉ Répondre…                     ➤] │
│           │  ┌ ───────────────────────────────────────────────────────────────┐ │
│           │  │ ◉ Ibrahim: analyse solide, MAIS…                          🔔 │ │
│           │  │    ▽ 2 réponses                                              │ │
│           │  │       ◉ Amina: tu as raison sur la marge                    │ │
│           │  └ ───────────────────────────────────────────────────────────────┘ │
│           │  ┌ ───────────────────────────────────────────────────────────────┐ │
│           │  │ ◉ Fatou: +1, le peer-set comprime encore                     │ │
│           │  └ ───────────────────────────────────────────────────────────────┘ │
│           │  [Afficher 21 autres commentaires]  ▼ scroll                     │
│           └──────────────────────────────────────────────────────────────────────┘
           Info liée (facultatif ≥ 1280) : profil auteur + réactions similaires (320, ST)
§22 : le post + commentaires = page dédiée, pas un simple doublon de la carte du feed ;
commentaires indentés (40px), « Afficher plus » ; embed plus grand qu'en feed.
```

### ▼ 10 — EVENTS · DESKTOP

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│[H] Événements            [ ⌘K  Rechercher…          ]                🔔  ✉  👤     │ 64
├───────────┬───────────────────────────────────────────────────────────────────────┤
│ SIDEBAR   │  MAIN (max 1040)                                                       │
│ FIXE 256  │                                                                        │
│           │  ÉVÉNEMENTS                                                            │
│           │  48 événements programmés · Pro uniquement : 12                          │
│           │                                                                        │
│           │  [Tous] [À venir] [En direct] [Passés]   [+ Créer (staff)]             │
│           │                                                                        │
│           │  FEATURED EVENT — carte horizontale 1040×180                           │
│           │  ┌──────────────────────────────────────────────────────┬───────────┐ │
│           │  │ LIVE ●  WEBINAR  ·  19:00       Aujourd'hui         │  [S'inscrire]│ │
│           │  │ Stratégie dividendes BRVM 2026                      │  148 inscrits │
│           │  │ par Aïssatou D.  ·  durée 45 min                    │  12 en liste  │
│           │  └──────────────────────────────────────────────────────┴───────────┘ │
│           │                                                                        │
│           │  À VENIR — grid 3 colonnes                                            │
│           │  ┌──────────┬──────────┬──────────┐                                   │
│           │  │ AMA       │ Conference│ Workshop │                                    │
│           │  │ Marchés   │ Fintech  │ Analyse  │                                   │
│           │  │ Sam. 28   │ 14 avr.  │ 22 mai   │                                   │
│           │  │ [Inscrire] [Inscrire] [Complet] │                                    │
│           │  └──────────┴──────────┴──────────┘                                   │
│           │                                                                        │
│           └────────────────────────────────────────────────────────────────────────┘
Filtres status ≠ filtres de catégorie (ceux-ci vivent dans les filtres kind internes).
Featured = 1 seul, mis en avant structurellement (largueur), pas répété dans la grille.
```

---

## 4. ÉCRANS SECONDAIRES — STRUCTURE RÉUTILISÉE

> Chaque écran ci-dessous réutilise un des 4 gabarits : **Shell 3 zones** (Home), **Detail 2 colonnes** (Community Info), **Grille catalogue** (Discovery/Directory), **Admin** (dashboard/sous-écrans).

| Écran | Gabarit | Structure |
|---|---|---|
| **Communautés (mobile)** | Mobile Home | header 48 · search 44 · tabs 44 · carrousel 96 · grid 2 col → pagination |
| **Directory mobile** | Grid catalogue | search · filtres chips · grid 2 col |
| **Post Detail mobile** | Detail (mono col) | post plein → commentaires → composer sticky au-dessus du bottom nav ; pas de colonne liée |
| **Search ⌘K** | Overlay | palette flottante 640 max : input 52 → résultats groupés (Pros/Commu/Posts/Entreprises/Événements) → raccourcis pied |
| **Notifications** | Shell 3 zones (main only) | header · filtres chips · timeline verticale (jour en titre sticky, items 64 px) |
| **Bookmarks** | Shell 3 zones | header · tri · liste de posts sauvés (cartes compactes) |
| **Wizard création (7 étapes)** | Modal/drawer | stepper 7 points · une étape à l'écran · validation progressive · récap final |
| **Analytics perso** | Shell 3 zones | header · StatCards · charts (Réputation, Interactions, Badges) · Leaderboard |
| **Moderation (user)** | Shell 3 zones | tabs (signalements/appels/bannissements) + timeline |
| **Settings** | Admin (2 col) | nav latérale tl-forms + panneau |
| **Event Detail** | Detail (mono col) | cover 180 → titre+bouton → meta → intervenants (2 col) → agenda → participants → discussion |
| **Tablet (toutes)** | Tablette | sidebar 72 icônes (ou masquée < 900) · main max 720 · pas de rail · 2-col grids contrôlées |

---

## 5. COMPOSANTS STRUCTURELS — SPÉCIFICATIONS DE DISPOSITION

### Cartes
| Carte | Largeur | Padding | Radius | Structure |
|---|---|---|---|---|
| Post (feed) | 100 % colonne | 16 | 12 | avatar 40 · header · contenu · embed/image · actions |
| Communauté (directory) | 1/n colonne | 16 | 12 | avatar 44 · nom/tag · stats · desc 2 L · CTA |
| Communauté (carrousel) | 208 | 12 | 12 | avatar 40 · nom · stat · bouton |
| Prof (grid) | 1/3 colonne | 16 | 12 | avatar 64 · nom · badge · fonction · spécialité · followers · CTA |
| Événement (grid) | 1/3 colonne | 16 | 12 | kind chip + date · titre · lieu · speakers · footer inscrire |
| Événement (featured) | 100 % (h 180) | 20 | 16 | horizontal : contenu gauche / CTA droite |

### Grilles
- Directory communautés : `repeat(3, 1fr)` desktop · `repeat(4, 1fr)` ≥ 1440 · `repeat(2, 1fr)` tablette · 1 col mobile. Gap 16.
- Profils : `repeat(3, 1fr)` desktop · 2 tablette · 1 mobile.
- Analyses populaires : `repeat(4, minmax(200px,1fr))` desktop.
- Découverte : jamais auto-fill libre — colonnes contrôlées et égales.

### Navigation
- Tabs : hauteur 44, item actif souligné par indicateur 2 px + texte bleu ; mobile scroll horizontal (`overflow-x auto, scrollbar masquée, tap cible ≥ 44 px`).
- Carrousel : `scroll-snap-type: x mandatory`, cartes snap, flèches discrètes au hover ; une seule rangée.
- Breadcrumb : `Section › Entité` dans le header pour Communauté, Profil, Event, Admin.

### Espaces (rythme vertical) — feed
```
16 gap après header de page  ·  8 header→tabs  ·  12 tabs→carrousel  ·  16 carrousel→composer
16 composer→premier post  ·  16 entre posts  ·  24 avant la section suivante
```

---

## 6. INTERACTIONS & NAVIGATION

### 6.1 Navigation principale
```
Sidebar → pages app BLUEROCK (Marchés, Watchlist…) · COMMUNITY actif
  └── Header Community → tabs (feed) → carrousel → composer → posts
       ├── post → Post Detail (#09)
       ├── communauté → Community Detail (#03/#04) → admin (si role) → Admin (#08)
       ├── profil pro → Professional Profile (#05)
       ├── directory/découverte → #06/#07 → détail
       └── événement → Event Detail → inscription
Recherche ⌘K → résultats groupés → chaque résultat ouvre son détail (même route)
Notifications → item → contexte du trigger (post/commentaire/profil/communauté)
```

### 6.2 Micro-interactions (150–200 ms, sans bloat)
| Action | Retour |
|---|---|
| Rejoindre / Suivre | `Rejoindre → ✓ Membre` / `Suivre → ✓ Suivi` (bleu, 200 ms, pas d'annulation sournoise) |
| Rocket / Like | icône scale 1→1.2→1, couleur bleue, compteur optimiste |
| Bookmark | icône remplie bleue + toast discret 1,5 s |
| Insightful | pastille ambre, compteur +1 |
| Tabs | transition de fond 150 ms, contenu fade 120 ms |
| Retry erreur | bouton Réessayer branché sur le même endpoint |
| Carrousel | snap, flèche apparaît au hover 150 ms |
| Skeleton | shimmer 1 200 ms, jamais de spinner géant |

---

## 7. MATRICE RESPONSIVE

| Élément | Mobile <768 | Tablette 768–1023 | Desktop 1024–1439 | Large ≥1440 |
|---|---|---|---|---|
| Header | 48 (compact) | 64 | 64 sticky | 64 sticky |
| Sidebar | — (bottom nav) | 72 icônes ou masquée | 256 | 256 |
| Main | 100 % (16 pad) | max 640/720 | max 720 | max 720 (bloc centré) |
| Right | — (intégré au fil) | — déplacé sous contenu | 320 sticky | 320 sticky |
| Grids | 1 col | 2 col | 3 col | 3–4 col |
| Carrousel comm. | 148 px cartes | 208 | 208 | 208 |
| Tabs | scroll horiz. | adaptatif | ligne unique | ligne unique |
| Composer | compact 48 | 96 | 96 | 96 |
| Bottom nav | ✓ (5) | — | — | — |

Règle §30 : le gain de largeur à 1440+ ne gonfle pas les cartes — il augmente l'aération périphérique et la densité contrôlée des grilles catalogue.

---

## 8. ÉCARTS AVEC L'IMPLÉMENTATION ACTUELLE (pistes d'implémentation)

La structure actuelle (`pages/community.js` + 9 sections) est **compatible** avec ce cadre ; restructure nécessaire :

1. **Header global pleine largeur + barre de tabs sticky** : sortir le titre `co-header` du contenu → zone header 64 px ; déplacer les nav de la sidebar actuelle vers une vraie Sidebar fixe ; ajouter la sous-nav tabs sticky sous le header.
2. **Un seul scroll** : le `.safe-area` reste le conteneur de scroll ; la sidebar actuelle (`co-shell-side`) doit passer en fixe (elle est déjà dans le shell) et le rail actuel (`co-rail`) passe de `overflow-y auto` à `position: sticky` (supprimer son scroll propre).
3. **Composer compact** : actuellement le composer du feed (`.fs-composer-card`) est en bas de FeedSection — le remonter en position (4) du flux §5, sous le carrousel, et le réduire à 48 px collapsed.
4. **Carrousel communautés** : `CommunityGroupsSection` affiche une liste → nouvelle vue carrousel (réutilise les mêmes données `getCommunityGroups`).
5. **Pages dédiées** : transformer les sections en routes (Community Home = l'actuelle page consolidée ; ajouter `/community/communities`, `/community/discover`, `/community/profiles/[id]`, `/community/groups/[slug]`, `/community/events`, `/community/posts/[id]`, `/community/admin/[slug]`). Garder `/community` = Home.
6. **Grilles catalogue** : Discover et Directory utilisent les grid templates contrôlés (§1.2/§5) au lieu des colonnes uniques existantes.
7. **Cover + détails** : créer les gabarits `Detail 2 colonnes` (community/profil) et `Admin` en réutilisant les styles `--c-*` existants.

---
*Document de structure — la couleur et les effets appliqués ensuite depuis `community-design-system.md` (tokens `--c-*`, surfaces 4 niveaux, bleu `#2E54FF`, Inter).*