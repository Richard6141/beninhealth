"use server";

/**
 * Analyse assistee des agregats de pilotage (F-IA-04, chapitre 16 du pack),
 * reservee a l'administration nationale. Ne lit QUE `AgregatQuotidien`
 * (jamais Consultation ni aucune table individuelle, RG-PIL-01), par
 * departement, sur les 12 dernieres semaines completes. Les statistiques sont
 * calculees par analyse-agregats.ts (deterministes, sans service externe) et
 * chaque signal est un constat a verifier, jamais une conclusion ni une
 * communication (meme esprit que RG-PIL-50).
 *
 * Indicateurs analyses : ceux de la comparaison territoriale de F-PIL-04
 * (IND-01, 02, 04, 07, 08, 10), les seuls representables par un nombre par
 * etablissement et par jour. Voir src/modules/pilotage/tendances-constantes.ts.
 *
 * Controles : session admin_national, fonctionnalite ai.analytics active
 * (RG-IA-02, relue en base a chaque appel). Chaque ouverture est journalisee
 * (RG-PIL-21, ANALYTICS_VIEW) et comptee dans le suivi de gouvernance.
 */

import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { journaliser } from "@/modules/audit/journaliser";
import { DIMENSION_PAR_INDICATEUR_COMPARABLE } from "@/modules/pilotage/tendances-constantes";
import { trouverDefinitionIndicateur } from "@/modules/pilotage/indicateurs";
import { can } from "@/security/permissions";
import {
  analyserSeries,
  construireSeriesHebdomadaires,
  lundisDesSemainesCompletes,
  type LigneAgregat,
  type SerieHebdomadaire,
  type SignalAnalyse,
} from "./analyse-agregats";
import { enregistrerAppelTermine, FONCTIONNALITE_ANALYSE } from "./journal";
import { VERSION_METHODE_ANALYSE } from "./regles-analyse";

const NOMBRE_DE_SEMAINES = 12;

export interface ResultatAnalyseAgregats {
  /** Faux quand la fonctionnalite est desactivee : aucune donnee n'a ete lue. */
  actif: boolean;
  signaux: SignalAnalyse[];
  /** Nombre de series (indicateur x departement) analysees. */
  seriesAnalysees: number;
  /** Premier et dernier lundi des semaines analysees. */
  premiereSemaine: string | null;
  derniereSemaine: string | null;
  genereLe: string;
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Lance l'analyse des agregats. Null si le role n'y a pas droit. */
export async function getAnalyseAgregats(): Promise<ResultatAnalyseAgregats | null> {
  const session = await getSession();
  if (!session || !session.roles.some((role) => can(role, "read", "analyse_agregats"))) return null;

  const maintenant = new Date();
  if (!(await estFonctionnaliteActive("ai.analytics"))) {
    return { actif: false, signaux: [], seriesAnalysees: 0, premiereSemaine: null, derniereSemaine: null, genereLe: maintenant.toISOString() };
  }

  const debut = Date.now();
  const lundis = lundisDesSemainesCompletes(maintenant, NOMBRE_DE_SEMAINES);
  const debutFenetre = new Date(`${lundis[0]}T00:00:00.000Z`);
  const finFenetre = new Date(`${lundis[lundis.length - 1]}T00:00:00.000Z`);
  finFenetre.setUTCDate(finFenetre.getUTCDate() + 7);

  const [departements, etablissements] = await Promise.all([
    prisma.departement.findMany({ select: { id: true, nom: true } }),
    prisma.etablissementSanitaire.findMany({
      select: { id: true, commune: { select: { departementId: true } }, zoneSanitaire: { select: { departementId: true } } },
    }),
  ]);
  const nomDepartement = new Map(departements.map((departement) => [departement.id, departement.nom]));
  const departementParEtablissement = new Map<string, string>();
  for (const etablissement of etablissements) {
    const departementId = etablissement.commune?.departementId ?? etablissement.zoneSanitaire?.departementId ?? null;
    if (departementId) departementParEtablissement.set(etablissement.id, departementId);
  }

  const series: SerieHebdomadaire[] = [];
  for (const [code, dimension] of Object.entries(DIMENSION_PAR_INDICATEUR_COMPARABLE)) {
    const definition = trouverDefinitionIndicateur(code);
    if (!definition) continue;

    const lignes = await prisma.agregatQuotidien.findMany({
      where: { indicateur: code, date: { gte: debutFenetre, lt: finFenetre }, ...(dimension !== null ? { dimensionLibre: dimension } : {}) },
      select: { etablissementId: true, date: true, valeur: true },
    });
    const lignesParDepartement: LigneAgregat[] = [];
    for (const ligne of lignes) {
      const departementId = ligne.etablissementId ? departementParEtablissement.get(ligne.etablissementId) : undefined;
      if (departementId) lignesParDepartement.push({ territoireId: departementId, date: ligne.date, valeur: ligne.valeur });
    }
    series.push(...construireSeriesHebdomadaires(lignesParDepartement, lundis, nomDepartement, { code: definition.code, libelle: definition.libelle }));
  }

  const signaux = analyserSeries(series);

  await journaliser({
    utilisateurId: session.userId,
    action: "ANALYTICS_VIEW",
    donneeConcernee: `pilotage_analyse_assistee:semaines=${lundis[0]}..${lundis[lundis.length - 1]}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Analyse assistee des agregats (${series.length} series, ${signaux.length} signaux, methode ${VERSION_METHODE_ANALYSE}).`,
  });

  // Compteurs seulement : nombreSources = series analysees, pucesLues = signaux produits.
  await enregistrerAppelTermine(
    { utilisateurId: session.userId, patientId: null, fonctionnalite: FONCTIONNALITE_ANALYSE, modele: VERSION_METHODE_ANALYSE, versionConsigne: VERSION_METHODE_ANALYSE },
    { statut: "ok", modele: VERSION_METHODE_ANALYSE, nombreSources: series.length, pucesLues: signaux.length, pucesSupprimees: 0, dureeMs: Date.now() - debut }
  );

  return {
    actif: true,
    signaux,
    seriesAnalysees: series.length,
    premiereSemaine: lundis[0],
    derniereSemaine: lundis[lundis.length - 1],
    genereLe: maintenant.toISOString(),
  };
}
