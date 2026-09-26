/**
 * Système de permissions RBAC (Phase 2).
 *
 * Matrice de permissions fonctionnelle, alignée sur le tableau "Rôle -> accès
 * principal" de src/security/README.md. Reste volontairement fail-safe :
 * toute combinaison (rôle, action, ressource) non listée explicitement ici
 * est refusée.
 *
 * Rappel des principes du README à respecter par les appelants de `can` :
 * Zero Trust (vérifier systématiquement, ne jamais présumer un accès), MFA
 * obligatoire pour les actions sensibles des professionnels, traçabilité
 * (toute vérification portant sur une donnée médicale doit être accompagnée
 * d'une entrée JournalAudit côté appelant), et consentement contrôlable pour
 * l'accès d'un professionnel au dossier d'un patient.
 */

import type { NomRole } from '@/types';

/** Rôle applicatif, aligné sur NomRole (src/types/domain-identity.ts). */
export type Role = NomRole;

/** Action possible sur une ressource, au sens RBAC. */
export type Action = 'read' | 'create' | 'update' | 'delete';

/**
 * Permission élémentaire, sous la forme "action:ressource" (ex : "read:patient",
 * "create:prescription").
 */
export type Permission = `${Action}:${string}`;

/**
 * Matrice RBAC : pour chaque rôle, l'ensemble fermé des permissions
 * accordées. Toute permission absente de cet ensemble est refusée.
 *
 * Ressources utilisées ici (alignées sur src/types et src/security/README.md) :
 * - propre_dossier : dossier du patient connecte lui-meme (Patient, Consultation,
 *   Prescription, ExamenMedical, DocumentMedical qui le concernent)
 * - patient : dossier d'un patient consulte par un professionnel de sante
 * - consultation, prescription, examen_medical, document_medical : actes et
 *   pieces du dossier clinique
 * - consentement, rendez_vous : geres par le patient lui-meme
 * - suivi_communautaire : donnees de suivi limitees de l'agent communautaire
 * - medicament : catalogue et delivrance geres par le pharmacien
 * - etablissement_sanitaire, professionnel_sante : gestion administrative locale
 * - analytics : donnees agregees uniquement, jamais nominatives
 */
