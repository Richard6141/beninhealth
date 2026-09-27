/**
 * Recherche d'un professionnel de sante pour le partage de dossier (F-CIT-10
 * du pack) : a partir de 3 caracteres, insensible aux accents et a la casse,
 * sur le nom, la specialite ou l'etablissement. Module pur (pas de
 * "use server", pas d'acces base) : src/modules/patient/actions.ts (qui est
 * "use server", donc ne peut exporter que des fonctions asynchrones) importe
 * ces constantes et fonctions pures d'ici plutot que de les exporter
 * elle-meme, meme principe que src/modules/prescription/recherche-medicaments.ts.
 */

export const MIN_CARACTERES_RECHERCHE_PROFESSIONNEL = 3;
export const MAX_RESULTATS_RECHERCHE_PROFESSIONNEL = 20;

/** Minuscules, sans accents, espaces compactes (meme principe que recherche-medicaments.ts). */
export function normaliserPourRecherche(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai a partir de 3 caracteres (espaces exclus). */
export function rechercheProfessionnelSuffisante(terme: string): boolean {
  return normaliserPourRecherche(terme).replace(/ /g, "").length >= MIN_CARACTERES_RECHERCHE_PROFESSIONNEL;
}
