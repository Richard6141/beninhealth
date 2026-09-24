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
