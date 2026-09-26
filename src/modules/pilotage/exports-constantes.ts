/**
 * Types et constantes partages entre le module serveur des exports de
 * pilotage (exports.ts, "use server", ne peut exporter que des fonctions
 * async) et l'interface (F-PIL-05, chapitre 14 du pack).
 */

export type PorteeExportPilotage = "national" | "etablissement";

export type MotifExport = "rapport_mensuel" | "reunion" | "planification" | "autre";

export interface OptionMotifExport {
  value: MotifExport;
  label: string;
}

/** RG-PIL-40 : liste fermee, "autre" exige un texte libre complementaire. */
export const MOTIFS_EXPORT: OptionMotifExport[] = [
  { value: "rapport_mensuel", label: "Rapport mensuel" },
  { value: "reunion", label: "Réunion" },
  { value: "planification", label: "Planification" },
  { value: "autre", label: "Autre" },
];

export interface ExportPilotageActionState {
  error: string | null;
  success: boolean;
  /** Echo du motif confirme (jamais recalcule cote client) : sert a construire les liens de telechargement une fois la re-authentification reussie. */
  motif?: MotifExport;
  motifTexte?: string;
}
