/**
 * Telechargement CSV des donnees de pilotage (F-PIL-05 du pack). Meme garde
 * d'acces que les routes soeurs /api/patient/export/* : la re-
 * authentification est deja faite cote ecran (verifierExportPilotageAction),
 * cette route re-verifie independamment la session et le role (Zero Trust),
 * puis journalise l'export reellement effectue (RG-PIL-40 : action "EXPORT"
 * avec les filtres).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getVueNationalePilotage, getTableauBordEtablissement, type PeriodeTableauBord } from "@/modules/pilotage/lecture";
import { construireCSVEtablissement, construireCSVNational, libelleMotif, libellePeriode } from "@/modules/pilotage/exports-rendu";
import type { MotifExport } from "@/modules/pilotage/exports-constantes";

const PERIODES_VALIDES: PeriodeTableauBord[] = ["aujourdhui", "7j", "30j", "mois"];
const MOTIFS_VALIDES: MotifExport[] = ["rapport_mensuel", "reunion", "planification", "autre"];

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const url = new URL(request.url);
  const portee = url.searchParams.get("portee");
  const periodeBrute = url.searchParams.get("periode");
  const motifBrut = url.searchParams.get("motif");
  const motifTexte = url.searchParams.get("motifTexte") ?? undefined;

  if (portee !== "national" && portee !== "etablissement") {
    return NextResponse.json({ error: "Portée invalide." }, { status: 400 });
  }
  const periode: PeriodeTableauBord = (PERIODES_VALIDES as string[]).includes(periodeBrute ?? "")
    ? (periodeBrute as PeriodeTableauBord)
    : "7j";
  if (!MOTIFS_VALIDES.includes(motifBrut as MotifExport)) {
    return NextResponse.json({ error: "Motif d'export invalide." }, { status: 400 });
  }
  const motif = motifBrut as MotifExport;

  let csv: string;
  let nomFichier: string;

  if (portee === "national") {
    if (!session.roles.includes("admin_national")) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    const vue = await getVueNationalePilotage(periode);
    if (!vue) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    csv = construireCSVNational(vue);
    nomFichier = "pilotage-national.csv";
  } else {
    if (!session.roles.includes("admin_etablissement")) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    const bord = await getTableauBordEtablissement(periode);
    if (!bord) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    csv = construireCSVEtablissement(bord);
    nomFichier = "pilotage-etablissement.csv";
  }

  await journaliser({
    utilisateurId: session.userId,
    action: "EXPORT",
    donneeConcernee: `pilotage_${portee}:periode=${periode};format=csv`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: `Export de pilotage (F-PIL-05). Motif : ${libelleMotif(motif, motifTexte)}. Période : ${libellePeriode(periode)}.`,
  });

  return new NextResponse("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nomFichier}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

