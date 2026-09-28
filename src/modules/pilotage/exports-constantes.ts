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

/**
 * Longueur minimale du texte libre du motif "autre" : meme seuil de 10
 * caracteres que le motif de l'export du journal d'audit (F-AUD-01,
 * audit/actions.ts) et du retrait de vaccination, pour qu'un motif trace
 * dans le journal soit reellement explicatif (5 auparavant).
 */
export const LONGUEUR_MIN_MOTIF_TEXTE_EXPORT = 10;

/**
 * Actions de JournalAudit propres aux exports de pilotage (F-PIL-05,
 * RG-PIL-40). Distinctes par format plutot que l'ancien "EXPORT" generique,
 * pour qu'un auditeur filtre directement les exports pilotage dans le
 * journal (meme convention snake_case que export_journal_audit_telecharge ou
 * export_donnees_telecharge). Le motif reste en clair dans la justification.
 */
export const ACTIONS_AUDIT_EXPORT_PILOTAGE = {
  csv: "export_pilotage_csv",
  pdf: "export_pilotage_pdf",
  repartitionCsv: "export_pilotage_repartition_csv",
  tendancesCsv: "export_pilotage_tendances_csv",
} as const;

export interface ExportPilotageActionState {
  error: string | null;
  success: boolean;
  /**
   * Jeton signe emis apres re-authentification reussie (voir jeton-export.ts) :
   * a joindre aux liens de telechargement. Il embarque le motif, que les
   * routes lisent dans le jeton verifie et non dans l'URL.
   */
  jeton?: string;
}
