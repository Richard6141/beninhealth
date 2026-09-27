/**
 * Types partages entre le module de lecture de la carte (carte.ts, "use
 * server", qui ne peut exporter que des fonctions async) et l'ecran (F-PIL-03).
 */

import type { ValeurMasquee } from "./masquage";
import type { PeriodeCarte } from "./carte-regles";

export interface DepartementCarte {
  id: string;
  code: string;
  nom: string;
  /** Valeur de l'indicateur sur la periode, masquee (RG-PIL-02) : jamais un effectif de 1 a 4. */
  valeur: ValeurMasquee;
  /** Classe de la carte choroplethe, 0 (faible) a 4 (elevee). */
  classe: number;
  nombreEtablissements: number;
}

export interface EtablissementCarte {
  id: string;
  nom: string;
  type: string;
  x: number;
  y: number;
}

export interface CarteSanitaire {
  indicateur: { code: string; libelle: string };
  periode: PeriodeCarte;
  departements: DepartementCarte[];
  /** Valeur numerique la plus elevee parmi les departements, pour la legende. */
  maximum: number;
  etablissements: EtablissementCarte[] | null;
}
