/**
 * Appareils connus d'un compte et alerte de nouvelle connexion (F-AUTH-02) : une
 * connexion d'un compte professionnel depuis un appareil jamais vu declenche une
 * notification interne et un SMS "Nouvelle connexion a votre compte". La toute
 * premiere connexion d'un compte n'alerte pas (aucun appareil de reference), et
 * les patients ne sont pas alertes. Seule l'empreinte HMAC de l'appareil est
 * conservee. Module serveur SANS "use server".
 */

import { prisma } from "@/lib/prisma";
import { empreinteHmac } from "@/lib/chiffrement";
import type { NomRole } from "@/types";
import { alerterSecurite } from "./alertes-securite";

const DOMAINE_EMPREINTE = "appareil-connu";

export function empreinteAppareil(userId: string, appareil: string, navigateur: string): string {
  return empreinteHmac(`${userId}|${appareil}|${navigateur}`, DOMAINE_EMPREINTE);
}

function dateCourteBenin(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Porto-Novo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/** Enregistre l'appareil courant et alerte si c'est un nouvel appareil d'un compte professionnel. Ne leve jamais. */
export async function enregistrerAppareilEtAlerter(
  userId: string,
  roles: ReadonlyArray<NomRole>,
  appareil: { appareil: string; navigateur: string }
): Promise<void> {
  try {
    const empreinte = empreinteAppareil(userId, appareil.appareil, appareil.navigateur);
    const connu = await prisma.appareilConnu.findUnique({ where: { userId_empreinte: { userId, empreinte } } });

    if (connu) {
      await prisma.appareilConnu.update({ where: { id: connu.id }, data: { derniereFoisLe: new Date() } });
      return;
    }

    const autresAppareils = await prisma.appareilConnu.count({ where: { userId } });

    await prisma.appareilConnu.create({
      data: { userId, empreinte, appareil: appareil.appareil, navigateur: appareil.navigateur },
    });

    if (autresAppareils === 0 || !roles.some((role) => role !== "patient")) {
      return;
    }

    const quand = dateCourteBenin(new Date());
    await alerterSecurite(userId, {
      type: "connexion_nouvel_appareil",
      message: `Nouvelle connexion à votre compte le ${quand} depuis un nouvel appareil (${appareil.appareil}, ${appareil.navigateur}). Si ce n'est pas vous, changez votre mot de passe.`,
      messageSms: `Nouvelle connexion a votre compte le ${quand}. Si ce n'est pas vous, changez votre mot de passe.`,
    });
  } catch (erreur) {
    console.error("Enregistrement de l'appareil impossible :", erreur);
  }
}
