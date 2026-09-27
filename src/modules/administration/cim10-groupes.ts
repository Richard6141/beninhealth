/**
 * Classification d'un code CIM-10 en groupe de maladies et en chapitre
 * (section 18.6 du pack). Module SANS "use server" : fonctions pures.
 *
 * Regle du pack : "un code appartient a un seul groupe : le plus specifique
 * l'emporte". Les regles ci-dessous sont donc evaluees DANS L'ORDRE, de la
 * plus specifique a la plus generale : VIH, IST, interruption de grossesse,
 * violences, addictions (F10 a F19) avant les troubles mentaux (F00 a F99) ;
 * fievre typhoide (A01.0) avant les maladies diarrheiques (A00 a A09) ;
 * interruption de grossesse (O04 a O07) avant les complications de la
 * grossesse (O00 a O99).
 *
 * Les codes de groupe reprennent ceux du pilotage
 * (src/modules/pilotage/referentiel-groupes-maladies.ts) pour que
 * l'agregation puisse s'appuyer sur ce referentiel.
 *
 * La liste des codes SENSIBLES est un parametre de referentiel (F-ADM-04) :
 * ce module donne la valeur par defaut d'un code (celle de son groupe), que
 * l'administration peut ensuite corriger code par code.
 */

export type GroupeCim10 =
  | "vih"
  | "ist"
  | "interruption_grossesse"
  | "violence"
  | "addiction"
  | "trouble_mental"
  | "typhoide"
  | "diarrhee"
  | "tuberculose"
  | "meningite"
  | "fievre_hemorragique"
  | "paludisme"
  | "rougeole"
  | "ira"
  | "hta"
  | "diabete"
  | "drepanocytose"
  | "malnutrition"
  | "infection_cutanee"
  | "complication_grossesse"
  | "autre";

export const GROUPES_SENSIBLES: readonly GroupeCim10[] = [
  "vih",
  "ist",
  "interruption_grossesse",
  "violence",
  "addiction",
  "trouble_mental",
];

export const LIBELLES_GROUPES_CIM10: Record<GroupeCim10, string> = {
  vih: "VIH",
  ist: "Infections sexuellement transmissibles",
  interruption_grossesse: "Interruption de grossesse",
  violence: "Violences et maltraitances",
  addiction: "Addictions",
  trouble_mental: "Troubles mentaux et du comportement",
  typhoide: "Fièvre typhoïde",
  diarrhee: "Maladies diarrhéiques",
  tuberculose: "Tuberculose",
  meningite: "Méningite",
  fievre_hemorragique: "Fièvres hémorragiques virales",
  paludisme: "Paludisme",
  rougeole: "Rougeole",
  ira: "Infections respiratoires aiguës",
  hta: "Hypertension artérielle",
  diabete: "Diabète",
  drepanocytose: "Drépanocytose",
  malnutrition: "Malnutrition",
  infection_cutanee: "Infections cutanées",
  complication_grossesse: "Complications de la grossesse",
  autre: "Autres diagnostics",
};

/** Forme "A00" ou "A00.9" (lettre, deux chiffres, sous-code facultatif). */
export const FORMAT_CODE_CIM10 = /^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/;

export function normaliserCodeCim10(saisie: string): string {
  return saisie.trim().toUpperCase();
}

/** Rang d'une categorie a 3 caracteres, comparable a l'interieur et entre lettres (X99 < Y00). */
function rang(code: string): number {
  return code.charCodeAt(0) * 100 + Number(code.slice(1, 3));
}

function dans(code: string, debut: string, fin: string): boolean {
  const valeur = rang(code);
  return valeur >= rang(debut) && valeur <= rang(fin);
}

export function groupeCim10PourCode(codeBrut: string): GroupeCim10 {
  const code = normaliserCodeCim10(codeBrut);

  if (!FORMAT_CODE_CIM10.test(code)) {
    return "autre";
  }

  if (dans(code, "B20", "B24") || code.startsWith("Z21")) return "vih";
  if (dans(code, "A50", "A64")) return "ist";
  if (dans(code, "O04", "O07")) return "interruption_grossesse";
  if (code.startsWith("T74") || dans(code, "Y05", "Y07") || dans(code, "X85", "Y09")) return "violence";
  if (dans(code, "F10", "F19")) return "addiction";
  if (dans(code, "F00", "F99")) return "trouble_mental";
  if (code === "A01.0" || code.startsWith("A01.0")) return "typhoide";
  if (dans(code, "A00", "A09")) return "diarrhee";
  if (dans(code, "A15", "A19")) return "tuberculose";
  if (code.startsWith("A39") || dans(code, "G00", "G03")) return "meningite";
  if (dans(code, "A90", "A99")) return "fievre_hemorragique";
  if (dans(code, "B50", "B54")) return "paludisme";
  if (code.startsWith("B05")) return "rougeole";
  if (dans(code, "J00", "J22")) return "ira";
  if (dans(code, "I10", "I15")) return "hta";
  if (dans(code, "E10", "E14")) return "diabete";
  if (code.startsWith("D57")) return "drepanocytose";
  if (dans(code, "E40", "E46")) return "malnutrition";
  if (dans(code, "L00", "L08")) return "infection_cutanee";
  if (dans(code, "O00", "O99")) return "complication_grossesse";

  return "autre";
}

