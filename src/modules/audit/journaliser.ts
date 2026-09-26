import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Point d'ecriture unique de JournalAudit (prealable a RG-AUD-02, chainage
 * cryptographique des empreintes du journal ; voir "Reste a faire" #1 dans
 * docs/audit-cote-administration.md). Avant ce helper, prisma.journalAudit.create()
 * etait appele directement dans une quinzaine de fichiers, rendant impossible
 * d'intercepter chaque ecriture pour y ajouter le hash de la precedente.
 *
 * Volontairement une fonction normale (pas async) qui renvoie directement la
 * PrismaPromise de `create` : plusieurs appelants la passent non-attendue dans
 * un tableau `prisma.$transaction([...])` (transaction "batch"), ce qui exige
 * l'objet PrismaPromise original et non une Promise qui l'envelopperait.
 */
export interface DonneesJournalAudit {
  utilisateurId: string;
  action: string;
  donneeConcernee: string;
  adresseTechnique: string;
  justification: string;
}

export function journaliser(
  donnees: DonneesJournalAudit,
  client: PrismaClient | Prisma.TransactionClient = prisma
) {
  return client.journalAudit.create({ data: donnees });
}
