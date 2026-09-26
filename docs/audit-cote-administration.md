# Audit des rôles admin_etablissement et admin_national face au pack Claude Code

Même méthode que `docs/audit-cote-patient.md` et `docs/audit-cote-medecin.md` :
lecture complète des deux chapitres du pack les plus pertinents pour ces
rôles, `docs/pack claude/specs/14-fiches-pilotage.md` (pilotage, indicateurs,
tableaux de bord) et `docs/pack claude/specs/15-fiches-administration-audit.md`
(administration de la plateforme et audit), puis comparaison fiche par fiche
avec le code réel. Cette version remplace la précédente, qui n'avait fait
qu'un contrôle ciblé sur un seul invariant (voir la section dédiée plus bas,
conservée) sans jamais comparer les fiches une à une.

## Écart préalable à connaître : les rôles du pack ne correspondent pas aux rôles du dépôt

Les chapitres 14 et 15 du pack sont écrits pour quatre rôles : `FACILITY_ADMIN`,
`HEALTH_AUTHORITY`, `PLATFORM_ADMIN` et `AUDITOR`. Ce dépôt n'en a que deux
(`src/security/permissions.ts`) : `admin_etablissement` (proche de
`FACILITY_ADMIN`) et `admin_national` (qui recouvre à la fois `HEALTH_AUTHORITY`
et `PLATFORM_ADMIN`). Il n'existe aucun rôle `AUDITOR` dans ce dépôt, et aucune
route `/admin/*` ni `/audit/*` (vérifié : recherche de fichiers vide sur ces
deux chemins). Seules `/app/etablissement` et `/app/ministere` existent
(Phase 6, `CLAUDE.md`). Cet écart structurel explique à lui seul pourquoi la
quasi totalité du chapitre 15 (pensé pour `PLATFORM_ADMIN` et `AUDITOR`) est
absente : ce ne sont pas des oublis ponctuels mais l'absence du rôle et de
l'espace d'écran que ces fiches supposent.

## Chapitre 14, pilotage, indicateurs et tableaux de bord

