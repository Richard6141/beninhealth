"use server";

/**
 * F-AUTH-09 du pack ("Gerer ses appareils et sessions"). S'appuie sur la
 * table `SessionActive` et le `sessionId` embarque dans le JWT depuis
 * src/lib/session.ts. Zero Trust : chaque action verifie que la session
 * ciblee appartient bien a l'utilisateur connecte avant de la fermer.
 */

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { headers } from "next/headers";

export interface SessionActiveResume {
  id: string;
  appareil: string;
  navigateur: string;
  adresseIp: string;
  dateCreation: string;
  derniereActivite: string;
  estCourante: boolean;
}

export interface SessionsActionState {
  error: string | null;
  success: boolean;
}

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    return listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

/** Liste les sessions actives de l'utilisateur connecte, la plus recente d'abord. Null si personne n'est connecte. */
export async function listerMesSessions(): Promise<SessionActiveResume[] | null> {
  const session = await getSession();
  if (!session) return null;

  const sessions = await prisma.sessionActive.findMany({
    where: { userId: session.userId },
    orderBy: { derniereActivite: "desc" },
  });

  return sessions.map((ligne) => ({
    id: ligne.id,
    appareil: ligne.appareil,
    navigateur: ligne.navigateur,
    adresseIp: ligne.adresseIp,
    dateCreation: ligne.dateCreation.toISOString(),
    derniereActivite: ligne.derniereActivite.toISOString(),
    estCourante: ligne.id === session.sessionId,
  }));
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

/**
 * Ferme UNE session precise (RG implicite de F-AUTH-09 : ne doit jamais
 * fermer une session d'un AUTRE utilisateur, verifie explicitement).
 * Fermer sa propre session courante est autorise (equivaut a se
 * deconnecter) : le pack ne l'interdit pas explicitement, et bloquer ce cas
 * serait une friction arbitraire pour l'utilisateur.
 */
export async function fermerSessionAction(
  prevState: SessionsActionState,
  formData: FormData
): Promise<SessionsActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  const sessionId = texte(formData, "sessionId");
  if (!sessionId) {
    return { error: "Session cible manquante.", success: false };
  }

  const sessionCible = await prisma.sessionActive.findUnique({ where: { id: sessionId } });
  if (!sessionCible || sessionCible.userId !== session.userId) {
    return { error: "Cette session ne vous appartient pas ou est déjà fermée.", success: false };
  }

  await prisma.sessionActive.delete({ where: { id: sessionId } });

  await journaliser({
    utilisateurId: session.userId,
    action: "fermeture_session",
    donneeConcernee: `session_active:${sessionId}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Fermeture d'une session (F-AUTH-09) : ${sessionCible.appareil}, ${sessionCible.navigateur}.`,
  });

  return { error: null, success: true };
}

/** Ferme toutes les sessions de l'utilisateur SAUF la session courante ("Déconnecter tous les autres appareils"). */
export async function deconnecterAutresAppareilsAction(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposee par useActionState.
  prevState: SessionsActionState,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature imposee par useActionState, aucune donnee de formulaire necessaire ici.
  formData: FormData
): Promise<SessionsActionState> {
  const session = await getSession();
  if (!session) {
    return { error: "Session expirée. Veuillez vous reconnecter.", success: false };
  }

  const resultat = await prisma.sessionActive.deleteMany({
    where: { userId: session.userId, id: { not: session.sessionId } },
  });

  await journaliser({
    utilisateurId: session.userId,
    action: "fermeture_autres_sessions",
    donneeConcernee: `utilisateur:${session.userId}`,
    adresseTechnique: await adresseTechniqueCourante(),
    justification: `Déconnexion des autres appareils (F-AUTH-09) : ${resultat.count} session(s) fermée(s).`,
  });

  return { error: null, success: true };
}
