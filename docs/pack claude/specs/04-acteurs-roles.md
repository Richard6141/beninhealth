# 4. Acteurs, rôles et espaces de travail

## 4.1 Vue d'ensemble des 12 rôles

| Code technique | Rôle | Qui | Espace (URL) | Rattachement | Double authentification |
|---|---|---|---|---|---|
| `CITIZEN` | Citoyen / patient | Toute personne ayant un compte | `/citoyen` | Aucun (personnel) | Non |
| `DOCTOR` | Médecin | Médecin inscrit à l'Ordre, validé | `/pro` | Un ou plusieurs établissements | **Oui, obligatoire** |
| `NURSE` | Infirmier / sage-femme | Infirmier, sage-femme, validé | `/pro` | Un ou plusieurs établissements | **Oui** |
| `RECEPTIONIST` | Agent d'accueil | Personnel administratif d'un établissement | `/pro` (menu réduit) | Un établissement | **Oui** |
| `CHW` | Agent de santé communautaire | Relais communautaire rattaché à un centre de santé | `/terrain` | Un centre de santé + une aire géographique | **Oui** (+ code PIN local) |
| `LAB_TECH` | Technicien de laboratoire | Technicien d'un laboratoire | `/labo` | Un laboratoire | **Oui** |
| `LAB_SUPERVISOR` | Responsable de laboratoire / biologiste | Valide les résultats | `/labo` | Un laboratoire | **Oui** |
| `PHARMACIST` | Pharmacien / agent de pharmacie habilité | Officine ou pharmacie hospitalière | `/pharmacie` | Une pharmacie | **Oui** |
| `FACILITY_ADMIN` | Responsable d'établissement | Directeur, major, gestionnaire | `/etablissement` | Un établissement | **Oui** |
| `HEALTH_AUTHORITY` | Autorité sanitaire | Ministère, direction départementale, coordination de zone | `/pilotage` | Une portée géographique : nationale, département ou zone sanitaire | **Oui** |
| `AUDITOR` | Auditeur / délégué à la protection des données | Contrôle des accès, demandes des personnes | `/audit` | National | **Oui** |
| `PLATFORM_ADMIN` | Administrateur de la plateforme | Équipe d'exploitation | `/admin` | National | **Oui**, à chaque connexion |

## 4.2 Règles générales sur les rôles

- **RG-ROL-01** — Un **compte** (utilisateur) DOIT correspondre à une seule personne physique. Les comptes partagés (« accueil1 ») sont interdits.
- **RG-ROL-02** — Tout compte possède automatiquement la capacité **citoyen** pour son propre dossier. Les autres rôles sont donnés par des **affiliations** : couple (rôle, établissement) ou (rôle, portée géographique), avec une date de début, une date de fin facultative et un statut (`INVITED`, `ACTIVE`, `SUSPENDED`, `ENDED`).
- **RG-ROL-03** — Un utilisateur qui possède plusieurs affiliations DOIT choisir un **espace actif** (F-AUTH-07). Toutes ses actions sont évaluées dans cet espace uniquement. Changer d'espace est tracé dans l'audit.
- **RG-ROL-04** — Un professionnel NE DOIT PAS accéder à **son propre dossier** ni à celui d'une **personne dont il est tuteur** depuis son espace professionnel. Il passe par son espace citoyen. Toute tentative est refusée et tracée.
- **RG-ROL-05** — Les rôles cliniques (`DOCTOR`, `NURSE`, `LAB_*`, `PHARMACIST`, `CHW`) exigent un **profil professionnel validé** par un administrateur de la plateforme (F-ADM-03) avant la première affiliation active.
- **RG-ROL-06** — `PLATFORM_ADMIN`, `AUDITOR` et `HEALTH_AUTHORITY` NE DOIVENT JAMAIS pouvoir lire une donnée clinique nominative. Aucune permission de lecture clinique ne peut leur être ajoutée, même par configuration.
- **RG-ROL-07** — Un même utilisateur NE DOIT PAS cumuler `PLATFORM_ADMIN` et un rôle clinique actif (séparation des pouvoirs). Il NE DOIT PAS non plus cumuler `AUDITOR` et `PLATFORM_ADMIN`.
- **RG-ROL-08** — Quand une affiliation passe à `ENDED` ou `SUSPENDED`, toutes les sessions ouvertes dans cet espace DOIVENT être invalidées à la requête suivante.