const MATRICE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  patient: new Set<Permission>([
    'read:propre_dossier',
    'update:propre_dossier',
    'read:consultation',
    'read:prescription',
    'read:examen_medical',
    'read:document_medical',
    'read:consentement',
    'create:consentement',
    'update:consentement',
    'delete:consentement',
    'create:rendez_vous',
    'read:rendez_vous',
    'update:rendez_vous',
    // F-CIT-11 : generer un code de partage temporaire de son propre dossier.
    'create:code_partage',
    'read:code_partage',
    // Demandes d'acces par NPI ou telephone : voir et repondre depuis son
    // espace (voir src/modules/transfert/demandes-patient.ts).
    'read:demande_acces_recue',
    'update:demande_acces_recue',
  ]),

  medecin: new Set<Permission>([
    'read:patient',
    'read:consultation',
    'create:consultation',
    'update:consultation',
    'read:prescription',
    'create:prescription',
    'update:prescription',
    'read:examen_medical',
    'create:examen_medical',
    // F-LAB-06 : le medecin demandeur peut annuler sa propre demande
    // d'examen tant qu'aucun resultat n'existe (annulerExamenAction verifie
    // en base qu'il est bien le demandeur, jamais suppose de ce seul droit).
    'update:examen_medical',
    'read:document_medical',
    'create:document_medical',
    'read:rendez_vous',
    'read:vaccination',
    'create:vaccination',
    'read:prise_en_charge_infirmiere',
    'create:acces_urgence',
    // F-CIT-11 : utiliser le code de partage temporaire presente par un
    // patient (RG-CIT-91 : medecin ou infirmier valide uniquement).
    'update:code_partage',
    // Acces par NPI ou telephone + code de confirmation envoye au patient
    // (voir src/modules/transfert/actions.ts).
    'create:demande_acces_dossier',
    'update:demande_acces_dossier',
    // F-CLI-14 : le medecin peut envoyer une reference vers un autre
    // etablissement, et repondre (contre-reference) a une reference recue
    // par son propre etablissement.
    'read:reference_patient',
    'create:reference_patient',
    'update:reference_patient',
  ]),

  infirmier: new Set<Permission>([
    'read:patient',
    'read:consultation',
    'update:consultation',
    'read:prescription',
    'read:examen_medical',
    'read:rendez_vous',
    'read:vaccination',
    'create:vaccination',
    'read:prise_en_charge_infirmiere',
    'create:prise_en_charge_infirmiere',
    'create:acces_urgence',
    // F-CIT-11 : utiliser le code de partage temporaire presente par un
    // patient (RG-CIT-91 : medecin ou infirmier valide uniquement).
    'update:code_partage',
    'create:demande_acces_dossier',
    'update:demande_acces_dossier',
  ]),

  agent_communautaire: new Set<Permission>([
    'read:suivi_communautaire',
    'create:suivi_communautaire',
    'update:suivi_communautaire',
    // F-COM-02 : fiche personne dediee, jamais un dossier Patient (voir
    // src/modules/communautaire/actions.ts).
    'read:personne_communautaire',
    'create:personne_communautaire',
  ]),

  pharmacien: new Set<Permission>([
    'read:prescription',
    'update:prescription',
    'read:medicament',
    'create:medicament',
    'update:medicament',
    'create:delivrance',
    'read:delivrance',
    'update:delivrance',
  ]),

  laboratoire: new Set<Permission>([
    'read:examen_medical',
    'update:examen_medical',
    'create:validation_examen',
  ]),

  admin_etablissement: new Set<Permission>([
    'read:etablissement_sanitaire',
    'create:etablissement_sanitaire',
    'update:etablissement_sanitaire',
    'delete:etablissement_sanitaire',
    'read:professionnel_sante',
    'create:professionnel_sante',
    'update:professionnel_sante',
    'delete:professionnel_sante',
    'read:journal_audit',
    'create:revue_acces_urgence',
    // F-RDV-04/05 : file du jour et enregistrement de l'arrivee (role
    // RECEPTIONIST absent de ce depot, route vers admin_etablissement, voir
    // src/modules/facility/file-du-jour.ts).
    'read:rendez_vous',
    'update:rendez_vous',
    // F-RDV-06 : rendez-vous pris au guichet, confirme directement (meme
    // routage de role, voir src/modules/facility/rendez-vous-guichet.ts).
    'create:rendez_vous',
  ]),

  admin_national: new Set<Permission>([
    'read:analytics',
    'read:journal_audit',
    'create:revue_acces_urgence',
    // F-AUD-04 : traiter les demandes de rectification et les signalements
    // d'acces suspect (role AUDITOR absent de ce depot, routes vers
    // admin_national, voir src/modules/patient/droits-donnees.ts).
    'read:demande_personne',
    'create:traitement_demande_personne',
    // F-AUD-03 : detection d'anomalies d'acces (role AUDITOR absent de ce
    // depot, routee vers admin_national).
    'read:signalement_anomalie',
    'update:signalement_anomalie',
    // F-ADM-04 : referentiels administrables, perimetre reduit a un seul
    // referentiel (vaccins, role PLATFORM_ADMIN absent de ce depot,
    // adaptation documentee dans src/modules/administration/referentiel-vaccinal.ts).
    'read:referentiel_vaccinal',
    'create:referentiel_vaccinal',
    'update:referentiel_vaccinal',
    // F-ADM-06 : detection et fusion de dossiers patient en doublon (voir
    // src/modules/patient/fusion-doublons.ts).
    'read:doublon_patient',
    'update:doublon_patient',
    // F-ADM-07 : parametres et fonctionnalites activables de la plateforme
    // (voir src/modules/administration/parametres.ts).
    'read:parametre',
    'update:parametre',
    // F-ADM-02 : referentiel des etablissements a l'echelle nationale (voir
    // src/modules/administration/etablissements.ts). Distinct de
    // etablissement_sanitaire accorde a admin_etablissement ci-dessus, qui
    // ne porte que sur son propre etablissement.
    'read:etablissement_sanitaire',
    'update:etablissement_sanitaire',
    // F-ADM-04 (partie 2) : referentiel medicaments administrable (voir
    // src/modules/administration/referentiel-medicaments.ts). Ressource
    // DISTINCTE de "medicament" (accordee a pharmacien ci-dessus) et non
    // "medicament" lui-meme : reutiliser ce dernier aurait par erreur permis
    // a un pharmacien d'appeler directement creerMedicamentAction/
    // modifierMedicamentAction/basculerActifMedicamentAction (Server Actions,
    // atteignables sans passer par l'ecran), puisque can() ne distingue pas
    // "lire/utiliser le catalogue pour une delivrance" de "administrer le
    // catalogue" quand les deux partagent la meme chaine de permission.
    // Trouve et corrige avant tout commit, voir docs/coordination-agents.md.
    'read:referentiel_medicament',
    'create:referentiel_medicament',
    'update:referentiel_medicament',
    // F-CIT-09 : fin de tutelle a la majorite, MVP reduit a une fin manuelle
    // par l'administrateur (pas de tache planifiee, pas de code de
    // reclamation par SMS, voir src/modules/administration/tutelles.ts).
    'read:tutelle',
    'update:tutelle',
    // F-ADM-04 (partie 3) : referentiel des examens medicaux administrable
    // (voir src/modules/administration/referentiel-examens.ts).
    'read:referentiel_examens',
    'create:referentiel_examens',
    'update:referentiel_examens',
    // F-ADM-04 (partie 5) : referentiel des jours feries (RG-ETA-42, voir
    // src/modules/administration/jours-feries.ts).
    'read:jour_ferie',
    'create:jour_ferie',
    'update:jour_ferie',
    // F-NOT-02 : boite d'envoi SMS simulee, consultable et testable (voir
    // src/modules/notification/sms/dev.ts).
    'read:envoi_sms',
    'create:envoi_sms',
    // F-NOT-04 : catalogue des notifications, 4e referentiel administrable
    // du pack F-ADM-04 (modeles de notifications/SMS, voir
    // src/modules/administration/referentiel-notifications.ts).
    'read:referentiel_notification',
    'create:referentiel_notification',
    'update:referentiel_notification',
    // F-ADM-03 : verifier le numero d'inscription d'un professionnel aupres de
    // l'Ordre, approuver, refuser ou demander un complement (voir
    // src/modules/administration/validation-professionnels.ts). Ressource
    // DISTINCTE de professionnel_sante (gestion locale par admin_etablissement)
    // pour que le validateur ne gagne aucun droit sur les dossiers cliniques
    // (RG-ROL-06) et que l'admin d'etablissement ne puisse pas se valider lui-meme.
    'read:validation_professionnel',
    'update:validation_professionnel',
  ]),
};

/**
 * Vérifie si un rôle donné est autorisé à effectuer une action sur une
 * ressource, selon la matrice RBAC ci-dessus.
 *
 * Fail-safe : toute combinaison non explicitement listée retourne false,
 * y compris pour un rôle qui ne serait pas (ou plus) une clé de la matrice.
 */
export function can(role: Role, action: Action, resource: string): boolean {
  const permissions = MATRICE_PERMISSIONS[role];

  if (!permissions) {
    return false;
  }

  return permissions.has(`${action}:${resource}` as Permission);
}
