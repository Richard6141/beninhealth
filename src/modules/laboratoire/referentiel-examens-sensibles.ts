/**
 * Referentiel des examens "sensibles" (pack Claude Code, F-LAB-01 / RG-LAB-02) :
 * "Un examen du groupe << sensible >> (ex. serologie VIH) DOIT etre marque
 * SENSITIVE et ANNOUNCE_REQUIRED : le resultat ne sera montre au patient
 * qu'apres annonce par un professionnel (F-LAB-05)."
 *
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * src/modules/prescription/referentiel-allergies.ts : typeExamen est un champ
 * texte libre dans ce MVP (pas encore un referentiel structure d'examens, voir
 * docs/audit-cote-laboratoire.md), donc la detection se fait par mots-cles sur
 * le libelle saisi. A remplacer par un vrai champ de referentiel (avec le
 * marquage SENSITIVE porte par l'examen du catalogue) le jour ou ce catalogue
 * existera.
 */

const MOTS_CLES_EXAMENS_SENSIBLES = ["vih", "sida", "hiv"];

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Indique si un libelle d'examen (typeExamen) correspond a un examen sensible connu. */
export function estExamenSensible(typeExamen: string): boolean {
  const normalise = normaliser(typeExamen);
  return MOTS_CLES_EXAMENS_SENSIBLES.some((motCle) => normalise.includes(motCle));
}
