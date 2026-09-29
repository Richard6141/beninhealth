/**
 * GET /api/v1/community/area/snapshot (F-COM-01, étape 4) : instantané
 * téléchargeable de l'aire de l'agent communautaire connecté, limité à 5000
 * personnes (RG-COM-01). Route mince : toute la logique vit dans
 * src/modules/sync/instantane-aire.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { obtenirInstantaneAire } from "@/modules/sync/instantane-aire";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Session expirée. Veuillez vous reconnecter." }, { status: 401 });
  }

  if (!session.roles.some((role) => can(role, "read", "personne_communautaire"))) {
    return NextResponse.json({ error: "Action réservée aux agents communautaires." }, { status: 403 });
  }

  const agent = await prisma.professionnelSante.findUnique({ where: { userId: session.userId } });
  if (!agent) {
    return NextResponse.json({ error: "Aucun profil professionnel associé à ce compte." }, { status: 404 });
  }

  const instantane = await obtenirInstantaneAire(agent.etablissementId);
  return NextResponse.json(instantane);
}
