# Roadmap détaillée

Version détaillée et cochable de la roadmap par phases du Bénin Health Intelligence Platform. Reprend la Partie 9 §5 et la Partie 11 §7 du cahier des charges. Vue d'ensemble synthétique : voir `CLAUDE.md`.

## Phase 0 : initialisation

- [x] Initialisation du dépôt Git
- [x] Scaffold Next.js 16 + TypeScript + Tailwind CSS v4
- [x] Structure de dossiers sous `src/` (app, components, features, modules, services, hooks, lib, database, security, tests, types)

## Phase 1 : environnement et architecture

- [x] Documentation de fondation (CLAUDE.md, README.md, CONTRIBUTING.md, docs/roadmap.md, docs/feature-template.md)
- [x] Schéma de données (SQLite local pour la vitesse de développement, migration vers PostgreSQL + PostGIS prévue avant la démonstration finale, voir `src/database/schema-notes.md`)
- [x] Types et interfaces TypeScript partagés (`src/types/`)
- [x] Structure des modules métier : patients, rendez-vous, prescriptions, établissements (`src/modules/`)
- [x] Fondations du modèle de sécurité : RBAC, Zero Trust, journal d'audit, consentement (`src/security/`)
- [x] Design system : identité institutionnelle du ministère de la Santé (couleurs, polices, logo), composants de base (`src/components/ui/`, `src/lib/cn.ts`)
- [x] Variables d'environnement et configuration (`src/lib/env.ts`, `.env.example`)

## Phase 2 : authentification et gestion des rôles

- [x] Authentification (connexion, inscription, session par JWT)
- [ ] MFA (authentification multi-facteurs) : non implémenté, reporté au durcissement sécurité de la Phase 7
- [x] RBAC fonctionnel : 8 rôles (patient, médecin, infirmier, agent communautaire, pharmacien, laboratoire, admin établissement, admin national)
- [x] Journal d'audit des connexions et des accès

## Phase 3 : dossier patient

- [x] Profil patient (identité, coordonnées, groupe sanguin, contact d'urgence)
- [x] Antécédents médicaux (allergies, antécédents, maladies chroniques)
- [x] Gestion du consentement patient (octroi et retrait vers un professionnel de santé)
- [x] Écrans citoyen : création d'espace, consultation et édition du dossier

## Phase 4 : espace professionnel et consultation médicale

- [x] Espace professionnel de santé (accès aux dossiers autorisés par consentement)
- [x] Prise de rendez-vous, du citoyen vers un établissement (et optionnellement un professionnel précis)
- [x] Consultation médicale (saisie, historique, clôture automatique du rendez-vous d'origine)
- [ ] Notifications de confirmation : confirmation affichée immédiatement à l'écran après chaque action, pas de canal de notification séparé (SMS/email) pour l'instant

## Phase 5 : prescription électronique

- [x] Module de prescription (catalogue de médicaments, prescriptions rattachées à une consultation et un professionnel identifié)
- [x] Règles de validation métier de base (champs obligatoires, quantités positives, refus si deux médicaments de la même prescription partagent le même principe actif)
- [x] Historique des prescriptions côté patient (traitements actifs, historique complet) et côté professionnel
- [x] Préparation de l'interopérabilité HL7 FHIR (documentation de projection vers `MedicationRequest`, pas d'exposition FHIR réelle)

## Phase 6 : hiérarchie de provisionnement et tableau de bord

- [x] Hiérarchie de provisionnement : le ministère crée un établissement et son compte administrateur, qui crée ensuite son personnel (mot de passe temporaire, aucune auto-inscription hors patient)
- [x] Tableau de bord établissement (indicateurs locaux)
- [x] Tableau de bord ministère (données agrégées uniquement, jamais de données nominatives)
- [ ] Cartographie sanitaire (PostGIS) : reporté à la migration PostgreSQL
- [x] Export et visualisation des indicateurs (CSV, graphique en barres accessible)

## Phase 7 : sécurité, tests et démonstration

- [x] Durcissement sécurité : MFA (TOTP) activable sur tout compte, connexion en deux étapes
- [x] Tests automatisés (Vitest : RBAC complet, validations et Zero Trust des modules identity/patient)
- [x] Jeu de données de démonstration à contexte béninois (déjà en place depuis les phases précédentes)
- [x] Répétition du scénario de démo : script automatisé `npm run demo:e2e`, vérifie le parcours complet contre le serveur réel

## Phase 8 : module laboratoire (examens médicaux)

- [x] Modèle de données ExamenMedical (demande, réalisation, résultat)
- [x] Demande d'examen par un médecin depuis une consultation
- [x] Réception et saisie du résultat par le laboratoire
- [x] Consultation du résultat par le patient et le médecin prescripteur

## Phase 9 : module pharmacie (délivrance des prescriptions)

- [x] Liste des prescriptions à délivrer côté pharmacien
- [x] Confirmation de délivrance (totale ou partielle), traçabilité complète

## Phase 10 : PWA hors ligne et notifications

- [x] Manifeste PWA, icône, service worker (réseau prioritaire, secours cache puis page hors ligne dédiée ; pas de synchronisation hors ligne complète, hors périmètre de ce MVP)
- [x] Centre de notifications in-app (`/app/notifications`) : confirmation de rendez-vous et résultat d'examen disponible, marquage individuel ou global comme lues
- [ ] SMS et email réels : hors périmètre, aucune passerelle disponible pour ce MVP
- [x] Lien de navigation vers `/app/notifications` et `/app/securite` dans l'en-tête
