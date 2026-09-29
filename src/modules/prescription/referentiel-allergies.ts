/**
 * Referentiel allergies <-> medicaments (pack Claude Code, F-PRE-02 / RG-PRE-10) :
 * "La correspondance allergie <-> medicament DOIT se faire sur la DCI et sur
 * la classe (ex. allergie « penicilline » -> toute molecule de la classe des
 * penicillines, dont l'amoxicilline) grace a la table de correspondance du
 * referentiel (section 18.4)."
 *
 * La table de correspondance elle-meme (allergie declaree -> prefixes de
 * code ATC) vit desormais dans
 * src/modules/administration/correspondance-allergie-atc-catalogue.ts et est
 * administrable (Prisma, modele CorrespondanceAllergieAtc), a l'image des
 * autres referentiels du depot (F-ADM-04). Ce fichier-ci ne fait plus que la
 * comparaison, sur deux niveaux :
 * - DCI (Medicament.principeActif) : comparaison textuelle directe, comme
 *   avant.
 * - Classe ATC (Medicament.codeAtc) : comparaison par PREFIXE contre les
 *   prefixes lies a l'allergie declaree (la hierarchie ATC est faite de
 *   prefixes, ex. "J01C" = penicillines couvre "J01CA04", "J01CR02", etc.).
 *
 * Module pur (pas de "use server", pas d'acces base) : appelable a la fois
 * cote serveur (verification bloquante, seule autorite reelle) et cote
 * client (retour immediat a l'ecran, jamais la seule ligne de defense). La
 * table de correspondance est donc toujours recue en parametre (jamais lue
 * ici), chargee cote serveur via
 * getCorrespondancesAllergieAtcActives(), a l'appel.
 */

import type { CorrespondanceAllergieAtc } from "@/modules/administration/correspondance-allergie-atc-catalogue";

export type { CorrespondanceAllergieAtc };

/** Normalise pour une comparaison insensible aux accents/casse/espaces superflus. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Prefixes de code ATC lies a une allergie declaree (toutes les entrees dont le terme correspond exactement, normalise). */
function prefixesAtcPourAllergie(
  allergieDeclaree: string,
  correspondancesAtc: readonly CorrespondanceAllergieAtc[]
): string[] {
  const cle = normaliser(allergieDeclaree);
  return correspondancesAtc
    .filter((correspondance) => normaliser(correspondance.allergie) === cle)
    .flatMap((correspondance) => correspondance.prefixesAtc);
}

/** Vrai si un code ATC commence par l'un des prefixes donnes (comparaison insensible a la casse). */
function codeAtcCorrespondAUnPrefixe(codeAtc: string, prefixes: string[]): boolean {
  const code = codeAtc.trim().toUpperCase();
  if (code.length === 0) {
    return false;
  }
  return prefixes.some((prefixe) => code.startsWith(prefixe.trim().toUpperCase()));
}

/**
 * Indique si un medicament correspond a une allergie declaree du patient,
 * soit par correspondance directe sur la DCI (Medicament.principeActif),
 * soit par la classe ATC (Medicament.codeAtc) via la table de correspondance
 * passee en parametre (RG-PRE-10). Retourne l'allergie declaree en cause
 * (pour le message a l'ecran), ou null si aucune correspondance.
 */
export function allergieCorrespondante(
  medicament: { principeActif: string; codeAtc: string },
  allergiesDeclarees: string[],
  correspondancesAtc: readonly CorrespondanceAllergieAtc[] = []
): string | null {
  const dci = normaliser(medicament.principeActif);

  for (const allergie of allergiesDeclarees) {
    const allergieNormalisee = normaliser(allergie);

    if (allergieNormalisee.length === 0) {
      continue;
    }

    const correspondDCI = dci === allergieNormalisee || dci.includes(allergieNormalisee);

    const prefixes = prefixesAtcPourAllergie(allergie, correspondancesAtc);
    const correspondClasse = prefixes.length > 0 && codeAtcCorrespondAUnPrefixe(medicament.codeAtc, prefixes);

    if (correspondDCI || correspondClasse) {
      return allergie;
    }
  }

  return null;
}

/** Longueur minimale de la justification de forcage (RG-PRE-10 : "20 caracteres minimum"). */
export const LONGUEUR_MIN_JUSTIFICATION_FORCAGE = 20;
