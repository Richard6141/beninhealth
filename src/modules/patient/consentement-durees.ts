/**
 * Durees d'autorisation proposees au patient (F-CIT-10, cahier des charges) :
 * 24h/7j/30j/6mois/12mois, jamais permanent (RG-ACC-12 : 12 mois maximum,
 * renouvellement requis au-dela).
 *
 * Fichier separe de src/modules/patient/actions.ts ("use server") : un
 * fichier "use server" ne peut exporter que des fonctions async, jamais une
 * constante ou un type (regle Next.js), or ces valeurs doivent etre
 * importees telles quelles par un composant client
 * (FormulaireNouveauConsentement.tsx) pour peupler le selecteur de duree.
 */

export const DUREES_CONSENTEMENT_CONNUES = ["24h", "7j", "30j", "6mois", "12mois"] as const;
export type DureeConsentement = (typeof DUREES_CONSENTEMENT_CONNUES)[number];

export const OPTIONS_DUREE_CONSENTEMENT: { valeur: DureeConsentement; libelle: string }[] = [
  { valeur: "24h", libelle: "24 heures" },
  { valeur: "7j", libelle: "7 jours" },
  { valeur: "30j", libelle: "30 jours" },
  { valeur: "6mois", libelle: "6 mois" },
  { valeur: "12mois", libelle: "12 mois" },
];

/**
 * Calcule la date de fin a partir d'une duree preselectionnee, jamais
 * indefinie. Fonction pure (pas d'acces base) : vit ici plutot que dans
 * actions.ts ("use server") pour la meme raison que les constantes
 * ci-dessus, et reutilisee par identity/actions.ts
 * (creerPatientParProfessionnelAction) pour le consentement accorde
 * automatiquement au medecin qui cree un patient "sans compte".
 */
export function calculerDateFinConsentement(duree: DureeConsentement, depuis: Date): Date {
  const dateFin = new Date(depuis);
  switch (duree) {
    case "24h":
      dateFin.setHours(dateFin.getHours() + 24);
      break;
    case "7j":
      dateFin.setDate(dateFin.getDate() + 7);
      break;
    case "30j":
      dateFin.setDate(dateFin.getDate() + 30);
      break;
    case "6mois":
      dateFin.setMonth(dateFin.getMonth() + 6);
      break;
    case "12mois":
      dateFin.setMonth(dateFin.getMonth() + 12);
      break;
  }
  return dateFin;
}
