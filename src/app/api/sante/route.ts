import { prisma } from "@/lib/prisma";

/**
 * Sante de l'application pour le deploiement : 200 quand la base repond, 503
 * sinon. Aucune donnee personnelle, aucune authentification.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", base: "up" });
  } catch {
    return Response.json({ status: "erreur", base: "down" }, { status: 503 });
  }
}
