/**
 * Domaine Patient : dossier patient et gestion du consentement.
 *
 * Phase 1 : structure de données uniquement (types), aucune logique métier.
 * Implémentation réelle prévue en Phase 2 avec le module `patient`
 * (voir src/modules/patient).
 */

/** Sexe biologique enregistré au dossier, selon la codification standard M/F. */
export type Sexe = 'M' | 'F';

/** Groupe sanguin, avec la valeur `inconnu` tant que l'information n'a pas été saisie. */
export type GroupeSanguin =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'inconnu';

/** Contact à prévenir en cas d'urgence médicale. */
export interface ContactUrgence {
  nom: string;
  telephone: string;
  lienParente: string;
}

/**
 * Patient de la plateforme. Ne porte pas les identifiants de connexion
 * (voir User dans domain-identity.ts) : uniquement les données de santé
 * et d'identification sanitaire.
 */
export interface Patient {
  id: string;
  /** Identifiant santé propre à la plateforme, indépendant de toute pièce d'identité. */
  identifiantSante: string;
  /**
   * Référence vers l'identité nationale (futur rattachement ANIP/NPI).
   * Optionnel en Phase 1 : l'interconnexion avec l'identité nationale n'est
   * pas encore en place.
   */
  referenceIdentiteNationale?: string;
  dateNaissance: string;
  sexe: Sexe;
  groupeSanguin: GroupeSanguin;
  contactsUrgence: ContactUrgence[];
  consentements: Consentement[];
}

/** Portée fonctionnelle couverte par un consentement patient. */
export type TypeAccesConsentement =
  | 'dossier_complet'
  | 'consultations'
  | 'prescriptions'
  | 'examens'
  | 'documents';

/** Statut courant d'un consentement. */
export type StatutConsentement = 'actif' | 'retire' | 'expire';

/**
 * Consentement donné par un patient à un acteur (professionnel, établissement...)
 * pour accéder à tout ou partie de son dossier. Le patient doit pouvoir
 * l'autoriser et le retirer à tout moment (principe de consentement contrôlable).
 */
export interface Consentement {
  id: string;
  patientId: string;
  /** Identifiant de l'acteur autorisé (professionnel de santé, établissement...). */
  acteurAutoriseId: string;
  typeAcces: TypeAccesConsentement;
  dateDebut: string;
  /** Absente ou nulle si le consentement n'a pas de date de fin prévue. */
  dateFin: string | null;
  statut: StatutConsentement;
}
