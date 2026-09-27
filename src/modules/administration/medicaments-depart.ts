/**
 * Catalogue de depart du referentiel des medicaments (F-PRE-03, section 18.4
 * du pack : "environ 150 presentations de medicaments essentiels courants,
 * fournies avec le projet", fichier seed/medications.csv absent de ce depot).
 *
 * Sous-ensemble de pres de 90 presentations d'usage courant en soins
 * primaires au Benin (paludisme, infections respiratoires et digestives,
 * hypertension, diabete, sante de la mere et de l'enfant). Module PUR (pas
 * d'acces base) : le semis vit dans prisma/seed-medicaments.ts. Comme le pack
 * le precise pour ce referentiel, la source reste "a confirmer avec
 * l'autorite nationale du medicament" : classes, codes ATC, limites d'age et
 * contre-indications de grossesse sont des donnees de depart a faire valider
 * avant tout usage reel, puis a maintenir depuis l'ecran d'administration.
 *
 * Les classes therapeutiques suivent les conventions deja lues par les
 * controles de securite : "penicillines", "cephalosporines", "sulfamides",
 * "ains", "salicyles", "opioides", "produits iodes" (allergies,
 * referentiel-allergies.ts) et les familles d'antibiotiques de
 * controles-securite.ts.
 */

export interface MedicamentDepart {
  /** Nom de la presentation (ici la denomination generique ; les marques sont dans `nomsCommerciaux`). */
  nom: string;
  principeActif: string;
  dosage: string;
  forme: string;
  classeTherapeutique: string;
  codeAtc: string;
  essentiel: boolean;
  nomsCommerciaux: string[];
  ageMinimumMois: number | null;
  contreIndiqueGrossesse: boolean;
  informationsComplementaires: string;
}

interface Options {
  essentiel?: boolean;
  marques?: string[];
  ageMois?: number;
  grossesse?: boolean;
  info?: string;
  nom?: string;
}

function p(
  principeActif: string,
  dosage: string,
  forme: string,
  classeTherapeutique: string,
  codeAtc: string,
  options: Options = {}
): MedicamentDepart {
  return {
    nom: options.nom ?? principeActif,
    principeActif,
    dosage,
    forme,
    classeTherapeutique,
    codeAtc,
    essentiel: options.essentiel ?? false,
    nomsCommerciaux: options.marques ?? [],
    ageMinimumMois: options.ageMois ?? null,
    contreIndiqueGrossesse: options.grossesse ?? false,
    informationsComplementaires: options.info ?? "",
  };
}

const E = { essentiel: true };

