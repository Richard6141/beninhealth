/**
 * Domaine Clinical : consultations, prescriptions, médicaments, examens et
 * documents médicaux.
 *
 * Phase 1 : structure de données uniquement (types), aucune logique métier.
 * Implémentation réelle prévue en Phase 3-4 avec les modules `clinical` et
 * `prescription` (voir src/modules/clinical et src/modules/prescription).
 */

/** Statut du cycle de vie d'une consultation. */
export type StatutConsultation =
  | 'planifiee'
  | 'en_cours'
  | 'terminee'
  | 'annulee';

/** Consultation médicale entre un patient et un professionnel de santé. */
export interface Consultation {
  id: string;
  patientId: string;
  professionnelId: string;
  etablissementId: string;
  date: string;
  motif: string;
  symptomes: string[];
  observations: string;
  conclusion: string;
  statut: StatutConsultation;
}

/** Forme galénique d'un médicament. */
export type FormeMedicament =
  | 'comprime'
  | 'gelule'
  | 'sirop'
  | 'injectable'
  | 'pommade'
  | 'autre';

/** Médicament au sens catalogue (référentiel), indépendant d'une prescription précise. */
export interface Medicament {
  id: string;
  nom: string;
  principeActif: string;
  dosage: string;
  forme: FormeMedicament;
  informationsComplementaires: string;
}

/** Ligne de prescription : un médicament du catalogue avec sa posologie pour ce cas précis. */
export interface LignePrescription {
  medicamentId: string;
  posologie: string;
  quantite: number;
  dureeTraitementJours: number;
}

/** Statut du cycle de vie d'une prescription. */
export type StatutPrescription =
  | 'creee'
  | 'validee'
  | 'delivree_partiellement'
  | 'delivree'
  | 'annulee';

/** Type d'événement conservé dans l'historique d'une prescription. */
export type TypeEvenementPrescription =
  | 'creation'
  | 'modification'
  | 'validation'
  | 'delivrance';

/** Entrée d'historique d'une prescription, pour la traçabilité obligatoire. */
export interface EvenementHistoriquePrescription {
  type: TypeEvenementPrescription;
  date: string;
  utilisateurId: string;
  commentaire?: string;
}

/** Ordonnance rattachée à une consultation. */
export interface Prescription {
  id: string;
  consultationId: string;
  medecinPrescripteurId: string;
  date: string;
  statut: StatutPrescription;
  medicaments: LignePrescription[];
  instructions: string;
  historique: EvenementHistoriquePrescription[];
}

/** Statut du cycle de vie d'un examen médical. */
export type StatutExamen = 'demande' | 'en_cours' | 'termine' | 'annule';

/** Examen médical réalisé par un laboratoire à la demande d'un professionnel de santé. */
export interface ExamenMedical {
  id: string;
  typeExamen: string;
  demandeurId: string;
  laboratoireId: string;
  date: string;
  statut: StatutExamen;
  /** Vide tant que l'examen n'est pas terminé. */
  resultat: string;
}

/** Nature d'un document médical stocké. */
export type TypeDocumentMedical =
  | 'compte_rendu'
  | 'imagerie'
  | 'resultat_laboratoire'
  | 'ordonnance'
  | 'certificat'
  | 'autre';

/** Niveau de confidentialité appliqué à un document médical. */
export type NiveauConfidentialite = 'standard' | 'restreint' | 'confidentiel';

/**
 * Document médical stocké pour un patient (résultat, compte rendu, imagerie...).
 * `emplacementStockage` référence l'emplacement du fichier réel (Phase 2+ pour le
 * stockage effectif), jamais le contenu binaire lui-même dans ce type.
 */
export interface DocumentMedical {
  id: string;
  type: TypeDocumentMedical;
  emplacementStockage: string;
  proprietaireId: string;
  niveauConfidentialite: NiveauConfidentialite;
  dateCreation: string;
}
