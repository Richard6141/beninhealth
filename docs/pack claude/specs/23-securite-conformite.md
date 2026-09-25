# 23. Sécurité, gouvernance et conformité

## 23.1 Objectifs (V1, Partie 7)

Protéger la **confidentialité** des patients, empêcher les **accès non autorisés**, garantir l'**intégrité** des données, assurer la **disponibilité** du service. La sécurité est intégrée dès la conception : le modèle d'accès (chapitre 5), l'audit et l'authentification sont construits **avant** les fonctionnalités métier (plan, chapitre 25).

## 23.2 Principe « Zero Trust » appliqué

| Principe V1 | Mise en œuvre |
|---|---|
| Aucune confiance automatique | Chaque requête est authentifiée et autorisée côté serveur (`authorize()`), y compris entre pages internes |
| Vérification utilisateur | Sessions serveur, second facteur pour les professionnels, ré-authentification pour les actions sensibles |
| Contrôle du contexte | Espace actif, base d'accès, horaires de validité, appareil (nouvel appareil signalé) |
| Limitation des permissions | Matrice de permissions minimale (section 4.14), catégories de données, masquage des sensibles |

## 23.3 Authentification et sessions

| Profil | Facteurs | Durée de session | Inactivité | Ré-authentification exigée pour |
|---|---|---|---|---|
| Citoyen | Mot de passe (+ OTP à l'inscription et à la réinitialisation) | 30 jours glissants ; « appareil partagé » : fermeture du navigateur | 30 min si appareil partagé | Téléchargement de l'archive de ses données, fermeture du compte |
| Professionnels (clinique, labo, pharmacie, accueil, terrain) | Mot de passe + TOTP (SMS en repli pour `CHW` et `RECEPTIONIST` si activé, RG-AUTH-50) | **12 heures** maximum | Verrouillage d'écran à 10 min (F-AUTH-08) | Signature d'ordonnance, accès d'urgence, validation de résultat, retrait « saisi par erreur », exports |
| Établissement, pilotage | Mot de passe + TOTP | 12 heures | 15 min | Exports |
| Administrateur, auditeur | Mot de passe + TOTP à **chaque** connexion | **8 heures** | **15 min** → déconnexion | Toute action sur un compte, les paramètres, les fusions, les exports |

- **RG-SEC-01** — Ré-authentification = saisie du code TOTP (ou du mot de passe pour le citoyen) ; elle reste valable **5 minutes** (`sessions.reauth_at`).
- **RG-SEC-02** — Les mots de passe sont hachés par la bibliothèque d'authentification avec un algorithme lent et salé (scrypt ou Argon2id) ; ils ne sont **jamais** journalisés, affichés ou envoyés.
- **RG-SEC-03** — Les cookies de session sont `HttpOnly`, `Secure` (hors développement local), `SameSite=Lax`, préfixés `__Host-` en production.

## 23.4 Chiffrement

| Donnée | Protection |
|---|---|
| En transit | **TLS 1.2 minimum** (1.3 recommandé) partout, HSTS ; aucun service accessible en HTTP simple |
| Base de données | Chiffrement du disque par l'hébergeur ; sauvegardes chiffrées |
| Champs très sensibles | **Chiffrement applicatif** AES-256-GCM (clé `FIELD_ENCRYPTION_KEY`, rotation annuelle possible grâce à un identifiant de clé stocké avec la valeur) : NPI, secrets TOTP |
| Documents | Stockage objet **privé** avec chiffrement côté serveur ; accès uniquement par URL signée de 60 s après `authorize()` |
| Données sur appareil (terrain) | AES-GCM avec clé dérivée du PIN (RG-OFF-01) |
| Secrets de l'application | Variables d'environnement gérées par l'hébergeur ou un coffre de secrets ; jamais dans le dépôt Git |

## 23.5 Protection contre les attaques (V1, Partie 7 §9, précisée)

| Menace | Mesure obligatoire | Vérification |
|---|---|---|
| Injection SQL | Prisma ou requêtes paramétrées uniquement ; interdiction de construire du SQL par concaténation (règle ESLint) | Revue + test |
| XSS | Échappement par React ; interdiction de `dangerouslySetInnerHTML` sur du contenu utilisateur ; en-tête **Content-Security-Policy** strict | Test automatique des en-têtes |
| CSRF | Cookies `SameSite=Lax` ; vérification de l'origine des Server Actions par Next.js ; routes API : contrôle de l'en-tête `Origin` pour les méthodes modifiant des données | Test |
| Contrôle d'accès cassé (IDOR) | `authorize()` systématique ; identifiants UUID ; 404 si pas de base d'accès | Suite de tests de la matrice (chapitre 26) |
| Force brute | Verrouillages et limites des sections 7 et 22.3 | Test |
| Fichiers malveillants | Vérification du type réel, taille maximale, stockage hors du serveur web, noms aléatoires, téléchargement avec `Content-Disposition: attachment` | Test |
| Fuite par les journaux | Liste de champs interdits masqués automatiquement par pino (`password`, `otp`, `token`, `npi`, `phone`, noms de champs cliniques) | Test CA-5 de F-AUTH-01 |
| Dépendances vulnérables | `pnpm audit` dans la CI (échec si vulnérabilité critique), mises à jour automatiques proposées | CI |
| En-têtes | HSTS, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy (caméra autorisée uniquement pour le scan QR), `frame-ancestors 'none'` | Test |
| Comportements anormaux | Détection d'anomalies (F-AUD-03) | Revue hebdomadaire |

## 23.6 Sauvegardes, continuité et incidents

- **RG-SEC-20** — Sauvegarde **complète quotidienne** et journaux de transactions en continu (restauration à un instant donné sur 7 jours), **chiffrées**, conservées dans **deux emplacements distincts** (V1 : « les données critiques ne doivent jamais dépendre d'un seul stockage »), rétention 35 jours.
- **RG-SEC-21** — Objectifs : perte de données maximale (**RPO**) **15 minutes** ; remise en service (**RTO**) **4 heures** en production.
- **RG-SEC-22** — **Test de restauration** mensuel en staging, documenté (durée, résultat). Avant la démonstration : au moins un test réussi.
- **RG-SEC-23** — Procédure d'incident écrite (`docs/securite/incident.md`) : détection → qualification (gravité 1 à 4) → confinement → correction → notification (autorité de protection des données et personnes concernées si une violation de données personnelles est avérée, dans les délais prévus par la réglementation) → retour d'expérience.

## 23.7 Gouvernance des données (V1, Partie 7 §12)

| Élément | Décision |
|---|---|
| Responsable du traitement | Le ministère de la Santé (ou l'entité qu'il désigne) |
| Délégué à la protection des données | Désigné ; dispose du rôle `AUDITOR` |
| Registre des traitements | Tenu à jour (un traitement par finalité : soins, rendez-vous, pilotage, IA, communautaire) |
| Origine et responsabilité de chaque donnée | Chaque donnée porte son auteur, son établissement et sa source (`DECLARED`, `CONFIRMED`, `COMMUNITY_SYNC`, `IMPORT`) |
| Durées de conservation | Dossier médical : [DÉCISION à fixer selon les textes applicables — hypothèse de travail : 20 ans après le dernier événement] ; journal d'audit : 10 ans ; journaux techniques : 12 mois ; notifications : 90 jours ; textes IA : 30 jours ; SMS simulés : 30 jours |
| Correction | Par addendum ou demande de rectification (F-CIT-13) |
| Demandes des personnes | Traitées par l'auditeur (F-AUD-04), réponse sous 30 jours |

## 23.8 Conformité au droit béninois

> [!WARNING] À faire valider par un juriste et par l'APDP
> Cette section résume les points de vigilance identifiés ; elle ne constitue pas un avis juridique.

| Obligation | Conséquence pour le projet |
|---|---|
| Le **Code du numérique** (loi n° 2017-20 du 20 avril 2018, livre V) encadre les données personnelles ; les données de santé y sont des **données sensibles**. | Accomplir les **formalités préalables** auprès de l'**APDP** (demande d'autorisation pour le traitement de données de santé) **avant** tout traitement de données réelles. |
| Droits des personnes (information, accès, rectification, opposition selon les cas). | Politique de confidentialité claire (langage simple), fonctions F-CIT-12 et F-CIT-13. |
| Sécurité et confidentialité ; secret médical des professionnels. | Chapitres 5 et 23 ; engagement de confidentialité accepté par chaque professionnel à l'activation de son compte. |
| Transferts de données hors du Bénin encadrés. | Choisir un hébergement conforme (idéalement au Bénin ou dans un cadre autorisé) ; **aucun** envoi de données réelles à un service étranger (dont IA) sans autorisation. |
| Sous-traitants. | Contrats avec l'hébergeur, le fournisseur SMS et tout fournisseur d'IA, prévoyant confidentialité, sécurité et localisation. |
| Intégration ANIP. | Convention avec l'ANIP ; utilisation du strict nécessaire ; traçabilité des vérifications ; séparation de l'identité et des données médicales (V1, Partie 7 §13). |
| Démonstration. | **Données fictives uniquement** ; bandeau « Données fictives » affiché dans tous les environnements hors production. |

## 23.9 Tests de sécurité avant mise en production (V1, Partie 7 §15)

Tests d'accès et de permissions (automatisés, chapitre 26), tests des API (entrées invalides, limites), **test d'intrusion** par un tiers indépendant, test de restauration, **revue de code** centrée sur la sécurité (checklist du tableau 23.5), analyse des dépendances.
