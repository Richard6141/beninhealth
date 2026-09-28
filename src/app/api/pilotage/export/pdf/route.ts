/**
 * Rapport PDF de pilotage (F-PIL-05 du pack) : filtres, indicateurs cles,
 * graphique, tableau, definitions, mention de masquage. Meme garde d'acces
 * (jeton signe de re-authentification exige) que la route CSV soeur
 * (./csv/route.ts), journalisee sous l'action "export_pilotage_pdf".
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getVueNationalePilotage, getTableauBordEtablissement, type PeriodeTableauBord } from "@/modules/pilotage/lecture";
import {
  CODES_INDICATEURS_ETABLISSEMENT,
  CODES_INDICATEURS_NATIONAL,
  definitionsPourCodes,
  libelleMotif,
  libellePeriode,
} from "@/modules/pilotage/exports-rendu";
import { verifierJetonExport } from "@/modules/pilotage/jeton-export";
import { ACTIONS_AUDIT_EXPORT_PILOTAGE } from "@/modules/pilotage/exports-constantes";

const PERIODES_VALIDES: PeriodeTableauBord[] = ["aujourdhui", "7j", "30j", "mois"];

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

const LARGEUR_PAGE = 595;
const HAUTEUR_PAGE = 842;
const MARGE = 50;

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const url = new URL(request.url);
  const portee = url.searchParams.get("portee");
  const periodeBrute = url.searchParams.get("periode");

  if (portee !== "national" && portee !== "etablissement") {
    return NextResponse.json({ error: "Portée invalide." }, { status: 400 });
  }
  const periode: PeriodeTableauBord = (PERIODES_VALIDES as string[]).includes(periodeBrute ?? "")
    ? (periodeBrute as PeriodeTableauBord)
    : "7j";

  // RG-PIL-40 : la ré-authentification n'est plus seulement vérifiée à l'écran.
  // Le motif vient du jeton signé émis après vérification du mot de passe,
  // jamais de l'URL : un GET direct avec le seul cookie de session est refusé.
  const contenuJeton = verifierJetonExport(url.searchParams.get("jeton"), {
    utilisateurId: session.userId,
    sessionId: session.sessionId,
    portee,
  });
  if (!contenuJeton) {
    return NextResponse.json(
      { error: "Ré-authentification requise ou expirée. Confirmez votre mot de passe depuis l'écran d'export." },
      { status: 403 }
    );
  }
  const { motif, motifTexte } = contenuJeton;

  const document = await PDFDocument.create();
  const police = await document.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await document.embedFont(StandardFonts.HelveticaBold);

  let page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
  let y = HAUTEUR_PAGE - MARGE;

  function nouvellePageSiNecessaire(hauteur: number) {
    if (y - hauteur < MARGE) {
      page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
      y = HAUTEUR_PAGE - MARGE;
    }
  }
  function titre(texte: string) {
    nouvellePageSiNecessaire(30);
    page.drawText(texte, { x: MARGE, y, size: 16, font: policeGrasse, color: rgb(0.03, 0.22, 0.39) });
    y -= 24;
  }
  function sousTitre(texte: string) {
    nouvellePageSiNecessaire(24);
    y -= 6;
    page.drawText(texte, { x: MARGE, y, size: 12, font: policeGrasse, color: rgb(0.03, 0.22, 0.39) });
    y -= 16;
  }
  function ligne(texte: string) {
    nouvellePageSiNecessaire(14);
    page.drawText(texte.length > 110 ? `${texte.slice(0, 109)}…` : texte, {
      x: MARGE,
      y,
      size: 10,
      font: police,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 14;
  }
  function ligneVide() {
    y -= 8;
  }

  if (portee === "national") {
    if (!session.roles.includes("admin_national")) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    const vue = await getVueNationalePilotage(periode);
    if (!vue) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }

    titre("Rapport de pilotage : Centre national");
    ligne(`Généré le ${new Date().toLocaleString("fr-FR")}`);
    ligne(`Période : ${libellePeriode(periode)}`);
    ligne(`Motif de l'export : ${libelleMotif(motif, motifTexte)}`);
    ligneVide();

    sousTitre("Indicateurs clés");
    ligne(`Consultations (IND-01) : ${vue.consultations.valeur}`);
    ligne(`Patients vus (IND-02) : ${vue.patientsVus.valeur}`);
    ligne(`Établissements actifs (IND-05) : ${vue.etablissementsActifs.actifs}/${vue.etablissementsActifs.total}`);
    ligne(`Cas de paludisme (IND-04) : ${vue.casPaludisme.valeur}`);
    ligne(`Taux de délivrance des ordonnances (IND-08) : ${vue.tauxDelivranceOrdonnances}`);
    ligne(`Vaccinations (IND-10) : ${vue.vaccinations.valeur}`);
    ligneVide();

    sousTitre("Graphique : Consultations, 12 dernières semaines");
    dessinerBarres(
      page,
      vue.evolutionHebdomadaire.map((point) => ({ libelle: point.finSemaine.slice(5), valeur: point.consultations })),
      MARGE,
      y
    );
    y -= 110;
    ligneVide();

    sousTitre(`Tableau : Top des diagnostics (IND-03, ${vue.topDiagnostics.length})`);
    if (vue.topDiagnostics.length === 0) ligne("Aucun diagnostic classifiable sur cette période.");
    vue.topDiagnostics.forEach((diagnostic) => ligne(`${diagnostic.libelle} : ${diagnostic.valeur}`));
    ligneVide();

    sousTitre("Définitions (RG-PIL-10)");
    definitionsPourCodes(CODES_INDICATEURS_NATIONAL).forEach((definition) =>
      ligne(`${definition.code} (${definition.libelle}) : ${definition.definition}`)
    );
  } else {
    if (!session.roles.includes("admin_etablissement")) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }
    const bord = await getTableauBordEtablissement(periode);
    if (!bord) {
      return NextResponse.json({ error: "Droits insuffisants." }, { status: 403 });
    }

    titre(`Rapport de pilotage : ${bord.etablissementNom}`);
    ligne(`Généré le ${new Date().toLocaleString("fr-FR")}`);
    ligne(`Période : ${libellePeriode(periode)}`);
    ligne(`Motif de l'export : ${libelleMotif(motif, motifTexte)}`);
    ligneVide();

    sousTitre("Indicateurs clés");
    ligne(`Consultations (IND-01) : ${bord.consultations}`);
    ligne(`Patients vus (IND-02) : ${bord.patientsVus}`);
    ligne(`Taux de délivrance des ordonnances (IND-08) : ${bord.tauxDelivranceOrdonnances}`);
    if (bord.rendezVousDuJour) {
      ligne(
        `Rendez-vous du jour (IND-07) : ${bord.rendezVousDuJour.pris} pris, ${bord.rendezVousDuJour.honores} honorés, ${bord.rendezVousDuJour.annules} annulés`
      );
    }
    ligneVide();

    sousTitre("Graphique : Consultations quotidiennes");
    dessinerBarres(
      page,
      bord.evolutionConsultations.map((point) => ({ libelle: point.date.slice(5), valeur: point.valeur })),
      MARGE,
      y
    );
    y -= 110;
    ligneVide();

    sousTitre(`Tableau : Top des diagnostics (IND-03, ${bord.topDiagnostics.length})`);
    if (bord.topDiagnostics.length === 0) ligne("Aucun diagnostic classifiable sur cette période.");
    bord.topDiagnostics.forEach((diagnostic) => ligne(`${diagnostic.libelle} : ${diagnostic.valeur}`));
    ligneVide();

    if (bord.activiteParProfessionnel.length > 0) {
      sousTitre("Tableau : Activité par professionnel");
      bord.activiteParProfessionnel.forEach((ligneActivite) =>
        ligne(`${ligneActivite.nomComplet} : ${ligneActivite.totalActes} acte(s)`)
      );
      ligneVide();
    }

    sousTitre("Définitions (RG-PIL-10)");
    definitionsPourCodes(CODES_INDICATEURS_ETABLISSEMENT).forEach((definition) =>
      ligne(`${definition.code} (${definition.libelle}) : ${definition.definition}`)
    );
  }

  ligneVide();
  sousTitre("Mention de masquage (RG-PIL-02)");
  ligne("Les valeurs de 1 à 4 sont affichées « < 5 » ; un taux calculé sur moins de 20 observations affiche « effectif insuffisant ».");

  const octets = await document.save();

  await journaliser({
    utilisateurId: session.userId,
    action: ACTIONS_AUDIT_EXPORT_PILOTAGE.pdf,
    donneeConcernee: `pilotage_${portee}:periode=${periode};format=pdf`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: `Export de pilotage (F-PIL-05). Motif : ${libelleMotif(motif, motifTexte)}. Période : ${libellePeriode(periode)}.`,
  });

  return new NextResponse(new Uint8Array(octets), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="pilotage-${portee}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Barres verticales simples (hauteur bornee a 80pt), pdf-lib n'ayant pas de
 * moteur de graphiques : meme principe de masquage que les graphiques deja
 * existants de l'ecran (une valeur "< 5"/null est dessinee a hauteur fixe
 * minimale, jamais proportionnelle a une valeur exacte non revelee).
 */
function dessinerBarres(
  page: import("pdf-lib").PDFPage,
  points: { libelle: string; valeur: number | null }[],
  xDepart: number,
  yHaut: number
) {
  if (points.length === 0) return;
  const largeurUtile = LARGEUR_PAGE - 2 * MARGE;
  const largeurBarre = Math.min(14, largeurUtile / points.length - 4);
  const hauteurMax = 80;
  const maximum = Math.max(1, ...points.map((point) => point.valeur ?? 0));
  const yBase = yHaut - hauteurMax;

  points.forEach((point, index) => {
    const x = xDepart + index * (largeurUtile / points.length);
    const masque = point.valeur === null;
    const hauteur = masque ? 8 : Math.max(3, (point.valeur! / maximum) * hauteurMax);
    page.drawRectangle({
      x,
      y: yBase,
      width: largeurBarre,
      height: hauteur,
      color: masque ? rgb(0.75, 0.75, 0.75) : rgb(0.03, 0.22, 0.39),
    });
  });
}
