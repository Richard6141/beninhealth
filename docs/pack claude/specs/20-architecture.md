# 20. Architecture technique

## 20.1 Choix d'architecture : un monolithe modulaire

La V1 cite des « services » (Identity, Patient, Clinical, Prescription, Facility, Analytics, Notification). **[DÉCISION]** Ils sont réalisés comme des **modules** d'une **seule application**, et non comme des micro-services séparés.

> [!IMPORTANT] Pourquoi un monolithe modulaire ?
> Des micro-services imposent plusieurs déploiements, des appels réseau entre services, des transactions distribuées et une surveillance complexe. Pour une équipe débutante et un MVP, c'est une source majeure de pannes et de retards. Un monolithe **bien découpé** offre la même séparation des responsabilités (exigence V1 « chaque domaine métier doit être indépendant ») et permet d'extraire un module en service plus tard, quand la charge nationale le justifiera, sans réécrire la logique métier.

```mermaid
%% caption: Figure 20.1 — Architecture logique de BHIP
flowchart TB
  CL["Une seule application web installable (PWA)<br/>citoyen · soignants · labo · pharmacie · terrain hors ligne<br/>établissement · pilotage · audit · administration"]
  subgraph APP["Application Next.js — monolithe modulaire"]
    direction TB
    IN["Pages + Server Actions  |  API REST /api/v1  |  façade FHIR /fhir/r4"]
    DOM["Modules métier<br/>identity-patient · facility · appointment · clinical<br/>prescription · pharmacy · lab · community-sync<br/>analytics · ai · referential · interop"]
    CORE["Socle transverse<br/>auth · access (authorize) · audit<br/>notifications · files · jobs"]
    IN --> DOM --> CORE
  end
  DB[("PostgreSQL 16 + PostGIS<br/>schémas app · audit · analytics")]
  S3[("Stockage de fichiers<br/>compatible S3, chiffré")]
  EXT["Adaptateurs externes<br/>SMS · email · modèle IA<br/>ANIP · DHIS2 (P2)"]
  CL --> IN
  CORE --> DB
  DOM --> DB
  CORE --> S3
  CORE --> EXT
```

## 20.2 Pile technique retenue

| Besoin | Choix | Justification |
|---|---|---|
| Langage | **TypeScript** en mode strict | Recommandé par la V1 ; le typage attrape une grande partie des erreurs avant l'exécution |
| Application web | **Next.js** (version stable courante, App Router) + React | Recommandé par la V1 ; interface et API dans un même projet ; rendu serveur pour les pages publiques |
| Styles et composants | **Tailwind CSS** + **shadcn/ui** (composants accessibles copiés dans le projet) + Lucide (icônes) | Recommandé par la V1 ; composants réutilisables et personnalisables |
| Formulaires et validation | **React Hook Form** + **Zod** | Un même schéma valide le navigateur **et** le serveur (V1 : validation frontend + backend) |
| Base de données | **PostgreSQL 16** + **PostGIS** + extensions `unaccent`, `pg_trgm`, `citext`, `pgcrypto` | Recommandé par la V1 ; transactions, contraintes, géographie |
| Accès aux données | **Prisma ORM** (schéma lisible, migrations) + requêtes SQL paramétrées (`$queryRaw` avec gabarits) pour la géographie et les agrégats | Très répandu et bien connu de Claude Code ; migrations versionnées |
| Authentification | **Better Auth** (sessions en base, connexion par téléphone et mot de passe, OTP, second facteur TOTP) | Bibliothèque éprouvée : on n'écrit pas soi-même la cryptographie des mots de passe et des sessions |
| Tâches planifiées et file | **pg-boss** (file de tâches dans PostgreSQL) | Pas de serveur supplémentaire (pas de Redis) ; tentatives et planification intégrées |
| Fichiers | Stockage **compatible S3** : **MinIO** en local, service S3 chiffré en production | Standard ; URLs signées temporaires |
| PWA et hors ligne | **Serwist** (service worker pour Next.js) + **Dexie** (IndexedDB) + Web Crypto | Installation sur téléphone, cache, stockage local chiffré |
| Cartes | **Leaflet** (react-leaflet) + tuiles OpenStreetMap + GeoJSON des limites administratives | Gratuit, léger |
| Graphiques | **Recharts** | Simple, accessible avec tableau alternatif |
| PDF | **@react-pdf/renderer** + **qrcode** | Ordonnances, rapports, carte santé |
| Internationalisation | **next-intl** | Français d'abord, langues nationales plus tard |
| Journaux techniques | **pino** (JSON) | Journaux structurés sans données de santé |
| Documentation d'API | OpenAPI 3.1 générée depuis les schémas Zod + interface **Scalar** sur `/api/docs` (accès restreint) | V1 : API documentée |
| Tests | **Vitest** (unitaires, intégration avec base de test Docker), **Playwright** (bout en bout, mobile et ordinateur) | V1 : trois niveaux de tests |
| Qualité | ESLint (+ règle de frontières entre modules), Prettier, Husky + lint-staged, commitlint | V1 : qualité du code, conventions de commit |
| Conteneurs | **Docker** + Docker Compose | V1 : environnement reproductible |
| Intégration continue | GitHub Actions | V1 : installation, vérification, tests, build à chaque modification |
| Gestionnaire de paquets | **pnpm** | Rapide, verrouillage fiable |

