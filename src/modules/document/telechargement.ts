"use server";

/**
 * Server Action de generation du lien de telechargement d'un document
 * medical, cote patient (F-CIT-06 du pack, RG-CIT-50). Le controle d'acces
 * (le patient connecte est bien le proprietaire de ce document) se fait ICI,
 * avant de generer le jeton temporaire ; la route de telechargement
 * (src/app/api/documents/[id]/telecharger/route.ts) fait confiance au seul
 * jeton (usage unique, 60 secondes), sans reverifier la session, exactement
 * comme une URL presignee classique. Meme principe que
 * src/modules/prescription/telechargement.ts.
 *
 * Reserve au patient proprietaire du document : contrairement a
 * /api/documents/[id] (route existante, utilisee par le medecin via
 * ListeDocuments.tsx), cette Action ne verifie jamais de Consentement, un
 * patient n'ayant besoin d'aucune autorisation pour son propre dossier
 * (meme principe que getMesDocuments dans src/modules/document/actions.ts).
 *
 * Nouveau fichier isole de src/modules/document/actions.ts (fichier partage
 * ce soir), aucune modification de ce fichier ni de la route existante.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerJetonTelechargementDocument } from "./jetons-telechargement";

export interface LienTelechargementDocumentActionState {
  error: string | null;
  url: string | null;
}

export async function genererLienTelechargementDocumentAction(
  prevState: LienTelechargementDocumentActionState,
  formData: FormData
): Promise<LienTelechargementDocumentActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", url: null };
  }

  const documentId = formData.get("documentId");

  if (typeof documentId !== "string" || documentId.length === 0) {
    return { error: "Document introuvable.", url: null };
  }

  const patient = await prisma.patient.findUnique({ where: { userId: session.userId } });

  if (!patient) {
    return { error: "Document introuvable.", url: null };
  }

  const document = await prisma.documentMedical.findUnique({ where: { id: documentId } });

  if (!document || document.patientId !== patient.id) {
    return { error: "Document introuvable.", url: null };
  }

  const jeton = creerJetonTelechargementDocument(documentId);

  return {
    error: null,
    url: `/api/documents/${documentId}/telecharger?jeton=${jeton}`,
  };
}
