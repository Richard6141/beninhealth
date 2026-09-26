/**
 * Constantes et types partages entre le module serveur (tendances.ts, marque
 * "use server") et l'interface (F-PIL-04). Un fichier "use server" ne peut
 * exporter QUE des fonctions async (contrainte Next.js/Turbopack : "Only
 * async functions are allowed to be exported in a 'use server' file") : toute
 * constante ou tout type utilise cote client doit donc vivre dans ce fichier
 * separe, jamais directement dans tendances.ts.
 */

import { trouverDefinitionIndicateur } from "./indicateurs";
import type { ValeurMasquee } from "./masquage";

export type GranulariteTendance = "semaine" | "mois";

export interface IndicateurComparable {
  code: string;
  libelle: string;
}

/**
 * Valeur : la dimensionLibre a filtrer pour cet indicateur, ou null pour
 * sommer toutes les lignes de l'indicateur sans filtrer (cas de IND-01/02/04,
 * dont dimensionLibre est toujours null en base, et de IND-10, dont chaque
 * dose/vaccin a sa propre dimensionLibre qu'on veut toutes additionner).
 */
export const DIMENSION_PAR_INDICATEUR_COMPARABLE: Record<string, string | null> = {
  "IND-01": null,
  "IND-02": null,
  "IND-04": null,
  "IND-07": "pris",
  "IND-08": "signees",
  "IND-10": null,
};

export const INDICATEURS_COMPARABLES: IndicateurComparable[] = Object.keys(
  DIMENSION_PAR_INDICATEUR_COMPARABLE
).map((code) => {
  const definition = trouverDefinitionIndicateur(code)!;
  return { code: definition.code, libelle: definition.libelle };
});

export interface TerritoireOption {
  id: string;
  code: string;
  nom: string;
}

export interface PointComparaison {
  /** Debut du bucket (lundi de la semaine, ou 1er du mois), format "AAAA-MM-JJ". */
  debut: string;
  /** Libelle court pour l'axe du graphique, ex. "15/01" ou "janv. 2026". */
  libelle: string;
  /** Cle = TerritoireOption.id. */
  valeurs: Record<string, ValeurMasquee>;
}

export interface FiltresTendances {
  indicateurCode: string;
  granularite: GranulariteTendance;
  /** Ids de Departement, 2 a 5 apres deduplication. */
  territoireIds: string[];
  /** Nombre de mois a remonter depuis aujourd'hui, borne a 24 (pack : "jusqu'a 24 mois"). */
  periodeMois: number;
}

export interface ResultatTendances {
  indicateur: IndicateurComparable;
  granularite: GranulariteTendance;
  periodeMois: number;
  territoires: TerritoireOption[];
  points: PointComparaison[];
}

export const PERIODE_MOIS_MAXIMUM = 24;
export const PERIODE_MOIS_DEFAUT = 6;
export const NOMBRE_TERRITOIRES_MINIMUM = 2;
export const NOMBRE_TERRITOIRES_MAXIMUM = 5;
