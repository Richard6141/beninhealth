/**
 * Route de telechargement du PDF d'une ordonnance (F-CIT-06 du pack).
 *
 * RG-CIT-50 : l'acces a deja ete controle au moment de la generation du
 * jeton (genererLienTelechargementOrdonnanceAction,
 * src/modules/prescription/telechargement.ts) ; cette route fait confiance
 * au seul jeton (usage unique, 60 secondes,
 * src/modules/prescription/jetons-telechargement.ts), sans reverifier de
 * session, exactement comme une URL presignee. CA-1 : un jeton reutilise ou
 * expire renvoie une erreur (410).
 *
 * RG-PRE-31 (rappel du pack, deja applique cote prescription) : le PDF ne
 * contient JAMAIS le motif de consultation ni aucune information de
 * diagnostic, seulement les lignes de prescription (medicament, posologie,
 * quantite, duree), le numero d'ordonnance, la date et le medecin
 * prescripteur.
 *
 * RG-CIT-51 : le PDF porte la mention "verifiable en scannant le QR code"
 * et le QR code lui-meme, qui encode l'URL de verification publique
 * F-PRE-06 (/v/o/[numero]?k=..., src/modules/prescription/verification-publique.ts,
 * livree par une autre session apres l'ecriture initiale de cette route :
 * mis a jour pour ne plus promettre une verification qui n'existait pas
 * encore).
 *
 * Nouvelle route isolee, aucune modification de
 * src/modules/prescription/actions.ts (partage cette nuit avec F-PRE-05).
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { consommerJetonTelechargement } from "@/modules/prescription/jetons-telechargement";
import { genererCleVerificationOrdonnance } from "@/modules/prescription/verification-publique";

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

const LARGEUR_PAGE = 595;
const HAUTEUR_PAGE = 842;
const MARGE = 50;

function formaterDate(date: Date): string {
  return date.toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: prescriptionId } = await params;
  const jeton = new URL(request.url).searchParams.get("jeton");

  if (!jeton || !consommerJetonTelechargement(prescriptionId, jeton)) {
    return NextResponse.json(
      { error: "Lien de telechargement invalide ou expire. Generez un nouveau lien." },
      { status: 410 }
    );
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: {
      patient: { include: { user: true } },
      medecinPrescripteur: { include: { user: true } },
      consultation: { include: { etablissement: true } },
      lignes: { include: { medicament: true } },
    },
  });

  if (!prescription) {
    return NextResponse.json({ error: "Ordonnance introuvable." }, { status: 404 });
  }

  const document = await PDFDocument.create();
  const policeNormale = await document.embedFont(StandardFonts.Helvetica);
  const policeGrasse = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
  let y = HAUTEUR_PAGE - MARGE;

  function nouvellePageSiNecessaire(hauteurRestanteRequise: number) {
    if (y - hauteurRestanteRequise < MARGE) {
      page = document.addPage([LARGEUR_PAGE, HAUTEUR_PAGE]);
      y = HAUTEUR_PAGE - MARGE;
    }
  }

  function ecrireTitre(texte: string) {
    nouvellePageSiNecessaire(30);
    page.drawText(texte, { x: MARGE, y, size: 18, font: policeGrasse, color: rgb(0.03, 0.22, 0.39) });
    y -= 26;
  }

  function ecrireLigne(texte: string, options?: { gras?: boolean; taille?: number }) {
    nouvellePageSiNecessaire(16);
    page.drawText(texte, {
      x: MARGE,
      y,
      size: options?.taille ?? 11,
      font: options?.gras ? policeGrasse : policeNormale,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 16;
  }

  function ecrireLigneVide() {
    y -= 10;
  }

  ecrireTitre(`Ordonnance ${prescription.numero}`);
  ecrireLigne(`Date : ${formaterDate(prescription.date)}`);
  ecrireLigne(
    `Prescripteur : Dr. ${prescription.medecinPrescripteur.user.prenom} ${prescription.medecinPrescripteur.user.nom}`
  );
  ecrireLigne(`Établissement : ${prescription.consultation.etablissement.nom}`);
  ecrireLigne(
    `Patient : ${prescription.patient.user.prenom} ${prescription.patient.user.nom} (${prescription.patient.identifiantSante})`
  );
  ecrireLigneVide();

  ecrireLigne("Médicaments prescrits", { gras: true, taille: 13 });
  ecrireLigneVide();

  prescription.lignes.forEach((ligne) => {
    ecrireLigne(`${ligne.medicament.nom} — ${ligne.medicament.dosage}, ${ligne.medicament.forme}`, { gras: true });
    ecrireLigne(`   ${ligne.posologie}`);
    ecrireLigne(
      `   Quantité : ${ligne.quantite} · Durée du traitement : ${ligne.dureeTraitementJours} ${ligne.dureeTraitementJours > 1 ? "jours" : "jour"}`
    );
    ecrireLigneVide();
  });

  ecrireLigneVide();

  const cleVerification = genererCleVerificationOrdonnance(prescription.numero, prescription.id);
  const urlVerification = `${new URL(request.url).origin}/v/o/${prescription.numero}?k=${cleVerification}`;
  const tailleQr = 70;
  nouvellePageSiNecessaire(tailleQr);
  try {
    const octetsQr = await QRCode.toBuffer(urlVerification, { width: tailleQr, margin: 0 });
    const imageQr = await document.embedPng(octetsQr);
    page.drawImage(imageQr, { x: MARGE, y: y - tailleQr + 10, width: tailleQr, height: tailleQr });
    page.drawText(
      "Document généré par BHIP — vérifiable en scannant le QR code.",
      { x: MARGE + tailleQr + 12, y: y - 20, size: 9, font: policeNormale, color: rgb(0.1, 0.1, 0.1) }
    );
    page.drawText(urlVerification, {
      x: MARGE + tailleQr + 12,
      y: y - 34,
      size: 8,
      font: policeNormale,
      color: rgb(0.35, 0.35, 0.35),
    });
    y -= tailleQr + 10;
  } catch (erreur) {
    console.error("Erreur lors de la generation du QR code de verification :", erreur);
    ecrireLigne("Document généré par la Plateforme d'Intelligence Sanitaire du Bénin.", { taille: 9 });
  }

  const octetsPdf = await document.save();

  await journaliser({
    utilisateurId: prescription.patient.userId,
    action: "telechargement_ordonnance_pdf",
    donneeConcernee: `prescription:${prescriptionId}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: `Ordonnance ${prescription.numero} telechargee au format PDF (F-CIT-06).`,
  });

  return new NextResponse(new Uint8Array(octetsPdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ordonnance-${prescription.numero}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
