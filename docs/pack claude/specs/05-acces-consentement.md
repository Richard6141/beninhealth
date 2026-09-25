# 5. Modèle d'accès aux données de santé (règles strictes)

Ce chapitre est **le plus important du document**. Il définit, sans ambiguïté, qui peut voir quoi, pour quel patient, pourquoi et pendant combien de temps. Il DOIT être implémenté **avant** tout écran clinique (étapes E05 et E06 du plan).

## 5.1 Principes

1. **Refus par défaut.** Si aucune règle n'autorise explicitement l'accès, il est refusé.
2. **Vérification à chaque requête.** Aucune autorisation n'est « mémorisée » dans le navigateur. Le serveur revérifie à chaque lecture et à chaque écriture.
3. **Un seul point de décision.** Toute vérification passe par **une seule fonction** du serveur : `authorize()` (module `access`). Il est interdit d'écrire une vérification de droits « à la main » dans une page ou une route.
4. **Tout est journalisé.** Chaque décision d'accès à une donnée patient, **autorisée ou refusée**, écrit une ligne dans le journal d'audit.

## 5.2 Catégories de données

Chaque donnée d'un patient appartient à exactement une catégorie. Les écrans et les API ne renvoient **que** les catégories autorisées.

| Catégorie | Contenu | Exemple |
|---|---|---|
| `IDENTITY` | Données d'identification | Nom, prénoms, sexe, date de naissance, identifiant santé, téléphone, commune |
| `SUMMARY` | Résumé utile à toute prise en charge | Groupe sanguin, allergies, maladies chroniques, traitements actifs, vaccinations, contact d'urgence |
| `CLINICAL` | Dossier clinique courant | Consultations, diagnostics, constantes, ordonnances, examens et résultats, documents, notes de soins |
| `SENSITIVE` | Données cliniques à confidentialité renforcée | Tout élément marqué « sensible » : par exemple santé mentale, VIH et infections sexuellement transmissibles, santé sexuelle et reproductive, violences, addictions |
| `COMMUNITY` | Données du suivi communautaire | Visites à domicile, vaccinations de terrain, suivis de grossesse et d'enfant |
| `ADMIN` | Données administratives liées à l'établissement | Rendez-vous, arrivée, statut de file d'attente |

- **RG-ACC-01** — Un élément clinique DOIT être marqué `SENSITIVE` automatiquement si son code CIM-10, son examen ou son vaccin appartient à la **liste des codes sensibles** (référentiel paramétrable, section 18.6), et PEUT l'être manuellement par son auteur.
- **RG-ACC-02** — Un élément `SENSITIVE` NE DOIT PAS apparaître dans le résumé (`SUMMARY`), ni dans les notifications, ni dans les résumés IA, ni dans les exports, sauf pour les personnes autorisées selon la section 5.4.

## 5.3 Algorithme de décision

La fonction `authorize(acteur, action, patient, catégorie)` applique les étapes suivantes **dans cet ordre**. Dès qu'une étape répond « refusé », on s'arrête.

| Étape | Question vérifiée par le serveur | Si la réponse est « non » | Code d'erreur |
|---|---|---|---|
| 1 | La session est-elle valide et le compte actif ? | Refus 401 | `UNAUTHENTICATED` |
| 2 | L'espace actif est-il valide (affiliation `ACTIVE`, profil validé, second facteur fait) ? | Refus 403 ou 401 | `NO_ACTIVE_SPACE` / `MFA_REQUIRED` |
| 3 | Le rôle de l'espace actif possède-t-il la permission pour cette action (section 4.14) ? | Refus 403 | `FORBIDDEN` |
| 4 | S'agit-il de son **propre** dossier ou de celui d'une **personne à charge**, depuis un espace professionnel (RG-ROL-04) ? | Si **oui** : refus 403 | `FORBIDDEN` |
| 5 | Existe-t-il une **base d'accès** valide pour ce patient (section 5.4) ? | Refus 404 (on ne révèle pas l'existence du dossier) | `PATIENT_NOT_FOUND` |
| 6 | La base d'accès couvre-t-elle la **catégorie** de données demandée (et le niveau sensible) ? | Données retirées de la réponse, ou refus 403 si seule cette catégorie est demandée | `FORBIDDEN` |
| 7 | Toutes les réponses sont « oui » | **Accès accordé** | — |

Dans **tous** les cas (étapes 1 à 7), une trace est écrite dans le journal d'audit : `DENIED` avec le code d'erreur, ou `ALLOWED` avec la base d'accès et le motif.

