// Phase 2 : Server Actions d'authentification (inscription, connexion,
// deconnexion). Voir src/modules/identity/actions.ts pour l'implementation
// et src/modules/identity/README.md pour le perimetre du module.
// Les ecrans peuvent importer directement depuis "@/modules/identity/actions"
// (contrat d'integration) ou depuis ce point d'entree.

export {
  registerPatientAction,
  loginAction,
  logoutAction,
  verifierCodeEmailEtConnecterAction,
  verifierMfaEtConnecterAction,
  type AuthActionState,
} from "./actions";

// Systeme de profil ("Mon profil") : consultation/modification des
// informations personnelles et televersement de la photo de profil. Le
// changement de mot de passe reutilise volontairement celui deja expose par
// gestion-comptes.ts (meme regle metier, un seul point d'implementation).
export {
  getMonProfil,
  mettreAJourProfilAction,
  televerserAvatarAction,
  type MonProfil,
  type ProfilActionState,
} from "./actions";

// Phase 6 : Server Actions de provisionnement de la hierarchie
// organisationnelle (ministere -> etablissement -> personnel) et de
// changement de mot de passe. Voir src/modules/identity/gestion-comptes.ts
// pour l'implementation et src/modules/identity/README.md pour le flux
// metier complet.
export {
  listEtablissementsDetail,
  creerEtablissementAction,
  listPersonnelEtablissement,
  creerProfessionnelAction,
  changerMotDePasseAction,
  type GestionCompteActionState,
  type EtablissementDetail,
  type MembrePersonnel,
} from "./gestion-comptes";

// Phase 7 : double authentification (TOTP). Voir
// src/modules/identity/mfa.ts pour l'implementation.
export {
  demarrerEnrolementMfa,
  activerMfaAction,
  desactiverMfaAction,
  getStatutMfa,
  type MfaActionState,
  type EnrolementMfa,
} from "./mfa";
