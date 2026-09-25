/**
 * Referentiel partage du module delivrance en pharmacie (F-PHA-03 du pack) :
 * motifs de non delivrance (ligne nulle ou partielle) et fenetre d'annulation
 * d'une delivrance (RG-PHA-13). Module pur (pas de "use server", pas d'acces
 * base), meme principe que referentiel-allergies.ts et controles-doublons.ts
 * dans ce meme dossier : appelable a la fois cote serveur (seule autorite
 * reelle, voir actions.ts) et cote client (affichage immediat dans le
 * formulaire de delivrance).
 */

export const MOTIFS_NON_DELIVRANCE_VALEURS = [
  "rupture_stock",
  "refus_patient",
  "cout",
  "autre",
] as const;

export type MotifNonDelivrance = (typeof MOTIFS_NON_DELIVRANCE_VALEURS)[number];

const LIBELLES_MOTIF_NON_DELIVRANCE: Record<MotifNonDelivrance, string> = {
  rupture_stock: "Rupture de stock",
  refus_patient: "Refus du patient",
  cout: "Cout trop eleve pour le patient",
  autre: "Autre motif",
};

/** Libelle francais d'un code de motif de non delivrance, ou le code brut si inconnu. */
export function libelleMotifNonDelivrance(motif: string): string {
  return (LIBELLES_MOTIF_NON_DELIVRANCE as Record<string, string>)[motif] ?? motif;
}

// RG-PHA-13 du pack : une delivrance est immuable une fois creee ; une erreur
// se corrige par une annulation motivee dans les 24 heures suivant sa
// creation, par la meme pharmacie, ce qui restitue les quantites annulees.
// Passe ce delai, l'annulation est refusee (voir annulerDelivranceAction).
export const HEURES_FENETRE_ANNULATION_DELIVRANCE = 24;

export const LONGUEUR_MIN_MOTIF_ANNULATION_DELIVRANCE = 10;

/** Vrai si la fenetre d'annulation d'une delivrance (24h) est depassee. */
export function delaiAnnulationDelivranceDepasse(
  dateDelivrance: Date,
  maintenant: Date = new Date()
): boolean {
  const limiteMs = HEURES_FENETRE_ANNULATION_DELIVRANCE * 60 * 60 * 1000;
  return maintenant.getTime() - dateDelivrance.getTime() > limiteMs;
}

/** Millisecondes restantes avant l'expiration de la fenetre d'annulation (0 si deja depassee). */
export function millisecondesRestantesAnnulation(
  dateDelivrance: Date,
  maintenant: Date = new Date()
): number {
  const limiteMs = HEURES_FENETRE_ANNULATION_DELIVRANCE * 60 * 60 * 1000;
  return Math.max(0, dateDelivrance.getTime() + limiteMs - maintenant.getTime());
}
