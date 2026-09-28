/**
 * Import CSV du referentiel des etablissements (F-ADM-02 du pack, P1
 * explicite). Module pur (pas de "use server", aucun acces base) : parsing
 * du fichier et validation ligne par ligne, reutilisant integralement les
 * regles deja en place dans etablissements-regles.ts (emprise du Benin,
 * coherence du departement, services, type). La resolution du departement
 * et de la commune se fait contre un referentiel deja charge (aucune requete
 * ici), pour rester un module pur et facilement testable.
 *
 * Decision de perimetre (documentee dans docs/coordination-agents.md avant
 * de coder) : le CSV ne cree JAMAIS de compte administrateur (contrairement
 * a la creation unitaire d'un etablissement, qui provisionne son admin dans
 * la meme transaction, voir identity/gestion-comptes.ts) : c'est
 * uniquement un chargement en masse du referentiel. Consequence : les
 * etablissements importes sont crees au statut "brouillon", jamais "actif"
 * d'emblee, en attendant qu'un admin_etablissement leur soit rattache et que
 * le statut soit change explicitement (changerStatutEtablissementAction,
 * deja existante).
 *
 * EtablissementSanitaire.localisation est obligatoire en base mais absent de
 * la liste de colonnes du pack : derive automatiquement (adresse, sinon
 * quartier/village, sinon le nom de la commune), jamais demande dans le CSV.
 */

import {
  CAPACITE_MAXIMALE,
  TYPES_ETABLISSEMENT_TRAITES,
  analyserServices,
  normaliserNomTerritoire,
  verifierCoordonnees,
  verifierPointDansDepartement,
  type GeometrieTerritoire,
  type TypeEtablissementTraite,
} from "./etablissements-regles";

/** Colonnes obligatoires du CSV (F-ADM-02 du pack). L'ordre des colonnes dans le fichier n'importe pas : reperees par leur en-tete. */
export const COLONNES_OBLIGATOIRES = ["nom", "type", "capacite", "latitude", "longitude", "departement", "commune"] as const;

/** Colonnes facultatives reconnues, en plus des obligatoires ci-dessus. */
export const COLONNES_FACULTATIVES = [
  "services",
  "sigle",
  "niveauPyramide",
  "secteur",
  "arrondissement",
  "quartierVillage",
  "adresse",
  "telephoneEtablissement",
  "emailEtablissement",
  "identifiantExterneDhis2",
] as const;

const TOUTES_LES_COLONNES = [...COLONNES_OBLIGATOIRES, ...COLONNES_FACULTATIVES] as const;
type NomColonne = (typeof TOUTES_LES_COLONNES)[number];

