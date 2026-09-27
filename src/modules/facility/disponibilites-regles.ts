/**
 * Constantes pures de F-ETA-05 (durée/capacité de créneau), séparées de
 * disponibilites.ts : ce dernier est un fichier "use server" (Server
 * Actions), qui ne peut exporter que des fonctions async (contrainte
 * Next.js), jamais une constante de valeur. Importé à la fois par
 * disponibilites.ts (validation) et par l'écran (FormulaireCreneaux.tsx,
 * options du sélecteur).
 */
export const DUREES_CRENEAU_MINUTES = [10, 15, 20, 30, 45, 60] as const;
export const CAPACITE_MIN = 1;
export const CAPACITE_MAX = 10;
