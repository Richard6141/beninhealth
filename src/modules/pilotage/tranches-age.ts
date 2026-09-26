/**
 * Tranches d'age standard du pilotage (section 14.2 du pack) et calcul de
 * l'age a une date donnee. RG-PIL-11 : l'age utilise pour une agregation est
 * toujours l'age du patient a la date de l'evenement (date de la
 * consultation, de la vaccination...), jamais l'age au moment du calcul de
 * l'agregat.
 */

export const TRANCHES_AGE_STANDARD = [
  "0-11 mois",
  "1-4 ans",
  "5-14 ans",
  "15-24 ans",
  "25-49 ans",
  "50-64 ans",
  "65 ans et plus",
] as const;

export type TrancheAge = (typeof TRANCHES_AGE_STANDARD)[number];

/** Age exact en annees revolues, a la date de l'evenement (RG-PIL-11). */
export function calculerAgeAnnees(dateNaissance: Date, dateEvenement: Date): number {
  let age = dateEvenement.getFullYear() - dateNaissance.getFullYear();
  const anniversaireDepasse =
    dateEvenement.getMonth() > dateNaissance.getMonth() ||
    (dateEvenement.getMonth() === dateNaissance.getMonth() && dateEvenement.getDate() >= dateNaissance.getDate());
  if (!anniversaireDepasse) {
    age -= 1;
  }
  return Math.max(age, 0);
}

/** Age exact en mois revolus, pour distinguer la tranche "0-11 mois". */
function calculerAgeMois(dateNaissance: Date, dateEvenement: Date): number {
  let mois = (dateEvenement.getFullYear() - dateNaissance.getFullYear()) * 12;
  mois += dateEvenement.getMonth() - dateNaissance.getMonth();
  if (dateEvenement.getDate() < dateNaissance.getDate()) {
    mois -= 1;
  }
  return Math.max(mois, 0);
}

/** Classe une date de naissance, a une date d'evenement donnee, dans une tranche d'age standard. */
export function classifierTrancheAge(dateNaissance: Date, dateEvenement: Date): TrancheAge {
  const mois = calculerAgeMois(dateNaissance, dateEvenement);
  if (mois <= 11) return "0-11 mois";
  const ans = calculerAgeAnnees(dateNaissance, dateEvenement);
  if (ans <= 4) return "1-4 ans";
  if (ans <= 14) return "5-14 ans";
  if (ans <= 24) return "15-24 ans";
  if (ans <= 49) return "25-49 ans";
  if (ans <= 64) return "50-64 ans";
  return "65 ans et plus";
}

/** Tranche binaire utilisee par IND-04 (paludisme) : "< 5 ans" / ">= 5 ans". */
export function classifierTrancheAgePaludisme(dateNaissance: Date, dateEvenement: Date): "< 5 ans" | ">= 5 ans" {
  return calculerAgeAnnees(dateNaissance, dateEvenement) < 5 ? "< 5 ans" : ">= 5 ans";
}