/** Minuscules sans accents ni espaces superflus, pour reperer un en-tete de colonne quelle que soit sa casse. */
function normaliserEnTete(valeur: string): string {
  return valeur
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

const ENTETES_NORMALISEES = new Map<string, NomColonne>(TOUTES_LES_COLONNES.map((colonne) => [normaliserEnTete(colonne), colonne]));

/**
 * Analyse une ligne CSV en champs (support des guillemets doubles pour un
 * champ contenant une virgule, et de leur doublement pour un guillemet
 * litteral, RFC 4180). Limite assumee : un champ entre guillemets ne peut
 * pas contenir de saut de ligne (chaque ligne du fichier est une ligne
 * physique) - suffisant pour ce referentiel (aucun champ multiligne).
 */
export function analyserLigneCsv(ligne: string): string[] {
  const champs: string[] = [];
  let champActuel = "";
  let dansGuillemets = false;

  for (let i = 0; i < ligne.length; i++) {
    const caractere = ligne[i];

    if (dansGuillemets) {
      if (caractere === '"') {
        if (ligne[i + 1] === '"') {
          champActuel += '"';
          i++;
        } else {
          dansGuillemets = false;
        }
      } else {
        champActuel += caractere;
      }
      continue;
    }

    if (caractere === '"') {
      dansGuillemets = true;
    } else if (caractere === ",") {
      champs.push(champActuel);
      champActuel = "";
    } else {
      champActuel += caractere;
    }
  }
  champs.push(champActuel);
  return champs;
}

export type LigneCsvBrute = Partial<Record<NomColonne, string>> & { numeroLigne: number };

export interface ResultatAnalyseCsv {
  lignes: LigneCsvBrute[];
  erreurEntete: string | null;
}

/**
 * Decoupe le contenu CSV en lignes de donnees brutes (la ligne d'en-tete
 * determine quelle colonne est laquelle). erreurEntete non-null si une
 * colonne obligatoire manque : dans ce cas, lignes est toujours vide (rien
 * n'est exploitable sans savoir quelle colonne est laquelle).
 */
export function analyserFichierCsv(contenu: string): ResultatAnalyseCsv {
  const lignesBrutes = contenu.split(/\r?\n/).filter((ligne) => ligne.trim().length > 0);

  if (lignesBrutes.length === 0) {
    return { lignes: [], erreurEntete: "Le fichier est vide." };
  }

  const entetes = analyserLigneCsv(lignesBrutes[0]).map((entete) => ENTETES_NORMALISEES.get(normaliserEnTete(entete)));

  const colonnesManquantes = COLONNES_OBLIGATOIRES.filter((colonne) => !entetes.includes(colonne));
  if (colonnesManquantes.length > 0) {
    return {
      lignes: [],
      erreurEntete: `Colonnes obligatoires manquantes dans l'en-tete : ${colonnesManquantes.join(", ")}.`,
    };
  }

  const lignes: LigneCsvBrute[] = lignesBrutes.slice(1).map((ligneBrute, index) => {
    const valeurs = analyserLigneCsv(ligneBrute);
    const ligne: LigneCsvBrute = { numeroLigne: index + 2 }; // +2 : ligne 1 = en-tete, 1-based.
    entetes.forEach((colonne, position) => {
      if (colonne) ligne[colonne] = (valeurs[position] ?? "").trim();
    });
    return ligne;
  });

  return { lignes, erreurEntete: null };
}

export interface CommuneReferentiel {
  id: string;
  nom: string;
  departementNom: string;
}

export interface LigneImportValide {
  numeroLigne: number;
  nom: string;
  type: TypeEtablissementTraite;
  capacite: number;
  latitude: number;
  longitude: number;
  communeId: string;
  localisation: string;
  services: string[];
  sigle: string | null;
  niveauPyramide: string | null;
  secteur: string | null;
  arrondissement: string | null;
  quartierVillage: string | null;
  adresse: string | null;
  telephoneEtablissement: string | null;
  emailEtablissement: string | null;
  identifiantExterneDhis2: string | null;
}

export interface LigneImportInvalide {
  numeroLigne: number;
  nomBrut: string;
  erreur: string;
}

function texteOuNull(valeur: string | undefined): string | null {
  const nettoye = (valeur ?? "").trim();
  return nettoye.length > 0 ? nettoye : null;
}

/**
 * Valide une ligne brute du CSV et la convertit en ligne prete a ecrire, ou
 * renvoie le motif de refus. Reutilise integralement les regles de
 * etablissements-regles.ts (memes controles que la creation/edition
 * unitaire) : aucune regle specifique a l'import n'est inventee, hormis le
 * format du fichier lui-meme.
 */
export function validerLigneImportEtablissement(
  ligne: LigneCsvBrute,
  communes: readonly CommuneReferentiel[],
  geometries: readonly GeometrieTerritoire[]
): LigneImportValide | LigneImportInvalide {
  const nomBrut = ligne.nom ?? "";
  const echec = (erreur: string): LigneImportInvalide => ({ numeroLigne: ligne.numeroLigne, nomBrut, erreur });

  const nom = nomBrut.trim();
  if (nom.length < 3 || nom.length > 150) {
    return echec("Le nom doit contenir entre 3 et 150 caracteres.");
  }

  const typeBrut = (ligne.type ?? "").trim();
  if (!(TYPES_ETABLISSEMENT_TRAITES as readonly string[]).includes(typeBrut)) {
    return echec(`Type invalide "${typeBrut}" (attendu : ${TYPES_ETABLISSEMENT_TRAITES.join(", ")}).`);
  }
  const type = typeBrut as TypeEtablissementTraite;

  const capacite = Number(ligne.capacite);
  if (!Number.isInteger(capacite) || capacite < 0 || capacite > CAPACITE_MAXIMALE) {
    return echec(`Capacite invalide "${ligne.capacite ?? ""}" (entier entre 0 et ${CAPACITE_MAXIMALE} attendu).`);
  }

  const latitude = Number(ligne.latitude);
  const longitude = Number(ligne.longitude);
  const erreurCoordonnees = verifierCoordonnees(latitude, longitude);
  if (erreurCoordonnees) {
    return echec(erreurCoordonnees);
  }

  const departementBrut = (ligne.departement ?? "").trim();
  const communeBrute = (ligne.commune ?? "").trim();
  if (departementBrut.length === 0 || communeBrute.length === 0) {
    return echec("Le departement et la commune sont obligatoires.");
  }

  const departementNormalise = normaliserNomTerritoire(departementBrut);
  const communeNormalisee = normaliserNomTerritoire(communeBrute);
  const communeTrouvee = communes.find(
    (candidate) =>
      normaliserNomTerritoire(candidate.nom) === communeNormalisee &&
      normaliserNomTerritoire(candidate.departementNom) === departementNormalise
  );

  if (!communeTrouvee) {
    return echec(`Commune "${communeBrute}" introuvable dans le departement "${departementBrut}".`);
  }

  const erreurDepartement = verifierPointDansDepartement(latitude, longitude, departementBrut, geometries);
  if (erreurDepartement) {
    return echec(erreurDepartement);
  }

  const services = analyserServices((ligne.services ?? "").split(/;+/).join("\n"));
  if ("erreur" in services) {
    return echec(services.erreur);
  }

  const adresse = texteOuNull(ligne.adresse);
  const quartierVillage = texteOuNull(ligne.quartierVillage);
  // Champ obligatoire en base, absent du CSV (voir docstring de module) :
  // derive du meilleur texte disponible, jamais laisse vide.
  const localisation = adresse ?? quartierVillage ?? communeTrouvee.nom;

  const email = texteOuNull(ligne.emailEtablissement);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return echec(`Adresse e-mail invalide "${email}".`);
  }

  return {
    numeroLigne: ligne.numeroLigne,
    nom,
    type,
    capacite,
    latitude,
    longitude,
    communeId: communeTrouvee.id,
    localisation,
    services: services.services,
    sigle: texteOuNull(ligne.sigle),
    niveauPyramide: texteOuNull(ligne.niveauPyramide),
    secteur: texteOuNull(ligne.secteur),
    arrondissement: texteOuNull(ligne.arrondissement),
    quartierVillage,
    adresse,
    telephoneEtablissement: texteOuNull(ligne.telephoneEtablissement),
    emailEtablissement: email,
    identifiantExterneDhis2: texteOuNull(ligne.identifiantExterneDhis2),
  };
}

export interface RapportValidationImport {
  valides: LigneImportValide[];
  invalides: LigneImportInvalide[];
}

/** Valide toutes les lignes d'un CSV deja analyse (analyserFichierCsv). */
export function validerLignesImport(
  lignes: readonly LigneCsvBrute[],
  communes: readonly CommuneReferentiel[],
  geometries: readonly GeometrieTerritoire[]
): RapportValidationImport {
  const valides: LigneImportValide[] = [];
  const invalides: LigneImportInvalide[] = [];

  for (const ligne of lignes) {
    const resultat = validerLigneImportEtablissement(ligne, communes, geometries);
    if ("erreur" in resultat) {
      invalides.push(resultat);
    } else {
      valides.push(resultat);
    }
  }

  return { valides, invalides };
}
