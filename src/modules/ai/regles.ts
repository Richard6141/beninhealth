/**
 * Constantes et vocabulaire de l'IA (chapitre 16 du pack). Module pur (pas de
 * "use server", aucun acces base). L'IA assiste, elle ne remplace pas le
 * professionnel (RG-IA-01) : rien de ce qui sort de ce module n'est enregistre
 * dans le dossier du patient et rien n'est envoye a un patient.
 */

export const VERSION_CONSIGNE_RESUME = "resume-v1";

/** RG-IA-07 : mention affichee avec tout contenu produit par l'IA. */
export const MENTION_GENEREE = "Généré automatiquement, à vérifier par le professionnel";

/** RG-IA-03 : tant que l'APDP n'a pas autorise le traitement, seules des donnees fictives peuvent etre traitees. */
export const MENTION_DONNEES_FICTIVES = "Données fictives : l'IA ne doit être utilisée qu'avec des données de démonstration tant que l'APDP n'a pas autorisé ce traitement.";

/** F-IA-01 : 30 resumes par heure et par medecin. */
export const LIMITE_RESUMES_PAR_HEURE = 30;

/** F-IA-01 : donnees des 24 derniers mois. */
export const MOIS_HISTORIQUE_RESUME = 24;

/** F-IA-01 : 8 puces au plus. */
export const NOMBRE_MAX_PUCES = 8;

/** F-IA-01 etape 5 : en dessous de 2 puces conformes, le resume est indisponible. */
export const NOMBRE_MIN_PUCES = 2;

export const MESSAGE_RESUME_INDISPONIBLE = "Résumé indisponible, consultez l'historique.";

/** RG-IA-08 : commentaire de retour conserve 30 jours au plus. */
export const JOURS_CONSERVATION_COMMENTAIRE_RETOUR = 30;

export const LONGUEUR_MAX_COMMENTAIRE_RETOUR = 300;

/**
 * Consigne systeme fixe, versionnee dans le code (F-IA-01 etape 4). Toute
 * modification change VERSION_CONSIGNE_RESUME et doit repasser le jeu
 * d'evaluation (RG-IA-20).
 */
export const CONSIGNE_SYSTEME_RESUME = [
  "Tu résumes un dossier médical fictif pour un médecin, en français.",
  `Écris au plus ${NOMBRE_MAX_PUCES} puces, une par ligne, commençant par "- ".`,
  "Utilise UNIQUEMENT les éléments fournis, chacun précédé d'une étiquette [S1], [S2]...",
  "Chaque puce cite au moins une étiquette entre crochets, par exemple [S2].",
  "Ne propose JAMAIS de diagnostic, de traitement ni de posologie. Ne modifie rien.",
  "Signale les informations manquantes importantes quand elles figurent dans les éléments.",
].join("\n");

export type TypeElement = "allergie" | "antecedent" | "maladie_chronique" | "traitement" | "consultation" | "resultat_anormal" | "vaccination" | "information_manquante";

export const LIBELLES_TYPE_ELEMENT: Record<TypeElement, string> = {
  allergie: "Allergie",
  antecedent: "Antécédent",
  maladie_chronique: "Maladie chronique",
  traitement: "Traitement en cours",
  consultation: "Consultation",
  resultat_anormal: "Résultat anormal",
  vaccination: "Vaccination",
  information_manquante: "Information manquante",
};

/** Un element du dossier propose au modele, deja minimise et etiquete. */
export interface ElementSource {
  /** "S1", "S2"... */
  etiquette: string;
  type: TypeElement;
  /** Texte deja assaini : jamais de nom, telephone, identifiant ni NPI (RG-IA-04). */
  texte: string;
  /** Date ISO de l'element quand elle existe, pour l'affichage du lien vers la chronologie. */
  date: string | null;
}

export interface PuceValidee {
  texte: string;
  /** Etiquettes citees, toutes existantes. */
  sources: string[];
}
