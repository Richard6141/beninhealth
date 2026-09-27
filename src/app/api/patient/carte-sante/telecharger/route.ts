/**
 * Route de telechargement du PDF imprimable de la carte sante (F-CIT-05 du
 * pack, etape 4, P1). Meme convention que la route equivalente pour une
 * ordonnance (F-CIT-06,
 * src/app/api/patient/prescriptions/[id]/telecharger/route.ts) : le controle
 * d'acces a deja eu lieu au moment de la generation du jeton
 * (genererLienImpressionCarteAction, src/modules/patient/carte-sante.ts),
 * cette route fait confiance au seul jeton (usage unique, 60 secondes,
 * src/modules/patient/carte-sante-impression.ts), sans reverifier de
 * session, exactement comme une URL presignee.
 *
 * Format carte bancaire (ID-1, 85,60 x 53,98 mm), texte du pack : "sans QR
 * dynamique" (un QR imprime deviendrait perime en moins de 5 minutes, et
 * imprimer le QR de secours "hors ligne" reviendrait a distribuer sur
 * papier un moyen de preuve que le pack demande justement de completer par
 * un second facteur, RG-CIT-41) : identite et identifiant sante seulement.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { consommerJetonImpressionCarteSante } from "@/modules/patient/carte-sante-impression";

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

// Format ID-1 (carte bancaire), 85,60 x 53,98 mm converti en points (1 mm = 2,83464567 pt).
const LARGEUR_CARTE = 243;
const HAUTEUR_CARTE = 153;
const MARGE = 16;

function formaterDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export async function GET(request: Request) {
  const jeton = new URL(request.url).searchParams.get("jeton");
  const patientId = jeton ? consommerJetonImpressionCarteSante(jeton) : null;

  if (!patientId) {
    return NextResponse.json(
      { error: "Lien de telechargement invalide ou expire. Generez un nouveau lien." },
      { status: 410 }
    );
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    include: { user: true },
  });

  if (!patient) {
    return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });
  }

  const document = await PDFDocument.create();
  const policeNormale = await document.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await document.embedFont(StandardFonts.HelveticaBold);
  const policeIdentifiant = await document.embedFont(StandardFonts.Courier);
  const page = document.addPage([LARGEUR_CARTE, HAUTEUR_CARTE]);

  page.drawRectangle({
    x: 0,
    y: 0,
    width: LARGEUR_CARTE,
    height: HAUTEUR_CARTE,
    color: rgb(0.97, 0.98, 0.99),
  });
  page.drawRectangle({
    x: 0,
    y: HAUTEUR_CARTE - 26,
    width: LARGEUR_CARTE,
    height: 26,
    color: rgb(0.03, 0.22, 0.39),
  });
  page.drawText("Carte sante du Benin", {
    x: MARGE,
    y: HAUTEUR_CARTE - 18,
    size: 11,
    font: policeGrasse,
    color: rgb(1, 1, 1),
  });

  let y = HAUTEUR_CARTE - 26 - 20;

  page.drawText(`${patient.user.prenom} ${patient.user.nom}`, {
    x: MARGE,
    y,
    size: 13,
    font: policeGrasse,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 18;

  page.drawText(`Ne(e) le ${formaterDate(patient.dateNaissance)}`, {
    x: MARGE,
    y,
    size: 9,
    font: policeNormale,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 22;

  page.drawText("Identifiant sante", {
    x: MARGE,
    y,
    size: 8,
    font: policeNormale,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 15;

  page.drawText(patient.identifiantSante, {
    x: MARGE,
    y,
    size: 14,
    font: policeIdentifiant,
    color: rgb(0.03, 0.22, 0.39),
  });

  page.drawText("Sans verification biometrique. Presence a prouver via l'application (QR, code SMS ou piece d'identite).", {
    x: MARGE,
    y: 10,
    size: 6,
    font: policeNormale,
    color: rgb(0.45, 0.45, 0.45),
  });

  const octetsPdf = await document.save();

  await journaliser({
    utilisateurId: patient.userId,
    action: "telechargement_carte_sante_pdf",
    donneeConcernee: `patient:${patient.id}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: "Carte sante telechargee au format PDF pour impression (F-CIT-05).",
  });

  return new NextResponse(new Uint8Array(octetsPdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="carte-sante-${patient.identifiantSante}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
