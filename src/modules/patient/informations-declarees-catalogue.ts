/**
 * Constante pure des categories d'informations declarees (F-CIT-04). Fichier
 * separe de informations-declarees.ts ("use server") : un module "use
 * server" ne peut exporter que des fonctions async, meme pattern deja
 * rencontre ce soir (referentiels-simples-catalogue.ts, chronologie-catalogue.ts).
 */

export const CATEGORIES_INFORMATION_DECLAREE = [
  "allergie",
  "antecedent",
  "maladie_chronique",
  "contact_urgence",
] as const;
export type CategorieInformationDeclaree = (typeof CATEGORIES_INFORMATION_DECLAREE)[number];
