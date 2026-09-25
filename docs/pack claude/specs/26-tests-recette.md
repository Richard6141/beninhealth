# 26. Stratégie de tests et recette

## 26.1 Les niveaux de tests (V1, Parties 5 et 10, précisés)

| Niveau | Outil | Ce qu'on teste | Quand | Qui l'écrit |
|---|---|---|---|---|
| **Unitaires** | Vitest | Règles pures (`rules.ts`) : formats, identifiants, doublons, constantes, posologies, masquage, transitions d'états, permissions | À chaque étape, **avant** le code métier | Claude Code |
| **Intégration** | Vitest + base PostgreSQL de test (Docker) | Services avec la base : transactions, contraintes, déclencheurs, `authorize()`, audit, concurrence | À chaque étape | Claude Code |
| **Bout en bout** | Playwright (profil mobile 360 px + ordinateur) | Parcours complets du chapitre 6 | Dès qu'un écran existe | Claude Code |
| **Sécurité** | Vitest + Playwright + outils | Matrice des permissions, IDOR, en-têtes, limites, secrets dans les journaux | E06, puis à chaque étape, puis E27 | Claude Code ; test d'intrusion externe avant production |
| **Tests manuels** | Guide « Ce que vous devez tester » | Ce que l'utilisateur voit et ressent | **Fin de chaque étape** | **Vous** |
| **Tests utilisateurs** | Protocole 19.7 | Compréhension, rapidité, erreurs, satisfaction | Avant la démonstration | Vous, avec 5 personnes |

- **RG-TST-01** — Chaque critère d'acceptation (CA) d'une fiche P0 DOIT avoir au moins un test automatisé portant son identifiant dans le nom (ex. `it('F-RDV-01 CA-1 : 20 réservations simultanées → 1 seule')`).
- **RG-TST-02** — Un test NE DOIT JAMAIS être supprimé, désactivé (`skip`) ou affaibli pour faire passer la CI sans votre accord écrit.
- **RG-TST-03** — Les tests utilisent **uniquement** des données fictives générées ; ils remettent la base à zéro entre les fichiers de tests.

## 26.2 Suites de tests obligatoires

| Suite | Contenu | Étape |
|---|---|---|
| `matrix.test.ts` | Pour chaque rôle et chaque permission de la section 4.14 : autorisé ou refusé comme prévu ; générée automatiquement depuis la table des permissions | E06 |
| `access-basis.test.ts` | Pour chaque base d'accès (B1 à B7) : création, couverture des catégories, expiration, révocation, cas `SENSITIVE` | E06 → E21 |
| `idor.test.ts` | Pour chaque route prenant un identifiant : un autre utilisateur du même rôle reçoit 404 | À chaque étape |
| `audit-coverage.test.ts` | Chaque lecture de donnée patient produit exactement une trace ; aucune trace modifiable | E06 → E27 |
| `service-guard.test.ts` | Chaque service exporté appelle `authorize()` ou est marqué `@public` (RG-ARC-12) | E06 |
| `concurrency.test.ts` | Réservation de créneau, délivrance, synchronisation rejouée | E13, E18, E22 |
| `immutability.test.ts` | Consultation validée, ordonnance signée, résultat validé, vaccination, audit : modification refusée par la base | E16 → E19 |
| `no-phi-in-logs.test.ts` | Aucune valeur sensible (mot de passe, OTP, téléphone, nom, diagnostic) dans les journaux techniques | E04 → E27 |
| `sms-content.test.ts` | Aucun modèle de SMS ne contient de donnée médicale ; ≤ 160 caractères | E23 |
| `analytics-privacy.test.ts` | Aucune réponse `/analytics` ne contient d'identifiant patient ; masquage < 5 ; rôle SQL limité | E24 |
| `ai-minimization.test.ts` | Aucune donnée interdite envoyée au modèle ; jeu d'évaluation | E25 |
| `dev-pages.test.ts` | `/dev/*` introuvables en production | E27 |

## 26.3 Grille de recette finale

