/**
 * Route de telechargement de la copie de mes donnees au format JSON
 * (F-CIT-13 du pack). Le middleware (middleware.ts) ne protege que /app/*,
 * pas /api/* : la verification de session est donc entierement a la charge
 * de ce handler, refaite ici independamment de tout rendu React ayant pu
 * produire le lien.
 *
 * Aucune re-authentification par mot de passe supplementaire ici : elle a
 * deja eu lieu cote /app/patient/droits via verifierMotDePasseExportAction
 * (src/modules/patient/droits-donnees.ts), qui a genere le lien de
 * telechargement affiche a l'ecran. Cette route ne fait que re-verifier la
 * session courante et le role, comme tout autre acces authentifie du depot.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { collecterMesDonneesPersonnelles } from "@/modules/patient/droits-donnees";

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const donnees = await collecterMesDonneesPersonnelles();

  if (!donnees) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  await journaliser({
    utilisateurId: session.userId,
    action: "export_donnees_telecharge",
    donneeConcernee: `utilisateur:${session.userId}`,
    adresseTechnique: adresseTechniqueDepuisRequete(request),
    justification: "Copie des donnees personnelles telechargee au format JSON (F-CIT-13)",
  });

  return new NextResponse(JSON.stringify(donnees, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mes-donnees.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
