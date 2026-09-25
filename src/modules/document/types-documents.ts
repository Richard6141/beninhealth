/**
 * Types de document medical et niveaux de confidentialite (F-CLI-13 du pack).
 *
 * Fichier separe de src/modules/document/actions.ts ("use server") : un
 * fichier "use server" ne peut exporter que des fonctions async, jamais une
 * constante ou un type (regle Next.js, voir src/modules/patient/consentement-durees.ts
 * pour le meme motif), or ces valeurs doivent etre importees telles quelles
 * par un composant client (FormulaireDocument.tsx) pour peupler les
 * selecteurs.
 */

export const TYPES_DOCUMENT_CONNUS = [
  "compte_rendu",
  "resultat",
  "imagerie",
  "courrier",
  "certificat",
  "autre",
] as const;
export type TypeDocumentMedical = (typeof TYPES_DOCUMENT_CONNUS)[number];

export const OPTIONS_TYPE_DOCUMENT: { valeur: TypeDocumentMedical; libelle: string }[] = [
  { valeur: "compte_rendu", libelle: "Compte rendu" },
  { valeur: "resultat", libelle: "Resultat" },
  { valeur: "imagerie", libelle: "Imagerie" },
  { valeur: "courrier", libelle: "Courrier" },
  { valeur: "certificat", libelle: "Certificat" },
  { valeur: "autre", libelle: "Autre" },
];

export const NIVEAUX_CONFIDENTIALITE_CONNUS = ["normal", "sensible"] as const;
export type NiveauConfidentialiteDocument = (typeof NIVEAUX_CONFIDENTIALITE_CONNUS)[number];

export const OPTIONS_NIVEAU_CONFIDENTIALITE: { valeur: NiveauConfidentialiteDocument; libelle: string }[] = [
  { valeur: "normal", libelle: "Normal" },
  { valeur: "sensible", libelle: "Sensible" },
];