| Fiche | Statut | Commentaire |
|---|---|---|
| Catalogue IND-01 à IND-13 (section 14.2) | **Partiel, très en retard sur cette ligne** (mise à jour 2026-09-26) | Cette ligne décrivait un état bien antérieur au chantier réel de pilotage (`src/modules/pilotage/`, agrégats calculés dans un vrai schéma Prisma `analytics` séparé, voir `AgregatQuotidien`). Repris depuis `/app/pilotage` (F-PIL-02) : IND-01 (consultations), IND-02 (patients vus), IND-05 (établissements actifs sur fenêtre glissante), IND-08 (taux de délivrance), IND-10 (vaccinations) sont calculés et affichés avec masquage RG-PIL-02/03 (`src/modules/pilotage/masquage.ts`, `< 5` sur un compte, « effectif insuffisant » sous 20 pour un taux) et variation vs période précédente. IND-03/IND-04 (top diagnostics, paludisme) fonctionnent par classification par mots-clés sur `Consultation.conclusion` (`src/modules/pilotage/referentiel-groupes-maladies.ts`), adaptation honnête documentée dans le code faute de codage CIM-10 réel dans ce dépôt. RG-PIL-01 (schéma `analytics` séparé) est fait. Encore absents : IND-06 (professionnels actifs), IND-07 (taux d'absence/no-show détaillé), IND-09 (ruptures), IND-11 (délai d'attente), IND-12 (qualité de saisie), IND-13 (adoption) ; rôle `analytics_reader` dédié (routé vers `admin_national`, même adaptation que le reste de ce document). |
| F-PIL-01 Tableau de bord d'établissement | **Partiel** | `/app/etablissement` (`src/app/app/etablissement/page.tsx`) existe pour `admin_etablissement` : tuiles consultations/prescriptions/professionnels, répartition des rendez-vous par statut, graphique en barres sur 6 mois, liste du personnel. Manque : sélecteur de période, délai d'attente médian, top 10 des diagnostics, activité par service et par professionnel, distinction personnel actif/invité/suspendu (le statut affiché ne connaît que valide/en_attente/rejete/suspendu mais aucun compte n'est jamais créé autrement que « valide », voir F-ADM-03), et surtout la section « accès d'urgence réalisés dans l'établissement » : elle n'existe pas, seule une `Notification` in-app ponctuelle est envoyée aux comptes `admin_etablissement` au moment de l'accès (`src/modules/urgence/actions.ts`, lignes 226 à 243). |
| F-PIL-02 Centre national de pilotage | **Partiel, très en retard sur cette ligne** (mise à jour 2026-09-26) | `/app/pilotage` (`src/app/app/pilotage/page.tsx`), distinct de `/app/ministere`, existe pour `admin_national` et couvre l'essentiel de la composition imposée par la fiche : barre de filtres (période seulement, visible et reflétée dans l'URL), 6 cartes d'indicateurs avec variation vs période précédente et masquage, top diagnostics, section alertes (F-PIL-06, résumé + lien vers `/app/pilotage/alertes`), section export (F-PIL-05), mention permanente de masquage en pied de page avec horodatage du dernier calcul, et journalisation `ANALYTICS_VIEW` de chaque ouverture (`journaliserOuvertureVueNationale`, `src/modules/pilotage/lecture.ts`). Manque encore : filtres territoire/type d'établissement/sexe/tranche d'âge (documenté explicitement dans le code, portée déjà nationale par défaut), carte (F-PIL-03). RG-PIL-20 (portée départementale) reste sans objet pour la même raison qu'avant (un seul rôle d'autorité sanitaire, toujours national), mais un référentiel territorial (départements/communes/zones sanitaires) existe désormais (`src/modules/pilotage/referentiel-territoire.ts`), prêt pour une future ventilation. |
| F-PIL-03 Carte sanitaire interactive | **Non fait** | Toujours vrai (mise à jour 2026-09-26) : `/app/pilotage` affiche explicitement « Module non activé » à l'emplacement prévu par la composition de la fiche, plutôt que d'omettre ce bloc ou d'inventer un contenu. Nécessite de vraies données de frontières géographiques (GeoJSON) des 12 départements du Bénin, à se procurer auprès du ministère plutôt qu'à approximer. |
| F-PIL-04 Tendances et comparaisons | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `/app/pilotage/tendances` (`src/modules/pilotage/tendances.ts`), lié depuis `/app/pilotage` (« Tendances par territoire »). |
| F-PIL-05 Exports et rapports | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `src/modules/pilotage/exports.ts` : export national et par établissement, avec motif obligatoire (RG-PIL-40) et journalisation. Masquage RG-PIL-41 appliqué avant export (réutilise `src/modules/pilotage/masquage.ts`, jamais de lecture directe des tables individuelles). Voir aussi `docs/coordination-agents.md`, point F-RDV-04/05, pour le contexte de livraison. |
| F-PIL-06 Alertes épidémiologiques simples | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `src/modules/pilotage/alertes.ts` + `/app/pilotage/alertes`, résumé intégré sur `/app/pilotage` (badge « N nouvelle(s) »). |
| F-PIL-07 Calcul des agrégats (processus technique) | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `AgregatQuotidien` vit dans un schéma Prisma séparé (`@@schema("analytics")`, `prisma/schema.prisma`), calculé par `src/modules/pilotage/agregation.ts` et planifié par `src/modules/pilotage/planificateur.ts`/`file-taches.ts` (voir aussi `demarrerPlanificateurPilotage`, câblé dans `src/instrumentation.ts`). Les tableaux de bord de pilotage (`/app/pilotage`) lisent cette couche d'agrégation plutôt que les tables opérationnelles en direct, ce qui rend les règles RG-PIL de masquage applicables (`src/modules/pilotage/masquage.ts`). Les deux tableaux de bord Phase 6 (`/app/etablissement`, `/app/ministere`, ligne F-PIL-01/Catalogue ci-dessus) restent eux en lecture directe et synchrone, non concernés par ce pipeline. |

## Chapitre 15, administration de la plateforme et audit

| Fiche | Statut | Commentaire |
|---|---|---|
| F-ADM-01 Tableau de bord administrateur | **Non fait** | Aucune route `/admin` n'existe, et aucun rôle `PLATFORM_ADMIN` n'est défini dans `src/security/permissions.ts`. Aucune file d'attente (professionnels à valider, doublons, établissements en brouillon, réinitialisations MFA), aucun état technique, aucune volumétrie distincte de ce que `admin_national` voit déjà sous `/app/ministere`. |
| F-ADM-02 Gérer le référentiel des établissements | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `src/modules/administration/etablissements.ts` + écran dédié `/app/ministere/etablissements` : le modèle `EtablissementSanitaire` a désormais un champ `statut` (défaut `"brouillon"`, cycle de vie réel via `changerStatutEtablissementAction`, RG-ADM-01/02 : jamais supprimé, seulement fermé) et les champs enrichis que cette ligne listait comme manquants (sigle, niveau de pyramide, secteur, arrondissement, quartier/village, adresse, téléphone/email d'établissement, identifiant externe DHIS2, hiérarchie parent/enfant), tous facultatifs pour ne pas casser les établissements déjà créés avant cet enrichissement. Référentiel territorial réel (départements/communes) via `getReferentielTerritoire`, réutilisé par le pilotage (F-PIL-02). Pas d'import CSV (P1, absence cohérente avec la priorité). |
| F-ADM-03 Valider un professionnel | **Non fait** | Le type `StatutValidationProfessionnel` (`src/types/domain-identity.ts`) et le champ `ProfessionnelSante.statutValidation` (défaut `"en_attente"` dans `prisma/schema.prisma`) prévoient bien les états `en_attente`/`valide`/`rejete`/`suspendu`, mais aucun chemin de création réel ne les utilise : `creerProfessionnelAction` et `creerEtablissementAction` (`src/modules/identity/gestion-comptes.ts`) forcent toutes deux `statutValidation: "valide"` dès la création. Il n'existe donc aucun écran d'approbation, aucun délai de 72 heures affiché (RG-ADM-10), aucune garde anti auto-validation (RG-ADM-11) : il n'y a simplement pas d'étape de validation à protéger. |
| F-ADM-04 Gérer les référentiels | **Partiel, 3 des 7 référentiels** (mise à jour 2026-09-26) | Écrans `/app/ministere/referentiels/{vaccins,medicaments,examens}`, réservés `admin_national` (rôle `PLATFORM_ADMIN` toujours absent de ce dépôt, même adaptation que le reste de ce document). Remplace les tableaux statiques historiques (`src/modules/vaccination/referentiel.ts`, catalogue médicaments, `src/modules/laboratoire/referentiel-examens.ts`) par de vraies tables (`VaccinReferentiel`, référentiel médicaments, `ExamenReferentielAdmin`). RG-ADM-20 (désactivation seule, jamais suppression) appliqué aux 3 : la donnée métier (`Vaccination.vaccin`, `ExamenMedical.typeExamen`, etc.) reste un texte libre, jamais une clé étrangère vers ces référentiels. RG-ADM-21 (versionnement) reste hors périmètre sur les 3, limite assumée. Encore codés en dur : CIM-10 (dépendrait d'abord d'un vrai codage diagnostique, absent de ce dépôt, voir Catalogue IND-01 à IND-13), motifs de rendez-vous (`RendezVous.motif` est un texte libre, pas de liste statique existante à convertir, écarté après vérification), jours fériés, modèles de SMS. |
| F-ADM-05 Gérer les comptes | **Partiel** | Rien pour le périmètre `PLATFORM_ADMIN` : pas d'écran `/admin/comptes`, pas de recherche de compte, pas de suspension/réactivation, pas de réinitialisation de second facteur, pas de principe des quatre yeux (RG-ADM-30). Pour le sous-périmètre `admin_etablissement` (F-ETA-04), mise à jour 2026-09-26 : suspendre/réactiver/terminer une affiliation existe désormais (voir `docs/coordination-agents.md`, point F-ETA-04), au-delà du tableau brut initial de `SectionPersonnel`. |
| F-ADM-06 Fusionner des dossiers en doublon | **Fait** (mise à jour 2026-09-26) | `/app/ministere/doublons` (`src/modules/patient/fusion-doublons.ts`) : détection par nom/prénom/date de naissance normalisés, fusion transactionnelle qui réassigne les relations du patient conservé (consentements, rendez-vous, consultations, prescriptions, examens, vaccinations, documents, etc.) vers le dossier conservé, sans jamais rien supprimer ; le dossier doublon passe au statut `"fusionne"` (jamais supprimé, même principe que le compte « sans_compte » existant). |
| F-ADM-07 Paramètres et fonctionnalités activables | **Fait** (mise à jour 2026-09-26) | `/app/ministere/parametres` (`src/modules/administration/parametres.ts`) : deux volets, fonctionnalités activables (catalogue de clés, RG-IA-02 pourrait s'y adosser si une fonctionnalité IA était un jour construite) et paramètres à valeur modifiable, journalisation systématique. Périmètre honnête documenté dans le code : l'infrastructure existe et quelques paramètres représentatifs sont semés, mais peu de constantes existantes du code ont été migrées pour LIRE leur valeur depuis cette table (reste un chantier fichier par fichier). |
| F-AUD-01 Rechercher dans le journal d'audit | **Fait** (périmètre adapté) | `src/modules/audit/actions.ts` + `/app/etablissement/audit` + `/app/ministere/audit` : recherche par période (obligatoire, 31 jours max), acteur, patient (identifiant santé, résolu vers toutes les ressources qui le concernent, même principe que `getMesAccesDossier`), action, établissement (ministère uniquement), pagination à 50. Adaptation documentée dans le module : le pack réserve cette fiche au rôle `AUDITOR`, absent de ce dépôt ; ouverte à `admin_national` (vue plateforme) et `admin_etablissement` (vue strictement limitée aux actions dont l'acteur appartient à son propre établissement, vérifié à l'écran : 168 entrées scopées contre 304 au global). RG-AUD-01 (la consultation du journal est elle-même journalisée) implémenté et vérifié en base. RG-AUD-02 (chaînage cryptographique des empreintes, page de vérification d'intégrité) reste non fait : `JournalAudit.create()` est appelé directement dans une quinzaine de fichiers à travers ce dépôt, l'implémenter correctement suppose d'abord de centraliser tous ces points d'écriture derrière un helper unique, un chantier à part entière distinct de cet écran de lecture. |
| F-AUD-02 Revoir les accès d'urgence | **Fait** | `getAccesUrgenceARevoir`/`enregistrerRevueAccesUrgenceAction` (`src/modules/audit/actions.ts`) + `/app/etablissement/audit/urgences` + `/app/ministere/audit/urgences`. Nouveau modèle `RevueAccesUrgence` (table séparée, jamais une modification de l'entrée `JournalAudit` originale). Liste triée du plus ancien au plus récent, mise en évidence rouge au-delà de 7 jours, éléments consultés pendant l'accès (type et date, jamais le contenu), indice de légitimité (consultation créée pendant l'accès ou non). Décision Conforme/Non conforme avec commentaire obligatoire, testée à l'écran ; une décision non conforme notifie le professionnel et le responsable de son établissement, vérifié en base (2 notifications créées). Une deuxième tentative de revue du même accès est refusée (contrainte unique sur `journalAuditId`). |
| F-AUD-03 Détection d'anomalies d'accès | **Fait** (périmètre réduit, mise à jour 2026-09-26) | `src/modules/audit/anomalies.ts`, nouveau modèle `SignalementAnomalieAcces`. Périmètre honnête documenté dans le code : détection à la demande (au chargement de l'écran), pas une tâche planifiée horaire ; 4 des 7 règles du pack, celles calculables sans ajouter de journalisation ailleurs dans le dépôt. Un signalement n'est jamais dupliqué pour un couple (règle, utilisateur) déjà ouvert. |
| F-AUD-04 Traiter les demandes des personnes | **Fait** (mise à jour 2026-09-26) | `/app/ministere/audit/demandes` (`src/modules/audit/demandes.ts`, nouveau modèle `TraitementDemandePersonne`) : réutilise bien la matière première déjà citée dans la version précédente de cette ligne (`signalerAccesSuspectAction`, F-CIT-12). F-CIT-13 (droits sur ses données, côté citoyen) est également fait depuis, voir `docs/audit-cote-patient.md`. |

## Invariant confirmé : pas de donnée nominative de patient dans les tableaux de bord agrégés

Ce contrôle avait été fait dans la version précédente de ce document ; il est
repris ici tel quel après relecture complète des fichiers concernés dans cette
passe (`src/modules/analytics/actions.ts`, `src/app/app/etablissement/**`,
`src/app/app/ministere/**`). Recherche de tout champ identifiant un patient
(`patientNomComplet`, `patient.nom`, `identifiantSante`) : aucune occurrence.
Les deux tableaux de bord ne manipulent que des noms de personnel (légitime,
gestion RH d'un établissement, hors périmètre patient) et des indicateurs
chiffrés. Ce point reste à classer sous IND-01/IND-02 et F-PIL-01/F-PIL-02 :
la règle de non-nominativité (RG-PIL-01, partie « aucun identifiant de
patient ») est la seule règle du chapitre 14 réellement respectée, même si
tout le reste de l'infrastructure d'agrégation qui devrait l'entourer
(masquage, schéma séparé, granularité territoriale) est absent.

## Reste à faire, par ordre de valeur

Mise à jour 2026-09-26 : cette section datait d'avant le chantier de
pilotage (F-PIL-04/05/06/07) et plusieurs fiches du chapitre 15
(F-ADM-04/06/07, F-AUD-03/04), tous livrés depuis. Reconstruite en
conséquence.

1. **Chaînage d'intégrité du journal (F-AUD-01, RG-AUD-02)** : nécessite de
   centraliser les ~15 points d'écriture directe de `JournalAudit.create()`
   à travers le dépôt derrière un helper unique avant de pouvoir chaîner les
   empreintes de façon fiable. Chantier de refactorisation à part entière,
   distinct de l'écran de recherche (déjà fait). Reste le seul point ouvert
   du chapitre 15 audit.
2. **Correction immédiate à faible coût, jamais faite** : filtrer
   `getStatistiquesEtablissement` et `getStatistiquesNationales`
   (`src/modules/analytics/actions.ts`, tableaux de bord Phase 6) sur les
   consultations réellement validées et non retirées
   (`statut !== "brouillon" && !saisieParErreur`), pour au moins tenir la
   promesse déjà écrite dans le commentaire du modèle `Consultation` du
   schéma Prisma. Sans objet pour les indicateurs de `/app/pilotage`
   (F-PIL-07), qui lisent une couche d'agrégation séparée.
3. **Carte sanitaire (F-PIL-03)** : nécessite de vraies données de
   frontières géographiques (GeoJSON) des départements, à se procurer
   aupres du ministère plutôt qu'à approximer.
4. **Indicateurs restants du catalogue** (IND-06, 07, 09, 11, 12, 13) et
   filtres territoire/type d'établissement/sexe/tranche d'âge sur
   `/app/pilotage` (F-PIL-02) : le référentiel territorial existe déjà
   (`src/modules/pilotage/referentiel-territoire.ts`), la ventilation
   reste à brancher.
5. **Validation des professionnels et référentiel des comptes (F-ADM-03,
   F-ADM-05 côté `PLATFORM_ADMIN`)** : décision produit confirmée avec
   l'utilisateur le 2026-09-26 : pas de validation centrale introduite. La
   hiérarchie de provisionnement actuelle (Phase 6) reste l'intention
   produit : l'admin d'établissement crée et active directement son propre
   personnel, il répond de ses propres recrutements. F-ADM-03 et le volet
   `PLATFORM_ADMIN` de F-ADM-05 ne seront donc pas développés tels que
   décrits par le pack ; lacune assumée, pas un chantier restant.
6. **Référentiels restants (F-ADM-04)** : CIM-10 (suppose d'abord un vrai
   codage diagnostique), jours fériés, modèles de SMS. Motifs de
   rendez-vous écarté après vérification (texte libre, pas de liste
   statique existante).
7. **Tableau de bord `PLATFORM_ADMIN` (F-ADM-01)** : chantier réel mais
   qui suppose d'abord de décider si ce dépôt introduit un jour ce rôle,
   ou continue avec seulement `admin_etablissement`/`admin_national`.

## Recommandation

Mise à jour 2026-09-26. Sur les 19 fiches et catalogues comparés (8 pour
le chapitre 14, 11 pour le chapitre 15) : F-AUD-01, F-AUD-02, F-AUD-03,
F-AUD-04, F-PIL-04, F-PIL-05, F-PIL-06, F-PIL-07, F-ADM-02, F-ADM-06 et
F-ADM-07 sont désormais faits et vérifiés à l'écran ; F-PIL-01, F-PIL-02,
F-ADM-04, F-ADM-05 et le catalogue IND-01 à IND-13 restent « Partiel »
(des morceaux réels et fonctionnels existent, et pour plusieurs d'entre
eux, la majorité de la fiche) ; seuls F-PIL-03, F-ADM-01 et F-ADM-03
restent « Non fait », dont deux par décision produit assumée plutôt que
par manque de temps. La traçabilité choisie comme
fondement de sécurité du projet (`docs/pack claude/CLAUDE.md`, invariant
4.1) est un engagement tenu à l'écriture ET à la lecture, les accès
d'urgence font l'objet d'un contrôle a posteriori réel, et le pipeline
d'agrégation du chapitre 14 (F-PIL-07) existe désormais avec son propre
schéma Prisma séparé et son masquage RG-PIL-01/02/03. Les points ouverts
les plus utiles restent l'intégrité cryptographique du journal
(RG-AUD-02) et la carte sanitaire (F-PIL-03, bloquée sur des données
géographiques réelles à obtenir).