- **RG-ACC-03** — Quand aucune base d'accès n'existe, l'API DOIT répondre **404** avec le code `PATIENT_NOT_FOUND` (message « Aucun patient accessible ne correspond. », section 18.8) et non 403, pour ne pas révéler l'existence d'un dossier.
- **RG-ACC-04** — Les résultats de `authorize()` NE DOIVENT PAS être mis en cache plus de **60 secondes**. Le retrait d'un consentement DOIT prendre effet au plus tard 60 secondes après.
- **RG-ACC-05** — Les listes (ex. recherche de patients, chronologie) DOIVENT être filtrées **dans la requête SQL** selon les bases d'accès, et non après coup en mémoire.

## 5.4 Les sept bases d'accès

Une **base d'accès** est la raison, enregistrée en base de données, pour laquelle un acteur peut accéder aux données d'un patient donné. Chaque accès autorisé est journalisé avec l'identifiant de sa base.

| # | Base | Qui en bénéficie | Catégories couvertes | Comment elle naît | Durée | Comment elle prend fin |
|---|---|---|---|---|---|---|
| B1 | `SELF` | Le citoyen, sur son propre dossier | Toutes (y compris sensibles), sauf résultats en attente d'annonce | Compte relié au dossier (F-AUTH-01, F-AUTH-03) | Permanente | Fermeture du compte |
| B2 | `GUARDIAN` | Le tuteur vérifié d'une personne à charge | Toutes sauf sensibles des 15 ans et plus (voir RG-ACC-30) | Tutelle vérifiée (F-CIT-07) | Jusqu'aux 18 ans de la personne ou révocation | Majorité, décision d'un établissement, révocation |
| B3 | `CONSENT` | Un professionnel nommé **ou** tous les cliniciens d'un établissement | Selon le niveau choisi : `SUMMARY`, `FULL` (sans sensible) ou `FULL_SENSITIVE` | Le patient accorde (F-CIT-10, F-CIT-11) | 24 h, 7 j, 30 j, 6 mois ou 12 mois (maximum) | Échéance ou retrait par le patient |
| B4 | `CARE_CONTEXT` | Les cliniciens (`DOCTOR`, `NURSE`) de l'établissement où le patient est **présent** | `IDENTITY` + `SUMMARY` + droit de **créer** consultation et ordonnance ; `FULL` si le patient l'accepte à l'arrivée | Enregistrement de l'arrivée avec vérification du patient (F-RDV-04) | 72 h | Échéance ou clôture de la visite + 24 h |
| B5 | `EMERGENCY` | Un `DOCTOR` ou `NURSE`, sur justification | `IDENTITY` + `SUMMARY` + `FULL` (sans sensible) + droit de **créer** consultation et ordonnance | Déclaration d'accès d'urgence (F-CLI-10) | 4 h | Échéance ; revue obligatoire a posteriori |
| B6 | `ASSIGNMENT` | Laboratoire destinataire d'une demande ; pharmacie à qui l'ordonnance est présentée ; agent communautaire de l'aire | Strictement la ressource affectée + identité minimale (+ allergies pour la pharmacie) | Demande d'examen, présentation d'ordonnance, affectation d'aire | Laboratoire : jusqu'à la validation du résultat ; pharmacie : 30 jours à compter de la présentation, ou jusqu'à `DISPENSED`, `EXPIRED` ou `CANCELLED` si c'est plus tôt ; agent : tant que l'aire lui est affectée | Clôture de la ressource |
| B7 | `AUTHOR` | L'auteur d'un élément clinique | L'élément qu'il a créé | Création de l'élément | Permanente dans le même établissement | Fin de l'affiliation |

### Règles détaillées sur le consentement (B3)

- **RG-ACC-10** — Le patient (ou son tuteur) est le seul à pouvoir créer ou retirer un consentement. Un professionnel PEUT **demander** un consentement (notification au patient) mais NE DOIT PAS l'accorder à sa place.
- **RG-ACC-11** — Un consentement DOIT comporter : bénéficiaire (professionnel ou établissement), niveau (`SUMMARY`, `FULL`, `FULL_SENSITIVE`), date de début, date de fin, canal (`APP`, `QR`, `SMS_OTP`, `DESK`), preuve (horodatage, identifiant de la session ou du code OTP utilisé).
- **RG-ACC-12** — La durée maximale d'un consentement est de **12 mois**. Au-delà, il doit être renouvelé.
- **RG-ACC-13** — Le niveau `FULL_SENSITIVE` NE PEUT être accordé qu'à un **professionnel nommé**, jamais à un établissement entier, et depuis l'application du patient uniquement (pas au guichet).
- **RG-ACC-14** — Le retrait prend effet **au plus tard 60 secondes** après (RG-ACC-04) et n'efface pas les éléments que le professionnel a lui-même créés (base B7).
- **RG-ACC-15** — Un consentement ne donne jamais de droit d'**écriture** à lui seul : pour créer une consultation ou une ordonnance, il faut en plus un contexte de soins (B4) ou un rendez-vous confirmé du jour avec ce professionnel. L'accès d'urgence (B5) donne aussi, à lui seul, le droit de créer consultation et ordonnance.

