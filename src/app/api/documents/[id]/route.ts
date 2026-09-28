/**
 * Route de telechargement d'un document medical (F-CLI-13 du pack) : seul
 * point de lecture du contenu binaire d'un DocumentMedical. RG-CLI-112 : le
 * fichier n'est jamais servi par une URL statique/publique, uniquement via
 * cette route authentifiee, apres reverification Zero Trust. Stocke sur
 * Cloudinary en prive (type "authenticated") : une URL signee a duree de vie
 * courte est generee a la demande (genererUrlSigneeCloudinary), recuperee
 * serveur a serveur, jamais exposee telle quelle au navigateur.
 *
 * Le middleware (middleware.ts) ne protege que /app/*, pas /api/* : la
 * verification de session est donc entierement a la charge de ce handler,
 * qui la refait ici (getSession()) independamment de tout rendu React ayant
 * pu produire le lien de telechargement, jamais suppose valide.
 *
 * Autorise le telechargement pour l'auteur du document, pour un professionnel
 * titulaire d'un Consentement actif pour le patient concerne (dossier_complet
 * ou documents ; dossier_complet seul pour un document "sensible", voir
 * src/modules/document/acces-documents.ts), ou pour le patient proprietaire du
 * document lui-meme (son propre dossier, aucun Consentement requis pour son
 * propre acces). Renvoie
 * la meme reponse 404 dans tous les cas de refus (document inexistant ou non
 * autorise) pour ne jamais confirmer a un appelant non autorise qu'un
 * document existe.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { genererUrlSigneeCloudinary } from "@/lib/cloudinary";
import { consentementPermetLeDocument } from "@/modules/document/acces-documents";
import { extensionDepuisTypeMime } from "@/modules/document/stockage-fichiers";

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

    // Un document "sensible" exige un consentement dossier_complet (acces-documents.ts).
    autorise = consentementPermetLeDocument(consentement, document.niveauConfidentialite);
  }

  if (!autorise) {
    // Le patient proprietaire du document accede toujours a son propre
    // dossier, sans Consentement (qui ne regit que l'acces d'un tiers).
    const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });
    autorise = patient !== null && patient.id === document.patientId;
  }

  if (!autorise) {
    return reponseIntrouvable();
  }

  const extension = extensionDepuisTypeMime(document.typeMime);

  if (!extension) {
    return reponseIntrouvable();
  }

  let octets: Buffer;

  try {
    // L'URL signee Cloudinary n'est jamais renvoyee au navigateur : recuperee
    // serveur a serveur ici, puis les octets sont renvoyes par cette route
    // elle-meme (RG-CLI-112, meme garantie qu'avec l'ancien stockage local).
    const urlSignee = genererUrlSigneeCloudinary(document.cheminFichier, extension);
    const reponseCloudinary = await fetch(urlSignee);

    if (!reponseCloudinary.ok) {
      throw new Error(`Cloudinary a repondu ${reponseCloudinary.status}`);
    }

    octets = Buffer.from(await reponseCloudinary.arrayBuffer());
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
      // Octets reellement renvoyes : le stockage peut differer de la taille
      // enregistree a l'ajout (purge des metadonnees, force_strip Cloudinary).
      "Content-Length": String(octets.length),
      "Cache-Control": "private, no-store",
    },
  });
}
