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
  { code: "paludisme", libelle: "Paludisme", motsCles: ["paludisme", "palu", "malaria"], sensible: false },
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

/**
 * Classe une conclusion de consultation (texte libre) dans un groupe de
 * maladies par correspondance de mots-cles, insensible a la casse. Retourne
 * null si aucun mot-cle ne correspond (conclusion non classifiable en
 * l'etat, exclue des indicateurs IND-03/IND-04 plutot que classee au
 * hasard).
 */
export function classifierGroupeMaladie(conclusion: string): GroupeMaladie | null {
  const texte = conclusion.toLowerCase();
  for (const groupe of GROUPES_MALADIES) {
    if (groupe.motsCles.some((motCle) => texte.includes(motCle))) {
      return groupe;
    }
  }
  return null;
}
