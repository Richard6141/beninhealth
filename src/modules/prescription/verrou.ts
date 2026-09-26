/**
 * Verrou de ligne sur une ordonnance (RG-PHA-11 du pack, SELECT ... FOR UPDATE).
 *
 * Module SANS "use server". A appeler en premier dans une transaction
 * interactive : le verrou est tenu jusqu'a la fin de la transaction, ce qui
 * fait attendre toute autre transaction qui verrouille la meme ordonnance.
 * Les lectures suivantes de cette transaction voient alors les ecritures que
 * l'autre a validees entre-temps (READ COMMITTED), donc la quantite deja
 * delivree est exacte au moment de l'ecriture.
 */

import type { Prisma } from "@prisma/client";

/** Vrai si l'ordonnance existe (et est maintenant verrouillee), faux sinon. */
export async function verrouillerOrdonnance(
  tx: Prisma.TransactionClient,
  prescriptionId: string
): Promise<boolean> {
  const lignes = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "public"."Prescription" WHERE "id" = ${prescriptionId} FOR UPDATE
  `;

  return lignes.length > 0;
}
