/**
 * Constantes partagees par le module urgence (F-CLI-10). Dans un fichier
 * separe, sans "use server" : un fichier Server Actions ne peut exporter que
 * des fonctions async, jamais une constante (regle deja rencontree ailleurs
 * dans ce depot, voir src/modules/patient/consentement-durees.ts).
 */

export const MOTIFS_URGENCE = [
  "patient_inconscient",
  "detresse_vitale",
  "patient_confus",
  "autre_urgence",
] as const;

export type MotifUrgence = (typeof MOTIFS_URGENCE)[number];

export const OPTIONS_MOTIF_URGENCE: { value: MotifUrgence; label: string }[] = [
  { value: "patient_inconscient", label: "Patient inconscient" },
  { value: "detresse_vitale", label: "Detresse vitale" },
  { value: "patient_confus", label: "Patient confus, incapable de repondre" },
  { value: "autre_urgence", label: "Autre urgence vitale" },
];
