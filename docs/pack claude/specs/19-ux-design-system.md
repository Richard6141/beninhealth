# 19. UX/UI et design system

## 19.1 Principes (V1, Partie 4, précisés)

| Principe V1 | Règle concrète vérifiable |
|---|---|
| Simplicité | Une **action principale** par écran (bouton plein), au plus deux actions secondaires visibles ; les parcours citoyens les plus fréquents en **3 écrans maximum**. |
| Clarté | Titre de page = ce que l'utilisateur peut faire (« Prendre rendez-vous ») ; hiérarchie : 1 titre, sections avec sous-titres ; vocabulaire de la section 18.10. |
| Accessibilité | Niveau **WCAG 2.1 AA** : contraste ≥ 4,5:1 pour le texte, 3:1 pour les éléments d'interface ; tout est utilisable au clavier ; libellés sur tous les champs ; focus visible ; texte agrandissable à 200 % sans perte. |
| Performance | Pages citoyennes : JavaScript initial < 200 Ko compressé ; images optimisées ; aucune police externe bloquante. |
| Mobile d'abord | Conception à 360 px de large d'abord ; zones tactiles ≥ 48 × 48 px ; formulaires en une colonne ; clavier adapté (`tel`, `email`, `numeric`). |
| Confiance | Indication permanente de l'espace actif, de la personne concernée (tuteur), de la base d'accès (pro) ; messages de sécurité rassurants et factuels. |

## 19.2 Identité visuelle et couleurs par espace

La direction artistique représente une plateforme **publique, médicale, moderne et rassurante**, ni froide ni administrative. Une couleur d'accent distingue chaque espace ; tous les espaces partagent les mêmes composants.

| Jeton | Valeur | Usage |
|---|---|---|
| `--brand-primary` | `#0B6E4F` (vert santé) | Marque, boutons principaux de l'espace citoyen |
| `--brand-secondary` | `#1D4E89` (bleu confiance) | Espace professionnel, liens |
| `--accent-sun` | `#F2B705` (jaune) | Mises en avant ponctuelles (jamais pour du texte sur fond blanc) |
| `--space-citizen` | `#0B6E4F` vert | Citoyen |
| `--space-pro` | `#1D4E89` bleu | Médecin, infirmier, accueil |
| `--space-lab` | `#0E7490` turquoise | Laboratoire |
| `--space-pharmacy` | `#15803D` vert pharmacie | Pharmacie |
| `--space-community` | `#B45309` ocre | Agent communautaire |
| `--space-facility` | `#6D28D9` violet | Responsable d'établissement |
| `--space-authority` | `#1E293B` bleu nuit | Pilotage |
| `--space-audit` | `#7E22CE` violet foncé | Audit |
| `--space-admin` | `#374151` anthracite + `#B91C1C` rouge (actions sensibles) | Administration |
| `--state-success` | `#15803D` | Succès |
| `--state-warning` | `#B45309` | Avertissement, valeur inhabituelle |
| `--state-danger` | `#B91C1C` | Erreur, allergie, accès d'urgence |
| `--state-info` | `#1D4E89` | Information |
| `--surface` / `--surface-muted` / `--border` | `#FFFFFF` / `#F5F7F9` / `#D9DEE4` | Fonds et bordures |
| `--text` / `--text-muted` | `#111827` / `#4B5563` | Textes |

- **RG-UI-01** — Une couleur NE DOIT JAMAIS porter seule une information : toujours un texte ou une icône en plus (ex. allergie = pastille rouge **+** « Allergie »).
- **RG-UI-02** — Le mode sombre est **P2** ; les jetons sont néanmoins définis en variables CSS pour le permettre.

**Typographie.** Police **Inter** auto-hébergée (via `next/font`, sous-ensemble latin), repli système. Tailles : 16 px (base pro), **17 px** (base citoyen), 14 px minimum pour les textes secondaires, 13 px pour les tableaux denses (admin, audit) ; titres 20 / 24 / 30 px ; interligne 1,5.

**Espacements.** Échelle de 4 px (4, 8, 12, 16, 24, 32, 48). **Rayons** : 8 px (champs, boutons), 12 px (cartes). **Icônes** : bibliothèque Lucide, 20 ou 24 px, toujours accompagnées d'un texte sauf icônes universelles (fermer, retour) avec un libellé accessible.

