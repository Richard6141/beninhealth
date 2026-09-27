/**
 * Evaluation des fonctionnalites d'IA avant activation et sur demande
 * (RG-IA-20 : un changement qui fait echouer le jeu d'evaluation ne doit pas
 * etre deploye). Module serveur sans "use server" : ce n'est pas un point
 * d'entree. Aucun acces base, aucune donnee reelle.
 */

import { fournisseurConfigure } from "./configuration";
import { executerJeuEvaluation, type EchecEvaluation } from "./jeu-evaluation";
import { executerJeuAnalyse } from "./jeu-evaluation-analyse";
import { executerJeuAssistant } from "./jeu-evaluation-assistant";

export type CleFonctionnaliteIa = "ai.summary" | "ai.citizen_assistant" | "ai.analytics";

export interface BilanEvaluation {
  conformes: number;
  total: number;
  echecs: EchecEvaluation[];
}

export function estFonctionnaliteIa(cle: string): cle is CleFonctionnaliteIa {
  return cle === "ai.summary" || cle === "ai.citizen_assistant" || cle === "ai.analytics";
}

async function evaluerResume(): Promise<BilanEvaluation> {
  const resultat = await executerJeuEvaluation(fournisseurConfigure());
  return { conformes: resultat.conformes, total: resultat.total, echecs: resultat.echecs };
}

async function evaluerAssistant(): Promise<BilanEvaluation> {
  const resultat = await executerJeuAssistant();
  return {
    conformes: resultat.conformes,
    total: resultat.total,
    echecs: resultat.echecs.map((echec) => ({ dossier: `Assistant : ${echec.question}`, regle: "attendu" as const, detail: `${echec.regle} : ${echec.detail}` })),
  };
}

async function evaluerAnalyse(): Promise<BilanEvaluation> {
  const resultat = executerJeuAnalyse();
  return {
    conformes: resultat.conformes,
    total: resultat.total,
    echecs: resultat.echecs.map((echec) => ({ dossier: `Analyse : ${echec.cas}`, regle: "attendu" as const, detail: `${echec.regle} : ${echec.detail}` })),
  };
}

export async function evaluerFonctionnaliteIa(cle: CleFonctionnaliteIa): Promise<BilanEvaluation> {
  if (cle === "ai.summary") return evaluerResume();
  if (cle === "ai.citizen_assistant") return evaluerAssistant();
  return evaluerAnalyse();
}

/** Les trois jeux, additionnes (ecran de gouvernance). */
export async function evaluerToutesLesFonctionnalitesIa(): Promise<BilanEvaluation> {
  const [resume, assistant, analyse] = await Promise.all([evaluerResume(), evaluerAssistant(), evaluerAnalyse()]);
  return {
    conformes: resume.conformes + assistant.conformes + analyse.conformes,
    total: resume.total + assistant.total + analyse.total,
    echecs: [...resume.echecs, ...assistant.echecs, ...analyse.echecs],
  };
}
