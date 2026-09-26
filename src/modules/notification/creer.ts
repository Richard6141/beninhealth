/**
 * Ecriture d'une notification interne. Volontairement HORS d'un fichier
 * "use server" : chaque fonction exportee d'un fichier "use server" est un
 * point d'entree atteignable par POST, or celle-ci n'a aucun controle de
 * session (c'est a l'appelant, deja dans un contexte Zero Trust verifie, de
 * fournir le bon destinataire). Ne jamais la deplacer dans actions.ts.
 */

import { prisma } from "@/lib/prisma";

/**
 * Cree une notification interne pour un utilisateur. A appeler depuis un
 * autre module juste apres un evenement pertinent (le destinataire doit
 * avoir ete determine par l'appelant a partir de donnees deja verifiees,
 * ex : le patient d'un rendez-vous que l'on vient de confirmer).
 */
export async function creerNotification(
  utilisateurId: string,
  type: string,
  message: string,
  lien?: string
): Promise<void> {
  await prisma.notification.create({
    data: { utilisateurId, type, message, lien: lien ?? null },
  });
}
