# Module identity

Responsabilité : gestion des comptes utilisateurs et de l'authentification (Identity Service).

Périmètre : User, Role (patient, medecin, infirmier, agent_communautaire, pharmacien,
laboratoire, admin_etablissement, admin_national), cycle de vie du compte,
authentification, MFA pour les actions sensibles des professionnels, et
rattachement d'un ProfessionnelSante à son identité avec validation de son statut.

Hors périmètre : données médicales (modules patient, clinical, prescription) et
permissions fines par ressource, définies dans src/security.

Phase d'implémentation : Phase 2.

## Implémentation Phase 2 (authentification)

Authentification réelle par identifiant/mot de passe, implémentée dans
`src/modules/identity/actions.ts` (Server Actions : `registerPatientAction`,
`loginAction`, `logoutAction`) et `src/lib/session.ts` (session JWT via jose,
cookie httpOnly `session`). Le contrôle d'accès par rôle (RBAC) s'appuie sur
`src/security/permissions.ts`, et la protection des routes `/app/*` sur
`middleware.ts` à la racine du projet.

Rappel : mot de passe jamais stocké ni journalisé en clair (hash bcryptjs),
message d'erreur générique à la connexion, traçabilité systématique des
événements d'authentification via JournalAudit.

## Hiérarchie de provisionnement (Phase 6)

Implémentation dans `src/modules/identity/gestion-comptes.ts` (Server Actions,
réexportées par `src/modules/identity/index.ts`).

Règle métier : tout repose sur un établissement, et il n'existe aucune
auto-inscription en dehors du patient. Le provisionnement des comptes suit
une chaîne stricte en trois niveaux :

1. **Ministère (admin_national) crée un établissement.** `creerEtablissementAction`
   crée, dans une même transaction, l'`EtablissementSanitaire` et le compte
   administrateur unique de cet établissement (`User` + rôle
   `admin_etablissement` + `ProfessionnelSante` de spécialité conventionnelle
   `"Administration"`, statut de validation `"valide"` d'emblée). C'est ce
   `ProfessionnelSante` qui rattache l'administrateur à son établissement,
   exactement comme pour tout autre professionnel.
2. **L'administrateur d'établissement (admin_etablissement) crée son personnel.**
   `creerProfessionnelAction` crée un compte (`User` + rôle + `ProfessionnelSante`)
   pour un rôle professionnel de l'établissement de l'appelant : `medecin`,
   `infirmier`, `agent_communautaire`, `pharmacien` ou `laboratoire`. Les rôles
   `admin_etablissement`, `admin_national` et `patient` sont explicitement
   exclus de cette fonction. Le professionnel créé est directement `"valide"` :
   l'administrateur d'établissement fait foi de la validité du compte qu'il crée.
   L'établissement de rattachement n'est jamais transmis par le formulaire : il
   est déduit du `ProfessionnelSante` (spécialité `"Administration"`) de
   l'appelant, via `getSession().userId`.
3. **Consultation.** `listEtablissementsDetail` (réservé à `admin_national`)
   et `listPersonnelEtablissement` (réservé à `admin_etablissement`, personnel
   de son propre établissement uniquement, administrateur exclu de la liste)
   alimentent les écrans de gestion correspondants.

Chaque création génère un mot de passe temporaire aléatoire et lisible
(`node:crypto`, jamais `Math.random`), retourné en clair une seule fois dans
`GestionCompteActionState.motDePasseTemporaire` pour être communiqué à la
personne concernée, jamais stocké ni journalisé en clair. `changerMotDePasseAction`,
ouverte à tous les rôles connectés, permet ensuite à chaque personne de
remplacer ce mot de passe temporaire par le sien.

Comme dans `actions.ts` : vérification du rôle de l'appelant dans la fonction
elle-même (Zero Trust, jamais seulement côté écran), hash bcryptjs (12 rounds),
et traçabilité systématique (JournalAudit) de toute création ou modification
de compte.

## Double authentification (Phase 7)

Implémentation dans `src/modules/identity/mfa.ts` (TOTP, compatible Google
Authenticator/Authy), activable volontairement par tout compte quel que soit
son rôle.

Flux d'activation : `demarrerEnrolementMfa` génère un secret et un QR code
sans jamais les écrire en base ; `activerMfaAction` exige la saisie d'un code
valide avant de sauvegarder le secret et de passer `mfaActif` à `true`. Sans
cette confirmation, aucun secret n'est jamais persisté.

Flux de connexion (`loginAction` dans `actions.ts`) : si le compte a la MFA
active, le mot de passe correct ne crée pas de session directement. Un jeton
de pré-authentification signé (JWT, 5 minutes, jamais posé en cookie) est
renvoyé à l'écran, qui affiche une deuxième étape (code à 6 chiffres). Cette
étape est validée par `verifierMfaEtConnecterAction`, qui vérifie le jeton
puis le code avant de créer la session réelle.

`desactiverMfaAction` exige le mot de passe actuel (pas un code TOTP) : une
personne ayant perdu l'accès à son application d'authentification doit
pouvoir se désactiver la MFA plutôt que rester bloquée hors de son compte.

Écran : `src/app/app/securite/page.tsx` (distinct de `/app/profil`, tenu par
un autre chantier).
