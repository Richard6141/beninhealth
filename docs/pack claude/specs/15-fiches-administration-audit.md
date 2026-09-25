# 15. Fiches fonctionnelles — Administration de la plateforme et audit

L'espace d'administration utilise un thème **gris anthracite** avec accent **rouge** (actions à fort impact) ; l'espace d'audit un thème **violet**. Ces espaces sont denses (tableaux), destinés à un usage sur ordinateur, mais restent utilisables sur tablette.

### F-ADM-01 — Tableau de bord administrateur

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P0 / E08 |
| Écrans | `/admin` |

**Composition.** Files d'attente à traiter (avec compteurs) : professionnels à valider, doublons à revoir, établissements en brouillon, réinitialisations de second facteur demandées. État technique : dernière exécution des tâches planifiées (agrégats, rappels, expiration), taille de la file de SMS en attente, erreurs des dernières 24 h (nombre). Volumétrie : comptes par rôle, établissements par statut.

### F-ADM-02 — Gérer le référentiel des établissements

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P0 / E08 |
| Écrans | `/admin/etablissements`, `/admin/etablissements/[id]` |
| API | `GET/POST/PATCH /api/v1/admin/facilities` |

**Champs.** Nom officiel, sigle, **type** (section 18.5), **niveau** de pyramide (central / intermédiaire / périphérique), secteur (public / privé lucratif / privé confessionnel / associatif), département, commune, arrondissement, **zone sanitaire**, quartier/village, adresse, coordonnées **GPS** (clic sur une carte ou saisie ; contrôle : le point doit être à l'intérieur de la commune choisie), téléphone, email, identifiant externe (code de l'établissement dans DHIS2, facultatif), statut (`DRAFT`, `ACTIVE`, `SUSPENDED`, `CLOSED`), établissement parent (ex. laboratoire d'un hôpital).

**Déroulé.** Création en `DRAFT` → contrôle → activation → invitation du responsable (F-AUTH-05). **Import CSV** (P1) : modèle téléchargeable, validation ligne par ligne, rapport d'erreurs, aucun import partiel (tout ou rien).

**Règles strictes.** **RG-ADM-01** — Fermer (`CLOSED`) un établissement DOIT : terminer toutes les affiliations, annuler les rendez-vous futurs avec notification, conserver toutes les données cliniques. **RG-ADM-02** — Un établissement NE PEUT PAS être supprimé, seulement fermé.

### F-ADM-03 — Valider un professionnel

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P0 / E08 |
| Écrans | `/admin/professionnels?statut=a-valider` |
| API | `POST /api/v1/admin/practitioners/{id}/approve`, `/reject` |

**Déroulé.** L'administrateur ouvre la demande : identité, profession, spécialité, numéro d'inscription, carte professionnelle téléversée, établissement(s) d'invitation, date de la demande. Il vérifie le numéro auprès de l'ordre professionnel concerné (procédure manuelle hors plateforme dans le MVP ; P2 : interrogation d'un registre officiel si disponible) puis :

- **Approuve** : le profil passe `VALIDATED`, les affiliations en attente deviennent `ACTIVE`, le professionnel est notifié.
- **Refuse** : motif obligatoire (numéro introuvable, document illisible, incohérence d'identité, autre), notification au professionnel **et** au responsable qui l'a invité.
- **Demande un complément** : message ; le professionnel peut téléverser un nouveau document.

**Règles strictes.** **RG-ADM-10** — Délai cible de traitement : **72 heures ouvrées** (indicateur affiché). **RG-ADM-11** — Un administrateur NE PEUT PAS valider son propre profil ni celui d'un membre de sa famille déclaré (déclaration sur l'honneur à la prise de poste).

### F-ADM-04 — Gérer les référentiels

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P1 / E08 (lecture/seed en P0) |
| Écrans | `/admin/referentiels/[type]` |

Référentiels gérés : géographie (départements, communes, arrondissements, zones sanitaires), types d'établissements, services, spécialités, CIM-10 (sous-liste + groupes de maladies + codes sensibles), médicaments (+ classes et correspondances d'allergies), examens et paramètres (+ valeurs de référence), vaccins et calendrier, motifs de rendez-vous, questionnaires communautaires, jours fériés, modèles de SMS.

**Règles strictes.** **RG-ADM-20** — Toute valeur de référentiel utilisée par une donnée existante NE PEUT PAS être supprimée, seulement **désactivée**. **RG-ADM-21** — Chaque modification crée une nouvelle **version** du référentiel (numéro, date, auteur, commentaire) ; les données cliniques gardent la référence à la version utilisée.

### F-ADM-05 — Gérer les comptes

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` ; `FACILITY_ADMIN` pour les affiliations de son établissement (F-ETA-04) |
| Priorité / étape | P0 / E08 |
| Écrans | `/admin/comptes` |

Recherche (téléphone ou email exacts, nom), fiche de compte (identité, affiliations, sessions actives, second facteur activé ou non, niveau de vérification, dernières connexions) — **sans aucune donnée médicale**. Actions : suspendre / réactiver le compte (motif, effet immédiat sur toutes les sessions), réinitialiser le second facteur (procédure : vérification d'identité par appel ou en présentiel, motif, notification), terminer une affiliation, inviter un `HEALTH_AUTHORITY`, `AUDITOR` ou `PLATFORM_ADMIN`.

**Règle stricte.** **RG-ADM-30** — Toute action sur un compte d'administrateur ou d'auditeur DOIT être confirmée par un **second administrateur** (principe des quatre yeux) : l'action reste « en attente » jusqu'à approbation.

### F-ADM-06 — Fusionner des dossiers en doublon

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P1 / E27 |
| Écrans | `/admin/doublons` |
| API | `POST /api/v1/admin/patients/merge` |

**Déroulé.** File des doublons probables (créations forcées, revues de synchronisation, signalements). Pour une paire, l'administrateur voit **seulement l'identité** des deux dossiers côte à côte (RG-ACC-44), le score et l'origine de chaque dossier. Il choisit « Fusionner » (en indiquant le dossier **principal**) ou « Ce ne sont pas les mêmes personnes » (la paire n'est plus proposée).

**Effet de la fusion.** Tous les éléments du dossier secondaire sont **rattachés** au dossier principal (sans modification de leur contenu) ; le dossier secondaire passe au statut `MERGED` avec un pointeur vers le principal ; son identifiant santé redirige vers le principal ; les deux patients (s'ils ont un compte) sont notifiés ; un compte lié au dossier secondaire est rattaché au principal si le principal n'en a pas, sinon un conflit est signalé et la fusion est refusée.

**Règles strictes.** **RG-ADM-40** — Une fusion DOIT être **réversible** pendant 30 jours (« Défusionner »), grâce à la table de correspondance des éléments déplacés. **RG-ADM-41** — Une fusion de dossiers de sexe ou de date de naissance différents DOIT exiger une justification et une **seconde approbation**.

### F-ADM-07 — Paramètres et fonctionnalités activables

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN` |
| Priorité / étape | P1 / E08 |

Tous les nombres « paramétrables » du document (durées de validité, limites, seuils) sont stockés dans une table `settings` avec valeur par défaut, bornes minimale et maximale, description et date de modification. Les **fonctionnalités activables** (feature flags) : `ai.summary`, `ai.citizen_assistant`, `sms.real_provider`, `pharmacy.module`, `lab.module`, `community.module`, `fhir.api`, `demo.banner`. **RG-ADM-50** — Chaque modification est journalisée et prend effet sans redéploiement, en moins de 60 s.

### F-AUD-01 — Rechercher dans le journal d'audit

| Élément | Valeur |
|---|---|
| Rôles | `AUDITOR` |
| Priorité / étape | P0 / E06 (moteur) puis E27 (écran) |
| Écrans | `/audit/journal` |
| API | `GET /api/v1/audit/events?actor=&patient=&action=&basis=&result=&from=&to=&cursor=` |

**Déroulé.** Filtres combinables : période (obligatoire, 31 jours maximum par requête), acteur, patient (identifiant santé), établissement, action, base d'accès, résultat (autorisé / refusé). Résultats paginés par 50, triés par date décroissante. Détail d'une trace : tous les champs de la section 5.7. Export CSV (motif + ré-authentification, journalisé).

**Règles strictes.** **RG-AUD-01** — La consultation du journal par l'auditeur est elle-même journalisée. **RG-AUD-02** — L'intégrité du journal est vérifiable : chaque trace contient l'empreinte de la trace précédente (chaînage) ; une page « Vérifier l'intégrité » recalcule la chaîne sur une période et signale toute rupture.

### F-AUD-02 — Revoir les accès d'urgence

| Élément | Valeur |
|---|---|
| Rôles | `AUDITOR` ; `FACILITY_ADMIN` pour son établissement |
| Priorité / étape | P1 / E21 |
| Écrans | `/audit/urgences`, `/etablissement/urgences` |

Liste des accès d'urgence non revus (le plus ancien en premier, en rouge au-delà de 7 jours). Pour chacun : professionnel, établissement, date, durée, motif, justification, **liste des éléments consultés** pendant l'accès (types et dates, sans contenu), présence d'une consultation créée pendant l'accès (indice de légitimité). Décision : « Conforme » ou « Non conforme » (commentaire obligatoire) ; une décision « non conforme » notifie le responsable d'établissement et le professionnel.

### F-AUD-03 — Détection d'anomalies d'accès

| Élément | Valeur |
|---|---|
| Rôles | Système → `AUDITOR` |
| Priorité / étape | P1 / E27 |

Règles de détection (paramétrables), exécutées chaque heure, produisant des **signalements** :

| Règle | Seuil par défaut |
|---|---|
| Nombre de dossiers distincts ouverts par un professionnel en 1 jour | > 60 |
| Recherches sans résultat | > 30 par heure (RG-CLI-12) |
| Accès refusés | > 20 par heure pour un même utilisateur |
| Accès d'urgence | > 3 par professionnel sur 7 jours |
| Consultation d'un dossier d'un patient portant le **même nom de famille** que le professionnel | Toute occurrence (à revoir) |
| Arrivées vérifiées « sur pièce » | > 30 % sur 7 jours dans un établissement (RG-ACC-21) |
| Connexions depuis plus de 3 adresses IP différentes en 1 heure | Toute occurrence |

### F-AUD-04 — Traiter les demandes des personnes

| Élément | Valeur |
|---|---|
| Rôles | `AUDITOR` |
| Priorité / étape | P1 / E27 |
| Écrans | `/audit/demandes` |

File des demandes créées par F-CIT-13 et des signalements « Je ne reconnais pas cet accès » (F-CIT-12). Pour chacune : date, type, délai restant (objectif : réponse sous **30 jours**), historique des échanges. L'auditeur peut contacter la personne (message in-app), consulter les traces liées, transférer au responsable d'établissement concerné, clôturer avec une réponse écrite visible par la personne.
