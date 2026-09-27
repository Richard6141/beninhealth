/**
 * Regles de la fusion de dossiers en doublon (F-ADM-06 du pack). Module pur
 * (pas de "use server", aucun acces base) : gardes testees une par une,
 * appliquees par fusion-doublons.ts avant toute ecriture.
 */

export const LONGUEUR_MIN_JUSTIFICATION_FUSION = 20;
export const LONGUEUR_MIN_MOTIF_IGNORE = 10;
export const LONGUEUR_MIN_MOTIF_DEFUSION = 20;

/** RG-ADM-40 : fenetre de reversibilite d'une fusion. */
export const JOURS_FENETRE_DEFUSION = 30;

export type EcartIdentite = "sexe" | "date_naissance";

export interface IdentiteComparable {
  sexe: string;
  dateNaissance: Date;
}

/**
 * RG-ADM-41 : une fusion de dossiers de sexe ou de date de naissance
 * differents exige une justification (deja imposee par le schema) et une
 * seconde approbation. Renvoie les ecarts constates, vide si aucun.
 */
export function ecartsIdentite(a: IdentiteComparable, b: IdentiteComparable): EcartIdentite[] {
  const ecarts: EcartIdentite[] = [];
  if (a.sexe !== b.sexe) ecarts.push("sexe");
  if (a.dateNaissance.getTime() !== b.dateNaissance.getTime()) ecarts.push("date_naissance");
  return ecarts;
}

export function exigeSecondeApprobation(ecarts: readonly EcartIdentite[]): boolean {
  return ecarts.length > 0;
}

/** Ordre canonique d'une paire (le plus petit id en premier), pour que "ignorer" soit symetrique. */
export function paireCanonique(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

/**
 * Garde de la demande de fusion : les deux dossiers doivent etre distincts,
 * et le dossier absorbe ne doit pas etre deja fusionne ni deja en cours
 * d'absorption ailleurs (fusion active ou en attente d'une seconde
 * approbation). Un dossier qui a deja absorbe un autre peut, lui, etre
 * choisi comme principal ou etre a son tour absorbe : les chaines de fusion
 * successives restent valides.
 */
export function verifierDemandeFusion(params: {
  patientConserveId: string;
  patientDoublonId: string;
  statutCompteDoublon: string;
  doublonEstDejaSecondaireActif: boolean;
}): string | null {
  if (params.patientConserveId === params.patientDoublonId) {
    return "Les deux dossiers doivent être différents.";
  }
  if (params.statutCompteDoublon === "fusionne") {
    return "Ce dossier a déjà été fusionné ailleurs.";
  }
  if (params.doublonEstDejaSecondaireActif) {
    return "Ce dossier a déjà été absorbé par une fusion active ou en attente d'approbation.";
  }
  return null;
}

/**
 * Garde de l'approbation d'une fusion en attente (ecarts d'identite,
 * RG-ADM-41) : un AUTRE administrateur que le demandeur, demande encore en
 * attente.
 */
export function verifierApprobationFusion(params: { statut: string; demandeParId: string; approbateurId: string }): string | null {
  if (params.statut !== "en_attente") {
    return "Cette demande de fusion a déjà été traitée.";
  }
  if (params.demandeParId === params.approbateurId) {
    return "La fusion doit être confirmée par un autre administrateur (quatre yeux, RG-ADM-41).";
  }
  return null;
}

/** RG-ADM-40 : une defusion n'est possible que dans la fenetre, sur une fusion encore active. */
export function verifierDefusion(params: { statut: string; defusionLimiteLe: Date; maintenant: Date }): string | null {
  if (params.statut !== "active") {
    return "Cette fusion a déjà été défusionnée ou n'est plus active.";
  }
  if (params.maintenant.getTime() > params.defusionLimiteLe.getTime()) {
    return "Le délai de 30 jours pour défusionner est dépassé.";
  }
  return null;
}
