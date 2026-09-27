/**
 * Route de telechargement de la copie de mes donnees au format JSON
 * (F-CIT-13 du pack). Le middleware (middleware.ts) ne protege que /app/*,
 * pas /api/* : la verification de session est donc entierement a la charge
 * de ce handler, refaite ici independamment de tout rendu React ayant pu
 * produire le lien.
 *
 * Re-authentification : la session seule ne suffit pas. Le lien porte un
 * jeton signe de 5 minutes, lie au compte, delivre par
 * verifierMotDePasseExportAction (src/modules/patient/droits-donnees.ts)
 * apres verification du mot de passe ; sans lui, 403.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { collecterMesDonneesPersonnelles } from "@/modules/patient/droits-donnees";
import { jetonExportDonneesValide } from "@/modules/patient/jeton-export-donnees";

function adresseTechniqueDepuisRequete(request: Request): string {
  return request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "inconnue";
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session || !session.roles.includes("patient")) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const jeton = new URL(request.url).searchParams.get("jeton");

  if (!jetonExportDonneesValide(jeton, session.userId)) {
    return NextResponse.json(
      { error: "Confirmation du mot de passe requise ou expiree." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
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
