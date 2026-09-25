/**
 * Controles de securite "doublon" et "meme classe" de la prescription
 * (pack Claude Code, F-PRE-02) :
 * - Doublon : "Meme DCI deja presente dans l'ordonnance ou dans une
 *   ordonnance active du patient" -> niveau Avertissement, "Confirmer ou
 *   retirer".
 * - Meme classe : "Deux medicaments de la meme classe therapeutique (ex.
 *   deux anti-inflammatoires non steroidiens)" -> niveau Avertissement,
 *   "Confirmer ou retirer".
 *
 * A la difference du controle allergie (referentiel-allergies.ts, niveau
 * Bloquant avec forcage justifie), ces deux controles sont de simples
 * avertissements (RG-PRE-12 : "les controles sont une aide, ils ne
 * remplacent pas le jugement du medecin") : une case a cocher suffit, aucune
 * justification textuelle n'est exigee par le pack pour ce niveau.
 *
 * Module pur (pas de "use server", pas d'acces base), meme approche que
 * referentiel-allergies.ts : appelable cote serveur (seule autorite reelle)
 * et cote client (retour immediat a l'ecran).
 */

export interface LigneComparable {
  principeActif: string;
  classeTherapeutique: string;
}

function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function memeDCI(a: LigneComparable, b: LigneComparable): boolean {
  const dciA = normaliser(a.principeActif);
  const dciB = normaliser(b.principeActif);
  return dciA.length > 0 && dciA === dciB;
}

function memeClasse(a: LigneComparable, b: LigneComparable): boolean {
  const classeA = normaliser(a.classeTherapeutique);
  const classeB = normaliser(b.classeTherapeutique);
  return classeA.length > 0 && classeA === classeB;
}

export type AvertissementSecurite = "doublon" | "meme_classe" | null;

/**
 * Compare une ligne candidate a une liste d'autres lignes deja retenues
 * (autres lignes de la meme ordonnance en cours de saisie + lignes des
 * ordonnances actives du patient) et retourne le premier avertissement
 * trouve, ou null si aucun. Le doublon (meme DCI) prime sur la simple
 * appartenance a la meme classe, plus specifique.
 */
export function avertissementPourLigne(
  candidate: LigneComparable,
  autresLignes: LigneComparable[]
): AvertissementSecurite {
  if (autresLignes.some((autre) => memeDCI(candidate, autre))) {
    return "doublon";
  }

  if (autresLignes.some((autre) => memeClasse(candidate, autre))) {
    return "meme_classe";
  }

  return null;
}

export function libelleAvertissement(avertissement: AvertissementSecurite): string {
  if (avertissement === "doublon") {
    return "Ce principe actif est deja present dans cette ordonnance ou dans une ordonnance active du patient.";
  }

  if (avertissement === "meme_classe") {
    return "Un autre medicament de la meme classe therapeutique est deja present dans cette ordonnance ou dans une ordonnance active du patient.";
  }

  return "";
}
