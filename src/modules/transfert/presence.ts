/**
 * Signal de presence du patient dans l'etablissement du professionnel : un
 * rendez-vous confirme aujourd'hui, ou une arrivee deja enregistree
 * aujourd'hui (F-RDV-04/05). Ce n'est pas une preuve, seulement un signal qui
 * autorise un acces plus long ; sans lui, l'acces est plafonne a une journee.
 */

import { prisma } from "@/lib/prisma";
import { bornesJourneeBenin } from "./code-acces";

export async function aSignalDePresence(
  patientId: string,
  etablissementId: string,
  maintenant: Date = new Date()
): Promise<boolean> {
  const { debut, fin } = bornesJourneeBenin(maintenant);

  const rendezVous = await prisma.rendezVous.findFirst({
    where: {
      patientId,
      etablissementId,
      date: { gte: debut, lt: fin },
      statut: { notIn: ["annule", "absent"] },
      OR: [{ statut: "confirme" }, { heureArrivee: { not: null } }],
    },
    select: { id: true },
  });

  return rendezVous !== null;
}