## 4.3 Fiche rôle — Citoyen / patient (`CITIZEN`)

**Mission.** Suivre son parcours de santé, retrouver ses documents, prendre rendez-vous, décider qui accède à ses données, agir pour ses enfants ou personnes à charge.

**Comment on obtient ce rôle.** Par inscription libre (F-AUTH-01) ou en réclamant un dossier créé par un établissement ou un agent (F-AUTH-03).

**Ce qu'il voit.** Uniquement son propre dossier et celui des personnes dont il est tuteur vérifié. Pour chaque professionnel ayant accédé à son dossier : nom, rôle, établissement, date, type de donnée consultée.

**Ce qu'il NE PEUT PAS faire.** Modifier une donnée saisie par un professionnel (il peut seulement demander une rectification, F-CIT-13) ; voir les notes marquées « sensibles » non encore annoncées par un professionnel ; voir les données d'une autre personne sans tutelle vérifiée.

**Écrans.**

| Route | Écran | Contenu principal | Fiches |
|---|---|---|---|
| `/citoyen` | Tableau de bord | Prochain rendez-vous, traitements actifs, derniers documents, alertes, 4 actions rapides | F-CIT-02 |
| `/citoyen/bienvenue` | Première utilisation | Assistant en 4 étapes | F-CIT-01 |
| `/citoyen/dossier` | Mon dossier santé | Résumé santé + chronologie filtrable | F-CIT-03 |
| `/citoyen/dossier/infos` | Mes informations déclarées | Allergies, antécédents, contacts d'urgence | F-CIT-04 |
| `/citoyen/carte` | Ma carte santé | Identifiant santé + QR code | F-CIT-05 |
| `/citoyen/ordonnances`, `/citoyen/resultats`, `/citoyen/documents` | Ordonnances, résultats, documents | Listes, détail, téléchargement | F-CIT-06 |
| `/citoyen/rendez-vous` | Mes rendez-vous | À venir, passés, prise de rendez-vous | F-RDV-01, F-RDV-02 |
| `/citoyen/partage` | Mes autorisations | Autorisations actives, partage temporaire | F-CIT-10, F-CIT-11 |
| `/citoyen/acces` | Qui a consulté mon dossier | Historique des accès | F-CIT-12 |
| `/citoyen/proches` | Mes personnes à charge | Liste, ajout, bascule | F-CIT-07, F-CIT-08 |
| `/citoyen/notifications` | Notifications | Centre de notifications | F-NOT-01 |
| `/citoyen/compte` | Mon compte | Profil, sécurité (`/citoyen/compte/securite`), préférences (`/citoyen/compte/notifications`), mes droits (`/citoyen/compte/mes-droits`) | F-AUTH-09, F-NOT-03, F-CIT-13 |

## 4.4 Fiche rôle — Médecin (`DOCTOR`)

**Mission.** Retrouver un patient autorisé, consulter son historique, enregistrer une consultation, prescrire, demander des examens, suivre l'évolution.

**Comment on obtient ce rôle.** Invitation par le responsable d'établissement (F-ETA-04) → activation du compte (F-AUTH-05) → validation du profil professionnel (numéro d'inscription à l'Ordre) par l'administrateur (F-ADM-03).

**Ce qu'il voit.** Les patients pour lesquels il dispose d'une **base d'accès** valide (chapitre 5) dans son établissement actif. Le niveau de détail dépend de la base : résumé ou dossier complet ; les données **sensibles** seulement s'il en est l'auteur ou si le patient l'a explicitement autorisé.

