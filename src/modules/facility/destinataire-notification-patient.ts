/**
 * Destinataire reel d'une notification adressee a un Patient (F-RDV-06/07,
 * F-CIT-08 du pack) : pour un compte normal, c'est son propre User.userId.
 * Pour une personne a charge (F-CIT-07, proches/actions.ts), Patient.user.statut
 * vaut "sans_compte" - ce compte placeholder n'est jamais connecte, une
 * notification qui lui est adressee est donc silencieusement perdue. Defaut
 * trouve et corrige (signale par une autre session, voir
 * docs/coordination-agents.md) : router alors vers le tuteur qui gere cette
 * personne a charge (Consentement.acteurAutoriseId), meme principe de
 * verification que proches/actions.ts (procheAutorise).
 *
 * Prend volontairement le seul patientId (jamais un objet Patient dont la
 * forme exacte varie d'un module appelant a l'autre) : reutilisable depuis
 * n'importe quel module (facility, prescription, laboratoire, clinical...)
 * sans lui imposer d'inclure `user.statut` dans sa propre requete.
 *
 * Module partage, pas de "use server" : simple lecture interne, jamais
 * appelee directement par un composant client.
 */

import { prisma } from "@/lib/prisma";

/**
 * userId a notifier pour ce patient. Si le patient est introuvable ou si
 * aucun tuteur actif n'est trouve pour une personne a charge (cas anormal :
 * compte "sans_compte" sans consentement, ou tuteur ayant retire son
 * consentement), retombe sur Patient.userId (ou patientId tel quel si le
 * patient est introuvable) : la notification reste silencieusement perdue
 * comme avant ce correctif, jamais une exception qui ferait echouer une
 * decision deja actee en base.
 */
export async function destinataireNotificationPatient(patientId: string): Promise<string> {
  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { userId: true, user: { select: { statut: true } } },
  });

  if (!patient) {
    return patientId;
  }

  if (patient.user.statut !== "sans_compte") {
    return patient.userId;
  }

  const tuteur = await prisma.consentement.findFirst({
    where: {
      patientId,
      statut: "actif",
      OR: [{ dateFin: null }, { dateFin: { gt: new Date() } }],
    },
    orderBy: { dateDebut: "desc" },
    select: { acteurAutoriseId: true },
  });

  return tuteur?.acteurAutoriseId ?? patient.userId;
}
