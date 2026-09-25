# Audit du rôle infirmier face au pack Claude Code

Même méthode que `docs/audit-cote-patient.md` et `docs/audit-cote-medecin.md`.
Périmètre : `src/app/app/medecin/**` (routes partagées avec le médecin),
`src/modules/facility/actions.ts`, `src/modules/clinical/actions.ts`,
`src/security/permissions.ts`, comparés à `docs/pack claude/specs/10-fiches-clinique.md`
(F-CLI-12, principalement) et à la matrice RBAC du pack pour ce rôle.

## Constat principal : le rôle était fonctionnellement vide, silencieusement

Avant la correction d'aujourd'hui, les trois écrans accessibles à l'infirmier
(tableau de bord, « Mes rendez-vous », « Mes consultations ») utilisaient tous
`getRendezVousDuProfessionnel()` / `getConsultationsDuProfessionnel()`, qui
filtrent sur `professionnelId = <compte connecté>`. Or `RendezVous.professionnelId`
et `Consultation.professionnelId` désignent toujours le **médecin** choisi par
le patient : un infirmier n'est jamais lui-même titulaire d'un rendez-vous ou
d'une consultation. Résultat : ces trois écrans affichaient systématiquement
« Aucun » quelle que soit l'activité réelle de l'établissement, sans erreur ni
indication que quelque chose ne fonctionnait pas. Un rôle entier du RBAC
existait dans le code mais ne montrait jamais rien à l'écran.

C'est un bug plus grave qu'un manque : contrairement à une fonctionnalité
absente (visible comme telle), un écran qui se charge normalement et affiche
poliment « aucun résultat » a toutes les apparences d'un système qui fonctionne.

## Corrections apportées aujourd'hui

1. **Nouvelles fonctions "établissement" plutôt que "moi-même"** :
   - `getRendezVousDeLEtablissementDuProfessionnel()` (`src/modules/facility/actions.ts`)
   - `getConsultationsDeLEtablissement()` (`src/modules/clinical/actions.ts`)

   Toutes deux filtrent sur `professionnel.etablissementId` (l'établissement du
   compte connecté) plutôt que sur son propre `professionnelId`, et incluent le
   nom du médecin réellement associé à chaque rendez-vous/consultation
   (`Dr. <Nom>`), puisque ce n'est plus implicitement "moi".

2. **Branchement par rôle sur les trois écrans partagés** (`DashboardInfirmier.tsx`,
   `medecin/rendez-vous/page.tsx`, `medecin/consultations/page.tsx`) : seul le rôle
   infirmier bascule vers les fonctions établissement ; le comportement du médecin
   est strictement inchangé.

3. **Libellés corrigés pour l'infirmier** sur l'écran consultations (« Consultations
   de l'établissement » plutôt que « Mes consultations », état vide reformulé) et
   affichage du nom du médecin sur chaque carte.

4. Vérifié à l'écran (Playwright, compte infirmier de démo Fabienne Dossou) :
   le tableau de bord affiche désormais 5 rendez-vous à venir (0 avant),
   « Mes rendez-vous » liste les rendez-vous de l'établissement, et
   « Consultations de l'établissement » affiche les 2 consultations existantes
   avec le nom du médecin (Dr. Julien Ahouansou).

## Statut face à la fiche F-CLI-12 (prise en charge infirmière)

Mise à jour après une passe ultérieure (même session, voir `docs/audit-cote-medecin.md`
F-CLI-12) : le préalable architectural signalé ci-dessus (constantes structurées) a
été construit entre-temps pour F-CLI-06, puis réutilisé ici. Le tableau qui suivait
directement ("tout non fait") est obsolète et remplacé par celui-ci :

| Élément attendu (F-CLI-12) | Statut |
|---|---|
| Liste des patients arrivés, en attente de prise de constantes | **Fait** : `getPatientsAttendantConstantes()` (`src/modules/soins/actions.ts`), écran `/app/medecin/soins`. Rendez-vous confirmés du jour de l'établissement, exclut les patients ayant déjà une `PriseEnChargeInfirmiere` créée aujourd'hui. |
| Saisie de constantes structurées par l'infirmier | **Fait** : mêmes 9 champs et mêmes contrôles (`src/modules/clinical/controles-constantes.ts`) que la consultation médecin. |
| Niveau de priorité (urgent / prioritaire / standard) | **Fait** : `prioriteTri` (`src/modules/soins/priorites.ts`). |
| Note de soins (immuable, addendum possible) | **Fait** pour l'immuabilité (`noteSoins` obligatoire à la création, jamais modifiée ensuite) ; addendum non implémenté (limite mineure assumée, périmètre jugé secondaire face au reste de la fiche). |
| Pré-remplissage des constantes dans la consultation du médecin | **Fait** : `getPriseEnChargeNonRecuperee(patientId)`, consommé par `FormulaireConsultation.tsx`. La prise en charge passe à `statut: "recuperee"` dès qu'un brouillon de consultation est créé à partir d'elle. |

Nouveau modèle `PriseEnChargeInfirmiere` (migration `20260925164957_...`) : ne crée
jamais de `Consultation` (l'infirmier n'a toujours pas `create:consultation`),
uniquement cette table dédiée que le médecin consulte en lecture.

## Reste à faire, par ordre de valeur

1. **Addendum sur la note de soins** : actuellement immuable sans mécanisme de
   complément, contrairement à l'addendum de consultation du médecin (F-CLI-08).
   Écart mineur, pas bloquant.
2. **Vaccination en terrain** (F-COM-04, distincte de F-CLI-11 déjà faite en
   établissement) : hors périmètre de ce document, voir
   `docs/audit-cote-agent-communautaire.md`.

## Recommandation

Le correctif du jour (établissement plutôt que "moi-même") reste la fondation
indispensable : sans lui, F-CLI-12 n'aurait rien eu à afficher. F-CLI-12 lui-même
est maintenant fait de bout en bout, y compris le pré-remplissage côté médecin.
Le rôle infirmier n'a plus de trou fonctionnel significatif identifié dans ce
document.
