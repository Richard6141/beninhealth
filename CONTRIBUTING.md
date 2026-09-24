# Contribuer au projet

Ce document décrit le workflow Git et les règles de collaboration du Bénin Health Intelligence Platform. Il reprend la Partie 10 §11 du cahier des charges.

## Branches

- `main` : branche stable. Elle reflète toujours un état déployable du projet.
- `develop` : branche d'intégration. Les fonctionnalités validées y sont fusionnées avant de passer sur `main`.
- `feature/nom-fonctionnalite` : une branche par fonctionnalité en développement, créée à partir de `develop`.

Pour créer une branche de fonctionnalité :

```bash
git checkout develop
git pull
git checkout -b feature/nom-fonctionnalite
```

Choisir un nom court, en anglais ou en français selon la convention déjà en usage dans le module concerné, descriptif de la fonctionnalité (par exemple `feature/rendez-vous-etablissement`).

## Convention de commit

Chaque message de commit suit le format `type(module): description`, à l'impératif et en anglais pour le verbe, avec le module concerné entre parenthèses.

Types utilisés :

- `feat` : nouvelle fonctionnalité.
- `fix` : correction de bug.
- `docs` : documentation uniquement.

Exemples concrets tirés du domaine santé :

- `feat(patient): add medical profile`
- `feat(appointment): add establishment availability check`
- `fix(prescription): correct dosage validation rule`

## Revue avant fusion

Aucune fonctionnalité importante ne doit fusionner directement dans `develop` ou `main` sans revue. Toute branche `feature/` destinée à `develop` passe par une pull request, et toute fusion vers `main` inclut une vérification par l'Agent Sécurité (conformité RBAC, Zero Trust, audit et consentement) avant validation.

## Organisation en agents IA

Le projet est développé par plusieurs agents IA, chacun avec un périmètre de fichiers défini pour éviter les modifications contradictoires. Le détail des rôles (Produit, Architecture, Frontend, Backend, Sécurité, QA) et de leur périmètre respectif est décrit dans `CLAUDE.md`.
