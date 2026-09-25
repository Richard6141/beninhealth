# 25. Plan de construction pas à pas (ordre strict)

Ce chapitre est le **guide de pilotage de Claude Code**. Il découpe le projet en **31 étapes** (E00 à E30), à réaliser **dans l'ordre**, **une par une**. Chaque étape produit quelque chose que **vous** pouvez tester vous-même. Claude Code **s'arrête** à la fin de chaque étape, vous remet un **rapport**, et **attend votre validation** avant de continuer.

## 25.1 La règle d'or : une étape, un rapport, votre validation

Le cycle de chaque étape est toujours le même :

**Votre consigne** → **Claude Code lit** (CLAUDE.md, PROGRESS.md, fiches citées) → **Claude Code propose un plan** → **vous validez le plan** → **Claude Code code et écrit les tests** → **tous les contrôles sont verts** → **Claude Code écrit le rapport et s'arrête** → **vous testez vous-même** → en cas de problème, retour à « code » ; sinon **vous écrivez « validé EXX »** → **Claude Code fusionne et passe l'étape à VALIDÉE** → étape suivante, sur votre nouvelle consigne.

**Ce qui est interdit à Claude Code (rappelé dans `CLAUDE.md`) :**

- commencer une étape sans consigne explicite de votre part ;
- réaliser plusieurs étapes d'affilée ;
- toucher à des fonctionnalités d'une étape future « pour gagner du temps » ;
- modifier une règle (RG) ou un critère d'acceptation (CA) pour faire passer un test ;
- désactiver, supprimer ou affaiblir un test existant ;
- fusionner une branche sans votre message « validé EXX ».

## 25.2 Déroulé détaillé d'une étape (pour vous et pour Claude Code)

