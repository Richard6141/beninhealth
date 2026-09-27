/**
 * Jeu d'evaluation de l'analyse des agregats (F-IA-04, F-IA-05, RG-IA-20) :
 * series hebdomadaires FICTIVES dont le resultat attendu est connu (pic, chute,
 * hausse, baisse, ou aucun signal). Rejoue par la gouvernance et avant toute
 * activation de ai.analytics. Module pur, aucune donnee reelle.
 *
 * Invariants verifies en plus du type de signal : l'explication cite la valeur
 * observee, aucune valeur de 1 a 4 n'est jamais affichee (RG-PIL-02), et un
 * signal ne porte que des champs agreges (aucun identifiant de patient).
 */

import { analyserSerie, type SerieHebdomadaire, type TypeSignal } from "./analyse-agregats";

interface CasAnalyse {
  nom: string;
  valeurs: readonly number[];
  attendus: readonly TypeSignal[];
}

const LUNDI_INITIAL = Date.UTC(2026, 5, 1);

function serie(nom: string, valeurs: readonly number[]): SerieHebdomadaire {
  return {
    code: "IND-01",
    libelle: "Consultations",
    territoire: nom,
    semaines: valeurs.map((valeur, index) => ({ debut: new Date(LUNDI_INITIAL + index * 7 * 24 * 3600 * 1000).toISOString().slice(0, 10), valeur })),
  };
}

export const JEU_ANALYSE: readonly CasAnalyse[] = [
  { nom: "stable", valeurs: [40, 42, 39, 41, 38, 40, 43, 41, 41], attendus: [] },
  { nom: "pic net", valeurs: [40, 42, 39, 41, 38, 40, 43, 41, 95], attendus: ["pic"] },
  { nom: "chute nette", valeurs: [60, 62, 58, 61, 59, 60, 63, 61, 12], attendus: ["chute"] },
  { nom: "petits effectifs sans signal", valeurs: [2, 3, 1, 2, 4, 3, 2, 3, 9], attendus: [] },
  { nom: "hausse continue", valeurs: [20, 22, 26, 29, 35, 41, 48, 56], attendus: ["hausse"] },
  { nom: "baisse continue", valeurs: [80, 72, 66, 58, 50, 45, 38, 30], attendus: ["baisse"] },
  { nom: "oscillation sans tendance", valeurs: [30, 50, 30, 50, 30, 50, 30, 50, 30], attendus: [] },
  { nom: "serie nulle", valeurs: [0, 0, 0, 0, 0, 0, 0, 0, 0], attendus: [] },
  { nom: "historique insuffisant", valeurs: [40, 41, 90], attendus: [] },
  { nom: "variabilite elevee sans signal", valeurs: [30, 60, 25, 55, 35, 50, 28, 52, 58], attendus: [] },
  { nom: "pic sur une mediane masquee", valeurs: [3, 3, 3, 4, 3, 3, 4, 3, 30], attendus: ["pic"] },
  { nom: "chute vers un petit effectif", valeurs: [40, 42, 39, 41, 38, 40, 43, 41, 2], attendus: ["chute"] },
];

export interface EchecAnalyse {
  cas: string;
  regle: "signaux" | "valeur" | "masquage" | "champs";
  detail: string;
}

export interface ResultatEvaluationAnalyse {
  total: number;
  conformes: number;
  echecs: EchecAnalyse[];
}

const CHAMPS_AUTORISES = new Set(["type", "code", "libelle", "territoire", "semaine", "observe", "attendu", "mesure", "explication"]);
// Un effectif de 1 a 4 present dans le texte d'un signal (RG-PIL-02).
const MOTIF_PETIT_EFFECTIF = /(?:^|[^\d,.])[1-4](?![\d,.])(?! ?(?:fois|semaines?|dernières|premières|hausses|baisses|variations|dans|sur|%))/;

export function executerJeuAnalyse(): ResultatEvaluationAnalyse {
  const echecs: EchecAnalyse[] = [];
  let casEnEchec = 0;

  for (const cas of JEU_ANALYSE) {
    const avant = echecs.length;
    const signaux = analyserSerie(serie(cas.nom, cas.valeurs));
    const obtenus = signaux.map((signal) => signal.type).sort();

    if (JSON.stringify(obtenus) !== JSON.stringify([...cas.attendus].sort())) {
      echecs.push({ cas: cas.nom, regle: "signaux", detail: `signaux ${JSON.stringify(obtenus)} au lieu de ${JSON.stringify(cas.attendus)}` });
    }

    for (const signal of signaux) {
      const derniere = cas.valeurs[cas.valeurs.length - 1];
      if (signal.type !== "hausse" && signal.type !== "baisse" && derniere >= 5 && !signal.explication.includes(String(derniere))) {
        echecs.push({ cas: cas.nom, regle: "valeur", detail: "l'explication ne cite pas la valeur observee" });
      }
      // Une valeur inferieure a 5 (observee ou de reference) ne doit jamais apparaitre ni dans les champs ni dans le texte.
      const petitesValeurs = new Set(cas.valeurs.filter((valeur) => valeur > 0 && valeur < 5).map(String));
      if (petitesValeurs.size > 0 && (MOTIF_PETIT_EFFECTIF.test(signal.explication) || (typeof signal.observe === "number" && signal.observe < 5 && signal.observe > 0) || (typeof signal.attendu === "number" && signal.attendu < 5 && signal.attendu > 0))) {
        echecs.push({ cas: cas.nom, regle: "masquage", detail: `valeur inferieure a 5 exposee : ${signal.explication.slice(0, 90)}` });
      }
      const champsInattendus = Object.keys(signal).filter((champ) => !CHAMPS_AUTORISES.has(champ));
      if (champsInattendus.length > 0) echecs.push({ cas: cas.nom, regle: "champs", detail: `champs non autorises : ${champsInattendus.join(", ")}` });
    }

    if (echecs.length > avant) casEnEchec += 1;
  }

  return { total: JEU_ANALYSE.length, conformes: JEU_ANALYSE.length - casEnEchec, echecs };
}
