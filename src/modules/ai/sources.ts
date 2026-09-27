/**
 * Construction des elements sources d'un resume de dossier (F-IA-01 etape 3).
 * Module pur : recoit des donnees deja lues (et deja autorisees) par
 * l'appelant, les filtre, les minimise et les etiquette [S1], [S2]...
 *
 * Exclusions (RG-IA-05) : tout element relevant d'un groupe de maladies
 * SENSIBLE (VIH, sante mentale, IST, violences, addictions, interruption de
 * grossesse, voir pilotage/referentiel-groupes-maladies.ts) et tout examen
 * marque sensible. La detection repose sur des mots-cles (aucun codage CIM-10
 * dans ce depot) : limite assumee, a remplacer par le codage reel.
 */

import { classifierGroupeMaladie } from "@/modules/pilotage/referentiel-groupes-maladies";
import { assainirTexte, type IdentitePatient } from "./minimisation";
import { MOIS_HISTORIQUE_RESUME, type ElementSource, type TypeElement } from "./regles";

export interface DonneesDossierIa {
  dateReference: Date;
  age: number;
  sexe: string;
  allergies: readonly string[];
  antecedents: readonly string[];
  maladiesChroniques: readonly string[];
  traitements: readonly { date: Date; lignes: readonly { medicament: string; posologie: string; dureeJours: number }[] }[];
  consultations: readonly {
    date: Date;
    motif: string;
    conclusion: string;
    tensionSystolique: number | null;
    tensionDiastolique: number | null;
  }[];
  examens: readonly {
    date: Date;
    typeExamen: string;
    sensible: boolean;
    parametres: readonly { libelle: string; valeur: number; unite: string; indicateur: string }[];
  }[];
  vaccinations: readonly { date: Date; vaccin: string; numeroDose: number }[];
}

export interface ElementsConstruits {
  elements: ElementSource[];
  /** Elements ecartes car sensibles (RG-IA-05), pour le journal (nombre seulement). */
  exclusSensibles: number;
}

const MAX_ELEMENTS = 40;
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export function moisAnnee(date: Date): string {
  return `${MOIS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function debutFenetre(dateReference: Date): Date {
  const debut = new Date(dateReference);
  debut.setUTCMonth(debut.getUTCMonth() - MOIS_HISTORIQUE_RESUME);
  return debut;
}

function moisEcoules(depuis: Date, jusqua: Date): number {
  return (jusqua.getUTCFullYear() - depuis.getUTCFullYear()) * 12 + (jusqua.getUTCMonth() - depuis.getUTCMonth());
}

/**
 * Formulations sensibles que le referentiel de pilotage ne couvre pas (il
 * cherche des expressions exactes) : l'IA est volontairement plus stricte que
 * les indicateurs, en cas de doute un element est ecarte plutot que propose.
 */
const MOTS_CLES_SENSIBLES_SUPPLEMENTAIRES = [
  "interruption volontaire",
  "seropositi",
  "suicid",
  "abus sexuel",
  "agression sexuelle",
  "viol ",
  "psychiatri",
];

function normaliserTexte(texte: string): string {
  return texte.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Vrai si un texte libre releve d'un groupe de maladies sensible (RG-IA-05). */
export function estTexteSensible(texte: string): boolean {
  if (classifierGroupeMaladie(texte)?.sensible === true) return true;
  const normalise = `${normaliserTexte(texte)} `;
  return MOTS_CLES_SENSIBLES_SUPPLEMENTAIRES.some((motCle) => normalise.includes(motCle));
}

export function construireElements(donnees: DonneesDossierIa, identite: IdentitePatient): ElementsConstruits {
  const brut: { type: TypeElement; texte: string; date: Date | null }[] = [];
  let exclusSensibles = 0;
  const fenetre = debutFenetre(donnees.dateReference);

  const ajouter = (type: TypeElement, texte: string, date: Date | null) => {
    const propre = assainirTexte(texte, identite);
    if (propre.length > 0) brut.push({ type, texte: propre, date });
  };
  const ajouterSiNonSensible = (type: TypeElement, texte: string, date: Date | null) => {
    if (estTexteSensible(texte)) {
      exclusSensibles += 1;
      return;
    }
    ajouter(type, texte, date);
  };

  for (const allergie of donnees.allergies) ajouterSiNonSensible("allergie", allergie, null);
  for (const maladie of donnees.maladiesChroniques) ajouterSiNonSensible("maladie_chronique", maladie, null);
  for (const antecedent of donnees.antecedents) ajouterSiNonSensible("antecedent", antecedent, null);

  for (const traitement of donnees.traitements) {
    if (traitement.date < fenetre) continue;
    const lignes = traitement.lignes
      .map((ligne) => `${ligne.medicament}, ${ligne.posologie}, ${ligne.dureeJours} jours`)
      .join(" ; ");
    ajouter("traitement", `Prescrit en ${moisAnnee(traitement.date)} : ${lignes}`, traitement.date);
  }

  for (const examen of donnees.examens) {
    if (examen.date < fenetre) continue;
    if (examen.sensible) {
      exclusSensibles += 1;
      continue;
    }
    for (const parametre of examen.parametres) {
      if (parametre.indicateur === "N") continue;
      ajouter(
        "resultat_anormal",
        `${examen.typeExamen}, ${moisAnnee(examen.date)} : ${parametre.libelle} ${parametre.valeur} ${parametre.unite} (${parametre.indicateur})`,
        examen.date
      );
    }
  }

  const consultations = donnees.consultations
    .filter((consultation) => consultation.date >= fenetre)
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  for (const consultation of consultations) {
    const texte = `${consultation.motif} ${consultation.conclusion}`;
    if (estTexteSensible(texte)) {
      exclusSensibles += 1;
      continue;
    }
    ajouter("consultation", `Consultation de ${moisAnnee(consultation.date)} : motif ${consultation.motif}, conclusion ${consultation.conclusion}`, consultation.date);
  }

  for (const vaccination of donnees.vaccinations) {
    if (vaccination.date < fenetre) continue;
    ajouter("vaccination", `${vaccination.vaccin}, dose ${vaccination.numeroDose}, ${moisAnnee(vaccination.date)}`, vaccination.date);
  }

  // Information manquante importante : derniere mesure de tension arterielle.
  const avecTension = consultations.find((consultation) => consultation.tensionSystolique !== null && consultation.tensionDiastolique !== null);
  if (avecTension === undefined) {
    ajouter("information_manquante", `Aucune mesure de tension artérielle enregistrée dans les ${MOIS_HISTORIQUE_RESUME} derniers mois`, null);
  } else {
    const ecoules = moisEcoules(avecTension.date, donnees.dateReference);
    if (ecoules > 12) ajouter("information_manquante", `Dernière mesure de tension artérielle il y a ${ecoules} mois`, avecTension.date);
  }

  return {
    elements: brut.slice(0, MAX_ELEMENTS).map((element, index) => ({
      etiquette: `S${index + 1}`,
      type: element.type,
      texte: element.texte,
      date: element.date ? element.date.toISOString() : null,
    })),
    exclusSensibles,
  };
}
