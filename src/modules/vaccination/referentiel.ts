/**
 * Referentiel simple du vaccin (F-CLI-11 du pack) et voies d'administration.
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * controles-doublons.ts : appelable cote serveur (seule autorite reelle,
 * voir actions.ts) et cote client (formulaire de saisie).
 */

export interface OptionReferentiel {
  value: string;
  label: string;
}

/** Vaccins courants du calendrier vaccinal, hors option "Autre" (texte libre). */
export const VACCINS_REFERENTIEL = [
  "BCG",
  "Polio",
  "Pentavalent",
  "Rougeole",
  "Fièvre jaune",
  "VAT",
  "COVID-19",
] as const;

/** Valeur speciale du selecteur de vaccin qui ouvre un champ de saisie libre. */
export const VALEUR_VACCIN_AUTRE = "Autre";

export const OPTIONS_VACCINS: OptionReferentiel[] = [
  ...VACCINS_REFERENTIEL.map((vaccin) => ({ value: vaccin, label: vaccin })),
  { value: VALEUR_VACCIN_AUTRE, label: VALEUR_VACCIN_AUTRE },
];

export const VOIES_ADMINISTRATION_VALEURS = [
  "intramusculaire",
  "sous_cutanee",
  "orale",
  "intradermique",
] as const;

export type VoieAdministration = (typeof VOIES_ADMINISTRATION_VALEURS)[number];

const LIBELLES_VOIES: Record<VoieAdministration, string> = {
  intramusculaire: "Intramusculaire",
  sous_cutanee: "Sous-cutanée",
  orale: "Orale",
  intradermique: "Intradermique",
};

export const OPTIONS_VOIES_ADMINISTRATION: OptionReferentiel[] = VOIES_ADMINISTRATION_VALEURS.map(
  (valeur) => ({ value: valeur, label: LIBELLES_VOIES[valeur] })
);

/** Libelle a afficher pour une voie stockee en base ; renvoie la valeur brute si inconnue. */
export function libelleVoie(valeur: string): string {
  return (LIBELLES_VOIES as Record<string, string>)[valeur] ?? valeur;
}

/** Longueur minimale du motif de retrait (RG-CLI-100 du pack). */
export const LONGUEUR_MIN_MOTIF_RETRAIT = 10;
