/**
 * POST /api/v1/sync/batches (F-COM-08) : réception d'un lot de saisies
 * créées hors ligne par un agent communautaire. Route mince : toute la
 * logique (idempotence, RG-COM-21, contrôle de doublon) vit dans
 * src/modules/sync/synchronisation.ts.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import {
  LotTropVolumineuxError,
  TAILLE_MAX_LOT,
  traiterLotSynchronisation,
} from "@/modules/sync/synchronisation";

const schemaSaisie = z.object({
  uuidAppareil: z.string().trim().min(1),
  type: z.literal("personne_communautaire"),
  horodatageLocal: z.string().trim().min(1),
  payload: z.record(z.string(), z.unknown()),
});

const schemaCorpsRequete = z.object({
  saisies: z.array(schemaSaisie).max(TAILLE_MAX_LOT),
});

function adresseIpDepuisRequete(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "inconnue"
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Session expirée. Veuillez vous reconnecter." }, { status: 401 });
  }

  if (!session.roles.some((role) => can(role, "create", "personne_communautaire"))) {
    return NextResponse.json({ error: "Action réservée aux agents communautaires." }, { status: 403 });
  }

  const agent = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  if (!agent) {
    return NextResponse.json({ error: "Aucun profil professionnel associé à ce compte." }, { status: 404 });
  }

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête JSON invalide." }, { status: 400 });
  }

  const validation = schemaCorpsRequete.safeParse(corps);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Lot de synchronisation invalide : " + (validation.error.issues[0]?.message ?? "format inattendu.") },
      { status: 400 }
    );
  }

  try {
    const resultats = await traiterLotSynchronisation(
      { utilisateurId: session.userId, agentId: agent.id, etablissementId: agent.etablissementId },
      validation.data.saisies,
      adresseIpDepuisRequete(request)
    );
    return NextResponse.json({ resultats });
  } catch (erreur) {
    if (erreur instanceof LotTropVolumineuxError) {
      return NextResponse.json({ error: erreur.message }, { status: 400 });
    }
    console.error("Erreur lors de la synchronisation d'un lot hors ligne :", erreur);
    return NextResponse.json({ error: "Une erreur est survenue lors de la synchronisation." }, { status: 500 });
  }
}
