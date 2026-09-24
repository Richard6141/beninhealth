// Phase 3 : Server Actions du dossier patient et du consentement (lecture du
// dossier, mise a jour, octroi et retrait de consentement). Voir
// src/modules/patient/actions.ts pour l'implementation et
// src/modules/patient/README.md pour le perimetre du module.
// Les ecrans peuvent importer directement depuis "@/modules/patient/actions"
// (contrat d'integration) ou depuis ce point d'entree.

export {
  getMonDossierPatient,
  getMesConsentements,
  listProfessionnelsDisponibles,
  updatePatientProfileAction,
  grantConsentAction,
  revokeConsentAction,
  type PatientActionState,
  type DossierPatientResume,
  type ConsentementAvecActeur,
  type ProfessionnelDisponible,
} from "./actions";
