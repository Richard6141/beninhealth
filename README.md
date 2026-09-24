# Bénin Health Intelligence Platform

Plateforme nationale de santé numérique qui connecte citoyens, professionnels de santé, établissements, laboratoires, pharmacies et le ministère de la Santé du Bénin autour d'une couche numérique commune. Elle offre au citoyen un suivi de son parcours de santé, au professionnel un accès aux informations nécessaires à sa pratique, et à l'État des indicateurs sanitaires fiables. Ce dépôt contient le MVP de démonstration réalisé dans le cadre d'un challenge ministériel.

## Stack technique

- Next.js 16 (App Router) + TypeScript + Tailwind CSS v4, avec une évolution PWA prévue pour un usage hors ligne sur le terrain.
- API modulaire sécurisée, pensée pour une interopérabilité future avec le standard HL7 FHIR.
- PostgreSQL, avec l'extension PostGIS prévue pour la cartographie sanitaire.
- Modèle de sécurité RBAC + Zero Trust, authentification MFA, journal d'audit systématique et gestion du consentement patient.

## Structure des dossiers

```
src/
  app/          Routes et pages de l'application (Next.js App Router)
  components/   Composants d'interface réutilisables, dont le design system (components/ui)
  features/     Fonctionnalités métier assemblées à partir des composants et des modules
  modules/      Logique métier organisée par domaine (patients, rendez-vous, prescriptions, etc.)
  services/     Appels API, intégrations externes et logique d'accès aux données
  hooks/        Hooks React partagés
  lib/          Fonctions utilitaires transverses (configuration, helpers)
  database/     Schéma de données, migrations et accès PostgreSQL
  security/     RBAC, Zero Trust, MFA, audit et gestion du consentement
  tests/        Scénarios de test et parcours bout en bout
  types/        Types et interfaces TypeScript partagés
```

## Lancer le projet en local

```bash
npm install
npm run dev
```

L'application est ensuite accessible sur `http://localhost:3000`.

## Statut actuel

Phase 1 en cours : mise en place de l'environnement, de l'architecture (types, modules, sécurité, schéma de données) et du design system, en parallèle par plusieurs agents. Le détail des phases précédentes et suivantes est dans `docs/roadmap.md`.

## Documentation

- `CLAUDE.md` : contexte du projet, organisation en agents IA, roadmap et workflow Git.
- `docs/roadmap.md` : roadmap détaillée et cochable, phase par phase.
- `Benin_Health_Intelligence_Platform_Cahier_des_charges_Complet.pdf` : cahier des charges complet du ministère.
- `design-system-base-fundlab.md` : base visuelle du design system, source de vérité pour l'identité graphique.
