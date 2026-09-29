/**
 * Regles pures d'expiration et de verrouillage du mode hors ligne
 * (RG-COM-02, RG-COM-03). Module sans effet de bord, teste independamment de
 * IndexedDB (qui n'est pas testable sans dependance externe dans ce depot).
 */

/** RG-COM-02 : 5 PIN errones effacent les donnees locales non synchronisables. */
export const MAX_ECHECS_PIN = 5;

/** RG-COM-03 : apres 30 jours sans synchronisation, les donnees de lecture sont effacees. */
export const JOURS_EXPIRATION_INSTANTANE = 30;

/** RG-COM-02 : vrai des que le compteur d'echecs de PIN atteint la limite. */
export function doitEffacerApresEchecsPin(compteurEchecs: number): boolean {
  return compteurEchecs >= MAX_ECHECS_PIN;
}

/** RG-COM-03 : vrai si aucune synchronisation n'a eu lieu depuis 30 jours (ou jamais). */
export function instantaneExpire(dateDerniereSynchronisation: Date | null, maintenant: Date = new Date()): boolean {
  if (!dateDerniereSynchronisation) return false; // pas encore d'instantane telecharge : rien a expirer
  const ecartMs = maintenant.getTime() - dateDerniereSynchronisation.getTime();
  const ecartJours = ecartMs / (24 * 60 * 60 * 1000);
  return ecartJours >= JOURS_EXPIRATION_INSTANTANE;
}
