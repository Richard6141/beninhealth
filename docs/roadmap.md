# Roadmap détaillée

Version détaillée et cochable de la roadmap par phases du Bénin Health Intelligence Platform. Reprend la Partie 9 §5 et la Partie 11 §7 du cahier des charges. Vue d'ensemble synthétique : voir `CLAUDE.md`.

## Phase 0 : initialisation

- [x] Initialisation du dépôt Git
- [x] Scaffold Next.js 16 + TypeScript + Tailwind CSS v4
- [x] Structure de dossiers sous `src/` (app, components, features, modules, services, hooks, lib, database, security, tests, types)

## Phase 1 : environnement et architecture (en cours)

- [x] Documentation de fondation (CLAUDE.md, README.md, CONTRIBUTING.md, docs/roadmap.md, docs/feature-template.md)
- [ ] Schéma de données PostgreSQL, avec PostGIS pour la cartographie sanitaire (`src/database/`)
- [ ] Types et interfaces TypeScript partagés (`src/types/`)
- [ ] Structure des modules métier : patients, rendez-vous, prescriptions, établissements (`src/modules/`)
- [ ] Fondations du modèle de sécurité : RBAC, Zero Trust, MFA, journal d'audit, consentement (`src/security/`)
- [ ] Design system fundlab : tokens et composants de base (`src/components/ui/`, `src/lib/cn.ts`)
- [ ] Variables d'environnement et configuration (`src/lib/env.ts`, `.env.example`)

## Phase 2 : authentification et gestion des rôles

- [ ] Authentification (connexion, inscription, session)
- [ ] MFA (authentification multi-facteurs)
- [ ] RBAC fonctionnel : rôles citoyen, professionnel de santé, établissement, ministère
- [ ] Journal d'audit des connexions et des accès

## Phase 3 : dossier patient

- [ ] Profil patient (identité, coordonnées)
- [ ] Antécédents médicaux
- [ ] Gestion du consentement patient
- [ ] Écrans citoyen : création d'espace, consultation du dossier

## Phase 4 : espace professionnel et consultation médicale

- [ ] Espace professionnel de santé (accès aux dossiers autorisés)
- [ ] Prise de rendez-vous, du citoyen vers un établissement
- [ ] Consultation médicale (saisie, historique)
- [ ] Notifications de confirmation

## Phase 5 : prescription électronique

- [ ] Module de prescription (entités patients, professionnels, prescriptions)
- [ ] Règles de validation métier (posologie, interactions)
- [ ] Historique des prescriptions côté patient et côté professionnel
- [ ] Préparation de l'interopérabilité HL7 FHIR

## Phase 6 : tableau de bord

- [ ] Tableau de bord établissement (indicateurs locaux)
- [ ] Tableau de bord ministère (données agrégées uniquement, jamais de données nominatives)
- [ ] Cartographie sanitaire (PostGIS)
- [ ] Export et visualisation des indicateurs

## Phase 7 : sécurité, tests et démonstration

- [ ] Durcissement sécurité (revue Zero Trust, RBAC, audit)
- [ ] Tests automatisés et parcours bout en bout (`src/tests/`)
- [ ] Jeu de données de démonstration à contexte béninois
- [ ] Répétition du scénario de démo : le citoyen crée son espace, prend rendez-vous ; le médecin consulte et prescrit ; le ministère voit les données agrégées
