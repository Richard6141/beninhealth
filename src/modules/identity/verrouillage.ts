"use server";

/**
 * Deverrouillage de l'ecran apres inactivite (F-AUTH-08 du pack). Re-verifie
 * le mot de passe du titulaire de la session courante, meme pattern que
 * validerResultatExamenAction (src/modules/laboratoire/actions.ts). Le
 * comptage des 3 tentatives avant deconnexion complete (RG-AUTH-70 du pack,
 * paragraphe "Deroule") se fait cote client (src/components/VerrouillageInactivite.tsx) :
 * ce n'est qu'un garde-fou d'usage, la seule vraie frontiere de securite est
 * la verification du mot de passe elle-meme, deja faite ici a chaque
 * tentative.
 */

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";

export interface DeverrouillageActionState {
  error: string | null;
  success: boolean;
}

const schemaDeverrouillage = z.object({
  motDePasse: z.string().min(1, "Le mot de passe est obligatoire."),
});

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/**
 * Verifie le mot de passe du titulaire de la session courante pour
 * deverrouiller l'ecran. Un echec est journalise (signal de securite
 * pertinent) ; un succes ne l'est pas (routine, jamais bruite l'audit).
 */
export async function deverrouillerEcranAction(
  prevState: DeverrouillageActionState,
  formData: FormData
): Promise<DeverrouillageActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  const validation = schemaDeverrouillage.safeParse({
    motDePasse: formData.get("motDePasse"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Mot de passe invalide.", success: false };
  }

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    const motDePasseValide = await bcrypt.compare(validation.data.motDePasse, utilisateur.motDePasseHash);

    if (!motDePasseValide) {
      await journaliser({
        utilisateurId: session.userId,
        action: "tentative_deverrouillage_echouee",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique: await adresseTechniqueCourante(),
        justification: "Mot de passe incorrect a la tentative de deverrouillage de l'ecran (F-AUTH-08).",
      });

      return { error: "Mot de passe incorrect.", success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du deverrouillage de l'ecran :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