## 19.3 Mise en page par espace

| Espace | Mobile (< 768 px) | Ordinateur (≥ 1024 px) |
|---|---|---|
| Citoyen | En-tête simple + **barre de navigation en bas** (Accueil, Dossier, Rendez-vous, Partage, Plus) | Même structure centrée (largeur max 720 px) |
| Professionnel, labo, pharmacie | En-tête avec sélecteur d'espace + menu en tiroir | **Barre latérale** fixe + bandeau patient en haut de la zone de contenu |
| Terrain (agent) | Plein écran, gros boutons, indicateur de synchronisation permanent | Non prioritaire |
| Établissement, pilotage, audit, admin | Utilisable (lecture) | Barre latérale + contenu large (max 1 440 px) |

## 19.4 Composants de la bibliothèque commune

Chaque composant est développé **une fois** dans `src/components/ui` (base shadcn/ui), documenté dans une page de démonstration `/dev/styleguide` (disponible en développement et en staging, jamais en production), avec tous ses **états** : normal, survol, focus, désactivé, chargement, erreur.

| Composant | Particularités obligatoires |
|---|---|
| Bouton | Variantes principale / secondaire / danger / lien ; état « chargement » qui empêche le double clic |
| Champ de formulaire | Libellé toujours visible (pas seulement un texte d'exemple), aide sous le champ, message d'erreur sous le champ lié par `aria-describedby` |
| Téléphone | Préfixe +229 fixe, masque « 01 XX XX XX XX », validation RG-AUTH-01 |
| Date | Sélecteur natif sur mobile ; option « date approximative » pour l'âge estimé |
| Recherche avec suggestions | Clavier (flèches, Entrée, Échap), délai de 250 ms, minimum 2–3 caractères, état « aucun résultat » |
| Carte d'information | Titre, contenu, action ; état vide |
| Tableau | Tri, pagination par curseur, état vide, version « liste de cartes » sur mobile |
| Graphiques | Courbes, barres, sans 3D ; valeurs accessibles en tableau ; masquage « < 5 » respecté |
| Carte géographique | Leaflet + OpenStreetMap ; légende ; alternative textuelle (liste) |
| Modale / confirmation | Titre = question ; bouton de confirmation nommé par l'action (« Annuler le rendez-vous ») |
| Notification éphémère (toast) | Succès et informations ; les erreurs importantes restent affichées dans la page |
| Bandeau patient | Voir chapitre 10 ; toujours visible ; allergies en rouge |
| Bandeaux d'état | « Hors connexion », « Accès d'urgence », « Vous agissez pour… », « Données fictives » |
| Indicateur d'enregistrement | « Enregistré à 09:14 » / « Enregistrement… » / « Hors connexion » |
| Stepper (assistant) | « Étape X sur N », retour sans perte |
| Lecteur de QR | Caméra du téléphone ; saisie manuelle en alternative |

## 19.5 États systématiques de chaque écran

Chaque écran DOIT prévoir et afficher ces quatre états (vérifié à la recette) :

1. **Chargement** : squelettes de contenu (pas de page blanche), jamais plus de 300 ms sans retour visuel.
2. **Vide** : message expliquant pourquoi et action utile.
3. **Erreur** : message simple du catalogue (section 18.8) + « Réessayer » ; référence de l'erreur pour le support.
4. **Hors connexion** : bandeau ; données en cache si autorisées, sinon message « Cette page nécessite une connexion ».

## 19.6 Animations et interactions

Transitions courtes (150–250 ms), chargements progressifs, retour visuel après chaque action (V1, Partie 4 §13). Respect du réglage « réduire les animations » du système (`prefers-reduced-motion`). Aucune animation décorative.

## 19.7 Validation UX (V1, Partie 4 §14, précisée)

Avant la démonstration : **5 tests utilisateurs** minimum (2 citoyens dont 1 peu familier du numérique, 1 médecin ou infirmier, 1 agent d'accueil ou terrain, 1 administrateur). Pour chaque test : scénario écrit, chronométrage, erreurs observées, satisfaction (note sur 5), verbatims. Seuil : chaque tâche principale réussie **sans aide** par au moins 4 personnes sur 5.
