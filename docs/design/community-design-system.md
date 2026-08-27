# BLUEROCK Community — Design System & Redesign Complet
### Spécification de design « nouvelle génération » — dark premium institutionnel

> **Portée** : refonte complète de l'écosystème Community de BLUEROCK (25 écrans minimum, 65 exigences).
> **Positionnement** : une institution financière moderne avec son propre écosystème social — jamais un réseau social générique.
> **Stack cible** : React / Next.js / Tailwind, composants existants réutilisés (§61), icônes **Lucide uniquement**.
> **Usage** : document de référence unique, implémentable directement (valeurs exactes, états, responsive).

---

## 0. Vision & principes

1. **Noir dominant.** Le noir n'est jamais un simple fond : c'est l'identité. Jamais d'interface « toute bleue ».
2. **Institutionnel premium.** Precision télégraphique, espace généreux, données chiffrées en `tabular-nums`, zéro clinquant social.
3. **Le bleu est un signal, pas un décor.** Le bleu électrique (`#2E54FF`) est réservé aux actions primaires, liens, éléments actifs et highlights de données.
4. **Réutilisation systématique de l'existant** (§61) : tokens `--tv-*`, icônes Lucide, composants `MarketChart`, sections community, `i18n`, `services/api.js`.
5. **Une seule colonne de lecture.** Feed scrollable, sidebar fixe, rail droit indépendant — structure « terminal de trading » pas « flux de scroll infini des réseaux ».
6. **Chaque écran a un état par défaut, un état vide, un état erreur, un état chargement.** Jamais d'erreur brute.
7. **Micro-interactions 150–200 ms.** Tout feedback est immédiat, discret, sans bruit.

---

## 1. Réutilisation de l'existant (audit §61)

Extrait des fichiers actuels de BLUEROCK — **codes réels à conserver** :

| Élément existant | Valeur actuelle | Utilisation dans le nouveau design |
|---|---|---|
| `--tv-bg` | `#000000` | Base body (conserve les dégradés radiaux bleu/violet existants, réduits) |
| `--tv-bg-secondary` | `#0A0A0A` | Fusionne vers la nouvelle surface S1 `#05070A` pour le Community |
| `--tv-bg-elevated` | `#141414` | Inchangé hors Community (app) |
| `--tv-divider` | `#1E1E1E` | Séparateurs structuraux app |
| `--tv-text` | `#F8F8FA` | Texte primaire |
| `--tv-text-secondary` | `#9AA3B2` | Texte secondaire |
| `--tv-text-muted` | `#6B7A94` | Texte tertiaire (métadonnées ≥ 12 px) |
| `--tv-blue` | `#4C8DFF` | Bleu brand global (charts, liens app) |
| `#2E54FF` + `#9DB9FF` | primaire des sections community actuelles | **Primaire du nouveau design community** |
| `#18C27C` / `#F04438` / `#E11D48` / `#F0A03D` / `#F59E0B` | vert / rouge / rouge sentiment / jaune / ambre | Sémantique conservée à l'identique |
| `#F5C518` | badge premium (EventsSection) | Conservé pour tout signal Premium |
| `rgba(255,255,255,0.12…0.16)` | bordures cartes sections community (`#ffffff12`, `#ffffff14`, `#ffffff16`) | Base du nouveau système de bordures |
| Radius community actuels | cartes 12–16 px, inputs 8–10 px, boutons 999 px (pills), tags pills | Normalisés dans le token scale (cartes 12–16, boutons 8–10, pill uniquement tags/badges/filtres) |
| Police titres `Plus Jakarta Sans` 800 | titre page community (`co-title`) | Conservé **uniquement** pour le mot « Bluerock » du hero |
| Animations | `transition 0.15s` partout | Normalisées 150–200 ms ease-out |
| Focus | `outline 1.5px rgba(76,141,255,0.65)` + ring 5 px `0.14` | Conservé tel quel (ring bleu) |
| Avatars community | carrés arrondis + initiales sur fond couleur (`avatar_color`) | Conservés (carrés arrondis radius 10–12), cercle réservé aux mini-avatars d'activité |
| `MarketChart.js` | composant charts existant | Réutilisé pour le Financial Embed et l'analytics |
| `ServerDownArt.js` | illustration erreur serveur | Réutilisé pour les états erreur serveur |
| `BottomNav.js` | 5 items, actif vert `#28C98B` | Remplacé dans le Community par la nouvelle bottom nav (5 items, actif bleu `#2E54FF` — voir §5 et Écran 23) |
| `DesktopDock.js` | dock pillé en haut, actif bleu + point lumineux | Nav globale conservée ; le Community ajoute sa **sidebar propre** (240–270 px) **sous** le dock |

**Règles de migration** : les nouveaux tokens sont préfixés `--c-*` et scopés au Community (fiche `community-tokens.css`) pour ne pas casser le reste de l'app ; le fond de la page `/community` et de toutes ses sous-pages passe à `#05070A`.

---

## 2. Design Tokens

### 2.1 Couleurs

#### Surfaces — 4 niveaux (noir dominant)

| Token | Valeur | Usage |
|---|---|---|
| `--c-bg` | `#05070A` | Fond d'application Community (remplace `#000` sur ces pages) |
| `--c-surface-1` | `#090E15` | Cartes, blocs, header, sidebar, rail |
| `--c-surface-2` | `#0D131C` | Cartes internes (commentaire dans post, input, menu déroulant, modales) |
| `--c-surface-3` | `#111A25` | Hover des surfaces, éléments « en relief 3e niveau » |
| `--c-overlay` | `rgba(2,4,8,0.72)` | Fond de modale / drawer (over `#000` ≈ 60–70 % opacité + `backdrop-filter: blur(8px)`) |
| `--c-float` | `rgba(13,19,28,0.9)` + `blur(24px)` | Palettes flottantes (search ⌘K, dropdown, tooltip) — reflet du dock existant |

#### Bordures — 1 px quasi invisibles

