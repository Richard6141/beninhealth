/**
 * Controles des constantes vitales (pack Claude Code, F-CLI-06) : "Une
 * valeur hors plage acceptee DOIT etre refusee avec le message << Valeur
 * impossible, verifiez la saisie >> ; une valeur dans la plage d'alerte DOIT
 * etre acceptee mais affichee en orange avec la confirmation << Valeur
 * inhabituelle, confirmez-vous ? >>" (RG-CLI-50). Les plages d'alerte du
 * pouls, de la frequence respiratoire et de la tension systolique dependent
 * de l'age (RG-CLI-51, section 18.7) ; les autres constantes n'ont qu'une
 * plage adulte dans le pack.
 *
 * [Valeurs indicatives a faire valider par un medecin referent avant usage
 * reel, comme le pack le precise lui-meme pour la section 18.7.]
 *
 * Module pur (pas de "use server", pas d'acces base) : appelable a la fois
 * cote serveur (verification bloquante, seule autorite reelle) et cote
 * client (retour immediat a l'ecran).
 */

export type StatutConstante = "ok" | "alerte" | "refus";

export interface ResultatControleConstante {
  statut: StatutConstante;
  message: string;
}

interface Plage {
  min: number;
  max: number;
}

const OK: ResultatControleConstante = { statut: "ok", message: "" };

function controlerPlage(
  valeur: number,
  accepte: Plage,
  alerteBas: number | null,
  alerteHaut: number | null
): ResultatControleConstante {
  if (valeur < accepte.min || valeur > accepte.max) {
    return { statut: "refus", message: "Valeur impossible, verifiez la saisie." };
  }

  if (alerteBas !== null && valeur < alerteBas) {
    return { statut: "alerte", message: "Valeur inhabituelle, confirmez-vous ?" };
  }

  if (alerteHaut !== null && valeur > alerteHaut) {
    return { statut: "alerte", message: "Valeur inhabituelle, confirmez-vous ?" };
  }

  return OK;
}

/** Age en annees revolues a la date de la consultation. */
export function ageAnnees(dateNaissance: Date, dateReference: Date): number {
  let age = dateReference.getFullYear() - dateNaissance.getFullYear();
  const moisDiff = dateReference.getMonth() - dateNaissance.getMonth();
  if (moisDiff < 0 || (moisDiff === 0 && dateReference.getDate() < dateNaissance.getDate())) {
    age -= 1;
  }
  return age;
}

/** Age en mois revolus, utilise pour distinguer < 2 mois et 2-11 mois (section 18.7). */
function ageMois(dateNaissance: Date, dateReference: Date): number {
  const anneesEnMois = (dateReference.getFullYear() - dateNaissance.getFullYear()) * 12;
  const mois = anneesEnMois + (dateReference.getMonth() - dateNaissance.getMonth());
  return dateReference.getDate() < dateNaissance.getDate() ? mois - 1 : mois;
}

export function controlerTemperature(valeurCelsius: number): ResultatControleConstante {
  return controlerPlage(valeurCelsius, { min: 30.0, max: 45.0 }, 35.5, 38.5);
}

/** Plage d'alerte du pouls (bpm), dependante de l'age (section 18.7 pour < 12 ans, F-CLI-06 sinon). */
export function controlerPouls(valeurBpm: number, dateNaissance: Date | null, dateReference: Date): ResultatControleConstante {
  const accepte: Plage = { min: 20, max: 250 };

  if (!dateNaissance) {
    return controlerPlage(valeurBpm, accepte, 50, 120);
  }

  const mois = ageMois(dateNaissance, dateReference);
  const annees = ageAnnees(dateNaissance, dateReference);

  if (mois < 2) return controlerPlage(valeurBpm, accepte, 100, 180);
  if (mois < 12) return controlerPlage(valeurBpm, accepte, 100, 160);
  if (annees < 5) return controlerPlage(valeurBpm, accepte, 90, 140);
  if (annees < 12) return controlerPlage(valeurBpm, accepte, 70, 120);
  return controlerPlage(valeurBpm, accepte, 50, 120);
}

/** Tension systolique (mmHg), plage d'alerte basse dependante de l'age (section 18.7). */
export function controlerTensionSystolique(
  systolique: number,
  diastolique: number,
  dateNaissance: Date | null,
  dateReference: Date
): ResultatControleConstante {
  const accepte: Plage = { min: 50, max: 300 };

  if (systolique <= diastolique) {
    return { statut: "refus", message: "Valeur impossible, verifiez la saisie." };
  }

  if (!dateNaissance) {
    return controlerPlage(systolique, accepte, 90, 140);
  }

  const mois = ageMois(dateNaissance, dateReference);
  const annees = ageAnnees(dateNaissance, dateReference);

  if (mois < 2) return controlerPlage(systolique, accepte, 60, null);
  if (mois < 12) return controlerPlage(systolique, accepte, 70, null);
  if (annees < 5) return controlerPlage(systolique, accepte, 70 + 2 * annees, null);
  if (annees < 12) return controlerPlage(systolique, accepte, 80, null);
  return controlerPlage(systolique, accepte, 90, 140);
}

export function controlerTensionDiastolique(valeurMmHg: number): ResultatControleConstante {
  return controlerPlage(valeurMmHg, { min: 20, max: 200 }, 60, 90);
}

/** Frequence respiratoire (/min), plage d'alerte dependante de l'age (section 18.7). */
export function controlerFrequenceRespiratoire(
  valeurParMin: number,
  dateNaissance: Date | null,
  dateReference: Date
): ResultatControleConstante {
  const accepte: Plage = { min: 5, max: 80 };

  if (!dateNaissance) {
    return controlerPlage(valeurParMin, accepte, null, 24);
  }

  const mois = ageMois(dateNaissance, dateReference);
  const annees = ageAnnees(dateNaissance, dateReference);

  if (mois < 2) return controlerPlage(valeurParMin, accepte, null, 60);
  if (mois < 12) return controlerPlage(valeurParMin, accepte, null, 50);
  if (annees < 5) return controlerPlage(valeurParMin, accepte, null, 40);
  if (annees < 12) return controlerPlage(valeurParMin, accepte, null, 30);
  return controlerPlage(valeurParMin, accepte, null, 24);
}

export function controlerSaturationOxygene(valeurPourcent: number): ResultatControleConstante {
  return controlerPlage(valeurPourcent, { min: 50, max: 100 }, 94, null);
}

export function controlerPoids(valeurKg: number): ResultatControleConstante {
  return controlerPlage(valeurKg, { min: 0.3, max: 300 }, null, null);
}

export function controlerTaille(valeurCm: number): ResultatControleConstante {
  return controlerPlage(valeurCm, { min: 20, max: 250 }, null, null);
}

export function controlerGlycemie(valeurGL: number): ResultatControleConstante {
  return controlerPlage(valeurGL, { min: 0.2, max: 6.0 }, 0.7, 1.8);
}

/** IMC = poids (kg) / taille (m)^2, alerte si < 18,5 ou >= 30 (F-CLI-06). Retourne null si poids ou taille manquant. */
export function calculerIMC(poidsKg: number | null, tailleCm: number | null): number | null {
  if (poidsKg === null || tailleCm === null || tailleCm <= 0) return null;
  const tailleM = tailleCm / 100;
  return poidsKg / (tailleM * tailleM);
}

export function controlerIMC(imc: number): ResultatControleConstante {
  if (imc < 18.5 || imc >= 30) {
    return { statut: "alerte", message: "IMC inhabituel, confirmez-vous ?" };
  }
  return OK;
}