**Ce qu'il NE PEUT PAS faire.** Chercher librement un patient dans tout le pays ; modifier une consultation validée (seulement l'addendum) ; signer une ordonnance sans ré-authentification ; supprimer quoi que ce soit ; voir les statistiques d'autres établissements.

**Écrans.**

| Route | Écran | Contenu principal | Fiches |
|---|---|---|---|
| `/pro` | Tableau de bord | Patients du jour, rendez-vous, alertes (résultats reçus, brouillons non validés), tâches | F-CLI-01 |
| `/pro/patients` | Recherche patient | Recherche par identifiant santé, QR, téléphone ou nom + date de naissance | F-CLI-02 |
| `/pro/patients/nouveau` | Nouveau dossier | Formulaire avec détection de doublons | F-CLI-03 |
| `/pro/patients/[id]` | Résumé patient | Bandeau identité + allergies, résumé | F-CLI-04 |
| `/pro/patients/[id]/historique` | Historique complet | Chronologie filtrable avec panneau de détail | F-CLI-09 |
| `/pro/patients/[id]/consultations/[cid]` | Consultation | Écran en 3 zones : patient / saisie / actions | F-CLI-05 à F-CLI-08 |
| `/pro/patients/[id]/ordonnances/nouvelle` | Ordonnance | Lignes de médicaments, contrôles, signature | F-PRE-01 à F-PRE-04 |
| `/pro/patients/[id]/examens/nouveau` | Demande d'examen | Choix des examens, laboratoire | F-LAB-01 |
| `/pro/urgence` | Accès d'urgence | Justification, durée | F-CLI-10 |
| `/pro/agenda` | Mon agenda | Rendez-vous par jour | F-RDV-04 |
| `/pro/ia` (panneau latéral) | Résumé IA | Synthèse sourcée du dossier | F-IA-01 |

## 4.5 Fiche rôle — Infirmier / sage-femme (`NURSE`)

**Mission.** Accueillir cliniquement le patient (prise des constantes, tri), réaliser et noter les soins, administrer les vaccins, suivre les patients, et, pour la sage-femme, suivre la grossesse.

**Différences avec le médecin (règles strictes).**

- **RG-ROL-10** — Un `NURSE` PEUT créer une **note de soins** et saisir des **constantes** (F-CLI-12), enregistrer une **vaccination** (F-CLI-11), créer un dossier patient (F-CLI-03).
- **RG-ROL-11** — Un `NURSE` NE DOIT PAS valider un **diagnostic médical** ni **signer une ordonnance** de médicaments. Exception prévue en P2 : liste limitative de produits pour les sages-femmes, paramétrable par l'administrateur.
- **RG-ROL-12** — Un `NURSE` voit le **résumé** et les consultations du patient dans le contexte de soins de son établissement, mais pas les données sensibles.

**Écrans.** Mêmes routes que le médecin (`/pro`), le menu masquant « Ordonnance » et « Valider le diagnostic ». Ajout de `/pro/soins` (liste des patients en attente de constantes) et de `/pro/vaccination`.

## 4.6 Fiche rôle — Agent d'accueil (`RECEPTIONIST`)

**Mission.** Gérer les rendez-vous et la file du jour, enregistrer l'arrivée des patients, créer un dossier pour un patient qui n'en a pas.

**Ce qu'il voit.** Uniquement des **données administratives** : nom, prénoms, date de naissance, sexe, téléphone, identifiant santé, rendez-vous dans son établissement. **Aucune donnée clinique** (ni allergies, ni consultations).

**Ce qu'il NE PEUT PAS faire.** Lire le dossier médical ; créer une consultation ; voir les rendez-vous d'un autre établissement.

**Écrans.**

