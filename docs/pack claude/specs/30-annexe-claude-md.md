# 30. Annexe — Fichier CLAUDE.md

Ce fichier est fourni séparément (`CLAUDE.md`) et doit être placé à la **racine du dépôt**. Claude Code le lit automatiquement au début de chaque session : il contient les règles permanentes du projet, le protocole « une étape, un rapport, votre validation » et les invariants de sécurité. Son contenu est reproduit ci-dessous pour référence. Le fichier `PROGRESS.md` (suivi des étapes E00 à E30) est également fourni séparément.

```text
# CLAUDE.md — Règles permanentes du projet BHIP

Tu travailles sur **Bénin Health Intelligence Platform (BHIP)**, une plateforme nationale de santé numérique. Les données de santé sont sensibles : **la sécurité et le respect des règles passent avant la vitesse**. La personne qui te pilote est un développeur débutant : explique simplement, ne suppose rien, demande quand c'est ambigu.

## 1. Où se trouve la vérité

- Le cahier des charges complet est dans `specs/` (lire `specs/00-guide-lecture.md` en premier).
- Le **plan de construction** est `specs/25-plan-construction.md` : étapes E00 à E30, dans l'ordre.
- L'avancement est dans `PROGRESS.md`. Lis-le au début de **chaque** session.
- Les décisions techniques sont dans `docs/decisions.md`.
- En cas de conflit entre ton intuition et `specs/`, **`specs/` a raison**. En cas de conflit entre deux passages de `specs/`, **arrête-toi et pose la question**.

## 2. Protocole OBLIGATOIRE de travail (une étape à la fois)

1. Ne commence une étape **que** lorsque l'utilisateur te le demande explicitement (« Réalise l'étape EXX »).
2. Lis `PROGRESS.md`, puis les fiches et sections citées par l'étape.
3. **Propose un plan** (fichiers, ordre des tâches, tests prévus, questions). N'écris aucun code avant que l'utilisateur ait répondu « OK pour le plan ».
4. Crée la branche `feature/EXX-nom-court` depuis `develop`.
5. Code dans cet ordre : règles pures (`rules.ts`) et leurs tests → repository → service (avec `authorize()`) → API / Server Actions → interface → tests de bout en bout.
6. Lance : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (si écrans), `pnpm build`. Corrige jusqu'à ce que tout soit vert.
7. Écris le **rapport de fin d'étape** dans `docs/rapports/EXX.md` en suivant **exactement** le modèle de la section 25.3 de `specs/25-plan-construction.md`, y compris la section « Ce que vous devez tester vous-même » (actions pas à pas, URL, compte à utiliser, résultat attendu).
8. Mets `PROGRESS.md` à jour : statut « À TESTER PAR L'UTILISATEUR ».
9. **ARRÊTE-TOI.** Termine ton message par : « J'attends votre validation de l'étape EXX. »
10. Si l'utilisateur signale un problème : corrige, relance tous les contrôles, ajoute une section « Corrections » au rapport, arrête-toi de nouveau.
11. Seulement après le message **« validé EXX »** : fusionne dans `develop`, marque l'étape « VALIDÉE (date) » dans `PROGRESS.md`.

## 3. Interdictions absolues

- Réaliser plusieurs étapes d'affilée, ou anticiper une étape future.
- Modifier une règle (`RG-…`) ou un critère d'acceptation (`CA-…`) pour faire passer un test. Si une règle te semble fausse : explique pourquoi et attends la décision.
- Supprimer, désactiver (`skip`, `only`) ou affaiblir un test existant.
- Fusionner une branche sans « validé EXX ».
- Ajouter une dépendance sans l'inscrire dans `docs/decisions.md` (nom, raison, alternative écartée).
- Utiliser des données réelles de patients. Toutes les données sont **fictives**.
- Écrire un secret (mot de passe, clé, jeton) dans le code ou dans Git.
- Afficher à l'utilisateur final une erreur technique (pile d'appels, message SQL).

## 4. Invariants de sécurité (à respecter dans chaque ligne de code)

1. **Toute** lecture ou écriture d'une donnée patient passe par `authorize()` du module `access` (chapitre 5 de `specs/`), qui écrit **toujours** une trace d'audit (ALLOWED ou DENIED).
2. Pas de base d'accès → réponse **404 `PATIENT_NOT_FOUND`** (« Aucun patient accessible ne correspond. »), jamais 403, pour ne pas révéler l'existence du dossier.
3. Filtrer les données **dans la requête SQL** selon la base d'accès ; ne jamais renvoyer un objet Prisma brut : toujours passer par un schéma Zod de sortie.
4. Les données `SENSITIVE` ne sortent que selon les règles du chapitre 5 ; jamais dans les SMS, notifications, résumés IA, exports ou agrégats fins.
5. Aucune donnée médicale n'est supprimée : statuts `ENTERED_IN_ERROR`, `RETIRED`, `MERGED`, addenda.
6. Consultations validées, ordonnances signées, résultats validés, vaccinations, délivrances, audit : **immuables** (déclencheurs en base).
7. Les journaux techniques (pino) ne contiennent **aucune** donnée de santé ni secret.
8. L'espace actif est lu dans la session serveur, jamais depuis un paramètre envoyé par le navigateur.
9. Les pages `/dev/*` n'existent qu'en `APP_ENV=dev` ou `staging`.
10. Le proxy (`proxy.ts`) ne remplace jamais les contrôles dans les services.

## 5. Conventions de code

- TypeScript strict, pas de `any` sans commentaire justifiant.
- Organisation par module : `src/modules/<module>/{index.ts, service.ts, repository.ts, schemas.ts, rules.ts, actions.ts, components/, __tests__/}`. Un module n'importe un autre module que par son `index.ts`. Seul `repository.ts` utilise Prisma.
- Pages (`src/app`) minces : pas de logique métier.
- Server Actions et routes `/api/v1` appellent les **mêmes** services.
- Validation Zod en entrée **et** en sortie ; erreurs via le catalogue de `specs/18-regles-transverses.md` (18.8).
- Tous les textes affichés dans `messages/fr.json` (aucun texte en dur).
- Dates stockées en UTC, affichées en `Africa/Porto-Novo`. Téléphones en E.164 `+22901XXXXXXXX`.
- Noms explicites, fonctions courtes, pas de duplication ; commentaires uniquement pour expliquer une décision métier ou technique (avec la référence `RG-…` ou `F-…`).
- Tests : le nom de chaque test cite la fiche et le critère (`F-RDV-01 CA-1 : …`). Données de test fictives, base remise à zéro entre fichiers.
- Commits : `type(module): description` (`feat`, `fix`, `test`, `docs`, `refactor`, `chore`), un commit par sous-tâche cohérente.

## 6. Commandes

- `docker compose up -d` — services (PostgreSQL+PostGIS, MinIO, Mailpit)
- `pnpm dev` — application en local
- `pnpm db:reset` — base recréée avec les données de démonstration
- `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm test:e2e` · `pnpm build`
- Outils de test manuel : `/dev/sms`, `/dev/comptes-demo`, `/dev/styleguide`, `/api/docs`, Mailpit sur http://localhost:8025

## 7. Quand tu as un doute

Arrête-toi et pose une question courte, avec **ta proposition** et sa justification (« Je propose X parce que Y ; alternative Z. Qu'en pensez-vous ? »). Inscris la décision prise dans `docs/decisions.md`.
```
