/**
 * Constantes pures pour le formulaire du referentiel medicaments (F-ADM-04).
 * Fichier separe de referentiel-medicaments.ts ("use server") : un module
 * "use server" ne peut exporter que des fonctions async, pattern deja
 * rencontre ce soir (parametres.ts -> fonctionnalites-catalogue.ts,
 * posologie.ts, referentiel-allergies.ts).
 */

/** Options courtes pour la forme galenique (voir docs/pack claude, section 18.4). */
export const FORMES_CONNUES = [
  "comprime",
  "gelule",
  "sirop",
  "suspension",
  "injectable",
  "pommade",
  "suppositoire",
  "autre",
] as const;

export const NOMBRE_NOMS_COMMERCIAUX_MAX = 10;
export const LONGUEUR_NOM_COMMERCIAL_MAX = 60;

/**
 * Code ATC (classification anatomique, therapeutique et chimique) a l'un des
 * cinq niveaux : A, A10, A10B, A10BA ou A10BA02. Vide accepte (non renseigne).
 */
export const FORMAT_CODE_ATC = /^[A-Z](\d{2}([A-Z]([A-Z](\d{2})?)?)?)?$/;

/** Code ATC normalise (majuscules, sans espaces), ou null s'il n'a pas un format valide ; "" reste "". */
export function normaliserCodeAtc(texte: string): string | null {
  const code = texte.replace(/\s+/g, "").toUpperCase();
  if (code.length === 0) return "";
  return FORMAT_CODE_ATC.test(code) ? code : null;
}

/**
 * Noms commerciaux saisis dans un champ texte (separes par des virgules ou
 * des points-virgules) : espaces retires, doublons ignores sans tenir compte
 * de la casse. Renvoie null si un nom depasse LONGUEUR_NOM_COMMERCIAL_MAX ou
 * si la liste depasse NOMBRE_NOMS_COMMERCIAUX_MAX.
 */
export function analyserNomsCommerciaux(texte: string): string[] | null {
  const vus = new Set<string>();
  const noms: string[] = [];

  for (const brut of texte.split(/[,;]/)) {
    const nom = brut.trim().replace(/\s+/g, " ");
    if (nom.length === 0) continue;
    if (nom.length > LONGUEUR_NOM_COMMERCIAL_MAX) return null;

    const cle = nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    noms.push(nom);
  }

  return noms.length > NOMBRE_NOMS_COMMERCIAUX_MAX ? null : noms;
}
