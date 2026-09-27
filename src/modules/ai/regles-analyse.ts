/**
 * Vocabulaire de l'analyse des agregats (F-IA-04). Module pur : la version de
 * la methode change des qu'un seuil ou une formule de analyse-agregats.ts
 * change, et le jeu d'evaluation doit alors etre rejoue (RG-IA-20).
 */

export const VERSION_METHODE_ANALYSE = "analyse-v1";

export const MENTION_SIGNAL = "Signal statistique à vérifier : ce constat automatique ne remplace pas l'analyse d'un épidémiologiste et ne déclenche aucune communication.";

/** Explication de la methode, affichee avec les resultats et dans la fiche de gouvernance. */
export const EXPLICATION_METHODE: readonly string[] = [
  "Les données analysées sont uniquement les agrégats de pilotage, par département et par semaine complète (les 12 dernières). Aucune donnée individuelle n'est lue.",
  "Pic ou chute : la dernière semaine est comparée à la médiane des 8 semaines précédentes. L'écart est divisé par la dispersion habituelle (la plus grande de l'écart absolu médian corrigé, de l'écart interquartile normalisé, de la racine de la médiane et de 1). Au-delà de 3, un signal est levé si la semaine compte au moins 10 unités (pic) ou si l'activité habituelle est d'au moins 20 (chute).",
  "Tendance : sur les 8 dernières semaines, la moyenne des 4 premières est comparée à celle des 4 dernières. Un signal est levé si la variation atteint 30 % et si au moins 5 des 7 variations d'une semaine à l'autre vont dans le même sens.",
  "Petits effectifs : une valeur de 1 à 4 n'est jamais affichée. Quand une valeur de comparaison est inférieure à 5, le score exact n'est pas donné.",
  "Avec moins de 6 semaines d'historique, aucune conclusion n'est tirée.",
];
