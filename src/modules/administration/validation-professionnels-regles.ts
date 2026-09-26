/**
 * Regles pures de la validation des professionnels (F-ADM-03 du pack), sans
 * acces base : etats de verification, delai cible de 72 heures ouvrees
 * (RG-ADM-10), motifs de refus. Volontairement HORS du fichier "use server"
 * validation-professionnels.ts (qui ne peut exporter que des fonctions async)
 * pour etre partagees avec l'ecran et testees seules.
 */

/** RG-ADM-10 : delai cible de traitement d'une demande. */
export const DELAI_CIBLE_HEURES_OUVREES = 72;

/** Revalidation periodique (docs/conception-transfert-dossier.md, section 12) : une verification de plus d'un an est a renouveler. */
export const DELAI_REVALIDATION_JOURS = 365;

export const MOTIFS_REFUS = [
  { code: "numero_introuvable", libelle: "Numéro introuvable auprès de l'Ordre" },
  { code: "document_illisible", libelle: "Pièce justificative illisible" },
  { code: "incoherence_identite", libelle: "Incohérence d'identité" },
  { code: "autre", libelle: "Autre motif" },
] as const;

export type CodeMotifRefus = (typeof MOTIFS_REFUS)[number]["code"];

export type EtatVerification = "a_traiter" | "complement" | "a_revalider" | "verifie" | "refuse";

export const LIBELLES_ETAT: Record<EtatVerification, string> = {
  a_traiter: "À vérifier",
  complement: "Complément demandé",
  a_revalider: "À revalider",
  verifie: "Vérifié",
  refuse: "Refusé",
};

export interface ChampsVerification {
  statutValidation: string;
  validationDecision: string | null;
  ordreVerifieLe: Date | null;
}

const UNE_HEURE_MS = 60 * 60 * 1000;
const UN_JOUR_MS = 24 * UNE_HEURE_MS;

/**
 * Etat d'un professionnel dans la file du validateur. Precedence : un refus
 * prime, puis un complement en cours, puis la fraicheur de la derniere
 * verification.
 */
export function etatVerification(champs: ChampsVerification, maintenant: Date): EtatVerification {
  if (champs.statutValidation === "rejete") return "refuse";
  if (champs.validationDecision === "complement") return "complement";
  if (champs.ordreVerifieLe) {
    const ageJours = (maintenant.getTime() - champs.ordreVerifieLe.getTime()) / UN_JOUR_MS;
    return ageJours > DELAI_REVALIDATION_JOURS ? "a_revalider" : "verifie";
  }
  return "a_traiter";
}

/** Vrai pour les etats qui attendent une action du validateur. */
export function attendUneAction(etat: EtatVerification): boolean {
  return etat === "a_traiter" || etat === "a_revalider";
}

/**
 * Heures ecoulees entre deux instants en excluant le samedi et le dimanche
 * (heure locale Africa/Porto-Novo, UTC+1 fixe, RG-ETA-43). Limite assumee : les
 * jours feries ne sont pas exclus (aucun referentiel de jours feries dans ce
 * depot) et une "heure ouvree" est une heure de calendrier d'un jour de semaine.
 */
export function heuresOuvreesEcoulees(debut: Date, fin: Date): number {
  if (fin.getTime() <= debut.getTime()) return 0;

  const finLocal = fin.getTime() + UNE_HEURE_MS;
  let curseur = debut.getTime() + UNE_HEURE_MS;
  let totalMs = 0;

  while (curseur < finLocal) {
    const debutJour = Math.floor(curseur / UN_JOUR_MS) * UN_JOUR_MS;
    const finSegment = Math.min(debutJour + UN_JOUR_MS, finLocal);
    const jourSemaine = new Date(debutJour).getUTCDay();
    if (jourSemaine !== 0 && jourSemaine !== 6) {
      totalMs += finSegment - curseur;
    }
    curseur = finSegment;
  }

  return totalMs / UNE_HEURE_MS;
}

/** Vrai si une demande en attente depasse le delai cible (RG-ADM-10). */
export function delaiCibleDepasse(dateDemande: Date, maintenant: Date): boolean {
  return heuresOuvreesEcoulees(dateDemande, maintenant) > DELAI_CIBLE_HEURES_OUVREES;
}

export interface ProfessionnelAValider {
  id: string;
  nomComplet: string;
  email: string;
  /** Role clinique du compte (medecin, infirmier, pharmacien, laboratoire, agent_communautaire). */
  role: string;
  specialite: string;
  profession: string | null;
  numeroOrdre: string | null;
  etablissementNom: string;
  /** ISO : creation du compte par l'etablissement. */
  dateDemande: string;
  heuresOuvreesEcoulees: number;
  delaiDepasse: boolean;
  etat: EtatVerification;
  ordreVerifieLe: string | null;
  decision: string | null;
  message: string | null;
  dateDecision: string | null;
}

export interface ValidationProfessionnelActionState {
  error: string | null;
  success: boolean;
}
