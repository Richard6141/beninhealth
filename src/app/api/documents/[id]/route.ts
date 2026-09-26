/**
 * Route de telechargement d'un document medical (F-CLI-13 du pack) : seul
 * point de lecture du contenu binaire d'un DocumentMedical. RG-CLI-112 : le
 * fichier n'est jamais servi par une URL statique/publique, uniquement via
 * cette route authentifiee, apres reverification Zero Trust.
 *
 * Le middleware (middleware.ts) ne protege que /app/*, pas /api/* : la
 * verification de session est donc entierement a la charge de ce handler,
 * qui la refait ici (getSession()) independamment de tout rendu React ayant
 * pu produire le lien de telechargement, jamais suppose valide.
 *
 * Autorise le telechargement pour l'auteur du document, ou pour un
 * professionnel titulaire d'un Consentement actif (dossier_complet ou
 * documents) pour le patient concerne (meme regle que
 * src/modules/document/actions.ts, reappliquee independamment ici). Renvoie
 * la meme reponse 404 dans tous les cas de refus (document inexistant ou non
 * autorise) pour ne jamais confirmer a un appelant non autorise qu'un
 * document existe.
 */

import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { cheminAbsoluDocument } from "@/modules/document/stockage-fichiers";

const TYPES_ACCES_DOCUMENT = ["dossier_complet", "documents"] as const;

interface RouteContext {
  params: Promise<{ id: string }>;
}

function reponseIntrouvable(): NextResponse {
  return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
}

/** Adresse technique d'origine de la requete, pour le JournalAudit (meme convention que src/modules/*\/actions.ts). */
function adresseTechniqueDepuisRequete(request: Request): string {
  return (
    request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue"
  );
}

/** Nettoie le nom de fichier original avant de le poser dans Content-Disposition (jamais de guillemet ni de saut de ligne injectable). */
function assainirNomFichier(nom: string): string {
  const nettoye = nom.replace(/["\r\n]/g, "").trim();
  return nettoye.length > 0 ? nettoye : "document";
}

export async function GET(request: Request, { params }: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const { id } = await params;

  const document = await prisma.documentMedical.findUnique({ where: { id } });

  if (!document) {
    return reponseIntrouvable();
  }

  let autorise = document.auteurId === session.userId;

  if (!autorise) {
    const consentement = await prisma.consentement.findUnique({
      where: {
        patientId_acteurAutoriseId: {
          patientId: document.patientId,
          acteurAutoriseId: session.userId,
        },
      },
    });

    autorise =
      consentement !== null &&
      consentement.statut === "actif" &&
      (consentement.dateFin === null || consentement.dateFin > new Date()) &&
      (TYPES_ACCES_DOCUMENT as readonly string[]).includes(consentement.typeAcces);
  }

  if (!autorise) {
    return reponseIntrouvable();
  }

  let octets: Buffer;

  try {
    octets = await readFile(cheminAbsoluDocument(document.cheminFichier));
  } catch (erreur) {
    console.error("Erreur lors de la lecture du document medical :", erreur);
    return reponseIntrouvable();
  }

  await journaliser({
    utilisateurId: session.userId,
    action: "consultation_document_medical",
    donneeConcernee: `document_medical:${document.id}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: `Document "${document.titre}" telecharge`,
  });

  return new NextResponse(new Uint8Array(octets), {
    status: 200,
    headers: {
      "Content-Type": document.typeMime,
      "Content-Disposition": `attachment; filename="${assainirNomFichier(document.nomFichierOriginal)}"`,
      "Content-Length": String(document.tailleOctets),
      "Cache-Control": "private, no-store",
    },
  });
}