- **RG-ARC-01** — Aucune nouvelle dépendance NE DOIT être ajoutée sans être notée dans `docs/decisions.md` (nom, raison, alternative écartée).

## 20.3 Organisation du code

Structure fusionnant les deux propositions de la V1 (Parties 5 et 10) : une organisation **par domaine métier** (« chaque fonctionnalité métier doit rester isolée »).

```text
bhip/
├── CLAUDE.md                      # règles permanentes pour Claude Code
├── PROGRESS.md                    # avancement étape par étape
├── specs/                         # ce cahier des charges en Markdown
├── docs/                          # architecture, décisions, API, sécurité, guides
├── docker-compose.yml             # postgres+postgis, minio, mailpit
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed/                      # scripts + fichiers CSV de référentiels et démo
├── public/                        # icônes PWA, manifest
├── messages/fr.json               # textes de l'interface
├── src/
│   ├── app/                       # routes Next.js (pages minces, sans logique métier)
│   │   ├── (public)/              # accueil, établissements, vérification d'ordonnance
│   │   ├── (auth)/                # connexion, inscription, activation
│   │   ├── citoyen/  pro/  labo/  pharmacie/  terrain/
│   │   ├── etablissement/  pilotage/  audit/  admin/
│   │   ├── api/v1/…/route.ts      # API REST (appelle les services)
│   │   └── fhir/r4/…/route.ts     # façade FHIR (lecture)
│   ├── components/ui/             # bibliothèque commune (design system)
│   ├── components/layout/         # gabarits par espace
│   ├── modules/                   # UN DOSSIER PAR MODULE (voir 20.4)
│   │   └── <module>/
│   │       ├── index.ts           # interface publique du module (seul point d'import)
│   │       ├── service.ts         # logique métier (fonctions)
│   │       ├── repository.ts      # accès base de données
│   │       ├── schemas.ts         # schémas Zod (entrées/sorties)
│   │       ├── rules.ts           # règles pures (RG) faciles à tester
│   │       ├── actions.ts         # Server Actions (appellent service)
│   │       ├── components/        # composants propres au module
│   │       └── __tests__/
│   ├── lib/                       # utilitaires transverses (formats, ids, erreurs, dates)
│   ├── server/                    # contexte de requête, prisma, logger, jobs
│   └── types/
└── tests/e2e/                     # Playwright
```

**Règles de dépendance (vérifiées par ESLint).**

- **RG-ARC-10** — Une page (`src/app`) NE DOIT contenir aucune logique métier ni requête de base de données : elle appelle le **service** d'un module.
- **RG-ARC-11** — Un module NE DOIT importer un autre module **que par son `index.ts`**.
- **RG-ARC-12** — Toute fonction de service qui touche des données patient DOIT recevoir le **contexte d'acteur** (`ctx`) et appeler `authorize()` (chapitre 5) avant toute lecture ou écriture ; un test automatique parcourt les services et échoue si un service exporté n'appelle pas `authorize` ou n'est pas marqué explicitement `@public`.
- **RG-ARC-13** — Seul `repository.ts` utilise Prisma. Les services ne font pas de SQL.
- **RG-ARC-14** — Server Actions (interface web) et routes `/api/v1` (API) appellent **les mêmes services** : aucune règle métier n'est dupliquée.

## 20.4 Modules et responsabilités

