// Phase 2 : Server Actions d'authentification (inscription, connexion,
// deconnexion). Voir src/modules/identity/actions.ts pour l'implementation
// et src/modules/identity/README.md pour le perimetre du module.
// Les ecrans peuvent importer directement depuis "@/modules/identity/actions"
// (contrat d'integration) ou depuis ce point d'entree.

export {
  registerPatientAction,
  loginAction,
  logoutAction,
  type AuthActionState,
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