| Token | Valeur | Usage |
|---|---|---|
| `--c-border` | `rgba(255,255,255,0.07)` | Bordure par défaut de toutes les surfaces (≈ `#ffffff12` actuel) |
| `--c-border-strong` | `rgba(255,255,255,0.12)` | Inputs, séparateurs de champs dans les formulaires |
| `--c-border-hover` | `rgba(46,84,255,0.38)` | **Le bleu n'apparaît qu'au hover/focus** (§ spé) |
| `--c-divider` | `rgba(255,255,255,0.06)` | Séparateurs internes (entre posts, entre rangées de tableaux) |

Règle : jamais de bordure rectangulaire bleue permanente ; la bordure bleue est un signal d'interaction.

#### Couleurs de marque & sémantiques

| Token | Valeur | Usage |
|---|---|---|
| `--c-blue` | `#2E54FF` | **Bleu électrique — action primaire, actif, check vérifié, lien** |
| `--c-blue-hover` | `#4470FF` (brighten 8 %) | Hover des actions primaires |
| `--c-blue-soft` | `rgba(46,84,255,0.14)` | Fond « accent » des chips/éléments actifs |
| `--c-blue-tint` | `#9DB9FF` | Texte bleu sur fond sombre (liens, valeurs actives) |
| `--c-cyan` | `#5FCCFF` | Cyan léger — signaux data / IA (très contenu) |
| `--c-violet` | `#7C6BFF` | Violet — utilisé uniquement en halo très subtil (glow radial, gradients hero), jamais plein |
| `--c-green` | `#18C27C` | Hausse, succès, rocket |
| `--c-red` | `#F04438` | Baisse, erreur, signalement, suppression |
| `--c-red-sent` | `#E11D48` | Sentiment bearish (conservé des sections actuelles) |
| `--c-amber` | `#F0A03D` | Avertissement, sentiment neutre-à-prudent, `F59E0B` en sentiment |
| `--c-gold` | `#F5C518` | Premium uniquement (badge 👑, bandeau, bordure de carte premium) |
| `--c-live` | `#FF4D4F` | Pastille LIVE (avec pulsation douce, pas clignotante) |

#### Dégradés de fond page (hérités, atténués)

```
body.community {
  background:
    radial-gradient(900px 640px at 88% -10%, rgba(46,84,255,0.10), transparent 62%),
    radial-gradient(700px 520px at -5% 92%, rgba(124,107,255,0.07), transparent 65%),
    radial-gradient(800px 420px at 50% 115%, rgba(46,84,255,0.05), transparent 60%),
    var(--c-bg);
}
```
Intensité < 10 % : le noir doit rester dominant.

### 2.2 Typographie

Font : **Inter** (famille unique). `font-variant-numeric: tabular-nums` sur **toutes** les données chiffrées (prix, compteurs, horodatages, stats).

| Token | Taille | Poids | Usage |
|---|---|---|---|
| `--c-ts-11` | 11 px | 500/600 | Micro-labels, badges (uppercase + `letter-spacing 0.15px` pour les libellés de tableau) |
| `--c-ts-12` | 12 px | 400/500 | Métadonnées, handles, timestamps |
| `--c-ts-13` | 13 px | 400 | Texte courant compact (tables) |
| `--c-ts-14` | 14 px | 400/500 | Texte standard, boutons |
| `--c-ts-15` | 15 px | 600 | Titres de composant, tabs |
| `--c-ts-16` | 16 px | 500/600 | Texte important, cartes pro |
| `--c-ts-18` | 18 px | 600 | Titres de section |
| `--c-ts-20` | 20 px | 600 | Titres de page (sidebar-level) |
| `--c-ts-24` | 24 px | 700 | Titres de page principaux |
| `--c-ts-28` | 28 px | 700 | Hero des pages d'entité (community, profil pro) |
| `--c-ts-40` | 40 px | 800 | Hero d'accueil « Le réseau financier de Bluerock. » |

Hiérarchie : `letter-spacing -0.02em` sur titres ≥ 18 px, `-0.03em` sur ≥ 28 px. `line-height 1.05–1.1` titres, `1.5` corps. Graisse maximale : 800 (réservé aux hero et aux valeurs de stats).

### 2.3 Espacement, radius, ombres

**Grille 4 px** : `4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64`.
Règle : espacement pair ; le contenu respire — jamais de padding < 12 px sur une carte, jamais de gap < 8 px entre composants cliquables.

**Radius**

| Scale | Valeur | Attribution |
|---|---|---|
| `--c-r-6` | 6 px | Micro-contrôles (icône seule, dots, inputs compacts) |
| `--c-r-8` | 8 px | Inputs, selects, boutons secondaires/sm |
| `--c-r-10` | 10 px | Boutons md/lg, avatars **non-carreaux-PRO**, champs du composer |
| `--c-r-12` | 12 px | Cartes standard (post, communautés, pros, events, embed) |
| `--c-r-16` | 16 px | Cartes vedettes (hero, event LIVE, community banner) |
| `--c-r-20` | 20 px | Sections / modales / drawer / panneaux admin |
| `--c-r-pill` | 999 px | **Réservé** : tags, badges, filtres, chips, boutons pill (search, composer) |

**Ombres** (héritées, normalisées)

| Token | Valeur | Usage |
|---|---|---|
| `--c-shadow-card` | `0 1px 2px rgba(0,0,0,0.4), 0 0 22px rgba(46,84,255,0.05)` | Cartes |
| `--c-shadow-hover` | `0 12px 32px rgba(0,0,0,0.55), 0 0 30px rgba(46,84,255,0.12)` | Cartes au hover (léger soulèvement `translateY(-1px)`) |
| `--c-shadow-pop` | `0 24px 60px rgba(0,0,0,0.7)` | Modales, dropdown, search command |
| `--c-glow-btn` | `0 0 22px rgba(46,84,255,0.30), 0 6px 18px rgba(46,84,255,0.18)` | Bouton primaire (existant) |