### Règles détaillées sur le contexte de soins (B4)

- **RG-ACC-20** — Le contexte de soins est ouvert **uniquement** par l'enregistrement de l'arrivée du patient (F-RDV-04), après **vérification de la présence** par l'un de ces moyens, du plus sûr au moins sûr : (1) scan du QR de la carte santé affiché sur le téléphone du patient ; (2) code à 6 chiffres envoyé par SMS au patient et saisi par l'accueil ; (3) déclaration « présence vérifiée sur pièce d'identité » par l'agent d'accueil, avec le type de pièce.
- **RG-ACC-21** — Le moyen (3) DOIT être tracé comme tel et signalé dans le tableau d'anomalies de l'auditeur au-delà de **30 %** des arrivées d'un établissement sur 7 jours.
- **RG-ACC-22** — À l'arrivée, le patient PEUT accepter de partager son **historique complet** (`FULL`) avec l'établissement pour la durée du contexte ; sinon, seul le résumé est visible.
- **RG-ACC-23** — Pour un patient **sans compte** (dossier créé par un établissement), le moyen (3) est autorisé et le niveau `FULL` ne concerne que les données produites dans ce même établissement.

### Règles sur les personnes à charge (B2)

- **RG-ACC-30** — Pour une personne à charge âgée de **15 ans ou plus**, les éléments `SENSITIVE` NE DOIVENT PAS être visibles par le tuteur. [DÉCISION : seuil de 15 ans à valider juridiquement.]
- **RG-ACC-31** — À **18 ans**, la base `GUARDIAN` prend fin automatiquement ; la personne reçoit une invitation à réclamer son dossier (F-CIT-09, P2 pour l'automatisation ; en MVP, fin manuelle par l'administrateur).

## 5.5 Portées des rôles non cliniques

| Rôle | Portée | Règle |
|---|---|---|
| `RECEPTIONIST` | Identité et rendez-vous des patients ayant un rendez-vous ou un dossier créé **dans son établissement** | **RG-ACC-40** — La recherche d'un patient par l'accueil DOIT exiger une correspondance exacte (identifiant santé, ou téléphone + date de naissance) ; aucune recherche partielle par nom n'est autorisée. Cette recherche exacte renvoie l'identité minimale (nom, prénoms, année de naissance) de **tout** patient correspondant, **uniquement** pour enregistrer une arrivée ou un rendez-vous, et elle est journalisée. |
| `FACILITY_ADMIN` | Agrégats de son établissement | **RG-ACC-41** — Aucun accès nominatif. |
| `HEALTH_AUTHORITY` | Agrégats de sa portée géographique | **RG-ACC-42** — Les requêtes de lecture DOIVENT porter uniquement sur les tables du schéma `analytics` (chapitre 14) ; la seule écriture autorisée est la revue des alertes (table `app.health_alert_reviews`, F-PIL-06), réalisée par le service analytics. |
| `AUDITOR` | Journal d'audit | **RG-ACC-43** — L'auditeur voit l'identifiant santé et le nom du patient concerné par une trace, pas le contenu des données consultées. |
| `PLATFORM_ADMIN` | Référentiels, comptes | **RG-ACC-44** — Lors d'une fusion de doublons, seuls les champs `IDENTITY` des deux dossiers sont affichés. |

## 5.6 Niveaux de vérification d'identité

| Niveau | Nom | Comment on l'obtient | Ce qu'il débloque |
|---|---|---|---|
| N0 | Déclaratif | Informations saisies par la personne, téléphone non vérifié | Rien : le compte n'est pas utilisable tant que le téléphone n'est pas vérifié |
| N1 | Téléphone vérifié | Code OTP par SMS (F-AUTH-01) | Dossier, rendez-vous, partage de niveau `SUMMARY` et `FULL` |
| N2 | Vérifié en établissement | Un agent d'accueil ou un soignant a vu une pièce d'identité et l'a confirmé | Partage `FULL_SENSITIVE`, déclaration de personnes à charge vérifiées, téléchargement de l'historique complet |
| N3 | Vérifié ANIP | Rapprochement avec le NPI via l'ANIP (P2) | Identique à N2 ; supprime les doublons |

