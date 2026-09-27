"use server";

/**
 * Gouvernance de l'IA (F-IA-05, chapitre 16 du pack) : fiches, suivi agrege,
 * jeu d'evaluation rejouable et coupure instantanee. Reserve a l'administration
 * nationale (ressource dediee gouvernance_ia). Aucune donnee de patient : seuls
 * des compteurs, des taux et des textes de fiches sont lus.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { can } from "@/security/permissions";
import { nomFournisseurConfigure } from "./configuration";
import { evaluerToutesLesFonctionnalitesIa } from "./evaluation";
import { FICHES_IA, type FicheIa } from "./fiches";
import type { EchecEvaluation } from "./jeu-evaluation";
import { FONCTIONNALITE_ANALYSE, FONCTIONNALITE_ASSISTANT, FONCTIONNALITE_RESUME, statistiquesAppelsIa, type StatistiquesIa } from "./journal";
import { VERSION_CONSIGNE_RESUME } from "./regles";
import { VERSION_BASE_ASSISTANT } from "./assistant";

const JOURS_SUIVI = 30;
const ACTION_EVALUATION = "evaluation_ia_rejouee";
const CLES_IA = ["ai.summary", "ai.citizen_assistant", "ai.analytics"] as const;
const DESCRIPTIONS_IA: Record<(typeof CLES_IA)[number], string> = {
  "ai.summary": "Resume automatique par IA d'un dossier ou d'une consultation.",
  "ai.citizen_assistant": "Assistant conversationnel IA pour le citoyen.",
  "ai.analytics": "Analyse assistee des tendances et des valeurs atypiques sur les agregats de pilotage (F-IA-04), signaux statistiques a verifier.",
};

export interface FonctionnaliteIaVue {
  cle: string;
  actif: boolean;
}

export interface GouvernanceIa {
  fournisseur: string;
  fonctionnalites: FonctionnaliteIaVue[];
  fiches: FicheIa[];
  statistiques: StatistiquesIa;
  statistiquesAssistant: StatistiquesIa;
  statistiquesAnalyse: StatistiquesIa;
  joursSuivi: number;
  derniereEvaluation: { date: string; conformes: number; total: number } | null;
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

async function obtenirSessionGouvernance(action: "read" | "update") {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, action, "gouvernance_ia"))) return null;
  return session;
}

/** Tableau de gouvernance, ou null si le role n'y a pas droit. */
export async function getGouvernanceIa(): Promise<GouvernanceIa | null> {
  if (!(await obtenirSessionGouvernance("read"))) return null;

  const depuis = new Date(Date.now() - JOURS_SUIVI * 24 * 60 * 60 * 1000);
  const [lignes, statistiques, statistiquesAssistant, statistiquesAnalyse, derniere] = await Promise.all([
    prisma.fonctionnaliteActivable.findMany({ where: { cle: { in: [...CLES_IA] } }, select: { cle: true, actif: true } }),
    statistiquesAppelsIa(FONCTIONNALITE_RESUME, depuis),
    statistiquesAppelsIa(FONCTIONNALITE_ASSISTANT, depuis),
    statistiquesAppelsIa(FONCTIONNALITE_ANALYSE, depuis),
    prisma.journalAudit.findFirst({ where: { action: ACTION_EVALUATION }, orderBy: { date: "desc" }, select: { date: true, justification: true } }),
  ]);

  const correspondance = derniere?.justification.match(/(\d+)\/(\d+) (?:dossiers|cas)/);

  return {
    fournisseur: nomFournisseurConfigure(),
    // Une ligne absente vaut "desactive" : etat par defaut des fonctionnalites d'IA (RG-IA-02).
    fonctionnalites: CLES_IA.map((cle) => ({ cle, actif: lignes.find((ligne) => ligne.cle === cle)?.actif ?? false })),
    fiches: [...FICHES_IA],
    statistiques,
    statistiquesAssistant,
    statistiquesAnalyse,
    joursSuivi: JOURS_SUIVI,
    derniereEvaluation:
      derniere && correspondance ? { date: derniere.date.toISOString(), conformes: Number(correspondance[1]), total: Number(correspondance[2]) } : null,
  };
}

export interface EvaluationIaEtat {
  error: string | null;
  success: boolean;
  conformes: number;
  total: number;
  echecs: EchecEvaluation[];
}

const ETAT_EVALUATION_VIDE: EvaluationIaEtat = { error: null, success: false, conformes: 0, total: 0, echecs: [] };

/** Rejoue les jeux d'evaluation (dossiers fictifs du resume, questions de l'assistant, series de l'analyse) avec le fournisseur, la base et les seuils actuels (RG-IA-20). */
export async function rejouerJeuEvaluationAction(): Promise<EvaluationIaEtat> {
  const session = await obtenirSessionGouvernance("update");
  if (!session) return { ...ETAT_EVALUATION_VIDE, error: "Action réservée à l'administration nationale." };

  try {
    const resultat = await evaluerToutesLesFonctionnalitesIa();

    await journaliser({
      utilisateurId: session.userId,
      action: ACTION_EVALUATION,
      donneeConcernee: "ia:resume_dossier",
      adresseTechnique: await adresseTechniqueCourante(),
      justification: `${resultat.conformes}/${resultat.total} cas conformes (fournisseur ${nomFournisseurConfigure()}, consigne ${VERSION_CONSIGNE_RESUME}, base assistant ${VERSION_BASE_ASSISTANT}).`,
    });

    return { error: null, success: resultat.echecs.length === 0, conformes: resultat.conformes, total: resultat.total, echecs: resultat.echecs };
  } catch (erreur) {
    console.error("[ia] echec du rejeu du jeu d'evaluation", erreur);
    return { ...ETAT_EVALUATION_VIDE, error: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export interface DesactivationIaEtat {
  error: string | null;
  success: boolean;
}

/**
 * Coupe toutes les fonctionnalites d'IA d'un coup (RG-IA-02 : "coupee
 * instantanement"). Idempotent : forcer "desactive" et non basculer, pour
 * qu'un double clic ne rallume jamais l'IA. Lue en base a chaque appel, la
 * coupure prend effet sur le champ.
 */
export async function desactiverIaAction(): Promise<DesactivationIaEtat> {
  const session = await obtenirSessionGouvernance("update");
  if (!session) return { error: "Action réservée à l'administration nationale.", success: false };

  try {
    const adresseTechnique = await adresseTechniqueCourante();
    await prisma.$transaction(async (tx) => {
      for (const cle of CLES_IA) {
        await tx.fonctionnaliteActivable.upsert({
          where: { cle },
          update: { actif: false, dateModification: new Date() },
          create: { cle, actif: false, description: DESCRIPTIONS_IA[cle] },
        });
      }
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "desactivation_ia",
          donneeConcernee: "fonctionnalites:ai",
          adresseTechnique,
          justification: `Fonctionnalités d'IA désactivées (${CLES_IA.join(", ")}).`,
        },
        tx
      );
    });
    return { error: null, success: true };
  } catch (erreur) {
    console.error("[ia] echec de la desactivation", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }
}
