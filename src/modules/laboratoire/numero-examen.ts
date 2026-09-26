import { randomInt } from "node:crypto";

/**
 * Numero de demande d'examen lisible LB-XXXX-XXXX (F-LAB-01 du pack).
 * Volontairement HORS d'un fichier "use server". Tire au hasard, jamais un
 * compteur : deux demandes simultanees ne se disputent aucune sequence, et
 * la contrainte d'unicite de ExamenMedical.numero attrape l'improbable
 * collision (32^8 combinaisons), que l'appelant traite par un nouvel essai.
 * L'alphabet exclut 0, 1, I et O pour rester lisible et dictable.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const FORMAT_NUMERO_EXAMEN = /^LB-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

function bloc(longueur: number): string {
  let resultat = "";
  for (let i = 0; i < longueur; i += 1) {
    resultat += ALPHABET[randomInt(ALPHABET.length)];
  }
  return resultat;
}

export function genererNumeroExamen(): string {
  return `LB-${bloc(4)}-${bloc(4)}`;
}

/** Vrai si l'erreur est une violation de contrainte d'unicite Prisma (P2002). */
export function estCollisionUnicite(erreur: unknown): boolean {
  return typeof erreur === "object" && erreur !== null && (erreur as { code?: unknown }).code === "P2002";
}
