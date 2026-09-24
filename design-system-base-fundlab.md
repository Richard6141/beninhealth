# Base de design : identité visuelle (couleurs, finitions, mouvement)

Extrait du projet **chalandise** (Business Check-up, Powered by FUND.lab),
`C:\Users\HP\Documents\test FUND.lab\chalandise`. Ce document ne décrit **ni
structure de page, ni positionnement, ni organisation d'écran** : uniquement
le langage visuel réutilisable ailleurs, quel que soit le sujet ou la mise en
page du nouveau projet. Sources : `src/app/globals.css` et les composants de
`src/composants/ui/`.

Nouveau projet différent : reprendre les *principes* (palette réduite,
rayons à deux paliers, mouvement discret, la couleur jamais seule) plutôt que
recopier les valeurs telles quelles, sauf si l'identité de marque doit rester
proche de celle-ci.

## 1. Principes directeurs

- **Sobriété institutionnelle** : fonds presque blancs, une seule couleur
  d'accent sombre (marine), pas de dégradés ni de gros aplats colorés en
  dehors d'un seul usage décoratif assumé (voir §3.4).
- **La couleur n'est jamais le seul signal.** Un statut (bon / à vérifier /
  bloquant / information) est toujours accompagné d'un libellé écrit en
  toutes lettres. Voir §8.4 pour le patron exact.
- **Deux paliers d'arrondi seulement** (carte / champ), pas une échelle de
  dix valeurs.
- **Une seule ombre**, très discrète, réservée aux cartes.
- **Mouvement fonctionnel, jamais décoratif** : chaque animation existe pour
  une raison précise (signaler un chargement, adoucir un changement d'écran,
  faire entrer un panneau). Toujours coupée par `prefers-reduced-motion`.
- **Accessibilité non négociable** : focus clavier toujours visible, rôles
  ARIA posés, contraste des couleurs de statut vérifié (4,5:1 minimum sur les
  fonds où elles sont utilisées en texte).
- **Feuille de style d'impression dédiée** : un rapport imprimé n'est pas une
  capture de l'écran (voir §11).

## 2. Palette de couleurs

Toutes les couleurs vivent en variables CSS dans `:root`, puis sont
exposées comme couleurs Tailwind via `@theme inline` (`--color-*`), donc
utilisables en classes `bg-*`, `text-*`, `border-*`.

### 2.1 Neutres

| Rôle | Variable | Valeur | Usage |
| --- | --- | --- | --- |
| Fond de page | `--plan` | `#f4f5f9` | Fond `<html>`, jamais utilisé pour une carte |
| Surface | `--surface` | `#ffffff` | Fond des cartes, champs, modales |
| Surface d'appui | `--surface-appui` | `#eceef5` | Fond des panneaux secondaires, pistes de barre de progression, onglets inactifs |
| Texte principal | `--encre` | `#090e1e` | Quasi noir, jamais un vrai `#000` |
| Texte secondaire | `--encre-secondaire` | `#3f4a63` | Descriptions, sous-titres |
| Texte atténué | `--encre-attenuee` | `#5c6680` | Métadonnées, légendes, texte facultatif |
| Bordure | `--bordure` | `#dde0ea` | Séparateurs, contours de carte |
| Bordure forte | `--bordure-forte` | `#bdc3d5` | Contours de champ de formulaire |

### 2.2 Accent (couleur de marque principale)