export function groupeEstSensible(groupe: GroupeCim10): boolean {
  return GROUPES_SENSIBLES.includes(groupe);
}

/**
 * Vrai si le code appartient au chapitre XVIII (symptomes, signes et
 * resultats anormaux d'examens, R00 a R99). RG-CLI-52 du pack : un
 * diagnostic principal pas encore etabli peut etre un code de ce chapitre
 * (ex. R50.9 Fievre, sans precision), mais alors la certitude est toujours
 * SUSPECTED, jamais CONFIRMED, quel que soit le choix saisi a l'ecran.
 */
export function estChapitreSymptome(codeBrut: string): boolean {
  const code = normaliserCodeCim10(codeBrut);
  return FORMAT_CODE_CIM10.test(code) && dans(code, "R00", "R99");
}

const CHAPITRES: { debut: string; fin: string; libelle: string }[] = [
  { debut: "A00", fin: "B99", libelle: "I. Maladies infectieuses et parasitaires" },
  { debut: "C00", fin: "D48", libelle: "II. Tumeurs" },
  { debut: "D50", fin: "D89", libelle: "III. Maladies du sang et des organes hématopoïétiques" },
  { debut: "E00", fin: "E90", libelle: "IV. Maladies endocriniennes, nutritionnelles et métaboliques" },
  { debut: "F00", fin: "F99", libelle: "V. Troubles mentaux et du comportement" },
  { debut: "G00", fin: "G99", libelle: "VI. Maladies du système nerveux" },
  { debut: "H00", fin: "H59", libelle: "VII. Maladies de l'œil et de ses annexes" },
  { debut: "H60", fin: "H95", libelle: "VIII. Maladies de l'oreille et de l'apophyse mastoïde" },
  { debut: "I00", fin: "I99", libelle: "IX. Maladies de l'appareil circulatoire" },
  { debut: "J00", fin: "J99", libelle: "X. Maladies de l'appareil respiratoire" },
  { debut: "K00", fin: "K93", libelle: "XI. Maladies de l'appareil digestif" },
  { debut: "L00", fin: "L99", libelle: "XII. Maladies de la peau et du tissu cellulaire sous-cutané" },
  { debut: "M00", fin: "M99", libelle: "XIII. Maladies du système ostéo-articulaire, des muscles et du tissu conjonctif" },
  { debut: "N00", fin: "N99", libelle: "XIV. Maladies de l'appareil génito-urinaire" },
  { debut: "O00", fin: "O99", libelle: "XV. Grossesse, accouchement et puerpéralité" },
  { debut: "P00", fin: "P96", libelle: "XVI. Affections dont l'origine se situe dans la période périnatale" },
  { debut: "Q00", fin: "Q99", libelle: "XVII. Malformations congénitales et anomalies chromosomiques" },
  { debut: "R00", fin: "R99", libelle: "XVIII. Symptômes, signes et résultats anormaux d'examens" },
  { debut: "S00", fin: "T98", libelle: "XIX. Lésions traumatiques, empoisonnements et autres conséquences de causes externes" },
  { debut: "V01", fin: "Y98", libelle: "XX. Causes externes de morbidité et de mortalité" },
  { debut: "Z00", fin: "Z99", libelle: "XXI. Facteurs influant sur l'état de santé" },
  { debut: "U00", fin: "U99", libelle: "XXII. Codes d'utilisation particulière" },
];

/** Chapitre de la CIM-10 d'un code, ou chaine vide si le code est mal forme. */
export function chapitreCim10PourCode(codeBrut: string): string {
  const code = normaliserCodeCim10(codeBrut);

  if (!FORMAT_CODE_CIM10.test(code)) {
    return "";
  }

  return CHAPITRES.find((chapitre) => dans(code, chapitre.debut, chapitre.fin))?.libelle ?? "";
}
