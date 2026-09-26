# Base de design : identité institutionnelle (Bénin Health Intelligence Platform)

Charte stricte du Bénin Health Intelligence Platform. Remplace intégralement
l'ancienne base "fundlab" (accent vert, rayons 8/16px, ombre sur les cartes,
Lato/Roboto) : ce document est désormais la seule source de vérité graphique
du projet, citée depuis `CLAUDE.md`. Source : bloc de charte transmis par
l'Agent Produit (2026-09-25), appliqué à la lettre — toute valeur non fournie
par la charte d'origine est signalée explicitement comme **dérivée** plutôt
que recopiée en silence.

## 0. Principe d'identité

Une seule marque visible : celle du ministère commanditaire. Aucun logo
propre au produit ne s'y ajoute (le logo décoratif "BHIP" de l'ancienne base
a été retiré des icônes PWA). L'en-tête, le pied de page et les icônes
d'application portent les armoiries et le nom de l'institution. Le nom du
produit reste réservé aux titres de page et aux métadonnées techniques
(texte, jamais graphique).

## 1. Couleurs

Toutes les couleurs vivent en variables CSS dans `:root` (`src/app/globals.css`),
puis sont exposées comme couleurs Tailwind via `@theme inline`, utilisables en
classes `bg-*`, `text-*`, `border-*`, `outline-*`.

### 1.1 Neutres et texte

| Rôle | Variable | Valeur | Usage |
| --- | --- | --- | --- |
| Fond de bande / page | `--plan` | `#eef2f6` | Fond `<html>`, panneaux secondaires |
| Surface | `--surface` | `#ffffff` | Fond des cartes, champs, modales |
| Surface d'appui | `--surface-appui` | `#eef2f6` | Même valeur que le fond de bande : la charte ne donne qu'un seul gris neutre |
| Titres | `--titre` | `#0a2a4a` | Couleur des `h1`-`h6` et des titres de carte, distincte du texte courant |
| Texte principal | `--encre` | `#1d2530` | Corps de texte |
| Texte secondaire | `--encre-secondaire` | `#525d69` | Descriptions, sous-titres |
| Texte atténué | `--encre-attenuee` | `#7c8794` | **Dérivé** — métadonnées, légendes ; la charte ne fournit que deux tons de texte, celui-ci comble le 3ᵉ palier déjà utilisé dans le code |
| Bordure | `--bordure` | `#dbe2ea` | Séparateurs, contours de carte |
| Bordure forte | `--bordure-forte` | `#dbe2ea` | **Fondue sur la même valeur** — la charte ne donne qu'une seule couleur de bordure, pas de second palier "fort" |

### 1.2 Marine (seule couleur d'action)

| Variable | Valeur | Usage |
| --- | --- | --- |
| `--marine` | `#0a3764` | Boutons pleins, liens, icônes actives, en-tête, anneau de focus |
| `--marine-fonce` | `#082b4f` | Survol des boutons pleins, pied de page (aplat foncé) |
| `--marine-clair` | `#e8eef6` | Fond doux : badges, pastille de sélection, fond de panneau mis en avant |

`--accent` / `--accent-fonce` / `--accent-clair` **alias** `--marine` et ses
variantes : tout le code applicatif qui utilisait déjà `bg-accent`,
`text-accent`, `outline-accent` (icônes encerclées, nav active, focus...)
hérite automatiquement de la couleur marine sans qu'un seul fichier d'écran
ait dû être modifié. Il n'existe plus aucun vert d'accent dans l'interface.

### 1.3 Statuts

Cinq tons, chacun avec une variante pleine (texte/icône) et une variante
claire (fond de badge ou de bandeau, jamais utilisée comme texte) :

