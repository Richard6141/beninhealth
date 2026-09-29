/**
 * GET /api/v1/sync/changes?since=curseur (F-COM-08) : changements de l'aire
 * de l'agent connecté depuis un curseur (date ISO). Route mince : la logique
 * vit dans src/modules/sync/instantane-aire.ts.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";
import { obtenirChangementsAire } from "@/modules/sync/instantane-aire";

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const depuisParametre = url.searchParams.get("since");
  const depuis = depuisParametre ? new Date(depuisParametre) : new Date(0);

  if (Number.isNaN(depuis.getTime())) {
    return NextResponse.json({ error: "Paramètre since invalide (date ISO attendue)." }, { status: 400 });
  }

  const changements = await obtenirChangementsAire(agent.etablissementId, depuis);
  return NextResponse.json(changements);
}
