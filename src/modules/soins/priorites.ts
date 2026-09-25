/**
 * Niveaux de priorite de tri saisis par l'infirmier lors de la prise en
 * charge (F-CLI-12 du pack). Module pur (pas de "use server", pas d'acces
 * base), sur le meme principe que controles-constantes.ts : appelable a la
 * fois par la Server Action de validation (src/modules/soins/actions.ts) et
 * par le composant client qui peuple le selecteur
 * (src/app/app/medecin/soins/nouvelle/FormulairePriseEnCharge.tsx). Une
 * constante de valeur (pas seulement un type) ne peut pas etre exportee
 * depuis un fichier "use server" : ce module reste volontairement separe de
 * actions.ts pour cette raison.
 */

export const PRIORITES_TRI = ["urgent", "prioritaire", "standard"] as const;

export type PrioriteTri = (typeof PRIORITES_TRI)[number];

export const LIBELLES_PRIORITE_TRI: Record<PrioriteTri, string> = {
  urgent: "Urgent",
  prioritaire: "Prioritaire",
  standard: "Standard",
};
