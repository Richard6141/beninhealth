/**
 * Controles de securite "age", "grossesse" et "duree" de la prescription
 * (pack Claude Code, F-PRE-02, table des controles) :
 * - Age : "Medicament marque contre-indique avant X ans dans le referentiel"
 *   -> niveau Bloquant, "Retirer ou forcer avec justification".
 * - Grossesse : "Patiente avec grossesse en cours connue et medicament
 *   marque contre-indique pendant la grossesse" -> niveau Bloquant, "Retirer
 *   ou forcer avec justification".
 * - Duree : "Duree > 30 jours pour un antibiotique" -> niveau Avertissement,
 *   "Confirmer".
 *
 * Complete referentiel-allergies.ts (allergie, Bloquant) et
 * controles-doublons.ts (doublon/meme classe, Avertissement) : meme famille
 * de controles F-PRE-02, repartis sur plusieurs fichiers plutot qu'un seul
 * gros module, a l'image du reste du depot.
 *
 * Module pur (pas de "use server", pas d'acces base) : appelable a la fois
 * cote serveur (verification bloquante, seule autorite reelle) et cote
 * client (retour immediat a l'ecran, jamais la seule ligne de defense).
 */

/** Age en mois complets d'un patient a une date de reference donnee. */
export function ageEnMois(dateNaissance: Date, dateReference: Date = new Date()): number {
  const mois =
    (dateReference.getFullYear() - dateNaissance.getFullYear()) * 12 +
    (dateReference.getMonth() - dateNaissance.getMonth());

  // Ajuste si le jour du mois de la date de reference precede celui de la
  // naissance (meme principe que src/modules/vaccination/referentiel.ts
  // pour le controle d'age vaccinal, evite d'arrondir a la hausse).
  return dateReference.getDate() < dateNaissance.getDate() ? mois - 1 : mois;
}

/**
 * Indique si un medicament est contre-indique pour un patient trop jeune, et
 * renvoie l'age minimum concerne (en mois) pour le message a l'ecran, ou null
 * si aucune restriction ne s'applique (age suffisant ou medicament sans
 * restriction connue, ageMinimumMois null).
 */
export function ageMinimumNonAtteint(
  medicament: { ageMinimumMois: number | null },
  patient: { dateNaissance: Date },
  dateReference: Date = new Date()
): number | null {
  if (medicament.ageMinimumMois === null) {
    return null;
  }

  return ageEnMois(patient.dateNaissance, dateReference) < medicament.ageMinimumMois
    ? medicament.ageMinimumMois
    : null;
}

/** Libelle lisible d'un age minimum en mois (ex. "24 mois" ou "6 ans"). */
export function libelleAgeMinimum(ageMinimumMois: number): string {
  if (ageMinimumMois % 12 === 0 && ageMinimumMois >= 12) {
    const ans = ageMinimumMois / 12;
    return `${ans} an${ans > 1 ? "s" : ""}`;
  }
  return `${ageMinimumMois} mois`;
}

/**
 * Indique si un medicament contre-indique pendant la grossesse est prescrit
 * a une patiente dont la grossesse en cours est declaree. RG-PRE-02 ne
 * s'applique qu'aux patientes (sexe "F", meme convention que
 * src/modules/patient/actions.ts) : un patient de sexe "M" n'est jamais
 * concerne, quel que soit le medicament.
 */
export function grossesseIncompatible(
  medicament: { contreIndiqueGrossesse: boolean },
  patient: { sexe: string; grossesseEnCours: boolean }
): boolean {
  return medicament.contreIndiqueGrossesse && patient.sexe === "F" && patient.grossesseEnCours;
}

function normaliserClasse(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Familles d'antibiotiques reconnues par classe therapeutique (meme
 * convention que CLASSES_PAR_ALLERGIE dans referentiel-allergies.ts : chaine
 * libre, pas de table ATC dediee dans ce depot). "Antibiotique(s)" au sens
 * large reste aussi reconnu directement, pour un medicament dont la classe
 * ne correspond a aucune famille listee ici.
 */
const CLASSES_ANTIBIOTIQUES = new Set([
  "penicillines",
  "cephalosporines",
  "sulfamides",
  "macrolides",
  "quinolones",
  "aminosides",
  "tetracyclines",
  "antibiotiques",
  "antibiotique",
]);

function estAntibiotique(classeTherapeutique: string): boolean {
  const classe = normaliserClasse(classeTherapeutique);
  return classe.length > 0 && (CLASSES_ANTIBIOTIQUES.has(classe) || classe.includes("antibiotique"));
}

/**
 * Duree de traitement excessive pour un antibiotique (pack : "> 30 jours").
 * Niveau Avertissement, pas Bloquant : simple confirmation attendue, jamais
 * un motif de refus pour les medicaments hors de cette classe.
 */
export function dureeAntibiotiqueExcessive(
  medicament: { classeTherapeutique: string },
  dureeTraitementJours: number
): boolean {
  return estAntibiotique(medicament.classeTherapeutique) && dureeTraitementJours > 30;
}
