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

## Phase 6 : tableau de bord

- [ ] Tableau de bord établissement (indicateurs locaux)
- [ ] Tableau de bord ministère (données agrégées uniquement, jamais de données nominatives)
- [ ] Cartographie sanitaire (PostGIS)
- [ ] Export et visualisation des indicateurs

## Phase 7 : sécurité, tests et démonstration

- [ ] Durcissement sécurité (MFA, revue Zero Trust, RBAC, audit)
- [ ] Tests automatisés et parcours bout en bout (`src/tests/`)
- [ ] Jeu de données de démonstration à contexte béninois
- [ ] Répétition du scénario de démo : le citoyen crée son espace, prend rendez-vous ; le médecin consulte et prescrit ; le ministère voit les données agrégées
