/**
 * Groupes de maladies (section 18.6 du pack), utilises par IND-03 (top des
 * diagnostics) et IND-04 (cas de paludisme). Le pack suppose un codage
 * CIM-10 du diagnostic principal (colonne icd10_codes.disease_group) : ce
 * depot n'a aucun codage diagnostique, `Consultation.conclusion` est un
 * champ texte libre (voir docs/audit-cote-medecin.md, F-CLI-07 : "tient lieu
 * de diagnostic principal faute de codage CIM-10").
 *
 * Adaptation honnete, meme principe deja utilise dans ce depot pour
 * l'allergie <-> medicament (src/modules/prescription/referentiel-allergies.ts)
 * et la detection d'examen sensible (src/modules/laboratoire/referentiel-examens-sensibles.ts) :
 * classification par mots-cles sur le texte libre plutot qu'un vrai code
 * CIM-10. Un texte de conclusion ambigu ou une formulation inhabituelle peut
 * echapper a la detection : a remplacer par un vrai referentiel CIM-10 (le
 * pack fournit sa table, section 18.4/18.6) avant tout usage reel.
 */

export interface GroupeMaladie {
  code: string;
  libelle: string;
  motsCles: string[];
  // RG-PIL-05 : une donnee SENSITIVE n'est comptee qu'au niveau departement/national.
  sensible: boolean;
}

export const GROUPES_MALADIES: GroupeMaladie[] = [
  {
    code: "paludisme",
    libelle: "Paludisme",
    motsCles: ["paludisme", "palustre", "paludique", "palu", "malaria"],
    sensible: false,
  },
  {
    code: "ira",
    libelle: "Infections respiratoires aigues",
    motsCles: ["infection respiratoire", "bronchite", "pneumonie", "grippe", "rhinopharyngite", "toux"],
    sensible: false,
  },
  {
    code: "diarrhee",
    libelle: "Maladies diarrheiques",
    motsCles: ["diarrhee", "gastro-enterite", "gastroenterite"],
    sensible: false,
  },
  { code: "typhoide", libelle: "Fievre typhoide", motsCles: ["typhoide", "salmonellose"], sensible: false },
  {
    code: "hta",
    libelle: "Hypertension arterielle",
    motsCles: ["hypertension", "hta", "tension elevee"],
    sensible: false,
  },
  { code: "diabete", libelle: "Diabete", motsCles: ["diabete", "hyperglycemie"], sensible: false },
  { code: "drepanocytose", libelle: "Drepanocytose", motsCles: ["drepanocytose", "drepanocytaire"], sensible: false },
  { code: "malnutrition", libelle: "Malnutrition", motsCles: ["malnutrition", "denutrition"], sensible: false },
  { code: "rougeole", libelle: "Rougeole", motsCles: ["rougeole"], sensible: false },
  { code: "meningite", libelle: "Meningite", motsCles: ["meningite"], sensible: false },
  {
    code: "fievre_hemorragique",
    libelle: "Fievres hemorragiques virales",
    motsCles: ["fievre hemorragique", "ebola", "lassa"],
    sensible: false,
  },
  { code: "tuberculose", libelle: "Tuberculose", motsCles: ["tuberculose"], sensible: false },
  {
    code: "infection_cutanee",
    libelle: "Infections cutanees",
    motsCles: ["infection cutanee", "dermatose", "abces cutane", "cellulite"],
    sensible: false,
  },
  {
    code: "complication_grossesse",
    libelle: "Complications de la grossesse",
    motsCles: ["complication de grossesse", "pre-eclampsie", "preeclampsie", "hemorragie de grossesse"],
    sensible: false,
  },
  { code: "vih", libelle: "VIH", motsCles: ["vih", "sida", "hiv"], sensible: true },
  {
    code: "ist",
    libelle: "Infections sexuellement transmissibles",
    motsCles: ["ist", "infection sexuellement transmissible", "syphilis", "gonorrhee", "chlamydia"],
    sensible: true,
  },
  {
    code: "trouble_mental",
    libelle: "Troubles mentaux et du comportement",
    motsCles: ["depression", "trouble mental", "trouble psychiatrique", "anxiete", "psychose"],
    sensible: true,
  },
  {
    code: "interruption_grossesse",
    libelle: "Interruption de grossesse",
    motsCles: ["interruption de grossesse", "avortement", "ivg"],
    sensible: true,
  },
  {
    code: "violence",
    libelle: "Violences et maltraitances",
    motsCles: ["violence", "maltraitance", "agression", "coups et blessures"],
    sensible: true,
  },
  { code: "addiction", libelle: "Addictions", motsCles: ["addiction", "alcoolisme", "toxicomanie"], sensible: true },
];

/** Codes des groupes marques SENSITIVE (RG-PIL-05), jamais comptes par etablissement. */
export const CODES_GROUPES_SENSIBLES: string[] = GROUPES_MALADIES.filter((groupe) => groupe.sensible).map(
  (groupe) => groupe.code
);

export function estGroupeSensible(code: string): boolean {
  return CODES_GROUPES_SENSIBLES.includes(code);
}

/** Minuscules et sans accents : "Dépression" et "depression" doivent se classer pareil. */
function normaliser(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Au-dela de cette longueur, un mot-cle est cherche en DEBUT de mot ; en dessous, en mot ENTIER. */
const LONGUEUR_MAX_MOT_CLE_ENTIER = 4;

function correspond(texteNormalise: string, motCle: string): boolean {
  const motif = normaliser(motCle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Mot-cle court (ist, hta, ivg, vih, sida, hiv, toux, palu) : mot entier,
  // sinon "ist" correspondrait a "assistance" et "hiv" a "hiver". Mot-cle
  // plus long : debut de mot, pour garder pluriels et derives ("diarrhees").
  const suffixe = normaliser(motCle).length <= LONGUEUR_MAX_MOT_CLE_ENTIER ? "(?![a-z0-9])" : "";
  return new RegExp(`(?<![a-z0-9])${motif}${suffixe}`).test(texteNormalise);
}

/**
 * Classe une conclusion de consultation (texte libre) dans un groupe de
 * maladies par correspondance de mots-cles, sans tenir compte de la casse ni
 * des accents. Retourne null si aucun mot-cle ne correspond (conclusion non
 * classifiable en l'etat, exclue des indicateurs IND-03/IND-04 plutot que
 * classee au hasard).
 *
 * Deux defauts corriges ici, tous deux critiques pour RG-PIL-05 : les
 * conclusions accentuees ("diarrhée", "dépression") n'etaient jamais
 * reconnues, et les mots-cles courts correspondaient a l'interieur d'autres
 * mots (un texte contenant "assistance" etait classe en infection
 * sexuellement transmissible, donc traite comme donnee sensible).
 */
export function classifierGroupeMaladie(conclusion: string): GroupeMaladie | null {
  const texte = normaliser(conclusion);
  for (const groupe of GROUPES_MALADIES) {
    if (groupe.motsCles.some((motCle) => correspond(texte, motCle))) {
      return groupe;
    }
  }
  return null;
}