export const MEDICAMENTS_DEPART: readonly MedicamentDepart[] = [
  // Antipaludiques
  p("Artéméther / Luméfantrine", "20 mg / 120 mg", "comprime", "antipaludiques", "P01BF01", {
    ...E, nom: "Artéméther-luméfantrine", marques: ["Coartem"], info: "Paludisme simple non compliqué, première intention.",
  }),
  p("Artésunate / Amodiaquine", "100 mg / 270 mg", "comprime", "antipaludiques", "P01BF03", {
    ...E, nom: "Artésunate-amodiaquine", marques: ["Coarsucam"], info: "Paludisme simple non compliqué.",
  }),
  p("Dihydroartémisinine / Pipéraquine", "40 mg / 320 mg", "comprime", "antipaludiques", "P01BF05", {
    nom: "Dihydroartémisinine-pipéraquine", marques: ["Eurartesim"], info: "Paludisme simple non compliqué, alternative.",
  }),
  p("Artésunate", "60 mg", "injectable", "antipaludiques", "P01BE03", { ...E, info: "Paludisme grave." }),
  p("Quinine", "300 mg", "comprime", "antipaludiques", "P01BC01", { ...E, info: "Paludisme grave ou échec du traitement de première intention." }),
  p("Sulfadoxine / Pyriméthamine", "500 mg / 25 mg", "comprime", "sulfamides", "P01BD51", {
    ...E, nom: "Sulfadoxine-pyriméthamine", marques: ["Fansidar"], info: "Prévention du paludisme pendant la grossesse (à partir du 2e trimestre).",
  }),

  // Antalgiques, antipyretiques, anti-inflammatoires
  p("Paracétamol", "500 mg", "comprime", "antalgiques", "N02BE01", { ...E, marques: ["Doliprane", "Efferalgan", "Dafalgan", "Panadol"], info: "Antalgique et antipyrétique." }),
  p("Paracétamol", "1 g", "comprime", "antalgiques", "N02BE01", { ...E, marques: ["Doliprane", "Dafalgan"], info: "Antalgique et antipyrétique." }),
  p("Paracétamol", "120 mg/5 ml", "suspension", "antalgiques", "N02BE01", { ...E, marques: ["Doliprane"], info: "Antalgique et antipyrétique de l'enfant." }),
  p("Ibuprofène", "200 mg", "comprime", "ains", "M01AE01", { ...E, marques: ["Advil", "Nurofen", "Brufen"], ageMois: 3, grossesse: true }),
  p("Ibuprofène", "400 mg", "comprime", "ains", "M01AE01", { ...E, marques: ["Advil", "Nurofen", "Brufen"], ageMois: 3, grossesse: true }),
  p("Ibuprofène", "100 mg/5 ml", "suspension", "ains", "M01AE01", { ...E, marques: ["Nurofen"], ageMois: 3, grossesse: true }),
  p("Diclofénac", "50 mg", "comprime", "ains", "M01AB05", { marques: ["Voltarène"], grossesse: true }),
  p("Diclofénac", "75 mg/3 ml", "injectable", "ains", "M01AB05", { marques: ["Voltarène"], grossesse: true }),
  p("Acide acétylsalicylique", "500 mg", "comprime", "salicyles", "N02BA01", { ...E, nom: "Aspirine", marques: ["Aspirine du Rhône"], grossesse: true }),
  p("Acide acétylsalicylique", "100 mg", "comprime", "salicyles", "B01AC06", { ...E, nom: "Aspirine", info: "Antiagrégant plaquettaire.", grossesse: true }),
  p("Tramadol", "50 mg", "gelule", "opioides", "N02AX02", { marques: ["Topalgic", "Contramal"], ageMois: 144 }),

  // Antibiotiques
  p("Amoxicilline", "500 mg", "gelule", "penicillines", "J01CA04", { ...E, marques: ["Clamoxyl", "Amoxil"], info: "Antibiotique à large spectre." }),
  p("Amoxicilline", "1 g", "comprime", "penicillines", "J01CA04", { ...E, marques: ["Clamoxyl"], info: "Antibiotique à large spectre." }),
  p("Amoxicilline", "250 mg/5 ml", "suspension", "penicillines", "J01CA04", { ...E, marques: ["Clamoxyl", "Amoxil"], info: "Antibiotique à large spectre de l'enfant." }),
  p("Amoxicilline", "250 mg dispersible", "comprime", "penicillines", "J01CA04", { ...E, info: "Pneumonie de l'enfant." }),
  p("Amoxicilline / Acide clavulanique", "500 mg / 125 mg", "comprime", "penicillines", "J01CR02", { ...E, nom: "Amoxicilline-acide clavulanique", marques: ["Augmentin"] }),
  p("Ampicilline", "1 g", "injectable", "penicillines", "J01CA01", E),
  p("Cloxacilline", "500 mg", "gelule", "penicillines", "J01CF02", { ...E, marques: ["Orbénine"], info: "Infections à staphylocoque." }),
  p("Benzathine benzylpénicilline", "2,4 MUI", "injectable", "penicillines", "J01CE08", { ...E, marques: ["Extencilline"], info: "Syphilis, rhumatisme articulaire aigu." }),
  p("Phénoxyméthylpénicilline", "1 MUI", "comprime", "penicillines", "J01CE02", { ...E, nom: "Pénicilline V", marques: ["Oracilline"] }),
  p("Ceftriaxone", "1 g", "injectable", "cephalosporines", "J01DD04", { ...E, marques: ["Rocéphine"] }),
  p("Céfixime", "200 mg", "comprime", "cephalosporines", "J01DD08", { marques: ["Suprax", "Oroken"] }),
  p("Ciprofloxacine", "500 mg", "comprime", "quinolones", "J01MA02", { ...E, marques: ["Ciflox", "Cipro"], ageMois: 216 }),
  p("Azithromycine", "500 mg", "comprime", "macrolides", "J01FA10", { ...E, marques: ["Zithromax"] }),
  p("Azithromycine", "200 mg/5 ml", "suspension", "macrolides", "J01FA10", { ...E, marques: ["Zithromax"] }),
  p("Érythromycine", "500 mg", "comprime", "macrolides", "J01FA01", { marques: ["Erythrocine"] }),
  p("Doxycycline", "100 mg", "comprime", "tetracyclines", "J01AA02", { ...E, marques: ["Vibramycine"], ageMois: 96, grossesse: true }),
  p("Gentamicine", "80 mg/2 ml", "injectable", "aminosides", "J01GB03", { ...E, marques: ["Gentalline"] }),
  p("Sulfaméthoxazole / Triméthoprime", "400 mg / 80 mg", "comprime", "sulfamides", "J01EE01", { ...E, nom: "Cotrimoxazole", marques: ["Bactrim"], ageMois: 1, grossesse: true }),
  p("Sulfaméthoxazole / Triméthoprime", "200 mg / 40 mg par 5 ml", "suspension", "sulfamides", "J01EE01", { ...E, nom: "Cotrimoxazole", marques: ["Bactrim"], ageMois: 1, grossesse: true }),
  p("Métronidazole", "500 mg", "comprime", "nitro-imidazoles", "J01XD01", { ...E, marques: ["Flagyl"] }),
  p("Métronidazole", "250 mg", "comprime", "nitro-imidazoles", "J01XD01", { ...E, marques: ["Flagyl"] }),
  p("Métronidazole", "125 mg/5 ml", "suspension", "nitro-imidazoles", "J01XD01", { ...E, marques: ["Flagyl"] }),
  p("Tétracycline", "1 %", "pommade", "tetracyclines", "S01AA09", { ...E, info: "Pommade ophtalmique." }),

  // Antiparasitaires, antifongiques
  p("Albendazole", "400 mg", "comprime", "antihelminthiques", "P02CA03", { ...E, marques: ["Zentel"], ageMois: 12, grossesse: true }),
  p("Mébendazole", "100 mg", "comprime", "antihelminthiques", "P02CA01", { ...E, marques: ["Vermox"], ageMois: 12, grossesse: true }),
  p("Praziquantel", "600 mg", "comprime", "antihelminthiques", "P02BA01", { ...E, marques: ["Biltricide"], info: "Bilharziose." }),
  p("Ivermectine", "3 mg", "comprime", "antihelminthiques", "P02CF01", { ...E, marques: ["Stromectol", "Mectizan"] }),
  p("Fluconazole", "150 mg", "gelule", "antifongiques", "J02AC01", { ...E, marques: ["Diflucan"], grossesse: true }),
  p("Clotrimazole", "100 mg", "autre", "antifongiques", "G01AF02", { ...E, marques: ["Canesten"], info: "Ovule." }),
  p("Miconazole", "2 %", "pommade", "antifongiques", "D01AC02", { ...E, marques: ["Daktarin"], info: "Crème." }),
  p("Perméthrine", "5 %", "pommade", "antiparasitaires externes", "P03AC04", { ...E, ageMois: 2, info: "Crème, gale." }),
  p("Benzoate de benzyle", "25 %", "autre", "antiparasitaires externes", "P03AX01", { ...E, marques: ["Ascabiol"], info: "Lotion, gale." }),

  // Respiratoire, allergie, corticoides
  p("Salbutamol", "100 µg/dose", "autre", "bronchodilatateurs", "R03AC02", { ...E, marques: ["Ventoline"], info: "Aérosol doseur." }),
  p("Salbutamol", "2 mg/5 ml", "sirop", "bronchodilatateurs", "R03CC02", { marques: ["Ventoline"] }),
  p("Prednisolone", "5 mg", "comprime", "corticoides", "H02AB06", { ...E, marques: ["Solupred"] }),
  p("Dexaméthasone", "4 mg/ml", "injectable", "corticoides", "H02AB02", E),
  p("Hydrocortisone", "1 %", "pommade", "corticoides", "D07AA02", { ...E, info: "Crème." }),
  p("Chlorphénamine", "4 mg", "comprime", "antihistaminiques", "R06AB04", { ...E, marques: ["Piriton"] }),
  p("Cétirizine", "10 mg", "comprime", "antihistaminiques", "R06AE07", { marques: ["Zyrtec"], ageMois: 72 }),
  p("Loratadine", "10 mg", "comprime", "antihistaminiques", "R06AX13", { marques: ["Clarityne"] }),

  // Digestif, rehydratation, nutrition
  p("Oméprazole", "20 mg", "gelule", "inhibiteurs de la pompe a protons", "A02BC01", { ...E, marques: ["Mopral", "Losec"] }),
  p("Sels de réhydratation orale", "sachet pour 1 L", "autre", "rehydratation", "A07CA01", { ...E, nom: "SRO", info: "Formule OMS à faible osmolarité, diarrhée aiguë." }),
  p("Zinc (sulfate)", "20 mg dispersible", "comprime", "oligo-elements", "A12CB01", { ...E, nom: "Zinc", info: "Diarrhée aiguë de l'enfant." }),
  p("Phloroglucinol", "80 mg", "comprime", "antispasmodiques", "A03AX12", { marques: ["Spasfon"] }),
  p("Métoclopramide", "10 mg", "comprime", "antiemetiques", "A03FA01", { marques: ["Primperan"], ageMois: 12 }),
  p("Ondansétron", "4 mg", "comprime", "antiemetiques", "A04AA01", { ...E, marques: ["Zophren"] }),
  p("Fer / Acide folique", "200 mg / 0,4 mg", "comprime", "antianemiques", "B03AD", { ...E, nom: "Fer + acide folique", info: "Prévention et traitement de l'anémie, grossesse." }),
  p("Acide folique", "5 mg", "comprime", "antianemiques", "B03BB01", E),
  p("Rétinol (vitamine A)", "100 000 UI", "gelule", "vitamines", "A11CA01", { ...E, nom: "Vitamine A", ageMois: 6, grossesse: true, info: "Supplémentation de l'enfant de 6 à 11 mois." }),
  p("Rétinol (vitamine A)", "200 000 UI", "gelule", "vitamines", "A11CA01", { ...E, nom: "Vitamine A", ageMois: 12, grossesse: true, info: "Supplémentation de l'enfant de 12 mois et plus." }),

  // Cardiovasculaire et metabolisme
  p("Amlodipine", "5 mg", "comprime", "inhibiteurs calciques", "C08CA01", { ...E, marques: ["Amlor"] }),
  p("Amlodipine", "10 mg", "comprime", "inhibiteurs calciques", "C08CA01", { ...E, marques: ["Amlor"] }),
  p("Énalapril", "5 mg", "comprime", "inhibiteurs de l'enzyme de conversion", "C09AA02", { ...E, marques: ["Renitec"], grossesse: true }),
  p("Hydrochlorothiazide", "25 mg", "comprime", "diuretiques", "C03AA03", { ...E, marques: ["Esidrex"] }),
  p("Furosémide", "40 mg", "comprime", "diuretiques", "C03CA01", { ...E, marques: ["Lasilix"] }),
  p("Furosémide", "20 mg/2 ml", "injectable", "diuretiques", "C03CA01", { ...E, marques: ["Lasilix"] }),
  p("Aténolol", "50 mg", "comprime", "betabloquants", "C07AB03", { ...E, marques: ["Ténormine"] }),
  p("Méthyldopa", "250 mg", "comprime", "antihypertenseurs", "C02AB01", { ...E, marques: ["Aldomet"], info: "Hypertension pendant la grossesse." }),
  p("Atorvastatine", "20 mg", "comprime", "statines", "C10AA05", { ...E, marques: ["Tahor", "Lipitor"], grossesse: true }),
  p("Metformine", "500 mg", "comprime", "antidiabetiques oraux", "A10BA02", { ...E, marques: ["Glucophage"] }),
  p("Metformine", "850 mg", "comprime", "antidiabetiques oraux", "A10BA02", { ...E, marques: ["Glucophage"] }),
  p("Glibenclamide", "5 mg", "comprime", "antidiabetiques oraux", "A10BB01", { ...E, marques: ["Daonil"] }),
  p("Gliclazide", "80 mg", "comprime", "antidiabetiques oraux", "A10BB09", { marques: ["Diamicron"] }),
  p("Insuline humaine rapide", "100 UI/ml", "injectable", "insulines", "A10AB01", { ...E, marques: ["Actrapid"] }),
  p("Insuline humaine isophane", "100 UI/ml", "injectable", "insulines", "A10AC01", { ...E, marques: ["Insulatard"] }),

  // Sante de la mere, contraception
  p("Ocytocine", "10 UI/ml", "injectable", "ocytociques", "H01BB02", { ...E, marques: ["Syntocinon"], info: "Prévention et traitement de l'hémorragie du post-partum." }),
  p("Acide tranexamique", "500 mg/5 ml", "injectable", "antifibrinolytiques", "B02AA02", { ...E, marques: ["Exacyl"], info: "Hémorragie du post-partum." }),
  p("Lévonorgestrel", "1,5 mg", "comprime", "contraceptifs", "G03AD01", { ...E, marques: ["Norlevo"], grossesse: true, info: "Contraception d'urgence." }),
  p("Lévonorgestrel / Éthinylestradiol", "150 µg / 30 µg", "comprime", "contraceptifs", "G03AA07", { ...E, marques: ["Minidril", "Microgynon"], grossesse: true, info: "Contraceptif oral combiné." }),
  p("Médroxyprogestérone", "150 mg/ml", "injectable", "contraceptifs", "G03AC06", { ...E, marques: ["Depo-Provera"], grossesse: true, info: "Contraceptif injectable trimestriel." }),

  // Neurologie, antiseptiques
  p("Diazépam", "10 mg/2 ml", "injectable", "benzodiazepines", "N05BA01", { ...E, marques: ["Valium"], info: "État de mal convulsif." }),
  p("Povidone iodée", "10 %", "autre", "produits iodes", "D08AG02", { ...E, marques: ["Bétadine"], info: "Solution antiseptique." }),
];

/** Forme comparable d'un texte : minuscules, sans accents ni espaces (dosages "20 mg / 120 mg" et "20 mg/120 mg" se confondent). */
function compact(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

/**
 * Vrai quand une ligne deja presente en base est la meme presentation qu'une
 * entree du catalogue de depart : meme dosage et meme forme, et meme DCI OU
 * meme nom qu'un nom du catalogue (les medicaments de demonstration portent
 * une marque dans `nom`, ex. "Coartem", avec une DCI ecrite autrement).
 */
export function memePresentation(
  existant: { nom: string; principeActif: string; dosage: string; forme: string },
  entree: MedicamentDepart
): boolean {
  if (compact(existant.dosage) !== compact(entree.dosage) || compact(existant.forme) !== compact(entree.forme)) {
    return false;
  }

  if (compact(existant.principeActif) === compact(entree.principeActif)) {
    return true;
  }

  const nomsConnus = new Set([entree.nom, ...entree.nomsCommerciaux].map(compact));
  return nomsConnus.has(compact(existant.nom));
}
