@AGENTS.md

# Bénin Health Intelligence Platform

Documentation de fondation du projet (Phase 1). Ce fichier centralise le contexte que tout agent ou intervenant doit connaître avant de modifier ce dépôt.

## Vision du projet

Le Bénin Health Intelligence Platform est une plateforme nationale de santé numérique qui connecte citoyens, professionnels de santé, établissements, laboratoires, pharmacies et le ministère de la Santé autour d'une couche numérique commune : suivi du parcours de santé pour le citoyen, accès aux informations nécessaires pour le professionnel, indicateurs sanitaires fiables pour l'État. Ce dépôt correspond à un MVP de démonstration réalisé dans le cadre d'un challenge ministériel : l'objectif de cette étape n'est pas de reproduire toute l'infrastructure nationale, mais de prouver la capacité à construire une base fiable, sécurisée et bien documentée.

## Organisation en agents IA

Le développement est réparti entre plusieurs agents, chacun avec un périmètre de fichiers défini, afin d'éviter les modifications contradictoires quand plusieurs agents travaillent en parallèle dans le même dépôt. Cette organisation reprend et opérationnalise la Partie 11 section 3 du cahier des charges.

| Agent | Rôle | Périmètre principal |
|---|---|---|
| Agent Produit | Maintient la documentation, les fiches fonctionnalités et les priorités (rôle tenu par l'utilisateur humain, qui agit comme CEO/product owner) | CLAUDE.md, README.md, docs/ |
| Agent Architecture | Définit la structure du dépôt, le schéma de données et les décisions techniques structurantes | src/types/, src/modules/, src/security/, src/database/, src/lib/env.ts, .env.example |
| Agent Frontend | Construit les écrans et composants en appliquant le design system fundlab | src/app/, src/components/ui/, src/lib/cn.ts |
| Agent Backend | Développe l'API, les services métier et le RBAC | src/modules/, src/services/, src/security/ |
| Agent Sécurité | Audite les permissions, revoit les branches avant fusion, veille à la conformité au modèle Zero Trust | src/security/, revue transverse avant merge |
| Agent QA | Écrit les scénarios de test et les parcours utilisateurs bout en bout | src/tests/ |

## Roadmap par phases

Reprend la Partie 9 §5 et la Partie 11 §7 du cahier des charges. Version détaillée et cochable : voir docs/roadmap.md.

- Phase 0 (fait) : initialisation du dépôt Git, scaffold Next.js/TypeScript/Tailwind, structure de dossiers.
- Phase 1 (fait) : environnement, architecture (types, modules, sécurité, schéma de données), design system et identité institutionnelle du ministère de la Santé.
- Phase 2 (fait) : authentification et gestion des rôles (RBAC fonctionnel pour 8 rôles). MFA reporté à la Phase 7.
- Phase 3 (fait) : dossier patient (profil, antécédents, consentement).
- Phase 4 (fait) : espace professionnel, prise de rendez-vous et consultation médicale.
- Phase 5 (fait) : prescription électronique.
- Phase 6 (fait) : hiérarchie de provisionnement (ministère crée un établissement et son admin, qui crée son personnel) et tableaux de bord établissement/ministère (données agrégées uniquement, jamais de données nominatives).
- Phase 7 (fait) : MFA (TOTP), tests automatisés (Vitest), script de démonstration bout en bout (`npm run demo:e2e`).
- Phase 8 (à venir) : module laboratoire (examens médicaux).
- Phase 9 (fait) : module pharmacie (délivrance des prescriptions).
- Phase 10 (à venir) : PWA hors ligne, centre de notifications in-app.

Détail cochable phase par phase : voir `docs/roadmap.md`.

## Workflow Git

Reprend la Partie 10 §11 du cahier des charges. Détail complet : voir CONTRIBUTING.md.

- `main` : branche stable, toujours déployable.
- `develop` : branche d'intégration, reçoit les fonctionnalités validées.
- `feature/nom-fonctionnalite` : une branche par fonctionnalité en développement.

Convention de commit :

- `feat(module): description`
- `fix(module): description`
- `docs(module): description`

## Références

- Cahier des charges complet du ministère : `Benin_Health_Intelligence_Platform_Cahier_des_charges_Complet.pdf`
- Base visuelle du design system (source de vérité graphique) : `design-system-base-fundlab.md`

