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

Prérequis : Node.js 24 (testé avec 24.19), npm, une base PostgreSQL.

```bash
npm ci
cp .env.example .env        # puis renseigner de vraies valeurs, jamais committées
npx prisma migrate deploy   # applique les migrations (voir plus bas pour l'ordre)
npm run db:seed             # comptes et données de démonstration (mot de passe de démo dans prisma/seed.ts)
npm run dev
```

L'application est ensuite accessible sur `http://localhost:3000`.

Contrôles avant tout push (les mêmes que ceux que doit lancer l'intégration continue) :

```bash
npx tsc --noEmit
npx eslint src
npx vitest run
npm run build
```

## Variables d'environnement

La liste complète, avec des valeurs factices, est dans `.env.example`. En production, le démarrage échoue si `DATABASE_URL`, `NEXTAUTH_SECRET` et les variables `SMTP_*` sont absentes (`src/lib/env.ts`). `WAPY_PONT_CLE` (WhatsApp) et `CLOUDINARY_*` sont facultatives. Aucun secret ne doit jamais être committé.

## Déploiement : points à ne pas manquer

- **Migrations avant l'application.** Lancer `npx prisma migrate deploy` AVANT de démarrer une nouvelle version : le code écrit dans la table `SessionActive` à chaque connexion, une base non migrée casse toute connexion. Le rejeu de toutes les migrations depuis une base vide a été vérifié identique au schéma Prisma.
- **Ordre d'un build propre :** `npm ci`, `npx prisma generate`, `npm run build`, puis `npm run start`. Le build compile en mode production (`NODE_ENV=production`) : il lui faut les variables obligatoires ci-dessus, même factices.
- **Stockage de fichiers sur disque local.** Les documents médicaux téléversés vont dans `private-uploads/` et les fichiers publics dans `public/uploads/` (tous deux ignorés par git). Dans un conteneur ou sur une plateforme à disque éphémère, il faut un volume persistant et sauvegardé, ou un stockage objet.
- **Tâches planifiées dans le processus.** Le pilotage, le marquage des absences, les rappels de rendez-vous et la purge des notifications démarrent depuis `src/instrumentation.ts` : ils supposent un seul processus serveur (pas de multi-instance sans verrou partagé).
- **Limitation de débit en mémoire** (`src/lib/limite-debit.ts`) : par instance, pas partagée entre instances.
- **Windows :** `prisma generate` échoue avec EPERM si un serveur de dev tient le moteur Prisma ; l'arrêter d'abord.
- **Données réelles :** interdit tant que l'autorisation de l'APDP (art. 407 du Code du numérique) n'est pas obtenue. Voir `docs/reste-a-faire.md`.

## Statut actuel

Les phases 0 à 10 de `docs/roadmap.md` sont faites, puis de nombreux modules du cahier des charges (administration, laboratoire, pharmacie, référentiels, rappels, exports de pilotage, sessions, vérification d'ordonnance, accès au dossier par NPI ou téléphone). Tout ce qui reste à faire, avec son état vérifié dans le code, est dans `docs/reste-a-faire.md`.

## Documentation

- `CLAUDE.md` : contexte du projet, organisation en agents IA, roadmap et workflow Git.
- `docs/roadmap.md` : roadmap détaillée et cochable, phase par phase.
- `docs/reste-a-faire.md` : tout ce qui reste à faire, état vérifié dans le code.
- `docs/conception-transfert-dossier.md` : conception de l'accès au dossier sans relation préalable et de l'identité des professionnels.
- `docs/coordination-agents.md` : journal de coordination entre les sessions de développement.
- `Benin_Health_Intelligence_Platform_Cahier_des_charges_Complet.pdf` : cahier des charges complet du ministère.
- `design-system-base-fundlab.md` : base visuelle du design system, source de vérité pour l'identité graphique.
