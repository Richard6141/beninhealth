/**
 * Route de telechargement d'un document medical, cote patient (F-CIT-06 du
 * pack). RG-CIT-50 : l'acces a deja ete controle au moment de la generation
 * du jeton (genererLienTelechargementDocumentAction,
 * src/modules/document/telechargement.ts) ; cette route fait confiance au
 * seul jeton (usage unique, 60 secondes,
 * src/modules/document/jetons-telechargement.ts), sans reverifier de
 * session, exactement comme une URL presignee. CA-1 : un jeton reutilise ou
 * expire renvoie une erreur (410).
 *
 * Route distincte de /api/documents/[id] (route existante, session-only,
 * utilisee par le medecin via ListeDocuments.tsx et par le lien direct du
 * tableau de bord patient, src/modules/patient/chronologie.ts) : celle-ci
 * n'est jamais modifiee, pour ne rien changer a son comportement actuel.
 * Cette nouvelle route sert exclusivement le nouvel ecran
 * /app/patient/documents.
 *
 * Meme logique de lecture des octets que la route existante (Cloudinary
 * prive, URL signee recuperee serveur a serveur, jamais exposee au
 * navigateur), volontairement dupliquee ici plutot que factorisee : chaque
 * route de telechargement reste isolee et lisible independamment, meme
 * principe deja adopte pour le PDF d'ordonnance (voir
 * src/app/api/patient/prescriptions/[id]/telecharger/route.ts).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { genererUrlSigneeCloudinary } from "@/lib/cloudinary";
import { extensionDepuisTypeMime } from "@/modules/document/stockage-fichiers";
import { consommerJetonTelechargementDocument } from "@/modules/document/jetons-telechargement";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function reponseJetonInvalide(): NextResponse {
  return NextResponse.json(
    { error: "Lien de telechargement invalide ou expire. Generez un nouveau lien." },
    { status: 410 }
  );
}

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

/** Nettoie le nom de fichier original avant de le poser dans Content-Disposition (jamais de guillemet ni de saut de ligne injectable). */
function assainirNomFichier(nom: string): string {
  const nettoye = nom.replace(/["\r\n]/g, "").trim();
  return nettoye.length > 0 ? nettoye : "document";
}

export async function GET(request: Request, { params }: RouteContext) {
  const { id: documentId } = await params;
  const jeton = new URL(request.url).searchParams.get("jeton");

  if (!jeton || !consommerJetonTelechargementDocument(documentId, jeton)) {
    return reponseJetonInvalide();
  }

  const document = await prisma.documentMedical.findUnique({
    where: { id: documentId },
    include: { patient: true },
  });

  if (!document) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  const extension = extensionDepuisTypeMime(document.typeMime);

  if (!extension) {
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  let octets: Buffer;

  try {
    const urlSignee = genererUrlSigneeCloudinary(document.cheminFichier, extension);
    const reponseCloudinary = await fetch(urlSignee);

    if (!reponseCloudinary.ok) {
      throw new Error(`Cloudinary a repondu ${reponseCloudinary.status}`);
    }

    octets = Buffer.from(await reponseCloudinary.arrayBuffer());
  } catch (erreur) {
    console.error("Erreur lors de la lecture du document medical :", erreur);
    return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
  }

  await journaliser({
    utilisateurId: document.patient.userId,
    action: "telechargement_document_medical",
    donneeConcernee: `document_medical:${document.id}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: `Document "${document.titre}" telecharge par le patient via lien temporaire`,
  });

  return new NextResponse(new Uint8Array(octets), {
    status: 200,
    headers: {
      "Content-Type": document.typeMime,
      "Content-Disposition": `attachment; filename="${assainirNomFichier(document.nomFichierOriginal)}"`,
      // Octets reellement renvoyes (voir la meme ligne dans ../route.ts).
      "Content-Length": String(octets.length),
      "Cache-Control": "private, no-store",
    },
  });
}
