# 0. Guide de lecture et d'utilisation

## 0.1 Ce que contient ce document

Ce cahier des charges est la **version 2.0 enrichie** du document « Bénin Health Intelligence Platform — Cahier des charges complet » (77 pages). Tout le contenu d'origine est conservé. Il a été réorganisé dans un ordre logique, corrigé là où il était ambigu ou contradictoire, et complété pour qu'un développeur débutant, aidé par Claude Code, puisse construire la plateforme **sans avoir à deviner**.

Le document répond à quatre questions, dans cet ordre :

1. **Quoi ?** Quelles fonctionnalités, pour quels utilisateurs (chapitres 1 à 6).
2. **Comment exactement ?** Chaque fonctionnalité fait l'objet d'une fiche détaillée : déroulé pas à pas, règles strictes, données, erreurs, critères d'acceptation (chapitres 7 à 18).
3. **Avec quoi ?** Design, architecture, base de données, API, sécurité (chapitres 19 à 24).
4. **Dans quel ordre ?** Plan de construction en 31 étapes (E00 à E30), chacune avec sa consigne pour Claude Code et sa condition de passage (chapitre 25), puis tests, déploiement et démonstration (chapitres 26 à 29).

## 0.2 Conventions d'écriture

| Repère | Signification |
|---|---|
| **DOIT** | Obligation absolue. Si ce n'est pas respecté, la fonctionnalité est considérée comme non conforme. |
| **NE DOIT PAS** | Interdiction absolue. |
| **DEVRAIT** | Recommandation forte ; on ne s'en écarte que pour une raison écrite dans le journal de décisions. |
| **PEUT** | Option laissée au choix. |
| **P0** | Priorité critique : indispensable au MVP et à la démonstration. |
| **P1** | Priorité importante : à réaliser après les P0, avant la démonstration si le temps le permet. |
| **P2** | Priorité future : décrite pour préparer l'architecture, **à ne pas développer** dans le MVP. |
| **F-XXX-00** | Identifiant d'une fiche fonctionnalité (ex. `F-CLI-03`). |
| **RG-XXX-00** | Identifiant d'une règle de gestion stricte (ex. `RG-PRE-05`). |
| **CA-00** | Critère d'acceptation : condition vérifiable qui dit quand la fonctionnalité est terminée. |
| **E00** | Étape du plan de construction (chapitre 25). |
| **[DÉCISION]** | Choix fait par cette revue pour lever une ambiguïté de la V1 ; à confirmer par le porteur du projet. |

> [!NOTE] Les trois mots qui comptent
> Un **rôle** dit *qui* est l'utilisateur (médecin, pharmacien…). Une **permission** dit *quelle action* il peut faire (lire un résumé, signer une ordonnance…). Une **base d'accès** dit *pourquoi il a le droit de le faire pour ce patient précis* (consentement, contexte de soins, urgence…). Les trois sont vérifiés à **chaque** requête (chapitre 5).

## 0.3 Comment travailler avec Claude Code

Claude Code est un assistant de programmation très efficace, mais il a tendance à vouloir tout construire d'un coup si on le laisse faire. Sur un projet de santé, c'est dangereux : une règle de sécurité oubliée au début se paie très cher ensuite. La méthode suivante est **obligatoire** :

1. Copiez le dossier `specs/` et le fichier `CLAUDE.md` fournis avec ce document à la racine de votre dépôt Git. Claude Code lit automatiquement `CLAUDE.md` à chaque session.
2. Travaillez **une étape à la fois**, dans l'ordre du chapitre 25. Chaque étape contient une consigne prête à copier-coller.
3. Au début de chaque étape, demandez à Claude Code de **lire les fiches citées** et de vous **proposer un plan** avant d'écrire du code (mode « plan »). Relisez le plan.
4. Laissez-le coder, puis exécutez vous-même les **tests et vérifications** de la condition de passage.
5. Faites un commit, fusionnez la branche, cochez l'étape. **Ne passez pas à l'étape suivante tant que la condition de passage n'est pas remplie.**
6. Si Claude Code propose de modifier une règle (« RG ») pour simplifier, refusez : les règles se changent dans ce document, pas dans le code.

> [!TIP] Une phrase à répéter à Claude Code
> « Implémente uniquement l'étape EXX. Ne touche pas aux fonctionnalités des étapes suivantes. Respecte les règles RG citées. Écris les tests des critères d'acceptation. Arrête-toi et liste ce qui reste ambigu. »

## 0.4 Historique des versions

| Version | Date | Auteur | Modifications |
|---|---|---|---|
| 1.0 | 2026 | Porteur du projet | Document initial en 13 parties (vision, rôles, modules, UX, architecture, données, sécurité, IA, MVP, spécifications développeur, gestion de projet, déploiement, annexes). |
| 2.0 | Septembre 2026 | Revue professionnelle | Réorganisation logique ; analyse critique (26 constats) et décisions ; 12 rôles détaillés ; modèle d'accès et de consentement ; 90+ fiches fonctionnalités avec règles strictes et critères d'acceptation ; modèle de données complet ; catalogue d'API ; sécurité et conformité béninoise ; indicateurs du ministère ; plan de construction en 31 étapes ordonnées pour Claude Code ; tests, démonstration, risques. |

## 0.5 Correspondance avec le document d'origine

| Partie d'origine (V1) | Où la retrouver dans la V2 |
|---|---|
| Résumé exécutif, Partie 1 (vision) | Chapitre 1 |
| Partie 2 — Utilisateurs, rôles et parcours | Chapitres 4, 5 et 6 |
| Partie 3 — Modules fonctionnels | Chapitres 7 à 17 (une fiche par fonctionnalité) |
| Partie 4 — UX/UI et écrans | Chapitre 19 et rubrique « Écrans » de chaque rôle (chapitre 4) |
| Partie 5 — Architecture technique | Chapitre 20 |
| Partie 6 — Modèle de données | Chapitre 21 |
| Partie 7 — Sécurité et gouvernance | Chapitres 5 et 23 |
| Partie 8 — IA et interopérabilité | Chapitres 16 et 22 |
| Partie 9 — MVP et roadmap | Chapitres 3, 25 et 28 |
| Partie 10 — Spécifications développeur | Chapitres 20, 22 et 25 |
| Partie 11 — Gestion du projet | Chapitre 25 |
| Partie 12 — Déploiement et exploitation | Chapitre 27 |
| Partie 13 — Annexes et validation | Chapitres 26, 28 et 29 |