| Statut | Plein | Clair | Sens |
| --- | --- | --- | --- |
| Succès | `--statut-bon` `#287d3c` | `--statut-bon-clair` `#287d3c14` | Validé, situation favorable |
| Vigilance | `--statut-vigilance` `#82540f` | `--statut-vigilance-clair` `#82540f17` | À vérifier, avertissement non bloquant |
| Alerte | `--statut-alerte` `#b7410e` | `--statut-alerte-clair` `#b7410e16` | Escalade intermédiaire entre vigilance et critique (ex. badges de gravité) |
| Critique | `--statut-critique` `#8b1e2d` | `--statut-critique-clair` `#8b1e2d12` | Bloquant, erreur |
| Information | `--info` `#1e5a8a` | `--info-clair` `#1e5a8a12` | Neutre informatif, aide |

Le composant `Alert` (bandeau de statut) garde exactement ses quatre niveaux
historiques — `BLOQUANT` (critique), `ATTENTION` (vigilance), `INFORMATION`,
`VALIDÉ` (succès) — inchangés depuis la base précédente et déjà conformes au
patron de la charte (voir §5.4). Le 5ᵉ ton, **Alerte**, est disponible comme
tonalité de `Badge` (`tone="alert"`) pour les cas où une gravité intermédiaire
a du sens (ex. résultat de laboratoire hors norme mais non critique) ; il n'a
pas été appliqué rétroactivement à un badge ou bandeau existant — c'est un
choix sémantique écran par écran, pas un remplacement mécanique.

### 1.4 Couleurs du drapeau (usage strictement limité)

| Variable | Valeur |
| --- | --- |
| `--drapeau-vert` | `#008751` |
| `--drapeau-jaune` | `#fcd116` |
| `--drapeau-rouge` | `#e8112d` |

Ces trois couleurs ne servent **qu'au filet du bloc d'identité du ministère**
(le mince trait tricolore sous le logo dans `Sidebar.tsx`). Jamais en
bandeau, jamais comme accent d'interface, jamais ailleurs.

## 2. Typographie

- **Montserrat** pour tout le texte, chargée via `next/font/google` dans
  `src/app/layout.tsx` (poids 400/600/700) : titres en graisse 700,
  sous-titres en 600, corps en 400 à 16px, libellés de navigation en
  capitales de 12px graisse 600. Remplace l'ancien Roboto : plus aucune
  police n'est chargée en dehors de Montserrat et JetBrains Mono.
- **JetBrains Mono** pour les codes, coordonnées GPS et identifiants
  (chiffres tabulaires), via la classe utilitaire `.chiffres`
  (`font-variant-numeric: tabular-nums` + police à chasse fixe). À poser sur
  toute valeur numérique affichée en colonne ou côte à côte (montants,
  scores, dates, identifiants `BJ-SANTE-...`).
- Poids maximal 700 partout (`font-bold`) : l'ancien `font-black` (900), non
  prévu par la charte, a été retiré de tout le code (39 fichiers) au profit
  de `font-bold`, avec la couleur `text-titre` sur les titres de page `h1`.

## 3. Rayons d'arrondi

