/**
 * Niveaux d'acces proposes au patient lors de l'octroi d'un consentement
 * (F-CIT-10, RG-ACC-11, RG-ACC-13, CA-2) : "SUMMARY", "FULL", "FULL_SENSITIVE",
 * en langage simple a l'ecran. Independant du typeAcces existant (portee par
 * module : dossier_complet/consultations/prescriptions/examens/documents),
 * qui reste inchange : le niveau ajoute un second axe, la profondeur
 * d'information a l'interieur de cette portee.
 *
 * Fichier separe de src/modules/patient/actions.ts ("use server") pour la
 * meme raison que consentement-durees.ts : ces valeurs sont importees telles
 * quelles par des composants client (FormulaireNouveauConsentement.tsx).
 */

export const NIVEAUX_ACCES_CONNUS = ["SUMMARY", "FULL", "FULL_SENSITIVE"] as const;
export type NiveauAccesConsentement = (typeof NIVEAUX_ACCES_CONNUS)[number];

/** Niveau minimal de verification d'identite du patient (User.niveauVerification) pour accorder FULL_SENSITIVE (RG-ACC-13, CA-2). */
export const NIVEAU_VERIFICATION_MINIMAL_FULL_SENSITIVE = "N2";

export const OPTIONS_NIVEAU_ACCES_CONSENTEMENT: {
  valeur: NiveauAccesConsentement;
  libelle: string;
  description: string;
}[] = [
  {
    valeur: "SUMMARY",
    libelle: "L'essentiel",
    description: "Groupe sanguin, allergies, maladies chroniques, traitements en cours.",
  },
  {
    valeur: "FULL",
    libelle: "Tout mon dossier",
    description: "En plus : consultations, ordonnances, analyses, documents, sauf informations sensibles.",
  },
  {
    valeur: "FULL_SENSITIVE",
    libelle: "Tout, y compris les informations sensibles",
    description: "Uniquement vers un professionnel nommé, avec un compte vérifié (N2).",
  },
];

/** Libelle court, pour l'affichage dans la liste des accès accordés et les notifications. */
export const LIBELLES_NIVEAU_ACCES: Record<string, string> = {
  SUMMARY: "L'essentiel",
  FULL: "Tout le dossier (hors informations sensibles)",
  FULL_SENSITIVE: "Tout le dossier, y compris les informations sensibles",
};

/** Phrase de recapitulatif utilisee par l'ecran de confirmation dedie (F-CIT-10, etape 5). */
export const PHRASES_NIVEAU_ACCES_RECAPITULATIF: Record<string, string> = {
  SUMMARY: "l'essentiel de votre dossier (groupe sanguin, allergies, maladies chroniques, traitements en cours)",
  FULL: "tout votre dossier sauf les informations sensibles",
  FULL_SENSITIVE: "tout votre dossier, y compris les informations sensibles",
};