| Route | Écran | Fiches |
|---|---|---|
| `/pro/accueil` | File du jour (arrivés, en attente, en consultation, terminés, absents) | F-RDV-04, F-RDV-05 |
| `/pro/accueil/demandes` | Demandes de rendez-vous à confirmer | F-RDV-03 |
| `/pro/accueil/rdv/nouveau` | Rendez-vous pris au guichet ou par téléphone | F-RDV-06 |
| `/pro/patients` | Recherche exacte d'un patient (RG-ACC-40) | F-CLI-02 |
| `/pro/patients/nouveau` | Nouveau dossier (administratif) | F-CLI-03 |

## 4.7 Fiche rôle — Agent de santé communautaire (`CHW`)

**Mission.** Suivre la santé au niveau du village ou du quartier : enregistrer les personnes, faire des visites, vacciner lors des campagnes, repérer les signes de danger et orienter vers le centre de santé. Travaille souvent **sans réseau**.

**Ce qu'il voit.** Les personnes de **son aire géographique** (liste de villages ou quartiers affectée par le responsable du centre de santé), limité aux données communautaires : identité, vaccinations, visites communautaires, suivis de grossesse et d'enfant. **Pas** les consultations médicales ni les résultats de laboratoire.

**Règles strictes.**

- **RG-ROL-20** — Les données téléchargées sur l'appareil DOIVENT être limitées à son aire et effacées à la déconnexion ou après 30 jours sans synchronisation.
- **RG-ROL-21** — L'application terrain DOIT être protégée par un **code PIN** de 6 chiffres en plus du compte.
- **RG-ROL-22** — Les saisies hors ligne DOIVENT être des **ajouts** (nouvelle visite, nouvelle vaccination, nouvelle personne) et jamais des modifications de données existantes, pour éviter tout conflit.

**Écrans.** `/terrain` (tableau de bord : à synchroniser, visites prévues), `/terrain/preparation`, `/terrain/personnes`, `/terrain/personnes/nouvelle`, `/terrain/visite/nouvelle`, `/terrain/vaccination`, `/terrain/synchronisation`. Fiches F-COM-01 à F-COM-04 et F-COM-08 (F-COM-05 à 07 : P2).

## 4.8 Fiche rôle — Technicien de laboratoire (`LAB_TECH`) et responsable (`LAB_SUPERVISOR`)

**Mission.** Recevoir les demandes d'examen adressées au laboratoire, enregistrer le prélèvement, saisir les résultats ; le responsable **valide** avant diffusion.

**Ce qu'ils voient.** Pour chaque demande **adressée à leur laboratoire** : identité minimale du patient (nom, prénoms, âge, sexe, identifiant santé), examens demandés, renseignements cliniques utiles saisis par le prescripteur, prescripteur. **Pas** le reste du dossier.

**Règles strictes.**

- **RG-ROL-30** — Seul `LAB_SUPERVISOR` PEUT valider un résultat. Un résultat NE DOIT PAS être validé par la personne qui l'a saisi (principe des quatre yeux), sauf paramètre « laboratoire à une seule personne » activé par l'administrateur pour ce laboratoire, auquel cas la validation est tracée comme « auto-validation ».
- **RG-ROL-31** — Un résultat validé NE DOIT PAS être modifié ; une correction crée une nouvelle version avec motif, et le prescripteur est notifié.

**Écrans.** `/labo` (file : à recevoir, en cours, à valider, validés du jour), `/labo/demandes/[id]`, `/labo/validation`. Fiches F-LAB-02 à F-LAB-06.

## 4.9 Fiche rôle — Pharmacien (`PHARMACIST`)

**Mission.** Vérifier une ordonnance présentée, enregistrer la délivrance (totale, partielle, avec substitution générique), consulter l'historique des délivrances de sa pharmacie.

