/**
 * Verification des regles de prise de rendez-vous qui exigent la base
 * (F-RDV-01, RG-RDV-01, RG-RDV-02, regle du meme jour). Module SANS "use
 * server" : appele par les actions de prise de rendez-vous du patient, d'un
 * proche, du guichet et par le deplacement, jamais directement par un client.
 *
 * Ces controles sont une courtoisie (message clair avant l'ecriture) ; la
 * garantie contre la double reservation du meme creneau reste l'index unique
 * partiel de la base (RG-RDV-03, voir rendez-vous-etats.ts).
 */

import { prisma } from "@/lib/prisma";
import { STATUTS_ACTIFS } from "./rendez-vous-etats";
import {
  MAX_RENDEZ_VOUS_FUTURS,
  MESSAGE_MEME_JOUR,
  MESSAGE_PLAFOND_ATTEINT,
  bornesJourLocalBenin,
  verifierFenetreReservation,
} from "./regles-rendez-vous";

export interface DemandeReservation {
  patientId: string;
  etablissementId: string;
  date: Date;
  /** Prise de rendez-vous au guichet : pas de delai minimum, horizon de 90 jours. */
  guichet?: boolean;
  /** Deplacement : le rendez-vous remplace n'est compte ni dans le plafond ni dans la regle du meme jour. */
  rendezVousRemplaceId?: string;
  maintenant?: Date;
}

/** Renvoie le message du premier refus (fenetre, meme jour, plafond de 3), ou null si la reservation est permise. */
export async function verifierReglesReservation(demande: DemandeReservation): Promise<string | null> {
  const maintenant = demande.maintenant ?? new Date();

  const refusFenetre = verifierFenetreReservation(demande.date, maintenant, demande.guichet ?? false);
  if (refusFenetre) {
    return refusFenetre;
  }

  const actifs = [...STATUTS_ACTIFS];
  const exclusion = demande.rendezVousRemplaceId ? { id: { not: demande.rendezVousRemplaceId } } : {};
  const { debut, fin } = bornesJourLocalBenin(demande.date);

  const memeJour = await prisma.rendezVous.findFirst({
    where: {
      patientId: demande.patientId,
      etablissementId: demande.etablissementId,
      date: { gte: debut, lt: fin },
      statut: { in: actifs },
      ...exclusion,
    },
    select: { id: true },
  });
  if (memeJour) {
    return MESSAGE_MEME_JOUR;
  }

  const nombreFuturs = await prisma.rendezVous.count({
    where: { patientId: demande.patientId, date: { gt: maintenant }, statut: { in: actifs }, ...exclusion },
  });
  if (nombreFuturs >= MAX_RENDEZ_VOUS_FUTURS) {
    return MESSAGE_PLAFOND_ATTEINT;
  }

  return null;
}
