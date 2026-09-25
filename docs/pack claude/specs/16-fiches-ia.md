# 16. Fiches fonctionnelles — Intelligence artificielle

## 16.1 Cadre d'utilisation (règles non négociables)

La V1 pose le principe : **l'IA assiste, elle ne remplace pas le professionnel** et ne doit jamais établir seule un diagnostic ni prendre une décision clinique. Ce principe est traduit en règles vérifiables.

- **RG-IA-01** — L'IA NE DOIT JAMAIS : poser un diagnostic, proposer un traitement ou une posologie, modifier une donnée du dossier, valider quoi que ce soit, envoyer un message à un patient.
- **RG-IA-02** — Toute fonctionnalité d'IA est derrière une **fonctionnalité activable** (F-ADM-07), **désactivée par défaut** en production, et doit pouvoir être coupée instantanément.
- **RG-IA-03** — Tant que l'autorité de protection des données (APDP) n'a pas autorisé le traitement et qu'un contrat de sous-traitance conforme n'est pas signé avec le fournisseur du modèle, l'IA NE DOIT être utilisée **que sur des données fictives** (environnements de développement, staging et démonstration). Un bandeau « Données fictives » est affiché.
- **RG-IA-04** — **Minimisation** : le texte envoyé au modèle NE DOIT PAS contenir le nom, les prénoms, le téléphone, l'adresse, l'identifiant santé, ni le NPI. Le patient est désigné « le patient » avec son âge et son sexe ; les professionnels et établissements par leur fonction (« médecin généraliste, centre de santé »).
- **RG-IA-05** — Les données `SENSITIVE` NE DOIVENT JAMAIS être envoyées au modèle.
- **RG-IA-06** — Chaque affirmation produite DOIT citer sa **source** (identifiant de l'élément du dossier) ; une affirmation sans source valide est supprimée avant affichage.
- **RG-IA-07** — Tout contenu produit par l'IA DOIT être affiché avec la mention « Généré automatiquement — à vérifier par le professionnel » et un style visuel distinct ; il N'EST PAS enregistré dans le dossier du patient.
- **RG-IA-08** — Chaque appel est journalisé (qui, pour quel patient, quand, quel modèle, combien de sources, durée, retour de l'utilisateur) **sans** stocker le texte envoyé ni la réponse au-delà de 30 jours.

## 16.2 Architecture de l'IA

Le code n'appelle jamais un fournisseur directement : il passe par un **adaptateur** (`src/modules/ai/provider.ts`) avec une interface unique `generate({ system, input, maxTokens })`. Le fournisseur (par exemple un modèle de langage accessible par API, comme Claude d'Anthropic) est choisi par configuration. Un fournisseur **factice** (`FakeProvider`) renvoie des réponses prédéfinies pour les tests automatisés et la démonstration hors ligne.

### F-IA-01 — Résumé de dossier pour le médecin

| Élément | Valeur |
|---|---|
| Rôles | `DOCTOR` (avec base d'accès `FULL` sur le patient) |
| Priorité / étape | P1 / E25 |
| Écrans | Panneau latéral « Résumé IA » dans `/pro/patients/[id]` |
| API | `POST /api/v1/patients/{id}/ai-summary` |

**Déroulé pas à pas.**

1. Le médecin ouvre le panneau et touche « Générer un résumé ».
2. Le serveur vérifie : fonctionnalité activée, base d'accès `FULL`, limite d'usage (**30 résumés par heure** et par médecin).
3. Il assemble les **données autorisées** des 24 derniers mois : diagnostics (codes et libellés), traitements (DCI, durée), résultats anormaux (paramètre, valeur, indicateur), vaccinations, allergies, constantes marquantes ; chaque élément reçoit une étiquette courte `[S1]`, `[S2]`… ; il retire les champs interdits (RG-IA-04, RG-IA-05).
4. Il envoie au modèle une consigne système fixe (versionnée dans le code) : résumer en français, en 8 puces maximum, **uniquement à partir des éléments fournis**, en citant les étiquettes, sans proposer de diagnostic ni de traitement, en signalant les informations manquantes importantes (ex. « pas de mesure de tension depuis 14 mois »).
5. Il **valide la réponse** : chaque puce doit citer au moins une étiquette existante ; les nombres cités doivent apparaître dans la source citée ; les puces non conformes sont retirées ; si moins de 2 puces restent, il affiche « Résumé indisponible, consultez l'historique ».
6. Il affiche le résumé avec des **liens** : chaque étiquette ouvre l'élément source dans la chronologie.
7. Le médecin peut noter le résumé (« utile » / « inexact » + commentaire) ; la note est journalisée pour l'évaluation.

**Critères d'acceptation.** CA-1 : sur le jeu de 20 dossiers fictifs d'évaluation, aucune affirmation sans source n'est affichée. CA-2 : le texte envoyé au modèle ne contient ni nom, ni téléphone, ni identifiant santé (test automatique sur les requêtes interceptées). CA-3 : un dossier avec une consultation sensible produit un résumé qui ne la mentionne pas.

### F-IA-02 — Assistant citoyen d'orientation (P2)

Répond à des questions **administratives et d'orientation** (« comment prendre rendez-vous ? », « où se faire vacciner à Bohicon ? », « que signifie “délivrée en partie” ? ») à partir d'une **base de connaissances validée** (FAQ, fiches des établissements). Toute question de symptôme reçoit une réponse fixe : « Je ne peux pas donner d'avis médical. En cas d'urgence, appelez le [numéro d'urgence] ou rendez-vous au centre de santé le plus proche », avec le bouton « Trouver un établissement ». N'accède pas au dossier du patient.

### F-IA-03 — Aide à la saisie (P2)

Dictée vocale de l'histoire de la maladie et proposition de **mise en forme** (le médecin relit et accepte ligne par ligne). Suggestion de codes CIM-10 à partir du texte saisi, **jamais sélectionnés automatiquement**.

### F-IA-04 — Analyses pour le ministère (P2)

Détection de tendances et de valeurs atypiques **sur les tables agrégées uniquement** (jamais sur les données individuelles), avec explication du calcul. Complète F-PIL-06.

### F-IA-05 — Gouvernance de l'IA

| Élément | Valeur |
|---|---|
| Rôles | `PLATFORM_ADMIN`, `AUDITOR` |
| Priorité / étape | P1 / E25 |

**Contenu.** Fiche de chaque fonctionnalité d'IA (objectif, données utilisées, modèle et version, consigne système et sa version, limites connues, date d'évaluation) ; tableau de suivi (nombre d'appels, taux de résumés « inexacts », taux de puces supprimées par la validation, temps de réponse) ; bouton de désactivation ; **jeu d'évaluation** de 20 dossiers fictifs avec les faits attendus, rejoué à chaque changement de modèle ou de consigne (test automatisé dans la CI). **RG-IA-20** — Un changement de modèle ou de consigne NE DOIT PAS être déployé si le jeu d'évaluation révèle une affirmation sans source ou une fuite de donnée interdite.
