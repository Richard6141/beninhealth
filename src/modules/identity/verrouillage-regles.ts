/**
 * Constante pure de F-AUTH-08 (verrouillage d'ecran), separee de
 * verrouillage.ts : ce dernier est un fichier "use server" (Server
 * Actions), qui ne peut exporter que des fonctions async (contrainte
 * Next.js), jamais une constante de valeur. Importee par verrouillage.ts et
 * par son test.
 */
export const TENTATIVES_MAX_VERROUILLAGE = 3;
