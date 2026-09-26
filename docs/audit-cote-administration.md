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
| Catalogue IND-01 à IND-13 (section 14.2) | **Partiel** | Seule une poignée d'indicateurs approximatifs existent, dans `src/modules/analytics/actions.ts` (`getStatistiquesEtablissement`, `getStatistiquesNationales`) : total consultations, total prescriptions, nombre de professionnels, répartition des rendez-vous par statut, série mensuelle des consultations sur 6 mois glissants. Aucun ne respecte la définition exacte du pack : IND-01 compte toutes les consultations sans filtrer sur un statut validé (`prisma.consultation.count({ where: { etablissementId } })` ne filtre ni `statut`, ni `saisieParErreur`), alors que `prisma/schema.prisma` affirme dans son propre commentaire sur `Consultation.saisieParErreur` que ces lignes sont « exclue des statistiques », ce qui n'est pas le cas en pratique (RG-PIL-61 non respecté). IND-02 (patients vus sur une période) n'existe pas, seul un total national statique de la table `Patient` est affiché. IND-03 et IND-04 (top diagnostics, cas de paludisme) sont impossibles aujourd'hui : aucun référentiel CIM-10 ni groupe de maladies n'existe dans ce dépôt (déjà noté indirectement dans `docs/audit-cote-medecin.md`, F-CLI-07, où la conclusion de consultation tient lieu de diagnostic faute de codage). IND-05, IND-06 (établissements et professionnels actifs sur une fenêtre glissante) n'existent pas, seuls des totaux statiques sont affichés. IND-07 a une répartition par statut mais aucun taux d'absence calculé, aucun sélecteur de période, aucune ventilation par service. IND-08 à IND-12 (ordonnances, ruptures, vaccinations, délai d'attente, qualité de saisie) sont totalement absents des tableaux de bord, alors que les données sous-jacentes existent en partie depuis les phases 7 à 9 (prescriptions, `Vaccination`). IND-13 (adoption) est absent. Les règles transverses RG-PIL-01 à 05 (masquage des petits effectifs « < 5 », schéma `analytics` séparé, rôle `analytics_reader`) sont absentes sans exception (recherche de « masquage », « effectif insuffisant », « analytics_reader » : aucune occurrence hors d'un fichier sans rapport). |
| F-PIL-01 Tableau de bord d'établissement | **Partiel** | `/app/etablissement` (`src/app/app/etablissement/page.tsx`) existe pour `admin_etablissement` : tuiles consultations/prescriptions/professionnels, répartition des rendez-vous par statut, graphique en barres sur 6 mois, liste du personnel. Manque : sélecteur de période, délai d'attente médian, top 10 des diagnostics, activité par service et par professionnel, distinction personnel actif/invité/suspendu (le statut affiché ne connaît que valide/en_attente/rejete/suspendu mais aucun compte n'est jamais créé autrement que « valide », voir F-ADM-03), et surtout la section « accès d'urgence réalisés dans l'établissement » : elle n'existe pas, seule une `Notification` in-app ponctuelle est envoyée aux comptes `admin_etablissement` au moment de l'accès (`src/modules/urgence/actions.ts`, lignes 226 à 243). |
| F-PIL-02 Centre national de pilotage | **Partiel** | `/app/ministere` (`src/app/app/ministere/page.tsx`) existe pour `admin_national`, avec deux onglets (indicateurs nationaux, établissements). Manque, par rapport à la composition imposée par la fiche : barre de filtres (territoire, période, type, sexe, tranche d'âge), variation par rapport à la période précédente, carte (F-PIL-03), section alertes (F-PIL-06), mention permanente de masquage en pied de page, et journalisation `ANALYTICS_VIEW` de chaque ouverture ou changement de filtre (RG-PIL-21, aucun `journalAudit.create` dans ce parcours). RG-PIL-20 (portée départementale) est sans objet : `EtablissementSanitaire` n'a aucun champ département, commune ou zone sanitaire, seulement une `localisation` en texte libre, donc aucune notion de territoire n'existe pour restreindre une portée. |
| F-PIL-03 Carte sanitaire interactive | **Non fait** | Aucune trace de carte, de GeoJSON ni de choroplèthe dans le code (`geojson`, `choroplèthe`, `carte sanitaire` : aucune occurrence). |
| F-PIL-04 Tendances et comparaisons | **Non fait** | Aucune route `/pilotage` n'existe dans ce dépôt (recherche de fichiers vide), a fortiori pas `/pilotage/tendances`. |
| F-PIL-05 Exports et rapports | **Partiel** | Seul un export CSV brut existe, réservé à `admin_national` : `exporterRepartitionCSV` (`src/modules/analytics/actions.ts`) déclenché par `BoutonExportCSV.tsx`, qui ne contient que la répartition par établissement. Aucun export PDF, aucun motif obligatoire, aucune ré-authentification, et aucune journalisation (RG-PIL-40 non respecté : pas de `journalAudit.create` dans `exporterRepartitionCSV`). RG-PIL-41 (masquage avant export) est sans objet puisqu'aucune règle de masquage n'existe. Rien d'équivalent côté `admin_etablissement`. |
| F-PIL-06 Alertes épidémiologiques simples | **Non fait** | Aucune détection d'anomalie statistique, aucune table `health_alert_reviews`, aucun code lié aux mots « alerte » ou « paludisme » à l'échelle agrégée. |
| F-PIL-07 Calcul des agrégats (processus technique) | **Non fait** | Aucune file de tâches, aucune tâche horaire ni nocturne, aucun schéma `analytics` séparé. Les deux tableaux de bord lisent directement et en synchrone les tables opérationnelles (`Consultation`, `RendezVous`, `Prescription`, `Patient`) à chaque affichage de page. C'est la cause racine qui rend presque toutes les règles RG-PIL de masquage et de portée inapplicables : il n'existe pas de couche d'agrégation où les appliquer. |

## Chapitre 15, administration de la plateforme et audit

| Fiche | Statut | Commentaire |
|---|---|---|
| F-ADM-01 Tableau de bord administrateur | **Non fait** | Aucune route `/admin` n'existe, et aucun rôle `PLATFORM_ADMIN` n'est défini dans `src/security/permissions.ts`. Aucune file d'attente (professionnels à valider, doublons, établissements en brouillon, réinitialisations MFA), aucun état technique, aucune volumétrie distincte de ce que `admin_national` voit déjà sous `/app/ministere`. |
| F-ADM-02 Gérer le référentiel des établissements | **Partiel** | La création existe via `creerEtablissementAction` (`src/modules/identity/gestion-comptes.ts`), mais avec un jeu de champs bien plus restreint que la fiche : nom, type, localisation en texte libre, latitude/longitude, capacité, services disponibles, sans sigle, niveau de pyramide, secteur, département/commune/arrondissement/zone sanitaire, quartier/village, téléphone/email d'établissement ni identifiant DHIS2. Le modèle `EtablissementSanitaire` (`prisma/schema.prisma`) n'a aucun champ `statut` : pas de cycle `DRAFT`/`ACTIVE`/`SUSPENDED`/`CLOSED`, donc RG-ADM-01 (fermeture avec conservation des données) et RG-ADM-02 (jamais supprimé, seulement fermé) sont sans objet, faute de mécanisme de fermeture à évaluer. Pas d'import CSV (P1, absence cohérente avec la priorité). |
| F-ADM-03 Valider un professionnel | **Non fait** | Le type `StatutValidationProfessionnel` (`src/types/domain-identity.ts`) et le champ `ProfessionnelSante.statutValidation` (défaut `"en_attente"` dans `prisma/schema.prisma`) prévoient bien les états `en_attente`/`valide`/`rejete`/`suspendu`, mais aucun chemin de création réel ne les utilise : `creerProfessionnelAction` et `creerEtablissementAction` (`src/modules/identity/gestion-comptes.ts`) forcent toutes deux `statutValidation: "valide"` dès la création. Il n'existe donc aucun écran d'approbation, aucun délai de 72 heures affiché (RG-ADM-10), aucune garde anti auto-validation (RG-ADM-11) : il n'y a simplement pas d'étape de validation à protéger. |
| F-ADM-04 Gérer les référentiels | **Fait** (périmètre réduit à un seul référentiel) | Le pack liste sept référentiels (CIM-10, médicaments et classes, examens et valeurs de référence, vaccins et calendrier, motifs de rendez-vous, jours fériés, modèles de SMS) : construire les sept était hors de portée pour ce soir. Traité : le référentiel vaccinal (`src/modules/administration/referentiel-vaccinal.ts`, écran `/app/ministere/referentiels/vaccins`), qui remplace le tableau statique historique `VACCINS_REFERENTIEL` de `src/modules/vaccination/referentiel.ts`. RG-ADM-20 (désactivation seule, jamais de suppression d'une entrée déjà utilisée par une vraie `Vaccination`) implémenté et vérifié. RG-ADM-21 (versionnement : chaque modification crée une nouvelle version numérotée, datée, avec auteur et commentaire) hors périmètre, limite assumée : seul l'état courant est conservé. Les règles d'âge/intervalle minimum du calendrier PEV (`REGLES_AGE_VACCINS`, `controlerAgeVaccination`) restent codées en dur, clé par le nom du vaccin : seule la liste des noms proposés devient administrable, pas les règles elles-mêmes. Vérifié de bout en bout (ajout d'un vaccin de test, présent dans le formulaire médecin, désactivé, absent du formulaire après désactivation, vaccins historiques toujours présents). Les six autres référentiels du pack restent non construits. |
| F-ADM-05 Gérer les comptes | **Partiel** | Rien pour le périmètre `PLATFORM_ADMIN` : pas d'écran `/admin/comptes`, pas de recherche de compte, pas de suspension/réactivation, pas de réinitialisation de second facteur, pas de principe des quatre yeux (RG-ADM-30). Pour le sous-périmètre `admin_etablissement` (F-ETA-04), seule la création de personnel existe (`creerProfessionnelAction`) : aucune action pour suspendre un membre du personnel, terminer une affiliation ou consulter une fiche de compte détaillée, uniquement le tableau brut de `SectionPersonnel` (`src/app/app/etablissement/page.tsx`). |
| F-ADM-06 Fusionner des dossiers en doublon | **Non fait** | Aucun écran `/admin/doublons`, aucune Server Action de fusion. La détection de doublon existante (`creerPatientParProfessionnelAction`, voir `docs/audit-cote-medecin.md`) intervient uniquement à la création d'un patient : c'est un mécanisme préventif différent, pas un écran de résolution a posteriori des doublons déjà créés. |
| F-ADM-07 Paramètres et fonctionnalités activables | **Non fait** | Aucune table `settings`, aucun système de fonctionnalités activables (`ai.summary`, `sms.real_provider`, etc.) nulle part dans le code. |
| F-AUD-01 Rechercher dans le journal d'audit | **Non fait** | C'est l'écart le plus important des deux chapitres. Le modèle `JournalAudit` (`prisma/schema.prisma`, ligne 392) est alimenté par la quasi totalité des modules (patient, facility, identity, clinical, urgence, etc.) mais n'est lu nulle part par un écran d'administration ou d'audit : la seule lecture de toute la base de code est `prisma.journalAudit.findMany` dans `src/modules/patient/actions.ts` (ligne 319, fonction `getMesAccesDossier`), qui sert l'écran patient « qui a consulté mon dossier » (F-CIT-12), pas un outil de recherche pour un rôle administratif. Aucun écran `/audit/journal`, aucun filtre par acteur/patient/établissement/action/base d'accès, aucune pagination, aucun export. RG-AUD-02 (chaînage des empreintes, page de vérification d'intégrité) n'est pas implémenté : le modèle `JournalAudit` n'a aucun champ d'empreinte de la trace précédente, seulement `id, utilisateurId, action, donneeConcernee, date, adresseTechnique, justification`. |
| F-AUD-02 Revoir les accès d'urgence | **Non fait** | Confirmé inchangé depuis `docs/audit-cote-medecin.md`. `src/modules/urgence/actions.ts` journalise bien chaque accès d'urgence dans `JournalAudit` (action `acces_urgence`) et envoie une `Notification` in-app aux comptes `admin_etablissement` de l'établissement concerné (lignes 226 à 243), mais aucun écran de revue n'existe : ni `/audit/urgences` ni `/etablissement/urgences` (recherche de fichiers vide sur les deux). Personne ne peut donc marquer un accès « Conforme »/« Non conforme », voir la liste des éléments consultés, ni bénéficier de la file triée par ancienneté à 7 jours que décrit la fiche. |
| F-AUD-03 Détection d'anomalies d'accès | **Fait** (périmètre réduit) | Détection à la demande (au chargement de l'écran admin), pas une tâche planifiée horaire comme le demande le pack, pour ne pas dépendre du planificateur de F-PIL-07. 4 des 7 règles du pack : accès d'urgence fréquents (> 3 sur 7 jours), connexions multi-IP (> 3 adresses en 1 heure), dossiers distincts élevés (> 60 par jour), nom de famille identique entre professionnel et patient consulté. Les 3 autres (recherches sans résultat, accès refusés, arrivées vérifiées « sur pièce ») supposeraient de journaliser de nouveaux événements à travers de nombreux fichiers, hors de portée. Écran `/app/ministere/audit/anomalies` : liste des signalements nouveaux et fermés, clôture avec commentaire obligatoire. |
| F-AUD-04 Traiter les demandes des personnes | **Fait** | Workflow de traitement pour deux types de demandes déjà produits ailleurs dans ce dépôt (aucun nouveau formulaire de saisie) : demande de rectification (`src/modules/patient/droits-donnees.ts`) et signalement d'accès suspect (`src/modules/patient/actions.ts`), toutes deux routées vers `admin_national` via `JournalAudit` (rôle `AUDITOR` absent de ce dépôt). Nouveau modèle `TraitementDemandePersonne`, même principe que `RevueAccesUrgence` : jamais une modification de l'entrée `JournalAudit` d'origine. Écran `/app/ministere/audit/demandes` : liste des demandes traitées et non traitées, réponse en texte libre (10 caractères minimum), une deuxième tentative de traitement de la même demande est refusée plutôt que d'écraser la première réponse. F-CIT-13 (droits sur ses données, côté citoyen) est désormais fait aussi, voir `docs/audit-cote-patient.md`. |

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

1. **Écran de recherche dans le journal d'audit (F-AUD-01, P0)** : `JournalAudit`
   est déjà alimenté partout dans le code (Zero Trust oblige, voir
   `docs/pack claude/CLAUDE.md` section 4.1), mais rien ne permet à quiconque
   de le consulter de façon transverse aujourd'hui, hors du cas très étroit
   de l'auto-consultation patient (F-CIT-12). C'est l'écart qui prive tous
   les autres correctifs de sécurité déjà faits (accès d'urgence, consentement,
   etc.) de tout mécanisme de contrôle a posteriori.
2. **Écran de revue des accès d'urgence (F-AUD-02, P1 mais lié à un P0
   fonctionnel)** : les données existent déjà intégralement dans `JournalAudit`
   (action `acces_urgence`), il ne manque qu'un écran de liste et deux boutons
   de décision, réutilisable pour `admin_etablissement` sur son propre
   périmètre.
3. **Pipeline d'agrégation et masquage des petits effectifs (F-PIL-07,
   RG-PIL-01 à 05, P0)** : tant qu'il n'existe pas de couche d'agrégation
   séparée, aucun indicateur du catalogue IND-01 à IND-13 ne peut respecter
   les règles de confidentialité du pack (masquage « < 5 », granularité
   territoriale minimale pour les données `SENSITIVE`). Ce chantier
   conditionne la quasi totalité du chapitre 14.
4. **Correction immédiate à faible coût** : filtrer `getStatistiquesEtablissement`
   et `getStatistiquesNationales` (`src/modules/analytics/actions.ts`) sur les
   consultations réellement validées et non retirées
   (`statut !== "brouillon" && !saisieParErreur`), pour au moins tenir la
   promesse déjà écrite dans le commentaire du modèle `Consultation` du
   schéma Prisma.
5. **Validation des professionnels et référentiel des comptes (F-ADM-03,
   F-ADM-05)** : décision à prendre avec l'utilisateur, la hiérarchie de
   provisionnement actuelle (Phase 6) fait délibérément l'économie d'une
   étape de validation puisque c'est l'admin d'établissement qui répond de
   ses propres recrutements ; documenter ce choix comme décision assumée
   plutôt que lacune, si c'est bien l'intention produit.
6. **Tout le reste du chapitre 15** (référentiels administrables, doublons,
   feature flags, tableau de bord `PLATFORM_ADMIN`) et la carte, les
   tendances et les alertes du chapitre 14 : chantiers réels mais qui
   supposent d'abord de décider si ce dépôt introduit un jour les rôles
   `PLATFORM_ADMIN` et `AUDITOR` du pack, ou s'il continue avec seulement
   `admin_etablissement`/`admin_national`.

## Recommandation

Sur les 19 fiches et catalogues comparés (8 pour le chapitre 14, 11 pour le
chapitre 15), aucun n'est entièrement « Fait » au sens strict du pack : 6 sont
« Partiel » (des morceaux réels et fonctionnels existent, notamment les deux
tableaux de bord Phase 6 et la hiérarchie de provisionnement), et 13 sont
« Non fait ». Ce n'est pas alarmant en soi : ces deux rôles ne manipulent
aucune donnée clinique individuelle, ce qui reste le bon ordre de priorité
pour une démonstration MVP. Le point qui mérite une attention réelle avant
d'aller plus loin est F-AUD-01 : la plateforme trace consciencieusement
presque toutes ses actions dans `JournalAudit` depuis la Phase 2, mais
personne, aujourd'hui, ne peut relire ce journal autrement qu'un patient
consultant sa propre fiche. Tant que cet écran n'existe pas, la traçabilité
choisie comme fondement de sécurité du projet (`docs/pack claude/CLAUDE.md`,
invariant 4.1) reste un engagement tenu à l'écriture mais pas à la lecture.

Mise à jour 2026-09-26 : F-ADM-04, F-AUD-03 et F-AUD-04 sont passés à
« Fait » depuis ce constat, voir leurs lignes dans le tableau ci-dessus
(F-AUD-01 et F-AUD-02, également « Fait » entre-temps, sont à vérifier avec
la session qui les a construits). Les chiffres « 6 Partiel / 13 Non fait »
ci-dessus datent donc d'avant ces chantiers.
