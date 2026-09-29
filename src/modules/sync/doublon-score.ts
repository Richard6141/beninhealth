/**
 * Contrôle de doublon rejoué côté serveur au moment de la synchronisation
 * d'une personne communautaire créée hors ligne (F-COM-02, F-COM-08).
 *
 * Le pack décrit un "score >= 80" sans donner de formule exacte (comme pour
 * F-CLI-03 et F-ADM-06, déjà simplifiés ailleurs dans ce dépôt, voir
 * docs/reste-a-faire.md). Simplification assumée ici : un score pondéré sur
 * 100, basé sur une correspondance normalisée (même normalisation que
 * normaliserPourComparaison dans communautaire/actions.ts, NFD + suppression
 * des diacritiques + minuscule) de quatre champs, jamais une distance
 * d'édition floue (Levenshtein, etc., hors de portée ce soir). Un score >= 80
 * place la nouvelle fiche en revue (statutRevue = "REVIEW") au lieu de la
 * créer normalement, conformément au texte du pack pour F-COM-02.
 *
 * Pondération : nom (40) + prenom (30) + date de naissance exacte (20) +
 * sexe (10) = 100 au maximum. Nom et prenom pèsent le plus car ce sont les
 * champs les plus discriminants pour une population sans identifiant
 * national ; la date de naissance déclarée sur le terrain est souvent
 * approximative (dateNaissanceApproximative), d'où un poids plus faible que
 * nom+prenom réunis.
 */

const SEUIL_REVUE = 80;

export interface CandidatDoublonScore {
  nom: string;
  prenom: string;
  dateNaissance: Date;
  sexe: string;
}

/** Même normalisation que normaliserPourComparaison (communautaire/actions.ts, identity/actions.ts) : NFD, suppression des diacritiques, minuscule, espaces bordure retirés. */
export function normaliserPourComparaison(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function memeJour(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

/** Calcule le score de correspondance (0 à 100) entre une fiche candidate et une personne déjà enregistrée. */
export function calculerScoreDoublon(candidat: CandidatDoublonScore, existante: CandidatDoublonScore): number {
  let score = 0;

  if (normaliserPourComparaison(candidat.nom) === normaliserPourComparaison(existante.nom)) {
    score += 40;
  }
  if (normaliserPourComparaison(candidat.prenom) === normaliserPourComparaison(existante.prenom)) {
    score += 30;
  }
  if (memeJour(candidat.dateNaissance, existante.dateNaissance)) {
    score += 20;
  }
  if (candidat.sexe === existante.sexe) {
    score += 10;
  }

  return score;
}

export interface ResultatControleDoublon {
  probableDoublon: boolean;
  meilleurScore: number;
}

/** Compare un candidat à un ensemble de personnes déjà enregistrées (même établissement) et retourne le meilleur score trouvé. */
export function controlerDoublon(
  candidat: CandidatDoublonScore,
  personnesExistantes: CandidatDoublonScore[]
): ResultatControleDoublon {
  let meilleurScore = 0;
  for (const existante of personnesExistantes) {
    const score = calculerScoreDoublon(candidat, existante);
    if (score > meilleurScore) meilleurScore = score;
  }

  return { probableDoublon: meilleurScore >= SEUIL_REVUE, meilleurScore };
}

export { SEUIL_REVUE };
