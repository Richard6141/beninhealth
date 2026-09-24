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