| Moment | Ce que fait Claude Code | Ce que vous faites |
|---|---|---|
| 1. Lancement | — | Copiez la **consigne** de l'étape (encadré en fin de fiche) dans Claude Code. |
| 2. Lecture | Lit `CLAUDE.md`, `PROGRESS.md`, les fiches et sections citées. | — |
| 3. Plan | Propose : fichiers à créer ou modifier, ordre des tâches, tests prévus, **questions** sur les points ambigus. N'écrit **aucun** code. | Relisez ; répondez aux questions ; dites « OK pour le plan ». |
| 4. Branche | Crée `feature/EXX-nom-court` depuis `develop`. | — |
| 5. Réalisation | Code **petit à petit** : d'abord les **règles pures** et leurs tests (`rules.ts`), puis le repository, le service (avec `authorize()`), puis l'API, puis l'interface. Un commit par sous-tâche, au format `feat(module): …`. | Vous pouvez suivre, sans intervenir. |
| 6. Contrôles | Exécute : `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` (si l'étape a des écrans), `pnpm build`. Corrige jusqu'à ce que tout soit vert. | — |
| 7. Rapport | Écrit le **rapport de fin d'étape** (modèle 25.3) dans `docs/rapports/EXX.md` et l'affiche ; met à jour `PROGRESS.md` (statut « À TESTER PAR L'UTILISATEUR »). | — |
| 8. Arrêt | **S'arrête.** Termine par : « J'attends votre validation de l'étape EXX. » | — |
| 9. Test | — | Lancez l'application (`pnpm dev`) et suivez **pas à pas** la section « Ce que vous devez tester » du rapport. Cochez chaque ligne. |
| 10a. Problème | Corrige, relance les contrôles, **complète** le rapport (section « Corrections »), s'arrête de nouveau. | Décrivez précisément : ce que vous avez fait, ce que vous attendiez, ce que vous avez vu (capture d'écran si possible). |
| 10b. Validation | Fusionne dans `develop`, marque l'étape « VALIDÉE » dans `PROGRESS.md` avec la date. | Écrivez : **« validé EXX »**. |

## 25.3 Modèle du rapport de fin d'étape

Claude Code DOIT utiliser **exactement** ce modèle (fichier `docs/rapports/EXX.md`).

```markdown
# Rapport de fin d'étape EXX — [titre]

## 1. Résumé en 3 phrases
[Ce qui fonctionne maintenant, en langage simple, du point de vue de l'utilisateur.]

## 2. Fonctionnalités et règles couvertes
| Fiche / règle | Statut | Commentaire |
|---|---|---|
| F-XXX-00 | Fait / Partiel / Non fait | … |
| RG-XXX-00 | Respectée (test : nom_du_test) | … |

## 3. Fichiers créés ou modifiés
[Liste groupée par module, une ligne d'explication par fichier important.]

## 4. Résultats des contrôles automatiques
- Lint : OK / KO
- Typage : OK / KO
- Tests unitaires et d'intégration : X réussis / Y au total
- Tests de bout en bout : X réussis / Y au total
- Build : OK / KO

## 5. Ce que vous devez tester vous-même (pas à pas)
Préparation : [commandes à lancer, ex. `pnpm db:reset && pnpm dev`]
| # | Action à faire | Où | Compte à utiliser | Résultat attendu | OK ? |
|---|---|---|---|---|---|
| 1 | … | http://localhost:3000/… | … | … | ☐ |

## 6. Limites connues et points reportés
[Ce qui n'est volontairement pas fait, et à quelle étape ce sera fait.]

## 7. Questions ou décisions à prendre
[Points ambigus rencontrés ; décision proposée.]

## 8. Prochaine étape proposée
EXX+1 — [titre]. Je ne la commencerai qu'après votre message « validé EXX ».
```

## 25.4 Outils pour tester vous-même

À partir de l'étape E04, l'application de développement propose des **pages réservées au développement** (elles NE DOIVENT JAMAIS exister en production — un test automatique le vérifie) :

| Page | Utilité |
|---|---|
| `/dev/sms` | Boîte d'envoi des SMS simulés : vous y lisez les codes OTP, les rappels, etc. |
| `http://localhost:8025` | Mailpit : les emails envoyés par l'application |
| `/dev/comptes-demo` | Liste des comptes de démonstration (rôle, identifiant, mot de passe commun) et, pour les comptes professionnels, le **code à 6 chiffres actuel** de leur second facteur, pour tester sans téléphone |
| `/dev/styleguide` | Tous les composants de l'interface et leurs états |
| `/api/docs` | Documentation interactive de l'API |

Commandes utiles (documentées dans le README) : `pnpm dev` (lancer), `pnpm db:reset` (remettre la base à zéro avec les données de démonstration), `pnpm test`, `pnpm test:e2e`.

## 25.5 Vue d'ensemble des étapes

| Semaine | Étape | Titre | Priorité | Supprimable si manque de temps |
|---|---|---|---|---|
| 1 | E00 | Préparer son poste de travail | P0 | Non |
| 1 | E01 | Initialiser le dépôt et les règles de qualité | P0 | Non |
| 1 | E02 | Base de données, services Docker, file de tâches | P0 | Non |
| 2 | E03 | Design system et gabarits des espaces | P0 | Non |
| 3 | E04 | Authentification citoyen | P0 | Non |
| 3 | E05 | Affiliations, invitations et espaces actifs | P0 | Non |
| 4 | E06 | Second facteur, journal d'audit, moteur d'autorisation | P0 | Non |
| 5 | E07 | Référentiels et données de départ | P0 | Non |
| 5 | E08 | Administration de la plateforme | P0 | Non |
| 5 | E09 | Espace établissement : fiche, personnel, agendas | P0 | Non |
| 6 | E10 | Dossier patient et première utilisation | P0 (+ P1 tutelle) | Tutelle seulement |
| 6 | E11 | Tableau de bord, dossier et carte santé du citoyen | P0 | Non |
| 7 | E12 | Consentements, partage et historique des accès | P0 | Non |
| 7 | E13 | Recherche d'établissements et rendez-vous | P0 | Non |
| 8 | E14 | Accueil : file du jour, arrivée, contexte de soins | P0 | Non |
| 8 | E15 | Espace soignant : tableau de bord, recherche, résumé | P0 | Non |
| 9 | E16 | Consultation médicale | P0 (+ P1 addendum, soins, vaccins) | Parties P1 |
| 9 | E17 | Ordonnance électronique | P0 | Non |
| 10 | E18 | Pharmacie | P1 | Oui |
| 10 | E19 | Laboratoire | P1 | Oui |
| 10 | E20 | Documents médicaux | P1 | Oui |
| 10 | E21 | Accès d'urgence et revue | P1 | Oui |
| 11 | E22 | Application terrain hors ligne | P1 | Oui |
| 11 | E23 | Notifications et rappels | P0 | Non |
| 12 | E24 | Agrégats et tableaux de bord de pilotage | P0 | Non |
| 12 | E25 | Résumé IA pour le médecin | P1 | Oui |
| 12 | E26 | Documentation d'API et façade FHIR | P1 | Façade FHIR seulement |
| 13 | E27 | Durcissement sécurité, écrans d'audit, droits des personnes | P0 / P1 | Parties P1 |
| 13 | E28 | Performance, accessibilité, responsive, charge | P0 | Non |
| 14 | E29 | Données de démonstration, déploiement staging, sauvegardes | P0 | Non |
| 14 | E30 | Recette complète, documentation, répétition de la démonstration | P0 | Non |

## E00 — Préparer son poste de travail

**Objectif.** Avoir tous les outils installés et vérifiés. Aucune ligne de code.

**Tâches (vous, avec l'aide de Claude Code si besoin).**

1. Installer : Git, Node.js (version LTS), pnpm, Docker Desktop (ou Docker Engine), un éditeur (VS Code), Claude Code.
2. Créer un compte GitHub et un dépôt **privé** `bhip`.
3. Installer sur votre téléphone une application d'authentification (Google Authenticator, Microsoft Authenticator ou FreeOTP).
4. Copier dans un dossier de travail : `CLAUDE.md`, `PROGRESS.md` et le dossier `specs/` fournis avec ce document.

**Ce que vous devez tester.** Dans un terminal : `git --version`, `node --version`, `pnpm --version`, `docker run hello-world` affichent une version ou un message de succès.

**Condition de passage.** Les quatre commandes fonctionnent.

> [!TIP] Consigne pour Claude Code — E00
> « Lis CLAUDE.md et specs/00-guide-lecture.md. Vérifie que Git, Node LTS, pnpm et Docker sont installés et fonctionnent sur ma machine en me donnant les commandes à lancer une par une. N'écris aucun code. Termine par le rapport de fin d'étape E00. »

## E01 — Initialiser le dépôt et les règles de qualité

**Objectif.** Un projet Next.js vide mais professionnel : structure, qualité automatique, intégration continue.

**À lire.** Chapitres 20.2, 20.3 ; `CLAUDE.md`.

**Tâches dans l'ordre.**

1. Initialiser le dépôt Git (branches `main` et `develop`), `.gitignore`, `.editorconfig`, `.nvmrc`.
2. Créer l'application Next.js (TypeScript strict, App Router, Tailwind, dossier `src/`), gestionnaire pnpm.
3. Créer l'arborescence de la section 20.3 (dossiers vides avec un `README.md` d'une ligne expliquant leur rôle).
4. Configurer ESLint (dont règle de frontières entre modules RG-ARC-11 et interdiction du SQL concaténé), Prettier, Husky + lint-staged, commitlint (convention `feat(module): …`).
5. Ajouter les scripts `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `format`.
6. Installer Vitest (un test exemple) et Playwright (un test qui ouvre la page d'accueil).
7. Créer la CI GitHub Actions : installation, lint, typage, tests, build — sur chaque push et pull request.
8. Créer `docs/decisions.md` (journal de décisions), `docs/rapports/`, `README.md` (première version : prérequis, installation, commandes).
9. Placer `CLAUDE.md`, `PROGRESS.md`, `specs/` à la racine.

**Interdits.** Aucune page métier, aucune base de données.

**Tests automatiques attendus.** Le test exemple Vitest et le test Playwright de la page d'accueil passent.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | `pnpm install` puis `pnpm dev`, ouvrir http://localhost:3000 | Une page d'accueil « BHIP — en construction » s'affiche |
| 2 | `pnpm lint` et `pnpm test` | Aucun échec |
| 3 | Faire un commit avec le message « test » | Le commit est **refusé** (message non conforme à la convention) |
| 4 | Pousser la branche sur GitHub, ouvrir l'onglet « Actions » | La CI est verte |

**Condition de passage.** Les 4 vérifications sont OK.

> [!TIP] Consigne pour Claude Code — E01
> « Réalise uniquement l'étape E01 de specs/25-plan-construction.md. Lis d'abord CLAUDE.md, PROGRESS.md et specs/20-architecture.md (sections 20.2 et 20.3). Propose-moi ton plan avant de coder. N'installe que les dépendances nécessaires à E01. Termine par le rapport de fin d'étape E01 selon le modèle 25.3 et arrête-toi. »

## E02 — Base de données, services Docker et file de tâches

**Objectif.** Une base PostgreSQL + PostGIS, un stockage de fichiers et un serveur d'emails de test qui démarrent en une commande ; Prisma branché ; file de tâches prête.

**À lire.** Chapitres 20.2, 20.6, 20.7, 21.1, 21.11 (principe du schéma audit).

**Tâches dans l'ordre.**

1. `docker-compose.yml` : PostgreSQL 16 avec PostGIS, MinIO (+ création du compartiment `bhip-documents` privé), Mailpit.
2. `.env.example` complet (section 20.7) ; chargement et **validation des variables au démarrage** avec Zod (l'application refuse de démarrer s'il manque une variable).
3. Prisma : connexion, schémas `app`, `audit`, `analytics` ; première migration qui active les extensions `postgis`, `unaccent`, `pg_trgm`, `citext`, `pgcrypto`.
4. Utilitaires `src/lib` : identifiants UUID v7, identifiants lisibles Crockford avec caractère de contrôle (section 18.2) **et leurs tests**, formats de dates et fuseau Africa/Porto-Novo, normalisation du téléphone (RG-AUTH-01) **et ses tests**, classe d'erreur applicative avec le catalogue 18.8, logger pino avec masquage des champs interdits.
5. File de tâches pg-boss : démarrage, une tâche de démonstration « ping » planifiée chaque minute qui écrit dans les journaux.
6. Script `pnpm db:reset` (recrée la base, applique les migrations, lance le seed — vide pour l'instant) et page `GET /api/health` (état de la base, du stockage, de la file).

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | `docker compose up -d` | Trois services démarrés (`docker compose ps`) |
| 2 | `pnpm db:reset` | Aucune erreur |
| 3 | Ouvrir http://localhost:3000/api/health | `{"database":"ok","storage":"ok","queue":"ok"}` |
| 4 | Ouvrir http://localhost:8025 | L'interface Mailpit s'affiche |
| 5 | Retirer `DATABASE_URL` du fichier `.env` et relancer `pnpm dev` | L'application refuse de démarrer avec un message clair ; remettre la variable |

**Condition de passage.** Tests automatiques des utilitaires verts + 5 vérifications OK.

> [!TIP] Consigne pour Claude Code — E02
> « Réalise uniquement l'étape E02. Lis CLAUDE.md, PROGRESS.md, specs/18-regles-transverses.md (18.1, 18.2, 18.8), specs/20-architecture.md et specs/21-modele-donnees.md (21.1). Écris d'abord les tests des utilitaires (identifiants, téléphone, dates). Ne crée aucune table métier à part ce qui est demandé. Plan d'abord, puis réalisation, puis rapport E02, puis arrêt. »

## E03 — Design system et gabarits des espaces

**Objectif.** Tous les composants de base et les gabarits des espaces existent, avec leurs couleurs, et sont visibles dans le guide de style.

**À lire.** Chapitre 19 en entier.

**Tâches dans l'ordre.**

1. Jetons de design (section 19.2) en variables CSS ; configuration Tailwind ; police Inter auto-hébergée.
2. Composants du tableau 19.4 (base shadcn/ui), avec tous leurs états ; composant téléphone (+229) ; stepper ; bandeaux d'état ; indicateur d'enregistrement.
3. Gabarits (`components/layout`) : citoyen (barre du bas), professionnel (barre latérale + emplacement du bandeau patient), terrain, pilotage/admin ; chacun avec sa couleur d'espace.
4. Composants d'état : chargement (squelettes), vide, erreur, hors connexion (section 19.5).
5. Mise en place de next-intl et `messages/fr.json` ; aucun texte en dur.
6. Page `/dev/styleguide` qui montre tout (réservée au développement).
7. Tests Playwright : captures du guide de style à 360 px et 1 280 px ; test d'accessibilité axe sur le guide de style.

**Interdits.** Aucune logique métier ; les gabarits utilisent des données factices codées dans la page de démonstration uniquement.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Ouvrir `/dev/styleguide` sur ordinateur | Tous les composants et leurs états sont visibles |
| 2 | Ouvrir la même page en mode téléphone (outils du navigateur, 360 px) | Rien ne déborde horizontalement |
| 3 | Naviguer au clavier (touche Tab) | Le focus est toujours visible |
| 4 | Comparer les gabarits citoyen, pro, pilotage | Chacun a sa couleur d'espace |

**Condition de passage.** Test axe sans erreur critique + 4 vérifications OK.

> [!TIP] Consigne pour Claude Code — E03
> « Réalise uniquement l'étape E03. Lis CLAUDE.md, PROGRESS.md et specs/19-ux-design-system.md en entier. Aucun texte en dur : tout dans messages/fr.json. Plan, réalisation, rapport E03, arrêt. »

## E04 — Authentification citoyen

**Objectif.** Un citoyen peut créer son compte avec vérification du téléphone, se connecter, se déconnecter, réinitialiser son mot de passe.

**À lire.** F-AUTH-01, F-AUTH-02, F-AUTH-04 ; F-NOT-02 ; sections 18.1, 18.8, 23.3 ; tables `users` et suivantes (21.4, partie authentification), `patients` (21.5, colonnes minimales).

**Tâches dans l'ordre.**

1. Intégrer Better Auth : sessions en base, connexion téléphone ou email + mot de passe, OTP par SMS.
2. Module `notifications` **minimal** : fonction `notify()` et `SmsProvider` avec `OutboxSmsProvider` (table `sms_outbox`) ; page `/dev/sms`.
3. Règles pures `auth/rules.ts` (mots de passe, limites OTP, verrouillage) **avec leurs tests d'abord**.
4. Inscription (F-AUTH-01) : formulaire, OTP, création **transactionnelle** du compte et d'un dossier patient minimal avec identifiant santé (le rattachement à un dossier existant sera complété en E10).
5. Connexion / déconnexion (F-AUTH-02) avec verrouillage ; mot de passe oublié (F-AUTH-04).
6. Proxy (`proxy.ts`) : redirection des non-connectés hors de `/citoyen`.
7. Page `/citoyen` provisoire « Bonjour [prénom] ».
8. Tests : unitaires (règles), intégration (inscription complète, verrouillage, message identique compte existant/inexistant), bout en bout (inscription → connexion → déconnexion), test « aucun secret dans les journaux ».

**Interdits.** Pas de rôles professionnels, pas de second facteur (E05, E06).

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Aller sur `/inscription`, saisir un téléphone « 97 12 34 56 » (8 chiffres) | Message « Les numéros béninois comptent désormais 10 chiffres… » |
| 2 | Saisir « 01 97 12 34 56 » et le reste du formulaire, valider | Écran de saisie du code, numéro masqué |
| 3 | Ouvrir `/dev/sms`, lire le code, le saisir | Arrivée sur « Bonjour [prénom] » |
| 4 | Se déconnecter, appuyer sur « Retour » du navigateur | Aucune donnée ne réapparaît ; retour à la connexion |
| 5 | Se connecter 5 fois avec un mauvais mot de passe, puis avec le bon | Message de verrouillage 15 minutes |
| 6 | Faire « Mot de passe oublié » avec ce numéro | Code dans `/dev/sms`, nouveau mot de passe accepté, connexion OK |
| 7 | Refaire une inscription avec le même numéro | Même message que pour un numéro libre ; aucun second compte |

**Condition de passage.** Tous les CA de F-AUTH-01, 02 et 04 couverts par des tests verts (sauf F-AUTH-02 CA-2, qui concerne le second facteur et sera couvert en E06) + 7 vérifications OK.

> [!TIP] Consigne pour Claude Code — E04
> « Réalise uniquement l'étape E04. Lis CLAUDE.md, PROGRESS.md, specs/07-fiches-comptes.md (F-AUTH-01, 02, 04), specs/17-fiches-notifications.md (F-NOT-02), specs/23-securite-conformite.md (23.3). Écris d'abord les tests des règles. Respecte chaque RG citée. Plan, réalisation, rapport E04 avec le guide de test manuel, arrêt. »

## E05 — Affiliations, invitations et espaces actifs

**Objectif.** Les rôles professionnels existent ; on peut inviter un professionnel, qui active son compte ; un utilisateur à plusieurs espaces choisit son espace actif.

**À lire.** Chapitre 4 (règles RG-ROL), F-AUTH-05, F-AUTH-07 ; tables `memberships`, `practitioner_profiles`, `invitations`, `facilities` (colonnes minimales : nom, type, statut).

**Tâches dans l'ordre.**

1. Enum des rôles ; table des permissions par rôle (section 4.14) en **constante TypeScript** testée.
2. Tables `memberships`, `practitioner_profiles`, `invitations`, et `facilities` minimale.
3. Seed : 1 `PLATFORM_ADMIN` de démonstration et 2 établissements fictifs minimaux.
4. Invitations (F-AUTH-05) : création (qui peut inviter qui, RG-AUTH-41), lien, activation, profil professionnel `PENDING_VALIDATION` pour les rôles cliniques. L'étape 6 de F-AUTH-05 (activation du second facteur) sera ajoutée en E06 : en E05, l'activation s'arrête après l'étape 5.
5. Espace actif (F-AUTH-07) : stocké dans la session serveur ; sélecteur ; trace `CONTEXT_SWITCH` (écrite pour l'instant dans une table temporaire qui sera remplacée par l'audit en E06 — ou directement dans l'audit si Claude Code réalise la table d'audit ici : à préciser dans le plan).
6. Gabarits des espaces reliés au rôle actif ; pages d'accueil vides de chaque espace (« Espace médecin — en construction »).
7. Fonction `requireSpace(role[])` utilisée par chaque page d'espace.
8. Page `/dev/comptes-demo` (sans second facteur pour l'instant).
9. Tests : règles d'invitation, expiration, usage unique, un médecin non validé n'a pas d'espace actif, changement d'espace, accès direct à une URL d'un autre espace refusé.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Se connecter avec le compte administrateur de démonstration | Arrivée dans l'espace administration (vide) |
| 2 | (Écran provisoire ou `/dev`) Inviter un responsable d'établissement pour l'établissement 1 | Un SMS d'invitation apparaît dans `/dev/sms` |
| 3 | Ouvrir le lien dans une fenêtre de navigation privée, activer le compte | Arrivée dans l'espace établissement |
| 4 | Réouvrir le même lien | « Invitation déjà utilisée » |
| 5 | Avec un compte citoyen, taper l'adresse `/admin` | Refus (page introuvable ou interdite) |
| 6 | Avec un compte ayant deux espaces | Écran de choix de l'espace ; le nom de l'espace est affiché dans l'en-tête |

**Condition de passage.** Tests verts + 6 vérifications OK.

> [!TIP] Consigne pour Claude Code — E05
> « Réalise uniquement l'étape E05. Lis CLAUDE.md, PROGRESS.md, specs/04-acteurs-roles.md, specs/07-fiches-comptes.md (F-AUTH-05, F-AUTH-07) et specs/21-modele-donnees.md (21.4). Plan, réalisation, rapport E05, arrêt. »

## E06 — Second facteur, journal d'audit et moteur d'autorisation

**Objectif.** Le socle de sécurité est complet : second facteur obligatoire pour les professionnels, journal d'audit infalsifiable, fonction unique `authorize()`.

**À lire.** Chapitre 5 en entier ; F-AUTH-06 ; F-AUD-01 (moteur) ; section 21.11 ; RG-ARC-12.

**Tâches dans l'ordre.**

1. Second facteur TOTP (F-AUTH-06) : activation, codes de secours, exigence à la connexion pour tout compte ayant une affiliation ; ré-authentification (RG-SEC-01) ; `/dev/comptes-demo` affiche le code courant des comptes de démonstration.
2. Schéma `audit` : table, droits SQL (RG-DB-01), déclencheur anti-modification, chaînage des empreintes (RG-DB-02) ; service `audit.record()` ; vérification d'intégrité.
3. Module `access` : `authorize()` selon l'algorithme 5.3, **avec pour l'instant les bases `SELF` et `AUTHOR`** ; les autres bases seront ajoutées aux étapes E10 (`GUARDIAN`), E12 (`CONSENT`), E14 (`CARE_CONTEXT`), E17-E19 (`ASSIGNMENT`), E21 (`EMERGENCY`) — mais l'interface de la fonction est définitive dès maintenant.
4. Contexte de requête (`ctx`) ; utilitaire `withAuthorization` pour les services ; test automatique RG-ARC-12 (tout service exporté appelle `authorize` ou est marqué `@public`).
5. Tests : une suite de tests de matrice **générée** à partir de la table des permissions (chaque rôle × chaque permission) ; chaque refus écrit une trace `DENIED` ; tentative de `UPDATE` sur l'audit refusée par la base.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Se connecter avec le responsable d'établissement créé en E05 | Obligation d'activer le second facteur avant toute chose |
| 2 | Scanner le QR avec l'application de votre téléphone, saisir le code | Codes de secours affichés ; accès à l'espace |
| 3 | Se déconnecter / reconnecter | Le code est demandé |
| 4 | Utiliser un code de secours, puis le réutiliser | Accepté la première fois, refusé la seconde |
| 5 | Dans un outil SQL (ou via la commande fournie dans le rapport), tenter de modifier une ligne du journal d'audit | Refus de la base de données |
| 6 | Lancer la commande de vérification d'intégrité fournie | « Chaîne intègre » |

**Condition de passage.** Suite de tests de la matrice verte + 6 vérifications OK. **Cette étape est critique : ne la validez pas s'il reste le moindre doute.**

> [!TIP] Consigne pour Claude Code — E06
> « Réalise uniquement l'étape E06. Lis CLAUDE.md, PROGRESS.md, specs/05-acces-consentement.md EN ENTIER, specs/07-fiches-comptes.md (F-AUTH-06), specs/21-modele-donnees.md (21.11) et specs/20-architecture.md (20.3, 20.5). La fonction authorize() doit suivre exactement l'ordre de la section 5.3. Écris les tests de la matrice avant l'implémentation. Plan, réalisation, rapport E06, arrêt. »

## E07 — Référentiels et données de départ

**Objectif.** Toutes les listes de référence sont chargées : géographie, établissements fictifs, services, CIM-10, médicaments, examens, vaccins, jours fériés ; paramètres et fonctionnalités activables.

**À lire.** Section 18.4, 18.5, 18.6 ; chapitre 21 (tables de référentiels, `settings`, `feature_flags`) ; chapitre 28 (données de démonstration).

**Tâches dans l'ordre.**

1. Tables de référentiels et de versions de référentiels.
2. Fichiers CSV de départ dans `prisma/seed/` (contenu du tableau 18.4, contexte béninois, **données fictives** pour les établissements) et scripts d'import idempotents.
3. Tables `settings` et `feature_flags` avec toutes les valeurs par défaut citées dans le document (Claude Code DOIT lister dans le rapport chaque paramètre et la fiche d'où il vient).
4. Service `referential` : recherche CIM-10, médicaments, examens (insensible aux accents), lecture des paramètres avec cache de 60 s.
5. Comptes de démonstration de tous les rôles (chapitre 28), avec second facteur préconfiguré.
6. Tests : import rejouable deux fois sans doublon ; recherche « paludisme » et « amoxi » ; lecture de paramètre.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | `pnpm db:reset` | Fin sans erreur, résumé des lignes importées affiché |
| 2 | Ouvrir `/dev/comptes-demo` | Les comptes de tous les rôles sont listés |
| 3 | Appeler `/api/v1/ref/icd10?q=palu` (ou via `/api/docs`) | Les codes B50–B54 apparaissent |
| 4 | Appeler `/api/v1/ref/medications?q=amoxi` | Les présentations d'amoxicilline apparaissent |

**Condition de passage.** Tests verts + 4 vérifications OK.

> [!TIP] Consigne pour Claude Code — E07
> « Réalise uniquement l'étape E07. Lis CLAUDE.md, PROGRESS.md, specs/18-regles-transverses.md (18.4 à 18.6), specs/21-modele-donnees.md (21.10, référentiels et système) et specs/28-donnees-demo-presentation.md. Toutes les données de patients et d'établissements sont FICTIVES. Plan, réalisation, rapport E07, arrêt. »

## E08 — Administration de la plateforme

**Objectif.** L'administrateur gère les établissements, valide les professionnels et gère les comptes.

**À lire.** F-ADM-01, F-ADM-02, F-ADM-03, F-ADM-05, F-ADM-07 (et F-ADM-04 en lecture) ; RG-ROL-06, RG-ROL-07.

**Tâches dans l'ordre.** (1) Tableau de bord admin avec les files. (2) Liste et fiche des établissements, création, activation, fermeture (RG-ADM-01), contrôle GPS dans la commune (PostGIS). (3) File de validation des professionnels (approuver, refuser, demander un complément). (4) Gestion des comptes (recherche exacte, suspension avec effet immédiat, réinitialisation du second facteur, quatre yeux RG-ADM-30). (5) Écran des paramètres et fonctionnalités activables. (6) Tests, dont : l'administrateur n'a accès à aucune route clinique.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Admin : créer un établissement avec un point GPS hors de la commune choisie | Refus avec message |
| 2 | Créer l'établissement correctement, l'activer, inviter son responsable | Invitation dans `/dev/sms` |
| 3 | Activer un compte médecin invité (compte de démonstration « médecin en attente ») ; vérifier qu'il ne voit aucun patient | Message « profil en cours de vérification » |
| 4 | Admin : approuver ce médecin | Le médecin accède à son espace |
| 5 | Admin : suspendre un compte connecté dans un autre navigateur | L'autre navigateur est déconnecté à l'action suivante |

**Condition de passage.** Tests verts + 5 vérifications OK.

> [!TIP] Consigne pour Claude Code — E08
> « Réalise uniquement l'étape E08. Lis CLAUDE.md, PROGRESS.md, specs/15-fiches-administration-audit.md (F-ADM-01, 02, 03, 05, 07) et specs/04-acteurs-roles.md (4.13). Plan, réalisation, rapport E08, arrêt. »

## E09 — Espace établissement : fiche, personnel, agendas

**Objectif.** Le responsable prépare son établissement pour recevoir des patients.

**À lire.** F-ETA-03, F-ETA-04, F-ETA-05 ; tables 21.7 ; RG-ETA-*.

**Tâches dans l'ordre.** (1) Fiche et services (modifiables vs réservés à l'admin). (2) Personnel : invitation (rôles selon type, 18.5), liste, suspension, fin. (3) Modèles d'agenda, aperçu, génération des créneaux par tâche planifiée (60 jours), fermetures, jours fériés. (4) Tests, dont : non-chevauchement (RG-ETA-40), régénération sans toucher aux créneaux réservés (RG-ETA-41), nombre de créneaux (CA de F-ETA-05).

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Responsable du CS de démonstration : activer le service « Médecine générale » en confirmation automatique | Service visible comme actif |
| 2 | Créer un agenda lundi–vendredi, 8 h–12 h, 15 min, capacité 1 | Aperçu : 16 créneaux par jour ouvré, 0 le samedi |
| 3 | Ajouter une fermeture pour un jour de la semaine prochaine | Les créneaux de ce jour sont bloqués |
| 4 | Inviter un agent d'accueil | Invitation dans `/dev/sms` ; l'agent active son compte |
| 5 | Essayer d'inviter un médecin dans une pharmacie (compte responsable de la pharmacie de démonstration) | Le rôle n'est pas proposé |

**Condition de passage.** Tests verts + 5 vérifications OK.

> [!TIP] Consigne pour Claude Code — E09
> « Réalise uniquement l'étape E09. Lis CLAUDE.md, PROGRESS.md, specs/09-fiches-etablissements-rdv.md (F-ETA-03 à F-ETA-05), specs/18-regles-transverses.md (18.5) et specs/21-modele-donnees.md (21.7). Plan, réalisation, rapport E09, arrêt. »

## E10 — Dossier patient et première utilisation

**Objectif.** Le dossier patient complet existe ; le citoyen remplit son profil santé ; (P1) il ajoute des personnes à charge ; un dossier créé sans compte peut être réclamé.

**À lire.** F-CIT-01, F-CIT-07, F-AUTH-03 ; section 21.3 (versions), 21.5 ; RG-ACC-30 ; score de doublons 18.3.

**Tâches dans l'ordre.** (1) Tables patients complètes, allergies, conditions, contacts, tutelles, identifiants ; `record_versions`. (2) Détection de doublons (18.3) comme **règle pure testée** + requête SQL de présélection. (3) Rattachement à l'inscription (étape 6 de F-AUTH-01). (4) Assistant de première utilisation. (5) (P1) Personnes à charge et base `GUARDIAN` dans `authorize()`. (6) (P1) Réclamation d'un dossier. (7) Tests.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Créer un nouveau compte citoyen | L'assistant en 4 étapes s'ouvre |
| 2 | Déclarer une allergie à la pénicilline, « Je ne sais pas » pour le groupe sanguin, passer l'étape 3, ajouter un contact | Tableau de bord atteint ; bandeau « Complétez votre profil » |
| 3 | (P1) Ajouter un enfant de 4 ans | L'enfant apparaît dans « Mes proches » avec la mention « non vérifié » |
| 4 | (P1) Réclamer le dossier de démonstration « patient sans compte » avec son code | Accès à ses consultations passées de démonstration |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E10
> « Réalise uniquement l'étape E10. Lis CLAUDE.md, PROGRESS.md, specs/08-fiches-citoyen.md (F-CIT-01, F-CIT-07), specs/07-fiches-comptes.md (F-AUTH-03), specs/18-regles-transverses.md (18.3) et specs/21-modele-donnees.md (21.3, 21.5). Plan, réalisation, rapport E10, arrêt. »

## E11 — Tableau de bord, dossier et carte santé du citoyen

**Objectif.** Le citoyen voit son tableau de bord, son dossier (résumé + chronologie), ses informations déclarées, sa carte santé QR, ses ordonnances et documents (listes vides pour l'instant, alimentées par les étapes suivantes).

**À lire.** F-CIT-02 à F-CIT-06, F-CIT-08 ; RG-ACC-01, RG-ACC-02 ; 19.5.

**Tâches dans l'ordre.** (1) Services de lecture du dossier (catégories, filtrage `SENSITIVE`, source déclarée/confirmée). (2) Tableau de bord (ordre imposé, états vides). (3) Dossier et chronologie paginée. (4) Informations déclarées versionnées (RG-CIT-30, 31). (5) Carte santé : jeton QR signé 5 min, usage unique, QR de secours. (6) Mise en cache hors ligne en lecture du tableau de bord (service worker minimal ; la PWA complète viendra en E22). (7) Sélecteur de personne à charge (P1). (8) Tests.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Citoyen de démonstration « avec historique » : ouvrir le tableau de bord | Sections dans l'ordre : alertes, prochain RDV, traitements, documents, 4 actions |
| 2 | Ouvrir « Mon dossier » | Résumé + chronologie ; chaque information indique sa source |
| 3 | Ouvrir « Ma carte santé » et attendre 5 minutes | Le QR se renouvelle (compte à rebours) |
| 4 | Passer le téléphone (ou le navigateur) en mode avion, recharger le tableau de bord | Données affichées avec « Hors connexion — données du … » |
| 5 | Citoyen de démonstration « avec donnée sensible » : vérifier qu'il voit sa propre donnée sensible | Visible pour lui |

**Condition de passage.** Tests verts (dont filtrage des sensibles dans les réponses API) + vérifications OK.

> [!TIP] Consigne pour Claude Code — E11
> « Réalise uniquement l'étape E11. Lis CLAUDE.md, PROGRESS.md, specs/08-fiches-citoyen.md (F-CIT-02 à F-CIT-06, F-CIT-08) et specs/05-acces-consentement.md (5.2). Plan, réalisation, rapport E11, arrêt. »

## E12 — Consentements, partage et historique des accès

**Objectif.** Le citoyen contrôle qui accède à son dossier et voit qui l'a consulté.

**À lire.** F-CIT-10, F-CIT-11, F-CIT-12 ; section 5.4 (B3) ; 5.7 ; tables 21.6.

**Tâches dans l'ordre.** (1) Tables `consents`, `consent_requests`, `share_codes`. (2) Base `CONSENT` dans `authorize()` (niveaux, durées, RG-ACC-10 à 15) **avec tests**. (3) Écrans d'autorisation (recherche du bénéficiaire, niveau en langage simple, durée, phrase de confirmation), retrait immédiat. (4) Code de partage temporaire + écran pro « saisir un code » (écran pro minimal, complété en E15). (5) Historique des accès regroupé (RG-ACC-61) + bouton « Je ne reconnais pas cet accès » (création d'un signalement). (6) Tests : retrait effectif en moins de 60 s ; `FULL_SENSITIVE` impossible vers un établissement.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Citoyen : autoriser le médecin de démonstration pour « Tout mon dossier », 7 jours | Phrase de confirmation exacte ; autorisation dans « actives » |
| 2 | Médecin (autre navigateur) : saisir l'identifiant santé du citoyen dans la recherche | Le patient est trouvé (résumé minimal, l'écran complet vient en E15) |
| 3 | Citoyen : retirer l'autorisation ; médecin : recharger dans la minute | « Aucun patient accessible ne correspond » |
| 4 | Citoyen : générer un code de partage ; médecin : le saisir | Le citoyen voit « Partagé avec Dr … » |
| 5 | Citoyen : ouvrir « Qui a consulté mon dossier » | L'accès du médecin est listé avec rôle, établissement, date |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E12
> « Réalise uniquement l'étape E12. Lis CLAUDE.md, PROGRESS.md, specs/08-fiches-citoyen.md (F-CIT-10 à F-CIT-12), specs/05-acces-consentement.md (5.4 B3, 5.7) et specs/21-modele-donnees.md (21.6). Plan, réalisation, rapport E12, arrêt. »

## E13 — Recherche d'établissements et rendez-vous

**Objectif.** Le citoyen trouve un établissement (liste et carte) et prend, annule ou déplace un rendez-vous sans double réservation possible.

**À lire.** F-ETA-01, F-ETA-02, F-RDV-01, F-RDV-02 ; figure 9.1 ; RG-RDV-*.

**Tâches dans l'ordre.** (1) Recherche publique (texte sans accents, filtres, distance PostGIS, pagination). (2) Carte Leaflet. (3) Fiche établissement. (4) Machine à états `transitionAppointment()` **testée en premier**. (5) Réservation atomique (RG-RDV-03) + test de concurrence (20 demandes simultanées). (6) Écrans de prise de rendez-vous, confirmation (fichier .ics), liste « Mes rendez-vous », annulation, déplacement. (7) Notification de confirmation (via `notify()` minimal).

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Sans être connecté, ouvrir `/etablissements`, chercher « akpakpa » | Le CS Akpakpa de démonstration est trouvé |
| 2 | Onglet « Carte » | Les établissements sont placés sur la carte |
| 3 | Citoyen : prendre un rendez-vous demain à 9 h en médecine générale | Écran de confirmation + SMS dans `/dev/sms` |
| 4 | Prendre 3 rendez-vous puis tenter un 4e | Message de limite atteinte |
| 5 | Annuler un rendez-vous | Le créneau redevient libre |
| 6 | Essayer d'annuler un rendez-vous de démonstration prévu dans moins de 2 h | Bouton remplacé par « Appeler l'établissement » |

**Condition de passage.** Test de concurrence vert + vérifications OK.

> [!TIP] Consigne pour Claude Code — E13
> « Réalise uniquement l'étape E13. Lis CLAUDE.md, PROGRESS.md et specs/09-fiches-etablissements-rdv.md (9.1, F-ETA-01, F-ETA-02, F-RDV-01, F-RDV-02). Commence par la machine à états et le test de concurrence. Plan, réalisation, rapport E13, arrêt. »

## E14 — Accueil : file du jour, arrivée, contexte de soins

**Objectif.** L'accueil gère la journée et ouvre le contexte de soins qui autorise les soignants.

**À lire.** F-RDV-03 à F-RDV-06, F-CLI-03 ; section 5.4 (B4) ; RG-ACC-20 à 23, RG-ACC-40.

**Tâches dans l'ordre.** (1) Tables `visits`, `care_contexts`, `health_card_tokens` (si pas faites). (2) Base `CARE_CONTEXT` dans `authorize()` + tests. (3) File du jour (colonnes, compteurs, rafraîchissement 30 s). (4) Arrivée avec les trois moyens de vérification, question de partage complet. (5) Arrivée sans rendez-vous et création de dossier avec contrôle de doublons obligatoire (jeton RG-CLI-20). (6) Confirmation/refus des demandes ; expiration (tâche). (7) Absences et clôture automatiques (tâche 23 h). (8) (P1) Rendez-vous au guichet. (9) Tests, dont : l'accueil ne reçoit **aucune** donnée clinique sur **toutes** les routes.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Citoyen : ouvrir sa carte santé ; Accueil : « Enregistrer une arrivée » → scanner (ou copier le lien de test du QR fourni dans le rapport) | Le patient passe dans « Arrivés » |
| 2 | Accueil : patient sans rendez-vous et sans compte → créer un dossier « KOSSOU Jean » avec la date de naissance d'un patient de démonstration existant | Le candidat doublon est proposé |
| 3 | Accueil : vérification par SMS (code lu dans `/dev/sms`) | Arrivée enregistrée |
| 4 | Accueil : tenter d'ouvrir le dossier médical du patient | Impossible (aucun lien, API refusée) |
| 5 | Scanner une deuxième fois le même QR | « Code déjà utilisé ou expiré » |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E14
> « Réalise uniquement l'étape E14. Lis CLAUDE.md, PROGRESS.md, specs/09-fiches-etablissements-rdv.md (F-RDV-03 à F-RDV-06), specs/10-fiches-clinique.md (F-CLI-03) et specs/05-acces-consentement.md (5.4 B4, 5.5). Plan, réalisation, rapport E14, arrêt. »

## E15 — Espace soignant : tableau de bord, recherche, résumé, historique

**Objectif.** Le médecin et l'infirmier retrouvent leurs patients autorisés et lisent le résumé et l'historique.

**À lire.** F-CLI-01, F-CLI-02, F-CLI-04, F-CLI-09 ; RG-ACC-03, RG-ACC-05.

**Tâches dans l'ordre.** (1) Bandeau patient (composant commun). (2) Tableau de bord pro. (3) Recherche (4 modes), réponses identiques patient inexistant / non accessible, demande d'accès. (4) Résumé filtré côté serveur (RG-CLI-30). (5) Historique paginé avec panneau de détail et audit individuel. (6) Tests, dont : réponse API sans consultation pour une base `SUMMARY` ; patient d'un autre établissement invisible.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Médecin : tableau de bord | Le patient arrivé en E14 apparaît dans « Patients du jour » |
| 2 | Ouvrir le patient | Bandeau avec allergie en rouge, résumé dans l'ordre prévu |
| 3 | Rechercher un patient existant sans lien avec l'établissement (téléphone + date de naissance de démonstration) | « Aucun patient accessible ne correspond » |
| 4 | Infirmier : ouvrir un patient de démonstration ayant une consultation sensible | La consultation sensible n'apparaît pas |
| 5 | Citoyen : « Qui a consulté mon dossier » | La consultation du médecin est tracée |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E15
> « Réalise uniquement l'étape E15. Lis CLAUDE.md, PROGRESS.md et specs/10-fiches-clinique.md (introduction, F-CLI-01, 02, 04, 09). Plan, réalisation, rapport E15, arrêt. »

## E16 — Consultation médicale

**Objectif.** Le médecin documente une consultation complète (brouillon enregistré automatiquement, constantes contrôlées, diagnostic CIM-10), la valide et la rend immuable.

**À lire.** Chapitre 10 : 10.1, F-CLI-05 à F-CLI-08, F-CLI-11, F-CLI-12 ; 18.6, 18.7.

**Tâches dans l'ordre.** (1) Machine à états et déclencheur d'immuabilité en base (**tests d'abord**). (2) Règles des constantes (plages acceptées et d'alerte, pédiatriques) en `rules.ts` avec tests exhaustifs. (3) Démarrage (un seul brouillon, RG-CLI-40). (4) Écran en trois zones, enregistrement automatique (10 s), brouillon local chiffré si coupure réseau. (5) Diagnostic CIM-10 (recherche, sensible automatique). (6) Validation avec contrôles, récapitulatif, empreinte, notification au patient. (7) (P1) Addendum et retrait. (8) (P1) Constantes par l'infirmier et note de soins. (9) (P1) Vaccination. (10) Tests E2E du parcours complet.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Médecin : démarrer une consultation pour le patient arrivé | Écran en 3 zones ; « Enregistré à … » s'actualise |
| 2 | Saisir une température de 50 °C | Refus « Valeur impossible » |
| 3 | Saisir 39,2 °C | Acceptée, en orange, avec confirmation |
| 4 | Couper le réseau (mode hors ligne du navigateur), écrire, remettre le réseau | « Hors connexion — enregistré sur cet appareil » puis envoi automatique |
| 5 | Valider sans diagnostic | Liste des sections manquantes |
| 6 | Choisir B50.9 (paludisme), écrire la conclusion, valider | Consultation verrouillée |
| 7 | Citoyen : ouvrir son dossier | La consultation apparaît, **sans** les observations réservées |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E16
> « Réalise uniquement l'étape E16. Lis CLAUDE.md, PROGRESS.md, specs/10-fiches-clinique.md (10.1, F-CLI-05 à F-CLI-08, F-CLI-11, F-CLI-12) et specs/18-regles-transverses.md (18.6, 18.7). Commence par l'immuabilité en base et les règles des constantes avec leurs tests. Plan, réalisation, rapport E16, arrêt. »

## E17 — Ordonnance électronique

**Objectif.** Le médecin crée une ordonnance structurée et contrôlée, la signe ; le patient la voit ; son QR est vérifiable.

**À lire.** Chapitre 11 : 11.1, F-PRE-01 à F-PRE-06 ; F-CIT-06.

**Tâches dans l'ordre.** (1) Tables, machine à états, immuabilité (**tests d'abord**). (2) Règles de calcul de quantité et de phrase lisible (tests). (3) Contrôles de sécurité (allergie par DCI et classe, doublons, âge, grossesse) (tests). (4) Écran d'ordonnance dans la consultation. (5) Signature (ré-authentification, numéro, validité, empreinte, jeton). (6) PDF et QR ; page publique de vérification. (7) Affichage côté citoyen. (8) (P1) Annulation, arrêt, renouvellement.

**Ce que vous devez tester.**

| # | Action | Résultat attendu |
|---|---|---|
| 1 | Médecin : prescrire « Amoxicilline 500 mg » au patient allergique à la pénicilline | Alerte **bloquante** |
| 2 | Retirer la ligne ; prescrire « Artéméther-luméfantrine » 1 cp 2 fois/jour 3 jours | Phrase lisible et quantité calculées correctement |
| 3 | Signer ; saisir le code de sécurité | Numéro RX attribué ; PDF téléchargeable |
| 4 | Essayer de modifier la ligne | Refus « ordonnance signée » |
| 5 | Scanner le QR du PDF avec un téléphone (ou ouvrir le lien) sans être connecté | Page « Ordonnance authentique », sans médicament ni patient |
| 6 | Citoyen : « Mes ordonnances » | L'ordonnance est « Valable jusqu'au … » |

**Condition de passage.** Tests verts + vérifications OK.

> [!TIP] Consigne pour Claude Code — E17
> « Réalise uniquement l'étape E17. Lis CLAUDE.md, PROGRESS.md et specs/11-fiches-prescription-pharmacie.md (11.1, F-PRE-01 à F-PRE-06). Commence par les règles pures et leurs tests. Plan, réalisation, rapport E17, arrêt. »

## E18 — Pharmacie (P1)

**Objectif.** Le pharmacien retrouve une ordonnance présentée et enregistre une délivrance totale ou partielle, sans dépassement possible.

**À lire.** F-PHA-01 à F-PHA-04 ; base `ASSIGNMENT` (5.4 B6).

**Tâches dans l'ordre.** (1) Base `ASSIGNMENT` pharmacie dans `authorize()`. (2) Recherche par QR ou numéro + année de naissance (limites). (3) Écran de délivrance (quantités, substitution, raisons). (4) Transaction avec verrou + test de concurrence. (5) Annulation sous 24 h. (6) Historique. (7) Notifications au patient.

**Ce que vous devez tester.** (1) Pharmacien : scanner le QR de l'ordonnance de E17 → lignes et allergies affichées, **pas** le diagnostic. (2) Délivrer 3 jours sur 3 pour une ligne et 0 pour une autre avec « rupture de stock » → statut « délivrée en partie », le citoyen le voit. (3) Tenter de délivrer plus que le reste → refus. (4) Saisir le numéro avec une mauvaise année de naissance → « introuvable ».

> [!TIP] Consigne pour Claude Code — E18
> « Réalise uniquement l'étape E18. Lis CLAUDE.md, PROGRESS.md, specs/11-fiches-prescription-pharmacie.md (F-PHA-01 à F-PHA-04) et specs/05-acces-consentement.md (5.4 B6). Plan, réalisation, rapport E18, arrêt. »

## E19 — Laboratoire (P1)

**Objectif.** Du bon d'examen au résultat validé, avec annonce obligatoire pour les résultats sensibles.

**À lire.** Chapitre 12 en entier.

**Tâches dans l'ordre.** (1) Tables, machine à états (tests). (2) Demande depuis la consultation. (3) File du laboratoire, prise en charge par code, prélèvement, rejet. (4) Saisie des résultats avec valeurs de référence et indicateurs (tests). (5) Validation quatre yeux. (6) Mise à disposition et annonce. (7) Notifications.

**Ce que vous devez tester.** (1) Médecin : demander NFS + goutte épaisse « au choix du patient ». (2) Technicien : prendre en charge avec le code et l'année de naissance, enregistrer le prélèvement, saisir les résultats (une hémoglobine basse → « L »). (3) Technicien : tenter de valider → refus. (4) Responsable : valider → le médecin et le patient sont notifiés. (5) Refaire avec une sérologie VIH → le patient voit seulement « Un résultat vous sera communiqué par votre médecin » jusqu'à ce que le médecin clique « Résultat annoncé ».

> [!TIP] Consigne pour Claude Code — E19
> « Réalise uniquement l'étape E19. Lis CLAUDE.md, PROGRESS.md et specs/12-fiches-laboratoire.md en entier. Plan, réalisation, rapport E19, arrêt. »

## E20 — Documents médicaux (P1)

**Objectif.** Ajouter et consulter des documents de façon sécurisée.

**À lire.** F-CLI-13, F-CIT-06 (RG-CIT-50), 23.4.

**Tâches.** (1) Module `files` : URL signée d'envoi, vérification du type réel, suppression des métadonnées d'image, taille. (2) Ajout d'un document par un soignant. (3) Téléchargement par URL signée de 60 s après `authorize()`, journalisé. (4) Retrait « ajouté par erreur ».

**Ce que vous devez tester.** (1) Envoyer un PDF de compte rendu → visible par le citoyen. (2) Renommer un fichier `.exe` en `.pdf` et l'envoyer → refus. (3) Copier le lien de téléchargement, attendre 2 minutes, le rouvrir → refus.

> [!TIP] Consigne pour Claude Code — E20
> « Réalise uniquement l'étape E20. Lis CLAUDE.md, PROGRESS.md, specs/10-fiches-clinique.md (F-CLI-13), specs/08-fiches-citoyen.md (F-CIT-06) et specs/23-securite-conformite.md (23.4). Plan, réalisation, rapport E20, arrêt. »

## E21 — Accès d'urgence et revue (P1)

**Objectif.** Soigner un patient qui ne peut pas consentir, avec contrôle a posteriori.

**À lire.** F-CLI-10, F-AUD-02, base `EMERGENCY` (5.4 B5).

**Tâches.** (1) Base `EMERGENCY` (4 h, sans sensible, limite 5/24 h). (2) Écran d'accès d'urgence avec ré-authentification. (3) Bandeau rouge. (4) Notifications (patient, responsable, auditeur). (5) Écrans de revue (auditeur, responsable).

**Ce que vous devez tester.** (1) Médecin : patient introuvable → accès d'urgence avec justification trop courte → refus ; avec justification correcte → accès et bandeau rouge. (2) Citoyen : l'accès apparaît en rouge avec la justification et un SMS a été reçu. (3) Auditeur : revoir et marquer « Conforme ».

> [!TIP] Consigne pour Claude Code — E21
> « Réalise uniquement l'étape E21. Lis CLAUDE.md, PROGRESS.md, specs/10-fiches-clinique.md (F-CLI-10), specs/15-fiches-administration-audit.md (F-AUD-02) et specs/05-acces-consentement.md (5.4 B5). Plan, réalisation, rapport E21, arrêt. »

## E22 — Application terrain hors ligne (P1)

**Objectif.** L'agent communautaire travaille sans réseau et synchronise sans doublon.

**À lire.** Chapitre 13 en entier.

**Tâches dans l'ordre.** (1) PWA complète (Serwist, manifeste, installation, cache des ressources). (2) Stockage local Dexie chiffré par PIN (RG-OFF-01) — **tests des fonctions de chiffrement d'abord**. (3) Préparation de l'appareil et instantané de l'aire. (4) Enregistrement d'une personne, visite avec signes de danger et référence, vaccination de terrain. (5) Synchronisation idempotente par lots, statuts par saisie, contrôle d'horloge. (6) Tests E2E en mode hors ligne (Playwright `setOffline`).

**Ce que vous devez tester (sur un vrai téléphone si possible).** (1) Installer l'application sur l'écran d'accueil. (2) Définir le PIN, télécharger l'aire. (3) Passer en mode avion ; enregistrer une personne et une visite avec un signe de danger → message « Référer immédiatement ». (4) Réactiver le réseau → synchronisation automatique, 2 saisies acceptées. (5) Au centre de santé (compte médecin ou infirmier), la référence communautaire est visible dans « À traiter ».

> [!TIP] Consigne pour Claude Code — E22
> « Réalise uniquement l'étape E22. Lis CLAUDE.md, PROGRESS.md et specs/13-fiches-communautaire-hors-ligne.md en entier. Commence par le chiffrement local et ses tests. Plan, réalisation, rapport E22, arrêt. »

## E23 — Notifications et rappels

**Objectif.** Toutes les notifications du catalogue sont envoyées au bon moment, par le bon canal, sans donnée médicale dans les SMS.

**À lire.** Chapitre 17 en entier ; F-RDV-07.

**Tâches.** (1) Catalogue complet (codes, modèles dans `fr.json`). (2) Envoi via la file après transaction, 3 tentatives, statut `FAILED`. (3) Plage de silence 21 h–7 h. (4) Centre de notifications par espace. (5) Préférences (P1). (6) Rappels de rendez-vous (veille 18 h, H-2) et leur annulation. (7) Test automatique : aucun modèle de SMS ne contient un champ clinique ; longueur ≤ 160.

**Ce que vous devez tester.** (1) Prendre un rendez-vous pour demain → le rappel est programmé (visible dans `/dev/sms` avec « envoi prévu à 18:00 »). (2) Annuler → le rappel disparaît. (3) Ouvrir la cloche dans l'espace citoyen puis dans l'espace médecin (même personne ayant les deux) → notifications différentes. (4) Lire tous les SMS de `/dev/sms` → aucun nom de médicament, examen ou diagnostic.

> [!TIP] Consigne pour Claude Code — E23
> « Réalise uniquement l'étape E23. Lis CLAUDE.md, PROGRESS.md, specs/17-fiches-notifications.md en entier et specs/09-fiches-etablissements-rdv.md (F-RDV-07). Plan, réalisation, rapport E23, arrêt. »

## E24 — Agrégats et tableaux de bord de pilotage

**Objectif.** Le responsable d'établissement et le ministère voient des indicateurs fiables, agrégés, masqués, filtrables, sur carte.

**À lire.** Chapitre 14 en entier ; 21.12 ; règles des graphiques et de la carte (chapitre 19, section 19.4).

**Tâches dans l'ordre.** (1) Tables `analytics`, rôle `analytics_reader` (test RG-PIL-04). (2) Calcul des agrégats par jour et établissement, idempotent, déclenché par événements + recalcul nocturne (tests : une consultation retirée disparaît). (3) Règles de masquage (1–4 → « < 5 », masquage complémentaire, dénominateur < 20) en `rules.ts` avec tests. (4) API d'indicateurs avec portée géographique. (5) Tableau de bord établissement. (6) Centre national : filtres dans l'URL, 6 indicateurs avec variation, top diagnostics, évolution, carte choroplèthe. (7) (P1) Tendances, exports avec motif, alertes. (8) Test automatique : aucune réponse `/analytics` ne contient d'identifiant patient.

**Ce que vous devez tester.** (1) Autorité nationale : ouvrir `/pilotage` → indicateurs avec « mise à jour : … ». (2) Cliquer sur un département de la carte → tout se filtre. (3) Choisir une commune avec peu de cas → valeurs « < 5 ». (4) Autorité départementale (compte de démonstration) → impossible de sélectionner un autre département. (5) Valider une nouvelle consultation (compte médecin), lancer la commande de recalcul fournie → le compteur augmente. (6) (P1) Exporter un PDF → motif demandé.

> [!TIP] Consigne pour Claude Code — E24
> « Réalise uniquement l'étape E24. Lis CLAUDE.md, PROGRESS.md, specs/14-fiches-pilotage.md en entier et specs/21-modele-donnees.md (21.12). Commence par les règles de masquage et le calcul idempotent, avec leurs tests. Plan, réalisation, rapport E24, arrêt. »

## E25 — Résumé IA pour le médecin (P1)

**Objectif.** Un résumé sourcé, minimisé, désactivable, sur données fictives.

**À lire.** Chapitre 16 en entier.

**Tâches.** (1) Adaptateur de fournisseur + `FakeProvider`. (2) Assemblage des données autorisées, minimisation (tests : aucun nom, téléphone, identifiant, aucune donnée sensible). (3) Consigne système versionnée. (4) Validation des puces (sources, nombres) avec tests. (5) Panneau d'affichage avec liens vers les sources, mention obligatoire. (6) Journal `ai_requests`, retour « utile/inexact ». (7) Jeu d'évaluation de 20 dossiers fictifs dans la CI.

**Ce que vous devez tester.** (1) Fonctionnalité désactivée → le bouton n'apparaît pas. (2) Activer (admin) → générer un résumé → chaque puce a un lien qui ouvre la bonne source. (3) Patient avec consultation sensible → non mentionnée. (4) Mention « Généré automatiquement — à vérifier » visible.

> [!TIP] Consigne pour Claude Code — E25
> « Réalise uniquement l'étape E25. Lis CLAUDE.md, PROGRESS.md et specs/16-fiches-ia.md en entier. Utilise le FakeProvider par défaut. Plan, réalisation, rapport E25, arrêt. »

## E26 — Documentation d'API et façade FHIR (P1)

**Objectif.** L'API est documentée et une façade FHIR R4 en lecture démontre l'interopérabilité.

**À lire.** Chapitre 22 en entier.

**Tâches.** (1) Génération OpenAPI depuis Zod ; `/api/docs` restreint ; `x-permission` sur chaque route. (2) Vérification que toutes les routes du tableau 22.4 existent et sont documentées (test). (3) Façade FHIR en lecture de **toutes les ressources du tableau 22.5** avec les mêmes contrôles d'accès. (4) Validation des ressources contre le schéma FHIR R4 (test).

**Ce que vous devez tester.** (1) Ouvrir `/api/docs` → routes classées par module, avec permissions. (2) Médecin connecté : ouvrir `/fhir/r4/Patient/{id}` d'un patient autorisé → ressource JSON FHIR ; d'un patient non autorisé → 404.

> [!TIP] Consigne pour Claude Code — E26
> « Réalise uniquement l'étape E26. Lis CLAUDE.md, PROGRESS.md et specs/22-api-interoperabilite.md en entier. Plan, réalisation, rapport E26, arrêt. »

## E27 — Durcissement sécurité, écrans d'audit, droits des personnes

**Objectif.** Toutes les protections du chapitre 23 sont en place et vérifiées ; l'auditeur dispose de ses outils.

**À lire.** Chapitre 23 ; F-AUTH-08, F-AUTH-09 ; F-AUD-01, F-AUD-03, F-AUD-04 ; F-CIT-13 ; F-ADM-06.

**Tâches.** (1) En-têtes de sécurité et CSP (tests). (2) Limitations de débit de 22.3 (tests). (3) Verrouillage d'écran et gestion des sessions. (4) Écrans d'audit : journal, intégrité, anomalies, demandes. (5) Droits des personnes (export d'archive, rectification, fermeture). (6) (P1) Fusion de doublons réversible. (7) Revue de sécurité par Claude Code avec la checklist 23.5 : **rapport listant chaque ligne et la preuve** (fichier, test). (8) Test automatique : les pages `/dev/*` renvoient 404 quand `APP_ENV=production`.

**Ce que vous devez tester.** (1) Laisser un espace médecin inactif 10 minutes → écran verrouillé, aucune donnée visible dans l'inspecteur. (2) Auditeur : rechercher les accès à un patient sur 7 jours → liste complète ; lancer la vérification d'intégrité → « intègre ». (3) Citoyen : demander la copie de ses données → archive téléchargeable après ré-authentification. (4) Lancer l'application avec `APP_ENV=production` en local → `/dev/sms` introuvable.

> [!TIP] Consigne pour Claude Code — E27
> « Réalise uniquement l'étape E27. Lis CLAUDE.md, PROGRESS.md, specs/23-securite-conformite.md en entier, puis les fiches F-AUTH-08, F-AUTH-09, F-AUD-01, F-AUD-03, F-AUD-04, F-CIT-13, F-ADM-06. Termine par une revue de sécurité ligne par ligne du tableau 23.5 avec preuves. Plan, réalisation, rapport E27, arrêt. »

## E28 — Performance, accessibilité, responsive, charge

**Objectif.** Atteindre les cibles du chapitre 24.

**Tâches.** (1) Mesures Lighthouse (mobile, Slow 4G) des 10 écrans principaux, avant/après. (2) Optimisations (taille des paquets, images, requêtes N+1, index manquants avec `EXPLAIN ANALYZE`). (3) Audit axe de tous les écrans principaux et corrections. (4) Tests Playwright à 360, 768 et 1 280 px. (5) Test de charge k6 (200 utilisateurs) sur la recherche d'établissements, la prise de rendez-vous et l'ouverture du résumé. (6) Rapport chiffré.

**Ce que vous devez tester.** (1) Parcourir l'application sur votre téléphone réel pendant 10 minutes (citoyen puis médecin) → aucune lenteur gênante, aucun débordement. (2) Relire le tableau des mesures du rapport → toutes les cibles du chapitre 24 sont atteintes ou expliquées.

> [!TIP] Consigne pour Claude Code — E28
> « Réalise uniquement l'étape E28. Lis CLAUDE.md, PROGRESS.md, specs/24-exigences-non-fonctionnelles.md et specs/19-ux-design-system.md (19.1, 19.5). Mesure avant d'optimiser et donne les chiffres avant/après. Plan, réalisation, rapport E28, arrêt. »

## E29 — Données de démonstration, déploiement staging, sauvegardes

**Objectif.** Une version en ligne, stable, avec des données de démonstration réalistes et une sauvegarde restaurée avec succès.

**À lire.** Chapitres 27 et 28.

**Tâches.** (1) Jeu de démonstration complet (chapitre 28) : 300 patients fictifs, 6 mois d'activité simulée, pour des tableaux de bord crédibles. (2) Dockerfile de production, configuration du serveur staging, HTTPS, variables. (3) Pipeline de déploiement (fusion sur `main` → déploiement staging ; migrations contrôlées ; retour arrière documenté). (4) Sauvegardes automatiques chiffrées + **test de restauration** documenté. (5) Supervision minimale (disponibilité, erreurs). (6) Bandeau « Données fictives ».

**Ce que vous devez tester.** (1) Ouvrir l'adresse de staging sur votre téléphone → HTTPS, bandeau « Données fictives ». (2) Dérouler le scénario de démonstration (chapitre 28) de bout en bout. (3) Relire le compte rendu du test de restauration (durée, résultat).

> [!TIP] Consigne pour Claude Code — E29
> « Réalise uniquement l'étape E29. Lis CLAUDE.md, PROGRESS.md, specs/27-deploiement-exploitation.md et specs/28-donnees-demo-presentation.md. Aucune donnée réelle. Plan, réalisation, rapport E29, arrêt. »

## E30 — Recette complète, documentation, répétition de la démonstration

**Objectif.** Tout est vérifié, documenté et prêt pour la présentation au ministère.

**Tâches.** (1) Exécuter la grille de recette complète (chapitre 26) et la remplir. (2) Corriger les anomalies bloquantes et majeures. (3) Finaliser les livrables de documentation (V1, Partie 10 §14) : README, architecture, API, installation, contribution, déploiement, sécurité, guides utilisateurs par rôle (1 page chacun, avec captures). (4) Checklists V1 « avant démonstration » et « présentation ministère » (chapitre 28). (5) Répétition chronométrée de la démonstration.

**Ce que vous devez tester.** Toute la grille de recette du chapitre 26, puis deux répétitions complètes de la démonstration.

> [!TIP] Consigne pour Claude Code — E30
> « Réalise uniquement l'étape E30. Lis CLAUDE.md, PROGRESS.md, specs/26-tests-recette.md et specs/28-donnees-demo-presentation.md. Prépare la grille de recette à remplir, corrige uniquement les anomalies que je te signale, finalise la documentation. Rapport E30, arrêt. »