À remplir en E30 (colonne « Résultat » : OK / KO + numéro d'anomalie). Chaque ligne renvoie à une fiche.

| ID | Scénario | Fiche(s) | Résultat attendu |
|---|---|---|---|
| REC-01 | Inscription citoyen complète sur téléphone | F-AUTH-01, F-CIT-01 | Compte, dossier, identifiant santé ; < 4 min |
| REC-02 | Connexion, verrouillage après 5 échecs, mot de passe oublié | F-AUTH-02, 04 | Conforme aux RG |
| REC-03 | Invitation et activation d'un médecin, validation par l'admin | F-AUTH-05, F-ADM-03 | Aucun accès avant validation |
| REC-04 | Second facteur : activation, code de secours à usage unique | F-AUTH-06 | Conforme |
| REC-05 | Changement d'espace (médecin à deux établissements) | F-AUTH-07 | Patients de l'établissement actif seulement |
| REC-06 | Création d'un établissement et de ses agendas | F-ADM-02, F-ETA-03 à 05 | Créneaux générés correctement |
| REC-07 | Recherche d'établissement (liste et carte) sans compte | F-ETA-01, 02 | Résultats corrects, sans accents |
| REC-08 | Prise de rendez-vous, limite de 3, annulation, déplacement | F-RDV-01, 02 | Conforme |
| REC-09 | Arrivée par QR, par SMS, sur pièce ; arrivée sans rendez-vous | F-RDV-04 | Contexte de soins ouvert ; accueil sans donnée clinique |
| REC-10 | Création d'un dossier avec doublon détecté | F-CLI-03 | Candidat proposé ; création forcée justifiée |
| REC-11 | Médecin : tableau de bord, recherche, résumé, historique | F-CLI-01, 02, 04, 09 | Filtrage conforme à la base d'accès |
| REC-12 | Consultation complète avec constantes anormales, coupure réseau, validation | F-CLI-05 à 07 | Brouillon préservé ; consultation immuable |
| REC-13 | Addendum qui corrige le diagnostic | F-CLI-08 | Statistiques utilisent le diagnostic corrigé |
| REC-14 | Ordonnance : alerte allergie, signature, PDF, vérification publique | F-PRE-01 à 06 | Conforme |
| REC-15 | Pharmacie : délivrance partielle, dépassement refusé | F-PHA-02, 03 | Conforme |
| REC-16 | Laboratoire : demande, prélèvement, résultat, validation 4 yeux, annonce sensible | F-LAB-01 à 05 | Conforme |
| REC-17 | Consentement : accorder, utiliser, retirer (effet < 60 s) | F-CIT-10 | Conforme |
| REC-18 | Code de partage temporaire | F-CIT-11 | Conforme |
| REC-19 | Historique des accès vu par le citoyen | F-CIT-12 | Tous les accès listés |
| REC-20 | Personne à charge : déclarée puis vérifiée | F-CIT-07, 08 | Droits évoluent selon le statut |
| REC-21 | Accès d'urgence et revue | F-CLI-10, F-AUD-02 | Conforme |
| REC-22 | Agent communautaire : hors ligne, synchronisation sans doublon | F-COM-01 à 04, F-COM-08 | Conforme |
| REC-23 | Rappels de rendez-vous et plage de silence | F-RDV-07, F-NOT-* | Conforme |
| REC-24 | Tableau de bord établissement | F-PIL-01 | Chiffres cohérents avec les données de démo |
| REC-25 | Centre national : filtres, carte, masquage, portée départementale | F-PIL-02, 03 | Aucune donnée nominative |
| REC-26 | Export avec motif | F-PIL-05 | Tracé |
| REC-27 | Résumé IA sourcé | F-IA-01 | Aucune affirmation sans source |
| REC-28 | Journal d'audit : recherche et intégrité | F-AUD-01 | Chaîne intègre |
| REC-29 | Droits des personnes : archive des données | F-CIT-13 | Archive complète |
| REC-30 | Tentatives d'accès interdits (URL directes, API, autre patient, autre établissement) pour chaque rôle | Chapitre 5 | Toutes refusées et tracées |
| REC-31 | Utilisation sur téléphone en « Slow 4G » | Chapitre 24 | Cibles atteintes |
| REC-32 | Navigation clavier et lecteur d'écran sur les parcours citoyens | 19.1 | Utilisable |

## 26.4 Classement des anomalies

| Gravité | Définition | Règle |
|---|---|---|
| **Bloquante** | Faille de sécurité ou de confidentialité, perte de données, parcours principal impossible | Corrigée **immédiatement**, avant toute autre tâche (V1 : « les problèmes critiques doivent être traités avant l'ajout de nouvelles fonctionnalités ») |
| **Majeure** | Règle métier non respectée, erreur de calcul, écran inutilisable sur mobile | Corrigée avant la démonstration |
| **Mineure** | Texte, alignement, confort | Corrigée si le temps le permet |

Chaque anomalie est enregistrée (fichier `docs/anomalies.md` ou tableau GitHub Issues) avec : description, impact, gravité, étapes pour reproduire, responsable, résolution (V1, Partie 11 §9).

## 26.5 Définition de « terminé » (pour chaque étape)

- Tous les critères d'acceptation des fiches de l'étape sont couverts par des tests verts.
- `authorize()` est appelé par tous les nouveaux services ; l'audit est écrit.
- Aucun texte en dur ; les quatre états d'écran (19.5) existent.
- Lint, typage, tests, build : verts dans la CI.
- Le rapport de fin d'étape est rédigé selon le modèle 25.3.
- **Vous** avez exécuté le guide de test et écrit « validé EXX ».