### 2.4 Icônes & images

- **Lucide uniquement**, `strokeWidth 1.8–2`, 16 px en inline, 18–20 px en navigation, 22 px en hero. Jamais d'emoji dans l'UI (le 🔥 des réactions existantes devient l'icône `Flame` de Lucide).
- **Images abstraites** : données, marchés africains, motifs de graphiques — jamais de drapeaux ni de clichés.
- Avatars : initiales sur fond couleur (`avatar_color` backend) ; photos `object-cover` uniquement si fournies.

### 2.5 Motion

| Action | Durée | Easing | Effet |
|---|---|---|---|
| Hover générale | 150 ms | ease-out | fond/bordure/couleur, lift `-1px` sur cartes |
| Press | 100 ms | ease-out | `scale(0.98)` |
| Like/Rocket/Follow | 200 ms | spring léger | icône `scale(1→1.25→1)` + couleur |
| Apparition modale/drawer | 180 ms | ease-out | fade + `translateY(8px→0)` |
| Apparition dropdown/menu | 150 ms | ease-out | fade + `translateY(4px→0)` |
| Skeleton | shimmer 1 200 ms | linear, infinite | dégradé `#111A25 → #0D131C` |
| Pastille LIVE | pulse 1 600 ms | ease-in-out | opacité 1→0.45→1, jamais de clignotement |
| Toast | 200 ms in / 300 ms out | ease-out | slide depuis le haut, auto-dismiss 3 s |

Toutes les transitions : `transform, opacity, background-color, border-color, box-shadow` uniquement (jamais `all`).

---

## 3. Composants

### 3.1 Boutons
| Variant | Fond | Bordure | Texte | Hover | Active |
|---|---|---|---|---|---|
| `primary` | `#2E54FF` | none | `#FFFFFF` | `brightness(1.08)` + glow | `brightness(0.94)` |
| `secondary` | `--c-surface-2` | `--c-border` | `--tv-text` | `--c-surface-3` + border-hover | surface-2 |
| `ghost` | transparent | transparent | `--tv-text-secondary` | bg `rgba(255,255,255,0.06)` | — |
| `danger` | `rgba(240,68,56,0.14)` | `rgba(240,68,56,0.4)` | `#FF7373` | bg intensifié | — |
| `premium` (si applicable) | `--c-surface-2` | `--c-gold 40%` | `--c-gold` | bg `rgba(245,197,24,0.08)` | — |

Tailles : **sm** 32 px (padding 0 12, ts-13), **md** 38 px (0 16, ts-14), **lg** 44 px (0 20, ts-15). `display:inline-flex; align-items:center; gap:8px; icon 16px`. Radius 8 (sm) / 10 (md, lg). Disabled : `opacity 0.4; pointer-events none`.

### 3.2 IconButton
36 × 36 px, radius 10, ghost ; hover surface-3 ; état actif : fond `--c-blue-soft` + icône `--c-blue-tint`. Toujours `aria-label`.

### 3.3 Avatar
- **Sizes** : xs 24 · sm 32 · md 40 · lg 56 · xl 72 · hero 96 px.
- Carré arrondi : radius `8` (xs/sm) `10` (md) `12` (lg+). Fond : `avatar_color` backend dégradé léger, initiales en `700`, `rgba(255,255,255,0.85)`.
- **Badge vérifié** : petit cercle bleu `18 px (sm) / 22 px (md+)`, bordure `2px #05070A`, icône `Check` Lucide 11–13 px, blanc. Posé en bas-droite de l'avatar. Discret — jamais de gros badge social.
- **Stack d'activité (rail)** : avatars **circulaires** xs superposés `-6px` overlap, bordure `2px --c-surface-1`.

### 3.4 Badge & Tag
- **Tag** : pill, ts-11, 600, padding `2px 9px`, fond `--c-blue-soft`, bordure `--c-blue 35 %`, texte `--c-blue-tint`. Catégories : Finance / Trading / IA / Économie / Entrepreneuriat / ESG / BRVM.
- **Badge** : pill ts-11 700 ; `new`/succès vert, statuts ambre, erreur rouge, Premium or.
- Filtres cliquables : pill `h 30px padding 0 14px`, secondaire ; actif = bleu plein texte blanc.

### 3.5 Card
```
padding 16; radius 12; bg --c-surface-1; border 1px --c-border;
header: gap 12, padding-bottom 12 + divider;
hover (si cliquable): translateY(-1px) + shadow-hover + border-hover;
```
Variante `CardInterne` (commentaires, champs) : `--c-surface-2`. Variante `CardVedette` (hero, live) : radius 16 + glow faible + blue-soft gradient `linear-gradient(160deg, rgba(46,84,255,0.10), transparent 55%)`.

### 3.6 Input
```
h 38 (md) / 44 (lg); bg --c-bg; border 1px --c-border-strong; radius 8;
focus: border --c-blue 60% + ring 4px rgba(46,84,255,0.16);
placeholder --tv-text-muted; label ts-13 500 + margin-bottom 6;
erreur: border rgba(240,68,56,0.6) + message #FF7373 ts-12;
disabled: opacity 0.45;
textarea: radius 10, padding 12, min-h 88.
```

### 3.7 SearchField (in-app, non-⌘K)
`h 40`, radius **pill**, bg `--c-surface-2`, icône `Search` avant placeholder « Rechercher… », focus ring bleu. Doublé dans le rail et le header.

### 3.8 Tabs
- **Ligne** : ts-15 500, padding `10px 16px`, `border-bottom 2px transparent` ; active : `--c-blue` + `--c-blue-tint` (existant, hérité) ; scroll horizontal mobile.
- **Pill (chips)** : h 32 pill, secondaire ; active bleu plein. Utilisées pour les filtres Discover/Events.

### 3.9 Dropdown / Select
Palette `--c-float` blur 24 px, radius 12, shadow-pop, item `h 36 padding 0 12`, hover surface-3, sélection check bleu. Flèche Lucide `ChevronDown` 16.

### 3.10 Tooltip
Palette `--c-surface-2`, blur 16, radius 8, ts-12, padding `6px 10px`, apparition 150 ms − délai 300 ms, `role="tooltip"`.

### 3.11 Modal & Drawer
- **Modal** : max-width 480 (confirmation) / 560 (editor) / 640 (wizard) ; radius 20 ; bg `--c-surface-1` ; header `padding 20 24 : 20px 24px ts-18 + X` ; footer fixe `padding 16 24` avec actions `justify-end`.
- **Drawer (mobile)** : 100 % largeur, radius `20px 20px 0 0`, slide 200 ms.
- Backdrop `--c-overlay` + blur 8, `Esc` ferme, focus piégé, `aria-modal`.

### 3.12 Toast
Top-center dans la zone de contenu, `--c-float`, border, radius 12, padding `12px 16px`, icône statut (Check vert / AlertTriangle ambre / X rouge), ts-13, stack gap 8.

### 3.13 Post
```
Card 16 padding 20; header: avatar md + (nom ts-15 600 + badge vérifié 18px,
handle @bluerock ts-12 muted, ·, timestamp ts-12 muted) + menu (MoreHorizontal ghost
→ Modal signalement/suppression si autorisé);
corps ts-15 lh 1.6;
FinancialEmbed ou image (radius 12, border);
actions: 4 IconButtons ghost ts-13 (counts en tabular):
  Rocket (actif = bleu + count bleu), MessageCircle, Repeat2, Bookmark;
  Save individuel à droite;
footer: séparateur + Likes compté (« 128 ») ; likes-only rollups;
hover carte cliquable → Post Detail.
```
Hauteur min-boutons 36 px. Actions « fiables » : `Rocket` = like premium BlueRock (icône Rocket Lucide, actif `#2E54FF`), `Insightful` = `Lightbulb` ambre (déclenche aussi un compteur de qualité), les deux présents.

### 3.14 Commentaire
```
CardInterne radius 12 padding 12; avatar sm + (nom ts-13 600 + badge vérifié +
timestamp muted ts-12) ; texte ts-13.5 lh 1.55; actions inline: Flame (réaction)
ts-12 + menu 3 points (suppression/rapport);
réponses : indent 40 sous le commentaire parent, trait vertical `1px --c-border`
à gauche; « Afficher 3 réponses » ts-12 --c-blue-tint;
groupe affiché = 3 premiers + « Afficher plus » ; rafraîchissement optimiste.
```

### 3.15 Composer
```
Card radius 16 padding 16; rangée 1: avatar sm + input textarea ghost multiline
(« Publier une analyse, une question… » ts-15, bg transparent, min-h 44, autosize 4 lignes max);
rangée 2: attachements (ImagePlus, FileUp, Link2) + Emoji ni gradient;
rangée 3: sentiment chips (Hausse #18C27C / Neutre #F0A03D / Baisse #E11D48) + tag Communauté (dropdown);
rangée 4 (footer): Draft (Save ghost) · bouton `Publier` primary lg;
focus: ring bleu sur la carte entière.
```
Poster ne demande jamais de titre — champ libre comme un terminal.

### 3.16 CommunityCard / ProfessionalCard / EventCard / StatCard
- **CommunityCard** : Card 12 ; header avatar lg (radius 12) + nom ts-16 600 + tag catégorie ; statut member badge ; stats row (`Membres` `Publications` `Scoring`) en ts-13 tabular ; footer bouton secondaire md « Rejoindre » → actif « ✓ Membre » (retenu 200 ms, jamais retour auto) ; hover lift.
- **ProfessionalCard** : même carcasse ; badge vérifié ; stats (`Rockets` `Followers` `Réputation`) ; bouton secundaire « Suivre » → « Suivi ✓ » bleu 200 ms.
- **EventCard** : Card 12 ; header : kind chip (LIVE = `--c-live` + pulse / WEBINAR / CONFERENCE / AMA / WORKSHOP) + date `ts-12 muted` ; titre ts-16 600 ; lieu ts-12 muted (+ icône MapPin) ; intervenants = avatar stack xs ; footer : participants (`120 inscrits · 8 en liste d'attente`, tabular, icônes Users) + bouton « S'inscrire » ; premium_only → badge 👑 `--c-gold` ; inscrit → « Inscrit ✓ » bleu ; complet → disabled « Complet » ; waitlist → « En attente » ambre.
- **StatCard** : padding 16, radius 12, label ts-12 uppercase muted, valeur ts-24 700 tabular, delta ts-12 (+ `TrendingUp` vert / `TrendingDown` rouge), mini étincelle 40 px optionnelle.

### 3.17 FinancialEmbed (bloc natif Bluerock — SONATEL SNTS)
```
Card radius 12 padding 16; header: logo fond 36x36 radius 8 + nom + symbol pilfer
SNTS + badge vérifié; à droite: delta % pill vert (fond rgba(24,194,124,0.14));
ligne principale: prix ts-20 700 tabular + +2,4 % ts-13 vert; 
widget chart: MarketChart réutilisé, h 160, ranges [1J | 1M | 3M | 6M | 1A] pill 11px;
stats grid 2x3 ts-12: Market cap 325,2 Md F CFA · PER 14,2 · Div. yield 4,8 %
Volume 1,24 M · 52 sem. 2 850 – 3 400 · Secteur Télécoms;
footer: bouton ghost « Voir la fiche → » (→ /quote?symbol=);
tout le bloc est un lien vers la fiche (hover: border-hover + lift);
données fictives marquées « Données démo » (badge ts-10 muted) si non-production.
```

### 3.18 Chart (réutilisé `MarketChart`)
Hauteurs : 160 (embed) · 220 (detail event/analytics) · 96 (mini spark sparkline 48 px).
Couleur ligne `#2E54FF`, aire dégradée `rgba(46,84,255,0.25)→transparent`, grid `rgba(255,255,255,0.05)` pointillé, crosshair bleu `60 %`, tooltip palette flottante. Assets garantis (aucun bouton de refresh).

### 3.19 Skeleton
Lignes shimmer : hauteurs 12–14, radius 6 ; avatars 40 ; cartes entières `--c-surface-1` avec bande shimmer 60 %. Pas d'animation sur `prefers-reduced-motion`.

### 3.20 Empty / Error state (premium)
```
Centré dans la carte: icône Lucide 28 toast 45% (Inbox / SearchX / AlertOctagon),
titre ts-16 600, sous-texte ts-13 muted max-w 320, CTA ghost md;
erreur serveur → ServerDownArt + « Réessayer » (bouton secondaire, retry câblé);
jamais de message d'erreur technique brut.
```

---

## 4. Layout architecture

### 4.1 Desktop (≥ 1200 px)
```
┌────────────────────────────────────────────────────────────────────┐
│ Top dock (existant, z-200, plein écran)                           │
├──────────┬──────────────────────────────────────┬──────────────────┤
│ Sidebar  │ Content                             │ Right rail       │
│ 256 px    │ fl-e: max-width 720, centré          │ 320 px fixe      │
│ fixed    │ (scroll indépendant)                │ (scroll indépendant)│
└──────────┴──────────────────────────────────────┴──────────────────┘
```
- **Sidebar** (240–270 px, ici **256**) : `bg --c-surface-1`, `border-right 1px --c-border`, padding `12px 10px` ; logo 22 px bleu + « BLUEROCK » ; groupe : Home, Feed, Discovery, Communautés, Événements, Professionnels, Mes publications, Mes marque-pages ; groupe Admin (staff) : Modération, Analytics, Créer une communauté ; footer : profil (avatar sm + nom) + icônes Settings, Notifications.
  - Item : `h 36, radius 8, padding 0 12, icon 18 + label ts-14` ; hover surface-3 ; **active = fond `--c-surface-2` + icône/label `--c-blue-tint` + indicatrice `2px × 16px` bleue `left:0` (PAS de rectangle bleu)**.
- **Header** (compact) : `h 56, padding 0 24, bg --c-bg, border-bottom --c-border` ; gauche titre de page (ts-20 600) ; droite : SearchField (⌘K), icône notification avec dot bleu `6px`, avatar me → menu.
- **Right rail** (indépendant, masqué tablette) : `w 320, padding 20 16, gap 20` ; widgets : Profils à suivre (3), Tendances (+5 titres), Événements à venir (2–3, chips LIVE), Activité (stack avatars + 2 lignes muted). Retour au rail après scroll : `position:sticky top 20`.
- Gap colonnes 24 ; padding page `24px 32px` ; content max-width 720, `margin auto`.

### 4.2 Tablette (768–1199 px)
- Right rail **supprimé** (≠ version réduite) ; les blocs Tendances/Événements/Activité migrent sous le feed (2-col grid).
- Sidebar **repliée** en colonne d'icônes 64 px (icons + tooltips), ou masquée sous 900 px en faveur du header + back-stack.
- Content max-width 640 ; padding 20.

### 4.3 Mobile (< 768 px)
- Structure héritée `mobile-root` / `safe-area` (padding `0 16`), **bottom nav** 5 items (h `64px + safe-area`), **pas une réduction du desktop**.
- Bottom nav : Accueil · Marchés · Community · Portfolio · Profil (icônes Lucide 22, labels ts-11 500, actif = icône + label `#2E54FF` + dot 4 px au-dessus ; inactif `#9AA3B2`).
- Cartes pleine largeur ; header contextuel ; tabs scrollable ; FAB « Composer » (56 px, blur float) si besoin par écran.

---

## 5. Screens — 25 écrans

> Ordre de construction imposé (§65). Chaque écran : structure, éléments, états, responsive.

### 01 · Community Home (accueil)
**Objectif** : la porte d'entrée — héros discret + stats + feed + rail.
- **Hero (320 px)** : sous-header, `bg --c-bg` avec gradient blue-soft très léger ; « Le réseau financier de Bluerock. » ts-40 800 (−0.03em) ; sous-texte ts-15 muted max-w 560 « Analyses, communautés et données — pensés pour les décideurs. » ; ligne stats inline `gap 24, divider 1px` : `12 400 professionnels · 340 communautés · 26 000 publications/semaine · 48 événements` (valeurs en ts-15 600 tabular) ; CTA secondaire « Créer sa communauté » + primary « Explorer ».
- **Colonne feed** : composer (§3.15) → tabs (§3.8 : Pour vous / Abonnements / Communautés / Professionnels / Tendances / Événements) → flux de Posts (§3.13) avec FinancialEmbed tous les ~4 posts ; pagination infinité (IntersectionObserver), skeleton ×3 en append.
- **Rail** : 4 widgets (§4.1).
- États : skeleton hero 2 lignes + 3 cartes ; vide « Aucune publication — suivez des profils » ; erreur ServerDownArt + Réessayer.
- Responsive : hero ts-28 mobile, stats en 2×2 wrap, tabs scrollables.

### 02 · Feed
**Objectif** : le flux pur, sans hero.
- Header dédié « Feed » ; tabs (§3.8, mêmes 6) ; composer réduit en « chip » (`input pill h 44, « Partager une analyse… »`, focus → composer complet overlay drawer mobile).
- Le tab **Professionnels** : filtre chips (Tous / Vérifiés / À suivre) + cartes Pros ; **Tendances** : liste titre + éditeur + delta ; **Événements** : grid EventCard.
- Réutilise `FeedSection` existante pour les données ; masque le header redondant sur desktop (déjà dans la sidebar).

### 03 · Post Detail & Commentaires
**Objectif** : le post en lecture focalisée.
- Colonne centrée max 640 ; card post complète (§3.13) ; puis section Commentaires (header « Réponses (n) ») : composer commentaire (avatar sm + input pill + Send) ; liste Commentaire (§3.14) ; « Afficher plus » toutes les 50 ; « Afficher toutes les réponses ».
- États : chargement skeleton post + 4 commentaires ; vide « Soyez le premier à commenter » ; erreur de commentaire = toast.
- Mobile : drawer commentaires full-height (slide 200 ms), composer sticky au-dessus du bottom nav.

### 04 · Community Detail
**Objectif** : une communauté, sa vie.
- **Banner** (h 180, dégradé identité de la communauté bleu-soft/violet très subtil, images abstraites marché autorisées) ; avatar xl 96 superposé −48 ; nom ts-28 700 + tag catégorie + vid ; boutons : « Rejoindre » (primary si public) / « Invitation » (secondary) ; stats inline : membres · publications · score de fiabilité (`--c-green`).
- Tabs : **Flux · Membres · Événements · À propos**.
- Flux = posts de la communauté (filtre automatique) ; Membres = grid avatar + nom + rôle + Follow ; À propos = description (markdown simple) + règles en CardInterne + admin display.
- États : private → écran « Communauté privée — rejoignez par invitation » (icône Lock, CTA) ; banned → message + bouton Appel (`appealCommunityPost` existant non utilisé — activer).

### 05 · Community Admin — Overview
**Objectif** : tableau de bord du fondateur (PAS un onglet public).
- Header « Administration · {name} » + chip actif/pending_removal + bouton « Paramètres ».
- 4 StatCards : Membres (Δ7 j) · Publications (Δ7 j) · Portée rockets · Score de fiabilité.
- Grid 2 col : mini chart « Publications / 30 j » (MarketChart 220) + liste « 5 derniers membres ».

### 06 · Community Admin — Posts
- Table (padding 12, divider) : publication · auteur · date · rockets · [Masquer] [Supprimer] ; actions icon-danger ; ligne masquée strikethrough muted + bouton « Rétablir » ; filtre chips (Toutes / Signalées / Masquées).
- **Signalées** : carte signalement par-dessus le post (CardInterne ambre) : raison chip + « Résolu » après action.

### 07 · Community Admin — Membres
- Recherche inline (pill) + table : avatar · nom · rôle (Admin/Modérateur/Membre chips) · rejoint · [Promouvoir/Modérer/Retirer] menu ; confirmation modal avant retrait.

### 08 · Community Admin — Modération
- Tabs internes : **Signalements** (cartel: post/commentaire + motif + « Masquer / Ignorer ») · **Bannis** (liste + « Débannir ») · **Invitations** (accepter/refuser).
- Vacances visuelles : chips de statut ; toast de confirmation à chaque action.

### 09 · Community Admin — Événements
- Liste EventCard + bouton « Créer un événement » (form modal : kind select chips, titre, date/heure (datetime-local), lieu, capacité, premium_only toggle, speakers répétables) ; actions publier / annuler / supprimer + chip d'état (draft ambre / publié vert / annulé rouge).

### 10 · Community Admin — Analytics
- Hero : 4 StatCards ; chart « Évolution des membres » (30/90 j, ranges pills) ; chart « Publications & engagement » (2 lignes : posts, rockets) ; top 5 publications (liste avec compteurs) ; export (ghost, CSV fictif).
- Réutilise `MarketChart` ; tickers tabular ; légendes ts-11 uppercase muted.

### 11 · Community Admin — Paramètres
- Form sections (Card) : identité (nom, tag, description, visibilité radio public/privé, catégorie select) ; média (banner image upload) ; règles (textarea) ; danger zone (border rouge) : « Transférer la propriété », « Dissoudre la communauté » (modal double confirmation « taper le nom pour confirmer »).

### 12 · Professional Profile
**Objectif** : la fiche d'un membre Pro.
- Card hero : avatar xl 96 + nom ts-28 700 + vérifié + handle ; tagline ts-14 muted ; stats row 3–4 (Rockets · Followers · Réputation score + niveau) ; boutons **Suivre** (secondary → actif bleu 200 ms) / **Message** (primary, ouvre la modal de message toast si non implémenté) ; badge “Pro vérifié” (Check + ts-12, fond `--c-blue-soft`).
- Row « À propos » : bio ts-14 lh 1.6 max-w 560.
- Tabs : **Publications · Commentaires · Communautés · Analyse** (post selected hot take + FinancialEmbed).
- États : privé → « Ce profil est privé » ; vide → 3 premiers posts « Vide pour l'instant ».

### 13 · Discovery
**Objectif** : découvrir sans le bruit d'un feed — **grille, jamais un feed agrandi**.
- Header « Découvrir » + SearchField pill (filtré localement).
- **Tabs** : Professionnels / Communautés / Publications / Tendances.
- Grid desktop `repeat(auto-fill, minmax(300px, 1fr)) gap 20` (2–3 col) ; mobile 1 col.
- Cartes : ProfessionalCard / CommunityCard / PostCard compact (texte 2 lignes clamp + meta) / TopicCard (tag + volume + delta).
- Filtres chips par catégorie (Finance, Trading, IA, Économie, Entrepreneuriat, ESG, BRVM) ; tri dropdown (« Pertinence · Récent · Populaire »).

### 14 · Search (⌘K)
**Objectif** : la recherche commande, instantanée, institutionnelle.
- Trigger partout : `kbd` visuel dans le header ; **⌘K / Ctrl+K** ouvre la palette (plein écran tablette/mobile).
- Palette : overlay `--c-overlay` blur 12 ; panneau `--c-float` 640 max radius 20 shadow-pop ; input h 52 icon Search + placeholder « Rechercher une société, un profil, une communauté… ».
- Résultats **catégorisés** : Professionnels / Communautés / Publications / Entreprises / Événements — sections `label ts-11 uppercase muted + 3 items` ; item = icon/avatar + titre + meta + sous-action (Suivre/Rejoindre/Fiche).
- Footer palette : raccourcis `↑↓`, `↵`, `Esc` (ts-11 muted, kbd pill).
- États : vide « Aucun résultat pour “…” » ; debounce 200 ms ; skeleton inline 4 lignes.

### 15 · Events
**Objectif** : l'agenda de l'écosystème.
- Header « Événements » + bouton primary « Créer » (staff) ; filtre chips kinds (Tous / LIVE / Webinar / Conférence / AMA / Workshop) ; tri (Date · Populaire) ; toggle « Pro uniquement ».
- Grid `repeat(auto-fill, minmax(300px,1fr)) gap 20` ; EventCard (§3.16) ; LIVE en tête : 2 EventCards vedettes (radius 16 + bordure `--c-live 35 %` + pastille pulse).
- Réutilise `EventsSection` (données + création) ; ajout de la vue grid et des chips de statut.

### 16 · Event Detail
- Hero : kind chip + titre ts-28 700 ; méta row : date (ts-15) · heure · lieu `MapPin` · fuseau ; stats : `Inscrits (n) · En attente (n) · Places (n)` tabular ; bouton principal (S'inscrire / Inscrit ✓ / En attente / Complet) + secondaire « Partager ».
- Blocs : **Intervenants** (avatar md + nom + rôle, grid 2 col) · **Agenda** (liste horaire ts-13 tabular + entrée) · **À propos** (texte, peu profond) · **Participants** (avatar stack + n).
- LIVE : bandeau haut `--c-live 12 %`, « En direct · 42 en ligne » + chart du covalence s'il s'agit d'un AMA marché.
- Premium-only : carte CTA « Événement Premium » + badge 👑 + bouton « Découvrir Premium ».

### 17 · Notifications
- Header « Notifications » ; filtre chips (Toutes / Suivis / Réponses / Système) ; groupe par jour (« Aujourd'hui », « Hier ») en ts-11 uppercase muted.
- Item : icône de type (Rocket bleu · MessageCircle vert · BadgeCheck violet-soft · CalendarEvent amber · Shield rouge) dans carré 36 radius 10 + texte ts-13 + ts-12 muted + dot non-lu bleu 8 px (suppression au clic).
- Actions inline : Suivre/Rejoindre/Consulter (ghost md).
- États : vide « Aucune notification » ; appui long mobile → « Tout marquer comme lu ».

### 18 · Bookmarks
- Header « Marque-pages » + tri (Récent · Auteur · Communauté) ; liste PostCard compacte (max 3 lignes) avec action Retirer (Bookmark actif → toast).
- Vide : « Aucun marque-pages — sauvegardez une analyse » + CTA Explorateur.

### 19 · Create Community (wizard 7 étapes)
- **Drawer desktop / plein-écran mobile** ; header stepper : 7 points 6 px (complété bleu + Check) + « Étape 2/7 » + X.
- Étapes indices :
  1. **Identité** : nom (input, compteur 3–40) + description (textarea 240) ;
  2. **Catégorie** : chip select 7 catégories + couverture (BRVM 01–Expresso) ;
  3. **Visibilité** : radios (Public / Privé / Sur invitation) cartes 2 col ;
  4. **Bannière & image** : upload 2 dropzones (16:9 / 1:1) aperçu ;
  5. **Règles** : liste réordonnable (GripVertical), max 8 ;
  6. **Modération** : toggles (Signaux automatiques / Filtres mots-clés / Vérification premium) ;
  7. **Récapitulatif** : carte preview complète + bouton « Créer la communauté » (success → toast + redirection detail).
- Validation progressive inline, jamais de blocage en masse ; « Retour » ghost à chaque étape ; dirty-state guard modal.

### 20 · Analytics (perso, niveau utilisateur)
**Objectif** : la réputation chiffrée.
- Card Réputation (réutilise `ReputationSection`) : score ts-24 700 + niveau chip + progression (bar 4 px, `--c-green` fill, marqueur palier) + 4 métriques (Fiabilité · Pertinence · Utilité · Transparence — chart radar 4 axes 220 ou barres) + badges mérités (grid, icône + nom, glow faible).
- Tabs : **Interactions · Publications · Badges** ; chart « Rockets & portée / 30 j » (2 lignes) ; table du top 5 publications perso (colonnes : post · rockets · partages · notes) ; leaderboard (top 10 + ligne « moi » surlignée `--c-surface-2` + point bleu).

### 21 · Moderation (signalements utilisateur)
**Objectif** : l'utilisateur suit ses signalements, pas un back-office.
- Tabs : **Mes signalements** (liste : cible + motif chip + état — résolu vert / en revue ambre / rejeté rouge) · **Appels** (post masqué + champ + bouton Appel) · **Bannissements** (détail raison + durée + bouton Appel désactivé si épuisé).
- Réutilise `ModerationSection` privée ; aucun accès admin visible.

### 22 · Settings (Community)
- Deux colonnes : nav latérale (Profil · Notifications · Confidentialité · Communauté) + panneau de formulaire.
- Sections : **Profil** (avatar upload, display_name, handle, bio, vérification statut chip) ; **Notifications** (toggles : suivis, événements, signalements, bimensuel digest) ; **Confidentialité** (radios : profil privé, visibilité likes) ; **Communauté** (deux toggles spam-striction + bouton danger « Supprimer mon compte communautaire » — modal double confirm).
- Salvage : « Enregistrer » primary button sticky en bas du panneau ; toast succès.

### 23 · Mobile — Home (Accueil)
- Bottom nav active « Accueil » ; hero compact mobile : « Le réseau financier de Bluerock. » ts-28 800 + stats wrap + clone composer chip → drawer ; feed ajusté `padding 0 16` ; cards radius 12 padding 14 (compacité +10 % : ts-14 corps) ; ImageUp/Boutons raccourcis conservés ; pas de rail (widgets Tendances fusionnés en une carte « Tendances » entre 2 posts).

### 24 · Mobile — Marchés (section Community)
- Sous-tab du bottom nav « Marchés » dans le contexte Community : indices strip (réutilise l'existant) + FinancialEmbed list (SNTS, BOAB, ETIT…) grid 1 col + event LIVE bandeau si en cours. Nav bottom active « Marchés ».

### 25 · Mobile — Community / Portfolio / Profil
- **Community** : tabs + feed ; FAB composer 56 px (blur + bordereau, bleu actif) ;
- **Portfolio** : réutilise les cartes existantes (pas de redesign), bottom nav actif « Portfolio » ;
- **Profil** : fiche mobile du §12 en 1 colonne + bundle accès « Mes publications / Marque-pages / Réputation / Signalements → Settings ».

### 26 · Tablet
- Application du §4.2 sur Home, Feed, Post Detail, Community Detail, Events : two-col grid contrôle, rail supprimé, sidebar icônes 64 px (≥ 900 px) sinon masquée, content max 640.

---

## 6. Micro-interactions & états transverses

| Interaction | Comportement |
|---|---|
| Follow / Rejoindre | `Suivre → Suivi ✓` (bleu, 200 ms spring, pas d'annulation auto) ; icône `UserCheck` |
| Rocket / Like | icône `scale(1→1.25→1)` + `#2E54FF`, count +1 optimiste |
| Bookmark | `Bookmark` → `Bookmark +` rempli bleu, toast « Sauvegardé » (1,5 s) |
| Insightful | `Lightbulb` ambre, compteur +1 |
| Like commentaire | `Flame` vert/actif, count +1 |
| Suppression | double-confirmation modal (jamais `window.confirm`) |
| Retry erreur | bouton secondaire « Réessayer » ré-câblé au même endpoint |
| Navigation tabs | fond bleu-soft 150 ms, contenu fade 120 ms |
| Scroll posts | header reste fixe, sidebar/rail sticky |
| Keydown | `⌘K` search · `Esc` ferme · `↑↓↵` palette · `Enter` envoie commentaire |

**États complets exigés sur chaque composant interactif** : default → hover → active/pressed → focus-visible (ring bleu `2px` + offset 2) → disabled (`opacity .4`) → loading (skeleton ou spinner `--c-blue`). Chaque carte : default → hover → focus-visible → pressed.

**Accessibilité** : contrastes AA (texte secondaire `#9AA3B2` sur `#05070A` = 5,4:1 ✓) ; terminé par labels ARIA sur icon-only, `aria-pressed` sur toggles, `role=dialog` modales, focus trap, `prefers-reduced-motion` désactive shimmer/lift/pulse, cibles tactiles ≥ 36 px.

---

## 7. Mapping implémentation (React/Next/Tailwind)

| New | Existant réutilisé |
|---|---|
| `community-tokens.css` (`--c-*` scopés) | `globals.css` (`--tv-*`), focus ring |
| `design/Button, Card, Input, Tabs, Badge, Tag, Avatar, Tooltip, Modal, Drawer, Toast, Skeleton, EmptyState` | patterns de `FeedSection.js`, `EventsSection.js` |
| `design/PostCard.js`, `CommentItem.js`, `Composer.js` | `FeedSection.js` (données/api), `assets` |
| `design/FinancialEmbed.js` (+ mini range chart) | `MarketChart.js`, `api` quote/candles |
| `design/CommunityCard/ProfessionalCard/EventCard/StatCard` | `DiscoverSection.js`, `CommunityGroupsSection.js`, `ProfessionalSection.js` |
| `design/RightRail.js` | widgets discutés (Tendances exists in DiscoverSection) |
| `community/[home|feed|post|community|admin|pro|discover|search|events|notifications|bookmarks|create|analytics|moderation|settings].js` | `pages/community.js` (header/tag i18n) |
| `community-shell.js` (sidebar 256 + rail 320) | `Sidebar.js`, `TopBar.js`, `DesktopDock.js` (dock global conservé) |
| bottom nav 5 items bleu | `BottomNav.js` (repackage items + colors) |
| i18n keys `c2x*` FR/EN | `lib/i18n.js` (pattern existant) |
| API | `services/api.js` (clients existants + éventuels `search`, `trends`) |

Structure recommandée : `frontend/src/components/community/design/` (système) + `frontend/src/pages/community/` (routes) — garder `/community` comme Home (alias vers `community/feed`).

---

## 8. Vérification spec → écrans (exigences couvertes)

| § spec | Écran(s) |
|---|---|
| §65 ordre de construction | ordre du §5 ci-dessus |
| Hero + stats | 01 |
| Tabs 6 | 01, 02 |
| Composer + Publier | 01, 02, 03 |
| Actions post (Rocket/Insightful/Commenter/Partager/Sauvegarder) | 03, 13 (+ embed 13) |
| Financial Embed SNTS | 01, 03, 13, 24 |
| Commentaires indentés + « Afficher plus » | 03 |
| Badge vérifié discret | 04, 12, 16, 03 |
| Tendances + évolution | 02, 13, rail 01 |
| Événements LIVE/WEBINAR/CONFERENCE/AMA/WORKSHOP | 15, 16, 09 |
| Activity mini-avatars | rail 01, 16 |
| Discovery grille (pas feed agrandi) | 13 |
| Communities Directory + filtres + tri | 13, 04 |
| Admin dashboard 7 onglets | 05–11 |
| Professional Profile Suite/Message | 12 |
| Search ⌘K catégorisé | 14 |
| Notifications | 17 |
| Bookmarks | 18 |
| Create Community wizard 7 étapes | 19 |
| Analytics | 20, 10 |
| Moderation | 21, 08 |
| Settings | 22 |
| Mobile bottom nav 5 items (pas vue réduite) | 23–25 |
| Tablet rail supprimé | 26 |
| États: skeleton/empty/error/success/disabled | §6 transversal |
| Micro-interactions 150–200 ms | §6, §2.5 |
| Accessibilité (focus, ARIA, contrastes) | §6 |
| Lucide uniquement | §2.4 |
| Images abstraites (jamais drapeaux) | §2.4 |
| AI Insight discret (pas de robot) | rail/01 chip « Insight IA » cyan ts-11 |
| Réutilisation des composants existants | §1, §7 |