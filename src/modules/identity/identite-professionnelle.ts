/**
 * Identite professionnelle nationale : profession + numero d'inscription a
 * l'Ordre (RG-AUTH-42 du pack : unique par profession). Module pur, sans acces
 * base ni reseau. Voir docs/conception-transfert-dossier.md, section 8.
 */

export const PROFESSIONS_CLINIQUES = [
  "medecin",
  "infirmier",
  "pharmacien",
  "laboratoire",
  "agent_communautaire",
] as const;

export type ProfessionClinique = (typeof PROFESSIONS_CLINIQUES)[number];

/** La profession clinique d'un role, ou null (ex. admin_etablissement n'a pas de profession propre). */
export function professionDepuisRole(role: string): ProfessionClinique | null {
  return (PROFESSIONS_CLINIQUES as readonly string[]).includes(role) ? (role as ProfessionClinique) : null;
}

/**
 * Forme canonique d'un numero d'ordre : sans espaces, en majuscules. Renvoie
 * null pour une saisie vide (numero non renseigne). Le format exact varie selon
 * l'Ordre et n'est pas confirme : seuls les caracteres usuels sont admis.
 */
export function normaliserNumeroOrdre(saisie: string): string | null {
  const nettoye = saisie.replace(/\s+/g, "").toUpperCase();
  return nettoye.length === 0 ? null : nettoye;
}

export const LONGUEUR_MAX_NUMERO_ORDRE = 40;

export function numeroOrdreValide(canonique: string): boolean {
  return canonique.length <= LONGUEUR_MAX_NUMERO_ORDRE && /^[A-Z0-9][A-Z0-9._/-]*$/.test(canonique);
}