| Variable | Valeur | Usage |
| --- | --- | --- |
| `--accent` | `#0c1a45` (marine) | Boutons pleins, liens, icônes actives, anneau de focus |
| `--accent-fonce` | `#070e24` | État survol/actif d'un bouton plein |
| `--accent-clair` | `#0c1a451a` (marine à 10 % d'opacité) | Fond de badge, pastille de sélection, cercle d'icône |

### 2.3 Couleurs de statut

Quatre statuts seulement, chacun avec une variante pleine (texte/icône) et
une variante claire (fond de badge ou de bandeau) :

| Statut | Plein | Clair | Sens |
| --- | --- | --- | --- |
| Bon / validé | `--statut-bon` `#0ea572` | `--statut-bon-clair` `#0ea57214` | Succès, situation favorable |
| Vigilance | `--statut-vigilance` `#d97706` | `--statut-vigilance-clair` `#d9770617` | À vérifier, avertissement non bloquant |
| Critique | `--statut-critique` `#dc2626` | `--statut-critique-clair` `#dc262612` | Bloquant, erreur |
| Information | `--info` `#2563eb` | `--info-clair` `#2563eb12` | Neutre informatif, aide |

Règle de contraste : chaque couleur pleine dépasse 4,5:1 sur les fonds où
elle sert de texte. Les variantes claires ne servent **jamais** de texte,
seulement de fond derrière la couleur pleine ou l'encre.

### 2.4 Couleur de marque décorative (à n'utiliser qu'avec parcimonie)

| Variable | Valeur | Usage |
| --- | --- | --- |
| `--marque-turquoise` | `#34bed5` | États de sélection d'un contrôle personnalisé (carte radio cochée), reflet de la barre de progression de navigation |
| `--marque-turquoise-fonce` | `#1a9db8` | Variante plus soutenue du dégradé |

**Règle explicite du projet source, à reprendre si la teinte décorative
choisie est claire :** cette couleur n'est volontairement **jamais** utilisée
en texte plein ni en fond de bouton plein, parce que sa luminosité ne passe
pas le contraste 4,5:1 (ni en texte sur blanc, ni en texte blanc dessus).
Elle reste cantonnée aux teintes claires (10 % d'opacité) et à un usage
décoratif ponctuel (dégradé de barre de chargement).

### 2.5 Bloc CSS à copier tel quel (à adapter aux nouvelles couleurs)

```css
:root {
  color-scheme: light;

  --plan: #f4f5f9;
  --surface: #ffffff;
  --surface-appui: #eceef5;
  --encre: #090e1e;
  --encre-secondaire: #3f4a63;
  --encre-attenuee: #5c6680;
  --bordure: #dde0ea;
  --bordure-forte: #bdc3d5;

  --accent: #0c1a45;
  --accent-fonce: #070e24;
  --accent-clair: #0c1a451a;

  --statut-bon: #0ea572;
  --statut-bon-clair: #0ea57214;
  --statut-vigilance: #d97706;
  --statut-vigilance-clair: #d9770617;
  --statut-critique: #dc2626;
  --statut-critique-clair: #dc262612;
  --info: #2563eb;
  --info-clair: #2563eb12;

  --marque-turquoise: #34bed5;
  --marque-turquoise-fonce: #1a9db8;

  --ombre-carte: 0 1px 2px rgba(20, 20, 20, 0.04);

  --radius-carte: 16px;
  --radius-champ: 8px;
}

@theme inline {
  --color-plan: var(--plan);
  --color-surface: var(--surface);
  --color-surface-appui: var(--surface-appui);
  --color-encre: var(--encre);
  --color-encre-secondaire: var(--encre-secondaire);
  --color-encre-attenuee: var(--encre-attenuee);
  --color-bordure: var(--bordure);
  --color-bordure-forte: var(--bordure-forte);
  --color-accent: var(--accent);
  --color-accent-fonce: var(--accent-fonce);
  --color-accent-clair: var(--accent-clair);
  --color-bon: var(--statut-bon);
  --color-bon-clair: var(--statut-bon-clair);
  --color-vigilance: var(--statut-vigilance);
  --color-vigilance-clair: var(--statut-vigilance-clair);
  --color-critique: var(--statut-critique);
  --color-critique-clair: var(--statut-critique-clair);
  --color-info: var(--info);
  --color-info-clair: var(--info-clair);
  --color-marque-turquoise: var(--marque-turquoise);
  --color-marque-turquoise-fonce: var(--marque-turquoise-fonce);
  --radius-carte: 16px;
  --radius-champ: 8px;
}
```

## 3. Typographie

- **Police** : Lato (variable Next.js `next/font/google`), avec repli
  `Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue',
  Arial, sans-serif`. Graisses chargées : 300, 400, 700, 900.
- **Échelle de tailles** (jetons déclarés, en cours de convergence dans le
  projet source ; à appliquer strictement dans un nouveau projet) :

| Jeton | Taille | Usage |
| --- | --- | --- |
| `--texte-legende` | 12px | Kickers, en-têtes de tableau, libellés courts |
| `--texte-petit` | 13px | Texte secondaire, aide, métadonnées |
| `--texte-corps` | 15px | Texte courant, labels de champ |
| `--texte-souligne` | 17px | Valeurs mises en avant |
| `--texte-titre-section` | 20px | Titres de carte |
| `--texte-titre-page` | 28px | Titre de page (`h1`) |

- **Chiffres alignés** : classe utilitaire `.chiffres` (`font-variant-numeric:
  tabular-nums`), posée sur toute valeur numérique affichée en colonne ou
  côte à côte (montants, scores, dates), pour que les chiffres ne dansent pas
  d'une ligne à l'autre.
- **Kicker** : petite étiquette au-dessus d'un titre, `12px`, graisse 600,
  lettres espacées (`tracking: 0.14em`), majuscules, en couleur d'accent.

## 4. Rayons d'arrondi

Deux paliers seulement, jamais une valeur arbitraire à côté :

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--radius-carte` | 16px | Cartes, panneaux, modales |
| `--radius-champ` | 8px | Champs de formulaire, boutons, pastilles, badges |

Un sous-élément dans un composant à `--radius-carte` reprend parfois
`calc(var(--radius-champ) - 4px)` pour rester visuellement imbriqué sans
dépasser le rayon du parent (ex. l'onglet actif dans une barre d'onglets).

## 5. Élévation

Une seule ombre dans tout le projet, très discrète :

```css
--ombre-carte: 0 1px 2px rgba(20, 20, 20, 0.04);
```

Réservée aux cartes et aux panneaux flottants (modales, menus déroulants).
Jamais de grosse ombre portée, jamais plusieurs paliers d'élévation : la
hiérarchie visuelle se fait par la couleur de fond (`--surface` sur
`--plan` ou `--surface-appui`) et la bordure, pas par l'ombre.

## 6. Mouvement et transitions

Principe : chaque animation a un rôle précis, dure peu (200 à 700 ms), et
**toutes** sont neutralisées sous `prefers-reduced-motion: reduce` (soit par
la classe utilitaire Tailwind `motion-reduce:`, soit par une règle média
dédiée juste sous le `@keyframes`).

| Cas d'usage | Effet | Durée / easing |
| --- | --- | --- |
| Changement de sous-écran (une question qui en remplace une autre) | Fondu + léger glissement vertical (6px) | `0.32s ease-out` |
| Panneau coulissant depuis le bord (menu mobile, tiroir latéral) | Glissement horizontal depuis -100% | `0.22s-0.24s ease-out` |
| Panneau coulissant depuis le bas (feuille mobile) | Glissement vertical depuis 100% | `0.24s ease-out` |
| Remplissage d'une barre de progression | Largeur animée | `duration-500 ease-out` (Tailwind) |
| Barre de chargement de navigation (haut d'écran) | Largeur + reflet qui glisse en boucle + fondu de sortie | largeur `0.6s cubic-bezier(0.22,0.61,0.36,1)`, reflet `1.1s ease-in-out infini`, sortie `opacity 0.22s ease-in` |
| Squelette de chargement (placeholder de contenu) | Dégradé qui glisse en boucle | `1.4s ease-in-out infini` |
| Apparition d'un bloc au défilement (ex. graphique) | Fondu + léger zoom (95% → 100%) | `duration-700 ease-out`, déclenché une seule fois via `IntersectionObserver` (seuil 25% visible) |
| Survol / changement d'état d'un bouton, onglet, champ | Couleur uniquement | `transition-colors` (valeur par défaut Tailwind, ~150ms) |

Aucune animation de rebond, d'élastique ou d'exagération : tout reste
`ease-out` ou `ease-in-out`, jamais de `cubic-bezier` avec dépassement sauf le
seul cas de la barre de chargement ci-dessus (choisi pour donner un effet de
décélération franche en fin de course).

## 7. Composants et leur finition visuelle

Uniquement l'apparence et les états ; aucune indication sur où ils sont
placés dans une page.

### 7.1 Boutons

- Base commune : coins à `--radius-champ`, graisse 600, transition de couleur
  uniquement, curseur désactivé + opacité 50% quand `disabled`.
- Quatre variantes :
  - **Primaire** : fond `--accent`, texte blanc, survol `--accent-fonce`.
  - **Secondaire** : bordure `--bordure-forte`, fond `--surface`, texte
    `--encre`, survol fond `--surface-appui`.
  - **Discret** : pas de bordure, texte couleur d'accent, survol fond
    `--accent-clair`.
  - **Danger** : bordure et texte `--statut-critique`, survol fond
    `--statut-critique-clair`.
- Trois tailles (hauteur minimale, pas de largeur imposée) : petite 36px,
  normale 44px, grande 48px.
- Une icône (lucide-react, 16px) peut précéder ou suivre le libellé, jamais
  seule sans texte sauf bouton strictement icône (voir 7.9).

### 7.2 Cartes

- Fond `--surface`, bordure `--bordure` 1px, rayon `--radius-carte`, ombre
  `--ombre-carte`, padding généreux (16px mobile, 24px à partir de `sm`).
- Un en-tête optionnel (titre + description courte + zone d'actions à
  droite) séparé du corps par un espacement, jamais par un filet.
- Peut être posée sur un fond `--plan` (cas courant) ou sur un fond
  `--surface-appui` légèrement teinté pour créer un panneau englobant plus
  large avec des cartes blanches qui « flottent » dedans.

### 7.3 Pastilles / badges

- Forme : `--radius-champ`, padding horizontal serré, texte 12-13px graisse
  600.
- Six tons disponibles, chacun fond clair + texte plein correspondant :
  neutre (gris), accent, bon, vigilance, critique, information.
- Toujours un texte à l'intérieur ; la pastille ne porte jamais qu'une pastille
  de couleur sans mot.

### 7.4 Alertes / bandeaux de statut

Patron exact du principe « la couleur n'est jamais seule » : un bandeau avec
bordure + fond clair du ton concerné, puis, **avant le titre**, une petite
étiquette encadrée en majuscules qui nomme le niveau en toutes lettres :
`BLOQUANT`, `ATTENTION`, `INFORMATION`, `VALIDÉ`. Le rôle ARIA suit le
niveau (`role="alert"` pour le critique, `role="status"` pour les autres).

```
[BLOQUANT]  Titre de l'alerte
Texte explicatif sur une ligne en dessous, en couleur neutre.
```

### 7.5 Champs de formulaire

- Contrôle texte / nombre : hauteur minimale 44px, bordure `--bordure-forte`,
  rayon `--radius-champ`, fond `--surface`, texte 16px (empêche le zoom
  automatique sur mobile), anneau d'accent au focus, bordure critique si en
  erreur (`aria-invalid`).
- Étiquette au-dessus du champ, 18px, graisse 600 ; astérisque rouge si
  obligatoire, sinon mention « (facultatif) » en petit texte atténué à côté
  du libellé (jamais l'inverse : le facultatif est explicite, pas
  l'obligatoire seul).
- Aide contextuelle : texte 13px sous l'étiquette, liée au champ par
  `aria-describedby`, jamais cachée uniquement dans une infobulle si
  l'information est indispensable à la compréhension.
- Message d'erreur : 13px, couleur critique, sous le contrôle, `role="alert"`.
- Champ nombre : unité affichée en incrustation à droite du champ (ex. « km »,
  « % », « FCFA »), jamais un champ séparé.
- Sélecteur natif (`<select>`) : même look que le champ texte, chevron en
  image de fond plutôt que la flèche native du navigateur.

### 7.6 Sélecteurs personnalisés (choix uniques stylés)

Deux patrons, selon le nombre d'options :

- **Peu d'options, chacune avec un contexte** (tranche de valeur, mode de
  déplacement...) : chaque option devient une carte cliquable pleine largeur
  (radio caché, `sr-only`), avec un petit rond qui se remplit en couleur
  décorative (turquoise) quand sélectionné, bordure et fond qui changent
  ensemble.
- **Notation sur une échelle courte** (0 à 3, avec repères concrets par
  niveau) : rangée de boutons égaux dans un même cadre, séparés par un filet
  interne, l'option active en fond `--accent-clair` + texte `--accent`.

Jamais l'apparence native d'un `<input type="radio">` ou `<input
type="checkbox">` visible à l'écran : toujours redessinée.

### 7.7 Onglets

- Piste en fond `--surface-appui`, coins `--radius-champ`, padding 4px.
- Onglet actif : fond `--surface`, ombre `--ombre-carte`, texte couleur
  d'accent. Onglet inactif : texte atténué, survol texte plein, pas de fond.
- Navigation clavier gauche/droite en plus du clic (rôle ARIA `tablist`
  complet).

### 7.8 Infobulle

- Icône ronde « i » minuscule (16px), bordure `--bordure-forte`, devient
  couleur d'accent au survol/focus.
- Contenu affiché en pur CSS (pas de JavaScript), déclenché par `:hover` et
  `:focus-within` uniquement (jamais seulement au clic, pour rester
  accessible au clavier) : carte flottante `--surface`, bordure, ombre,
  texte 12,5px.

### 7.9 Bouton icône seul

- Carré 36px, bordure `--bordure-forte`, coins `--radius-champ`, icône
  centrée. `title` et `aria-label` systématiquement identiques et
  obligatoires (jamais un bouton muet). Variante danger : survol bordure et
  fond critique clair.

### 7.10 Fenêtres modales

- Basées sur l'élément natif `<dialog>` + `showModal()` : piégeage du focus,
  touche Échap, fond assombri (`backdrop`, `--encre` à 40% d'opacité) fournis
  par le navigateur, jamais réimplémentés à la main.
- Boîte centrée : fond `--surface`, bordure `--bordure`, rayon
  `--radius-carte`, ombre `--ombre-carte`, deux largeurs possibles (étroite
  pour une confirmation, large pour un formulaire).
- Variante tiroir (panneau latéral ou panneau du bas sur mobile) : même
  boîte mais collée à un bord (`margin: 0` sur ce bord, rayon retiré côté
  collé), avec l'animation de glissement correspondante (§6).
- Bouton de fermeture : rond, icône « X » 16px, en haut à droite, jamais de
  simple texte « Fermer » comme seule sortie (le clic sur le fond et Échap
  fonctionnent toujours aussi).

### 7.11 Avatar

- Rond, initiales (une ou deux lettres) plutôt qu'une photo par défaut,
  couleur de fond choisie de façon déterministe à partir du nom (même
  personne = toujours la même couleur), parmi une petite palette de tons
  clairs (accent, bon, vigilance, information).

### 7.12 Chargement (squelette + barre de navigation)

- **Squelette** : rectangles gris avec un dégradé qui glisse en boucle,
  reprenant exactement la taille du contenu final pour qu'aucun saut de mise
  en page ne survienne à l'arrivée des vraies données. Toujours
  `aria-hidden`, l'annonce d'attente se fait une seule fois au niveau du
  conteneur (`role="status"`).
- **Barre de progression de navigation** : filet de 3px tout en haut de
  l'écran, dégradé turquoise avec reflet animé, se déclenche au clic sur un
  lien interne et se termine dès que la page affichée a changé.

## 8. Accessibilité (transversal, pas un chapitre à part dans le projet source)

- Anneau de focus visible sur tout élément interactif :
  `outline: 2px solid var(--accent); outline-offset: 2px; border-radius:
  6px;`, uniquement via `:focus-visible` (jamais au simple clic à la souris).
- Rôles ARIA posés systématiquement : `role="alert"` / `role="status"` selon
  la gravité, `role="tablist"/"tab"/"tabpanel"`, `role="radiogroup"`,
  `aria-describedby` pour relier aide et erreur à un champ, `aria-live`
  sur les zones qui changent sans rechargement (état d'enregistrement,
  progression).
- Aucune information portée par la couleur seule (voir §2.3 et §7.4).
- `prefers-reduced-motion: reduce` respecté par **toutes** les animations
  du document, sans exception.

## 9. Icônes

- Bibliothèque **lucide-react** exclusivement (icônes au trait, pas de
  pictos remplis ni d'émoji dans l'interface).
- Tailles : 14px (très petit contexte, infobulle), 16px (cas courant, dans
  un bouton ou à côté d'un libellé), 20px (mise en avant, en-tête de
  panneau).
- Toujours `aria-hidden="true"` quand l'icône accompagne un texte (le texte
  porte le sens) ; jamais d'icône seule cliquable sans `aria-label` sur son
  conteneur.
- Habillage optionnel : icône dans un rond de couleur douce
  (`bg-<statut>-clair`, `text-<statut>`), 36-40px de diamètre, pour donner du
  poids visuel à un indicateur sans utiliser une grosse icône brute.

## 10. Impression

Feuille de style dédiée (`@media print`), pensée comme un document, pas
comme une capture d'écran :

- Fond blanc pur, texte noir pur (les nuances d'encre du web ne servent
  qu'à l'écran).
- Les cartes perdent bordure, ombre, fond et rayon : elles redeviennent de
  simples sections séparées par un filet fin (`0.5pt solid #ccc`), avec
  une marge de respiration entre elles.
- Les titres passent en police à empattements (Georgia / Times New Roman)
  pour une lecture « éditoriale », différente du sans-serif utilisé à
  l'écran.
- Les couleurs porteuses de sens (pastilles, jauges) sont explicitement
  conservées (`print-color-adjust: exact`) : le reste de la mise en forme
  s'efface, pas l'information.
- Tout ce qui n'a de sens qu'à l'écran (navigation, boutons, boussole,
  panneaux) porte une classe `sans-impression` et disparaît totalement à
  l'impression ; l'inverse (`seulement-impression`) existe pour un en-tête
  de document qui n'apparaît qu'au format papier.
- Les animations de révélation au défilement sont neutralisées (l'élément
  est toujours visible, jamais figé à son état de départ invisible).
- Format A4, marges 16mm/14mm.

## 11. Reprendre cette base dans un nouveau projet

1. Copier le bloc CSS du §2.5 dans le nouveau projet, changer uniquement
   `--accent` (et ses deux variantes) pour la nouvelle couleur
   institutionnelle ; garder si possible les quatre couleurs de statut
   telles quelles (déjà vérifiées côté contraste).
2. Garder les deux paliers de rayon et l'ombre unique : ce sont eux qui
   donnent l'impression de cohérence, pas la couleur.
3. Recréer les composants de base sous forme de petites fonctions
   indépendantes (Bouton, Carte, Pastille, Alerte, Champ, Infobulle, Modale)
   plutôt que de dupliquer leurs classes CSS à chaque usage : c'est ce qui
   permet de changer un ton dans un seul fichier plus tard.
4. Reprendre le tableau de durées/effets du §6 tel quel : les mêmes minutages
   fonctionnent indépendamment du sujet de l'application.
5. Ne pas oublier la feuille d'impression si le nouveau projet produit des
   documents destinés à être imprimés ou exportés en PDF : c'est un chapitre
   qu'on oublie facilement en début de projet et qui coûte cher à ajouter
   après coup.