Quatre paliers seulement, chacun avec un usage précis — c'est le changement
le plus visible par rapport à l'ancienne base (deux paliers, 8px/16px) :

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--radius-badge` | 2px | Étiquettes, badges (pastilles, tag "BLOQUANT" dans `Alert`) |
| `--radius-champ` | 3px | Contrôles de formulaire (`TextField`, `SelectField`) — le nom du jeton vient de "champ" et n'a pas changé, seule sa valeur a été resserrée |
| `--radius-carte` | 4px | Cartes **et** boutons (la charte les regroupe dans le même palier) : `Card`, `Button`, `IconButton`, liens de navigation de la `Sidebar` |
| `--radius-flottant` | 6px | Boîtes flottantes : `Modal` (dialogue/tiroir), menu déroulant `AvatarMenu`, bulle de `Tooltip` |

Aucune valeur arbitraire en dehors de ces quatre paliers.

## 4. Élévation : aucune ombre

Les cartes et les panneaux flottants (modales, menus déroulants, infobulles)
se délimitent **par une bordure fine, jamais par une ombre**. `--ombre-carte`
vaut désormais `none` dans `globals.css` : les classes `shadow-[var(--ombre-carte)]`
existantes dans tout le code (19 emplacements avant cette révision) restent
en place mais ne produisent plus aucun effet — c'est le seul endroit à
modifier pour retirer l'ombre de toute l'application.

## 5. Composants — règles

### 5.1 En-tête

Bande blanche (identité du ministère, connexion) puis barre de navigation
marine en capitales, fixe au défilement. **Décision produit (tranchée,
2026-09-25)** : l'espace authentifié garde sa navigation latérale (`Sidebar`,
adaptée à 8 rôles avec des menus de 1 à 7 liens) plutôt que la bande blanche
+ barre horizontale décrite par la charte, jugée coûteuse à reconstruire
pour un gain incertain sur une application authentifiée. La barre marine
unique en haut (compte utilisateur) reste inchangée.

### 5.2 Pied de page

Aplat marine foncé (`--marine-fonce`), identité en clair, liens, mention
légale. Appliqué dans `src/app/app/layout.tsx` : fond `bg-marine-fonce`,
logo blanc du ministère (`public/logo-header-blanc.png`, auparavant orphelin
et inutilisé), mention légale en texte clair.

### 5.3 Navigation

- Libellés de navigation en capitales, 12px, graisse 600 (`Sidebar.tsx`).
- Onglets (`Tabs.tsx`) : soulignés, capitales, jamais de piste en pilule —
  trait actif marine de 2px sous l'onglet sélectionné, texte atténué sinon.
  La variante mobile "barre basse à pictogrammes" décrite par la charte n'a
  pas d'équivalent construit : `Tabs` reste un composant générique, pas un
  patron de navigation d'application entière.

### 5.4 Cartes

Fond `--surface`, bordure `--bordure` 1px, rayon `--radius-carte` (4px),
**sans ombre**, padding généreux. Déjà conforme dans `Card.tsx` avant cette
révision à l'exception du rayon et de l'ombre.

### 5.5 Étiquettes / badges

Rectangles à angle `--radius-badge` (2px), jamais en pastille arrondie.
Toujours un texte à l'intérieur (`Badge.tsx`), six tons + le nouveau ton
"alerte" (§1.3).

### 5.6 Alertes / bandeaux de statut

Patron exact de la charte, déjà implémenté dans `Alert.tsx` avant cette
révision : bordure + fond clair du ton concerné, étiquette encadrée en
majuscules avant le titre (`BLOQUANT`/`ATTENTION`/`INFORMATION`/`VALIDÉ`),
`role="alert"` pour le critique, `role="status"` sinon.

### 5.7 Champs de formulaire

Hauteur minimale 44px, bordure `--bordure-forte`, rayon `--radius-champ`
(3px), texte 16px. Étiquette au-dessus, astérisque rouge si obligatoire,
mention "(facultatif)" sinon. Aide liée par `aria-describedby`, erreur en
`role="alert"`. Unité affichée en incrustation, jamais un champ séparé.
Inchangé dans sa structure (déjà conforme), seul le rayon a changé.

### 5.8 Formulaires en étapes

« Étape 2 sur 3 : Libellé » en toutes lettres, barre plate segmentée, jamais
de pastilles numérotées décoratives. **Aucun composant de ce type n'existe
dans le code actuel** — règle documentée pour le jour où un formulaire long
sera construit.

### 5.9 État vide

Encadré bordé sur fond gris léger, sans motif ni illustration décorative.
Non audité écran par écran dans cette révision (voir journal de suivi).

### 5.10 Graphiques

Aplats à angles droits, pas de dégradé ni d'effet 3D. Non audité écran par
écran dans cette révision — au moins un écran de graphiques existe
(`src/app/app/ministere/IndicateursNationaux.tsx`), à revoir.

### 5.11 Fenêtres modales

Basées sur `<dialog>` natif + `showModal()`. Boîte `--radius-flottant` (6px),
bordure, sans ombre. Bouton de fermeture rond, icône X. Inchangé dans sa
structure, rayon migré vers le palier "boîtes flottantes".

### 5.12 Chargement

Le squelette de chargement (`Skeleton.tsx`) utilisait un dégradé glissant en
boucle ; remplacé par une pulsation d'opacité en aplat (`anim-squelette-pulse`)
pour respecter l'interdiction stricte des dégradés. La barre de progression
de navigation (`NavigationProgressBar.tsx`) a perdu son dégradé turquoise et
son reflet animé : elle est désormais un aplat marine uni.

## 6. À éviter systématiquement

- Sur-titres colorés au-dessus des titres, formules d'accroche marketing.
- Pastilles numérotées décoratives, fiches flottantes à ombre portée.
- **Dégradés, nulle part** — y compris dans les animations de chargement
  (voir §5.12). Transparences sur photo, animations d'entrée.
- Grands blancs sans filet ni bande ; angles très arrondis (`rounded-full`
  reste réservé aux éléments réellement circulaires : avatars, icônes
  encerclées, pastille de trigger d'infobulle).
- Bandeau tricolore en en-tête — le drapeau n'apparaît que dans le filet du
  bloc d'identité (§1.4).
- Tout logo ou monogramme propre au produit, quelle que soit la page.

## 7. Accessibilité et mouvement (transversal, non fourni par la charte visuelle, conservé de la base précédente)

- Anneau de focus visible sur tout élément interactif, en couleur marine
  (`outline: 2px solid var(--marine)`), uniquement via `:focus-visible`.
- Rôles ARIA posés systématiquement : `role="alert"`/`role="status"` selon
  la gravité, `role="tablist"/"tab"/"tabpanel"`, `aria-describedby`,
  `aria-live` sur les zones qui changent sans rechargement.
- `prefers-reduced-motion: reduce` respecté par toutes les animations,
  sans exception (`src/app/globals.css`).
- Feuille de style d'impression dédiée (`@media print`) : fond blanc pur,
  texte noir pur, cartes redevenues de simples sections, titres en police à
  empattements, couleurs porteuses de sens conservées.

## 8. Journal de suivi

Cette base a été appliquée aux tokens globaux, à l'intégralité de la
bibliothèque `src/components/ui/`, et à un audit écran par écran de
`src/app/app/**`.

### Tranché

- **Structure de l'en-tête** (2026-09-25) : la navigation latérale
  (`Sidebar`) est conservée plutôt que la bande blanche + barre marine
  horizontale décrite par la charte (voir §5.1).
- **Audit écran par écran** : rayons arbitraires corrigés (barres de
  graphique `ministere`/`etablissement`, boutons de filtre segmentés de
  `ListeExamensLaboratoire`/`ListeRendezVous`/`ListeRendezVousProfessionnel`,
  chip d'identifiant santé sur `patient/page.tsx`) ; nouveau composant
  `EtatVide` (§5.9) créé et déployé sur les ~30 emplacements d'état vide
  recensés. Aucune ombre, aucun dégradé, aucun vert résiduel trouvé ailleurs
  dans `src/app/app/**`. Pages de connexion et d'inscription vérifiées :
  déjà conformes (n'assemblent que des composants `ui/` déjà migrés).

### Encore ouvert

- **Ton "Alerte"** (§1.3) : disponible (`Badge tone="alert"`,
  `--statut-alerte`) mais pas encore adopté par un écran existant, à décider
  cas par cas (ex. un résultat de laboratoire hors norme mais non critique).
- **Graphiques** (§5.10) : seuls les deux graphiques en barres de
  `ministere`/`etablissement` ont été audités et corrigés (angles droits).
  Aucun autre graphique n'existe ailleurs dans le code à ce jour.