| Module | Responsabilité | Tables principales | Dépend de |
|---|---|---|---|
| `auth` | Comptes, sessions, OTP, second facteur, invitations, espace actif | users, sessions, accounts, verifications, two_factors, invitations | audit, notifications |
| `access` | `authorize()`, bases d'accès, consentements, contextes de soins, urgences, codes de partage | consents, care_contexts, emergency_accesses, share_codes | audit |
| `audit` | Écriture et consultation du journal, chaînage, anomalies | audit.audit_events, audit.anomalies | — |
| `identity-patient` | Dossiers patients, identifiants, doublons, tutelles, informations déclarées | patients, patient_identifiers, guardianships, allergies, conditions, emergency_contacts, record_versions | access, audit |
| `facility` | Établissements, services, personnel, affiliations, agendas, créneaux | facilities, facility_services, memberships, practitioner_profiles, schedules, slots, closures | referential |
| `appointment` | Rendez-vous, visites, file du jour | appointments, visits | facility, access, notifications |
| `clinical` | Consultations, constantes, diagnostics, addenda, vaccinations, notes de soins, documents | consultations, vital_signs, diagnoses, consultation_addenda, pregnancies, immunizations, nursing_notes, documents | access, referential |
| `prescription` | Ordonnances, contrôles, signature, vérification publique | prescriptions, prescription_items | clinical, referential |
| `pharmacy` | Délivrances | dispensations, dispensation_items | prescription |
| `lab` | Demandes, prélèvements, résultats, validation | lab_orders, lab_order_items, lab_results | clinical, referential |
| `community-sync` | Aires, visites communautaires, synchronisation | community_areas, community_visits, sync_batches, sync_items | identity-patient, clinical |
| `analytics` | Calcul des agrégats, lecture des indicateurs, alertes, exports | analytics.* | (lit les tables métier en lecture seule dans les tâches) |
| `ai` | Adaptateur de modèle, résumé, gouvernance | ai_requests | access, clinical |
| `notifications` | Catalogue, envoi, préférences, SMS | notifications, notification_preferences, sms_outbox | jobs |
| `files` | URLs signées, contrôle de type, suppression des métadonnées | (métadonnées dans documents) | — |
| `referential` | Géographie, CIM-10, médicaments, examens, vaccins, paramètres, fonctionnalités activables | geo_*, icd10_codes, medications, lab_tests, vaccines, settings, feature_flags | — |
| `interop` | Façade FHIR, adaptateurs ANIP et DHIS2 (P2) | — | tous en lecture via leurs index |

## 20.5 Cycle de vie d'une requête

1. Le **proxy** Next.js (fichier `proxy.ts`, anciennement `middleware.ts`) redirige les utilisateurs non connectés hors des espaces privés et ajoute un **identifiant de requête**. Il ne fait **aucune** vérification de droits métier (il peut être contourné : défense en profondeur).
2. La page ou la route construit le **contexte** : session, utilisateur, espace actif (lu en base), identifiant de requête.
3. Elle valide l'entrée avec **Zod**.
4. Elle appelle le **service**. Le service appelle `authorize()`, puis le repository, dans une **transaction** si plusieurs écritures sont liées.
5. Après validation de la transaction, les **événements** (notifications, agrégats) sont publiés dans la file de tâches.
6. La réponse est filtrée par un **schéma de sortie** Zod (seuls les champs prévus sortent ; jamais d'objet Prisma brut).
7. Les erreurs sont converties au format de la section 22.2 ; le détail technique va dans les journaux pino avec l'identifiant de requête.

## 20.6 Environnements

| Environnement | Rôle | Base de données | SMS | IA | Données |
|---|---|---|---|---|---|
| **dev** (local) | Développement quotidien | Docker local | Boîte d'envoi simulée | Fournisseur factice | Démo (seed) |
| **test** (CI) | Tests automatisés | Base éphémère Docker | Simulé | Factice | Générées par les tests |
| **staging** (préproduction) | Validation avant publication, démonstration | Serveur dédié | Simulé | Réel **sur données fictives** si activé | Démo (seed) |
| **production** | Service réel (après autorisations) | Serveur dédié, sauvegardé | Fournisseur réel | Désactivée par défaut | Réelles |

- **RG-ARC-20** — Chaque environnement a ses **propres secrets** ; aucun secret n'est versionné (fichier `.env.example` documenté seulement).
- **RG-ARC-21** — La base de production NE DOIT JAMAIS être copiée vers un autre environnement.

## 20.7 Variables d'environnement (extrait de `.env.example`)

```bash
# Application
APP_URL=http://localhost:3000
APP_ENV=dev                      # dev | test | staging | production
TZ_DISPLAY=Africa/Porto-Novo
# Base de données
DATABASE_URL=postgresql://bhip:bhip@localhost:5432/bhip
ANALYTICS_DATABASE_URL=postgresql://analytics_reader:***@localhost:5432/bhip
# Authentification
BETTER_AUTH_SECRET=              # 32 octets aléatoires
QR_SIGNING_SECRET=               # HMAC des QR de carte santé
FIELD_ENCRYPTION_KEY=            # chiffrement applicatif (NPI, secrets TOTP)
# Fichiers
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=bhip-documents
S3_ACCESS_KEY=
S3_SECRET_KEY=
# Messages
SMS_PROVIDER=outbox              # outbox | http
SMTP_URL=smtp://localhost:1025   # Mailpit en local
# IA
AI_PROVIDER=fake                 # fake | anthropic | ...
AI_API_KEY=
```
