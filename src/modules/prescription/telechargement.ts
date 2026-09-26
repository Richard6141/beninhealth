"use server";

/**
 * Server Action de generation du lien de telechargement PDF d'une ordonnance
 * (F-CIT-06 du pack, RG-CIT-50). Le controle d'acces (le patient connecte
 * est bien le titulaire de cette prescription) se fait ICI, avant de generer
 * le jeton temporaire ; la route de telechargement
 * (src/app/api/patient/prescriptions/[id]/telecharger/route.ts) fait
 * confiance au seul jeton (usage unique, 60 secondes), sans reverifier la
 * session, exactement comme une URL presignee classique : le controle
 * d'acces a deja eu lieu au moment de la generation, pas a chaque
 * consommation.
 *
 * Nouveau fichier isole de src/modules/prescription/actions.ts (partage
 * cette nuit avec F-PRE-05, voir docs/coordination-agents.md), aucune
 * modification de ce fichier.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerJetonTelechargement } from "./jetons-telechargement";

export interface LienTelechargementActionState {
  error: string | null;
  url: string | null;
}

export async function genererLienTelechargementOrdonnanceAction(
  prevState: LienTelechargementActionState,
  formData: FormData
): Promise<LienTelechargementActionState> {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return { error: "Session expiree. Veuillez vous reconnecter.", url: null };
  }

  const prescriptionId = formData.get("prescriptionId");

  if (typeof prescriptionId !== "string" || prescriptionId.length === 0) {
    return { error: "Ordonnance introuvable.", url: null };
  }

  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { patient: true },
  });

  if (!prescription || prescription.patient.userId !== session.userId) {
    return { error: "Ordonnance introuvable.", url: null };
  }

  const jeton = creerJetonTelechargement(prescriptionId);

  return {
    error: null,
    url: `/api/patient/prescriptions/${prescriptionId}/telecharger?jeton=${jeton}`,
  };
}
