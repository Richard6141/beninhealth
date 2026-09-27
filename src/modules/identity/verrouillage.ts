"use server";

/**
 * Deverrouillage de l'ecran apres inactivite (F-AUTH-08 du pack). Re-verifie
 * le mot de passe du titulaire de la session courante, meme pattern que
 * validerResultatExamenAction (src/modules/laboratoire/actions.ts).
 *
 * Comptage des 3 tentatives avant deconnexion complete (paragraphe
 * "Deroule" du pack) : desormais revalide cote serveur (corrige le
 * 2026-09-28, meme mecanisme que limitation-connexion.ts, compteur en
 * memoire par utilisateur). Le comptage cote client
 * (src/components/VerrouillageInactivite.tsx) reste utile pour le retour
 * immediat a l'ecran ("2 tentatives restantes"...), mais n'est plus la seule
 * frontiere : un client qui ignorerait son propre compteur (ou le
 * contournerait) se heurte quand meme a la deconnexion forcee ici, des la
 * 3e tentative echouee, quel que soit ce que le client en a fait. Le champ
 * `deconnecte` du resultat le signale explicitement au client, qui doit
 * alors se deconnecter immediatement sans attendre son propre compteur.
 */

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { destroySession, getSession } from "@/lib/session";
import { enregistrerEvenement, limiteAtteinte } from "@/lib/limite-debit";
import { journaliser } from "@/modules/audit/journaliser";
import { TENTATIVES_MAX_VERROUILLAGE } from "./verrouillage-regles";

export interface DeverrouillageActionState {
  error: string | null;
  success: boolean;
  /** Vrai si la session vient d'etre detruite cote serveur (3 echecs atteints) : le client doit se deconnecter, jamais retenter. */
  deconnecte?: boolean;
}

const schemaDeverrouillage = z.object({
  motDePasse: z.string().min(1, "Le mot de passe est obligatoire."),
});

const FENETRE_VERROUILLAGE_MS = 15 * 60 * 1000;
const MESSAGE_DECONNEXION = "Trop de tentatives. Vous avez été déconnecté(e).";

function cleVerrouillage(userId: string): string {
  return `verrouillage_ecran:${userId}`;
}

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

  const cle = cleVerrouillage(session.userId);

  // Deja atteint la limite avant meme cette tentative (rejeu, page rechargee
  // avec le compteur client reinitialise...) : la session est deja consideree
  // compromise, elle est fermee sans meme verifier le mot de passe soumis.
  if (limiteAtteinte(cle, TENTATIVES_MAX_VERROUILLAGE, FENETRE_VERROUILLAGE_MS)) {
    await destroySession();
    return { error: MESSAGE_DECONNEXION, success: false, deconnecte: true };
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
      enregistrerEvenement(cle, FENETRE_VERROUILLAGE_MS);

      await journaliser({
        utilisateurId: session.userId,
        action: "tentative_deverrouillage_echouee",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique: await adresseTechniqueCourante(),
        justification: "Mot de passe incorrect a la tentative de deverrouillage de l'ecran (F-AUTH-08).",
      });

      if (limiteAtteinte(cle, TENTATIVES_MAX_VERROUILLAGE, FENETRE_VERROUILLAGE_MS)) {
        await destroySession();
        return { error: MESSAGE_DECONNEXION, success: false, deconnecte: true };
      }

      return { error: "Mot de passe incorrect.", success: false };
    }

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors du deverrouillage de l'ecran :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}