- **RG-ACC-50** — Le niveau de vérification DOIT être affiché aux professionnels dans le bandeau patient.
- **RG-ACC-51** — Le numéro NPI, s'il est saisi, DOIT être stocké **chiffré** et accompagné d'une **empreinte** (hachage) pour la détection de doublons ; il NE DOIT PAS être affiché en clair (seuls les 4 derniers chiffres).

## 5.7 Contenu de chaque trace d'audit d'accès

| Champ | Exemple |
|---|---|
| Horodatage (UTC, précision milliseconde) | 2026-10-12T09:14:03.221Z |
| Acteur (utilisateur) et affiliation active (rôle + établissement) | Dr A. Hounkpè — DOCTOR — CS Akpakpa |
| Action | `VIEW`, `CREATE`, `UPDATE`, `VALIDATE`, `SIGN`, `DOWNLOAD`, `PRINT`, `EXPORT`, `SHARE`, `EMERGENCY_OPEN`, `CONSENT_GRANT`, `CONSENT_REVOKE`, `LOGIN`, `CONTEXT_SWITCH`… |
| Patient concerné | Identifiant interne + identifiant santé |
| Ressource | Type (`consultation`, `prescription`…) + identifiant ; catégorie de données |
| Base d'accès | `CARE_CONTEXT` + identifiant du contexte |
| Motif | Automatique (« Consultation du 12/10/2026 ») ou saisi (urgence, export) |
| Résultat | `ALLOWED` / `DENIED` + code de refus |
| Origine | Adresse IP, type d'appareil, identifiant de requête |

- **RG-ACC-60** — Le journal d'audit est **en ajout seul** : aucune modification ni suppression, y compris par un administrateur (contrainte au niveau de la base de données, chapitre 21).
- **RG-ACC-61** — Le citoyen voit dans « Qui a consulté mon dossier » toutes les traces `ALLOWED` le concernant, **regroupées** par acteur et par jour, avec le rôle et l'établissement de l'acteur (F-CIT-12).
- **RG-ACC-62** — Les données techniques (journaux applicatifs) NE DOIVENT contenir **aucune donnée de santé** ; les deux journaux sont séparés (V1, Partie 12 §6).

## 5.8 Squelette de la fonction de décision

Ce pseudo-code fixe le comportement attendu. Claude Code DOIT l'implémenter sous forme de fonctions pures testables, avec un test par ligne de la matrice (section 4.14) et par base d'accès.

```ts
// src/modules/access/authorize.ts
export async function authorize(input: {
  actor: SessionActor;              // utilisateur + affiliation active
  action: Permission;               // ex. 'patient.record.read'
  patientId?: string;
  category?: DataCategory;          // IDENTITY | SUMMARY | CLINICAL | SENSITIVE | COMMUNITY | ADMIN
  resource?: { type: string; id: string };
  reason?: string;                  // obligatoire pour EMERGENCY_OPEN et EXPORT
}): Promise<AccessDecision> {
  // 1. session + compte actif            -> sinon DENY('UNAUTHENTICATED')
  // 2. affiliation active + MFA si exigée -> sinon DENY('NO_ACTIVE_SPACE' | 'MFA_REQUIRED')
  // 3. permission du rôle (table statique ROLE_PERMISSIONS) -> sinon DENY('FORBIDDEN')
  // 4. garde-fou "soi-même ou personne à charge depuis un espace pro" (RG-ROL-04)
  // 5. recherche des bases d'accès valides, de la plus forte à la plus faible :
  //    SELF > GUARDIAN > AUTHOR > CONSENT > CARE_CONTEXT > EMERGENCY > ASSIGNMENT
  // 6. vérifie que la base couvre la catégorie (et le niveau SENSITIVE)
  // 7. écrit la trace d'audit (ALLOWED ou DENIED) — toujours
  // 8. renvoie { allowed, basis, basisId, allowedCategories, denyCode }
}
```

> [!IMPORTANT] Pourquoi une fonction unique ?
> Sur un projet de cette taille, les droits vérifiés « un peu partout » finissent toujours par être oubliés quelque part. Avec une fonction unique, on peut **tester exhaustivement** les règles une seule fois, et un simple outil de recherche dans le code suffit à vérifier que chaque route l'appelle (test automatique prévu au chapitre 26).
