/**
 * Domaine Facility : établissements sanitaires et rendez-vous.
 *
 * Phase 1 : structure de données uniquement (types), aucune logique métier.
 * Implémentation réelle prévue en phase ultérieure avec le module `facility`
 * (voir src/modules/facility), après les modules identity, patient, clinical
 * et prescription.
 */

/** Type d'établissement sanitaire. */
export type TypeEtablissement =
  | 'centre_sante'
  | 'hopital'
  | 'laboratoire'
  | 'pharmacie';

/** Coordonnées géographiques d'un établissement (stockage prévu via PostGIS, voir src/database). */
export interface CoordonneesGPS {
  latitude: number;
  longitude: number;
}

/** Établissement sanitaire (centre de santé, hôpital, laboratoire ou pharmacie). */
export interface EtablissementSanitaire {
  id: string;
  nom: string;
  type: TypeEtablissement;
  localisation: string;
  coordonneesGPS: CoordonneesGPS;
  servicesDisponibles: string[];
  /** Capacité d'accueil (ex : nombre de lits, de postes de consultation...). */
  capacite: number;
}

/** Statut du cycle de vie d'un rendez-vous. */
export type StatutRendezVous = 'demande' | 'confirme' | 'termine' | 'annule';

/** Rendez-vous pris par un patient auprès d'un professionnel dans un établissement. */
export interface RendezVous {
  id: string;
  patientId: string;
  etablissementId: string;
  professionnelId: string;
  date: string;
  motif: string;
  statut: StatutRendezVous;
}