**Ce qu'il voit.** L'ordonnance **présentée** (grâce à son code et à une vérification) : médicaments, posologies, prescripteur, date, statut, délivrances précédentes ; du patient : nom, prénoms, âge, sexe, **allergies médicamenteuses**. **Jamais** le diagnostic ni le reste du dossier.

**Écrans.** `/pharmacie` (recherche d'ordonnance, délivrances du jour), `/pharmacie/ordonnances/[code]`, `/pharmacie/historique`. Fiches F-PHA-01 à F-PHA-04.

## 4.10 Fiche rôle — Responsable d'établissement (`FACILITY_ADMIN`)

**Mission.** Gérer la fiche de l'établissement, son personnel, ses services et agendas, et suivre l'activité **statistique** de son établissement.

**Ce qu'il voit.** Données administratives de l'établissement, liste du personnel, indicateurs **agrégés** de son établissement, liste des accès d'urgence réalisés dans son établissement (pour revue, sans contenu clinique).

**Ce qu'il NE PEUT PAS faire.** Lire un dossier patient (sauf s'il a aussi un rôle clinique et qu'il bascule dans cet espace) ; voir les autres établissements ; valider un professionnel au niveau national.

**Écrans.** `/etablissement` (tableau de bord), `/etablissement/fiche`, `/etablissement/personnel`, `/etablissement/services`, `/etablissement/agendas`, `/etablissement/urgences`. Fiches F-ETA-03 à F-ETA-05, F-PIL-01.

## 4.11 Fiche rôle — Autorité sanitaire (`HEALTH_AUTHORITY`)

**Mission.** Piloter : suivre l'activité des établissements, analyser les territoires et les tendances, planifier les ressources.

**Portée.** Chaque affiliation a une portée : `NATIONAL` (ministère), `DEPARTMENT` (direction départementale, un département) ou `HEALTH_ZONE` (coordination d'une zone sanitaire). Les données affichées sont **filtrées automatiquement** à cette portée.

**Ce qu'il voit.** Exclusivement des **indicateurs agrégés** ; les effectifs de 1 à 4 sont masqués « < 5 ». **Aucune** donnée nominative, ni liste de patients.

**Écrans.** `/pilotage` (indicateurs clés), `/pilotage/carte`, `/pilotage/tendances`, `/pilotage/etablissements`, `/pilotage/alertes`, `/pilotage/rapports`. Fiches F-PIL-02 à F-PIL-06.

## 4.12 Fiche rôle — Auditeur / délégué à la protection des données (`AUDITOR`)

**Mission.** Contrôler la bonne utilisation des accès, revoir les accès d'urgence, détecter les anomalies, traiter les demandes des personnes (accès, rectification).

**Ce qu'il voit.** Le **journal d'audit** complet (qui, quoi, quand, sur quel patient, avec quelle base d'accès), mais **pas le contenu médical** des données consultées.

**Écrans.** `/audit` (tableau de bord d'anomalies), `/audit/journal`, `/audit/urgences`, `/audit/demandes`. Fiches F-AUD-01 à F-AUD-04.

## 4.13 Fiche rôle — Administrateur de la plateforme (`PLATFORM_ADMIN`)

**Mission.** Gérer les référentiels (établissements, géographie, CIM-10, médicaments, examens, vaccins), valider les professionnels, gérer les comptes (suspension), fusionner les doublons (sans lire le contenu clinique), paramétrer la plateforme et les fonctionnalités activables.

**Ce qu'il NE PEUT PAS faire.** Lire une donnée clinique ; se donner à lui-même un rôle clinique ; modifier ou supprimer le journal d'audit.

**Écrans.** `/admin`, `/admin/etablissements`, `/admin/professionnels`, `/admin/comptes`, `/admin/referentiels`, `/admin/doublons`, `/admin/parametres`. Fiches F-ADM-01 à F-ADM-07.

## 4.14 Matrice des permissions (référence)

Légende : **O** = oui ; **—** = non ; **B** = oui **si** une base d'accès valide existe pour ce patient (chapitre 5) ; **P** = limité à son propre dossier et à ses personnes à charge ; **E** = limité à son établissement ; **A** = limité à son aire ; **G** = agrégé uniquement, dans sa portée.

| Permission | CITIZEN | DOCTOR | NURSE | RECEPT. | CHW | LAB_T | LAB_S | PHARM | FAC_ADM | HEALTH_A | AUDITOR | PLAT_ADM |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `patient.identity.read` | P | B | B | E | A | Demande | Demande | Ordonnance | — | — | — | Fusion |
| `patient.summary.read` | P | B | B | — | — | — | — | Allergies | — | — | — | — |
| `patient.record.read` (complet) | P | B | B (sans sensible) | — | — | — | — | — | — | — | — | — |
| `patient.create` | Soi + proches | O | O | O | O | — | — | — | — | — | — | — |
| `patient.declared.update` | P | — | — | — | — | — | — | — | — | — | — | — |
| `consultation.create` / `.validate` | — | B | Note de soins | — | — | — | — | — | — | — | — | — |
| `prescription.sign` | — | B | — | — | — | — | — | — | — | — | — | — |
| `prescription.dispense` | — | — | — | — | — | — | — | Ordonnance | — | — | — | — |
| `lab.order.create` | — | B | — | — | — | — | — | — | — | — | — | — |
| `lab.result.enter` / `.validate` | — | — | — | — | — | O / — | O / O | — | — | — | — | — |
| `vaccination.create` | — | B | B | — | A | — | — | — | — | — | — | — |
| `appointment.book` | P | — | — | E | — | — | — | — | — | — | — | — |
| `appointment.manage` | — | E | E | E | — | — | — | — | E | — | — | — |
| `consent.manage` | P | — | — | — | — | — | — | — | — | — | — | — |
| `access_log.read` (sur soi) | P | — | — | — | — | — | — | — | — | — | — | — |
| `emergency_access.open` | — | O | O | — | — | — | — | — | — | — | — | — |
| `facility.manage` / `staff.manage` | — | — | — | — | — | — | — | — | E | — | — | O |
| `analytics.read` | — | — | — | — | — | — | — | — | E (G) | G | — | — |
| `audit.read` | — | — | — | — | — | — | — | — | Urgences E | — | O | — |
| `referential.manage` / `practitioner.validate` | — | — | — | — | — | — | — | — | — | — | — | O |
| `account.suspend` | — | — | — | — | — | — | — | — | Affiliations E | — | — | O |
| `community.read` / `community.visit.create` | — | — | — | — | A | — | — | — | — | — | — | — |
| `vitals.create` | — | B | B | — | — | — | — | — | — | — | — | — |
| `document.create` | — | B | B | — | — | Demande | Demande | — | — | — | — | — |
| `consent.request` / `share_code.redeem` | — | O | O | — | — | — | — | — | — | — | — | — |
| `lab.sample.collect` | — | — | — | — | — | Demande | Demande | — | — | — | — | — |
| `lab.order.cancel` / `lab.result.release` | — | Prescripteur | — | — | — | — | — | — | — | — | — | — |
| `emergency_access.review` | — | — | — | — | — | — | — | — | E | — | O | — |
| `patient.merge` | — | — | — | — | — | — | — | — | — | — | — | O |
| `data_request.manage` | — | — | — | — | — | — | — | — | — | — | O | — |
| `ai.summary` | — | B (FULL) | — | — | — | — | — | — | — | — | — | — |
| `health_alert.review` | — | — | — | — | — | — | — | — | — | G | — | — |

> [!NOTE] Comment lire « Demande », « Ordonnance », « Fusion »
> Le laboratoire ne voit l'identité que des patients qui ont une **demande d'examen adressée à son laboratoire** ; la pharmacie, que pour l'**ordonnance présentée** ; l'administrateur, que les données d'identité strictement nécessaires à la **fusion de doublons**.
