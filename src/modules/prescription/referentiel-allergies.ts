/**
 * Referentiel allergies <-> medicaments (pack Claude Code, F-PRE-02 / RG-PRE-10) :
 * "La correspondance allergie <-> medicament DOIT se faire sur la DCI et sur
 * la classe (ex. allergie « penicilline » -> toute molecule de la classe des
 * penicillines, dont l'amoxicilline) grace a la table de correspondance du
 * referentiel (section 18.4)."
 *
 * Pas de module Prisma dedie pour ce MVP (le pack decrit un fichier fourni
 * seed/allergy-classes.csv, absent de ce depot) : le referentiel vit ici, en
 * code, sous la forme attendue par la section 18.4 (allergie declaree ->
 * classes therapeutiques couvertes). A completer/valider par une autorite
 * sanitaire avant tout usage reel (meme reserve que le reste des
 * referentiels cliniques, section 18.4 du pack).
 *
 * Module pur (pas de "use server", pas d'acces base) : appelable a la fois
 * cote serveur (verification bloquante, seule autorite reelle) et cote
 * client (retour immediat a l'ecran, jamais la seule ligne de defense).
 */

/** Normalise pour une comparaison insensible aux accents/casse/espaces superflus. */
function normaliser(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Classes therapeutiques couvertes par une allergie declaree (mot-cle
 * normalise -> classes du referentiel medicaments, elles-memes normalisees
 * dans Medicament.classeTherapeutique). Liste de depart alignee sur les
 * exemples cites par le pack (section 18.4) ; a etendre au meme rythme que
 * le catalogue de medicaments.
 */
const CLASSES_PAR_ALLERGIE: Record<string, string[]> = {
  penicilline: ["penicillines"],
  amoxicilline: ["penicillines"],
  cephalosporine: ["cephalosporines"],
  sulfamide: ["sulfamides"],
  aspirine: ["salicyles", "ains"],
  ains: ["ains"],
  "anti-inflammatoire": ["ains"],
  codeine: ["opioides"],
  morphine: ["opioides"],
  iode: ["produits iodes"],
  latex: ["latex"],
};

/** Classes therapeutiques (normalisees) couvertes par une allergie declaree telle quelle. */
function classesCouvertesParAllergie(allergieDeclaree: string): string[] {
  const cle = normaliser(allergieDeclaree);
  return CLASSES_PAR_ALLERGIE[cle] ?? [];
}

/**
 * Indique si un medicament correspond a une allergie declaree du patient,
 * soit par correspondance directe sur la DCI (Medicament.principeActif),
 * soit par la classe therapeutique (Medicament.classeTherapeutique) via le
 * referentiel ci-dessus. Retourne l'allergie declaree en cause (pour le
 * message a l'ecran), ou null si aucune correspondance.
 */
export function allergieCorrespondante(
  medicament: { principeActif: string; classeTherapeutique: string },
  allergiesDeclarees: string[]
): string | null {
  const dci = normaliser(medicament.principeActif);
  const classe = normaliser(medicament.classeTherapeutique);

  for (const allergie of allergiesDeclarees) {
    const allergieNormalisee = normaliser(allergie);

    if (allergieNormalisee.length === 0) {
      continue;
    }

    const correspondDCI = dci === allergieNormalisee || dci.includes(allergieNormalisee);
    const correspondClasse =
      classe.length > 0 && classesCouvertesParAllergie(allergie).includes(classe);

    if (correspondDCI || correspondClasse) {
      return allergie;
    }
  }

  return null;
}

/** Longueur minimale de la justification de forcage (RG-PRE-10 : "20 caracteres minimum"). */
export const LONGUEUR_MIN_JUSTIFICATION_FORCAGE = 20;
