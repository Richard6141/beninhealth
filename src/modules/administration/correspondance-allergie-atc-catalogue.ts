/**
 * Catalogue de depart de la table de correspondance allergie <-> classe ATC
 * (F-PRE-02 / RG-PRE-10 du pack : "La correspondance allergie <-> medicament
 * DOIT se faire sur la DCI et sur la classe [...] grace a la table de
 * correspondance du referentiel, section 18.4"). Section 18.4 cite
 * explicitement : "penicillines, cephalosporines, sulfamides, AINS, aspirine,
 * iode, etc." (fichier de depart seed/allergy-classes.csv, absent de ce
 * depot).
 *
 * Les classes ATC sont hierarchiques par prefixe (ex. J01C = "Antibacterials
 * for systemic use, Beta-lactam antibacterials, penicillins"). Chaque
 * medicament du catalogue de depart porte deja un codeAtc complet (voir
 * src/modules/administration/medicaments-depart.ts) : une allergie declaree
 * couvre donc tout medicament dont le codeAtc COMMENCE PAR un des prefixes
 * lies a cette allergie, sans avoir a lister chaque molecule.
 *
 * Fichier SANS "use server" (meme principe que
 * referentiels-simples-catalogue.ts) : ces constantes doivent etre
 * importables par l'ecran d'administration, par le module qui les seme en
 * base (correspondance-allergie-atc.ts) et par le controle de securite pur
 * src/modules/prescription/referentiel-allergies.ts, qui n'a pas acces a
 * Prisma.
 *
 * Contenu de demonstration : a completer/valider par une autorite sanitaire
 * avant tout usage reel (meme reserve que le reste des referentiels
 * cliniques, section 18.4 du pack).
 */

export interface CorrespondanceAllergieAtc {
  /** Terme d'allergie declare, compare normalise (insensible accents/casse). */
  allergie: string;
  /** Libelle de la classe therapeutique, pour l'ecran d'administration et les messages. */
  libelleClasse: string;
  /** Prefixes de code ATC couverts par cette allergie (comparaison par prefixe, pas egalite stricte). */
  prefixesAtc: string[];
}

/**
 * Entrees de depart. Un meme terme d'allergie declare peut apparaitre sous
 * plusieurs formes usuelles (ex. "penicilline" et "amoxicilline" pointent
 * toutes deux vers la classe des penicillines, J01C) : chaque forme a sa
 * propre entree plutot qu'une logique de synonymes, pour rester simple et
 * administrable a la main (creer/desactiver une entree, RG-ADM-20).
 *
 * "sulfamide" couvre a la fois les antibiotiques sulfamides systemiques
 * (J01E, ex. cotrimoxazole) et l'antipaludique sulfadoxine-pyrimethamine
 * (P01BD, chimiquement un sulfamide egalement susceptible d'une reaction
 * croisee) : deux prefixes pour une seule allergie declaree.
 */
export const DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC: readonly CorrespondanceAllergieAtc[] = [
  { allergie: "penicilline", libelleClasse: "Pénicillines", prefixesAtc: ["J01C"] },
  { allergie: "amoxicilline", libelleClasse: "Pénicillines", prefixesAtc: ["J01C"] },
  { allergie: "cephalosporine", libelleClasse: "Céphalosporines", prefixesAtc: ["J01D"] },
  { allergie: "sulfamide", libelleClasse: "Sulfamides", prefixesAtc: ["J01E", "P01BD"] },
  { allergie: "ains", libelleClasse: "Anti-inflammatoires non stéroïdiens (AINS)", prefixesAtc: ["M01A"] },
  {
    allergie: "anti-inflammatoire",
    libelleClasse: "Anti-inflammatoires non stéroïdiens (AINS)",
    prefixesAtc: ["M01A"],
  },
  { allergie: "aspirine", libelleClasse: "Salicylés (dont aspirine)", prefixesAtc: ["N02BA", "B01AC"] },
  { allergie: "codeine", libelleClasse: "Opioïdes", prefixesAtc: ["N02A"] },
  { allergie: "morphine", libelleClasse: "Opioïdes", prefixesAtc: ["N02A"] },
  { allergie: "iode", libelleClasse: "Produits iodés", prefixesAtc: ["D08AG"] },
];

/** Longueur minimale de la justification de forcage (RG-PRE-10 : "20 caracteres minimum"). */
export const LONGUEUR_MIN_JUSTIFICATION_FORCAGE = 20;

/** Format attendu d'un prefixe ATC : lettres/chiffres, 1 a 7 caracteres (un code ATC complet en compte 7). */
export const FORMAT_PREFIXE_ATC = /^[A-Z0-9]{1,7}$/;

/** Normalise une liste de prefixes saisie en texte libre (separateur virgule) en tableau de prefixes valides. */
export function analyserPrefixesAtc(saisie: string): { ok: true; prefixes: string[] } | { ok: false; error: string } {
  const prefixes = saisie
    .split(",")
    .map((prefixe) => prefixe.trim().toUpperCase())
    .filter((prefixe) => prefixe.length > 0);

  if (prefixes.length === 0) {
    return { ok: false, error: "Au moins un prefixe ATC est obligatoire." };
  }

  const invalide = prefixes.find((prefixe) => !FORMAT_PREFIXE_ATC.test(prefixe));
  if (invalide) {
    return { ok: false, error: `Prefixe ATC invalide : "${invalide}".` };
  }

  return { ok: true, prefixes: [...new Set(prefixes)] };
}
