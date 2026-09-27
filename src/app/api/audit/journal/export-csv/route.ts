/**
 * Route de telechargement du CSV du journal d'audit (F-AUD-01 du pack).
 * Le middleware (middleware.ts) ne protege que /app/*, pas /api/* : la
 * verification de session et du jeton est entierement a la charge de
 * genererCsvJournalAudit (src/modules/audit/actions.ts), refaite ici
 * independamment de tout rendu React ayant pu produire le lien. Meme
 * principe que /api/patient/export/{json,pdf} (F-CIT-13) : un jeton signe
 * de 5 minutes, lie au compte, delivre apres re-authentification par mot de
 * passe (verifierMotDePasseExportCsvAuditAction).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { genererCsvJournalAudit, type FiltresJournalAudit } from "@/modules/audit/actions";

function valeur(searchParams: URLSearchParams, cle: string): string | undefined {
  const v = searchParams.get(cle);
  return v && v.trim().length > 0 ? v : undefined;
}

export async function GET(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const searchParams = new URL(request.url).searchParams;
  const jeton = searchParams.get("jeton");

  const filtres: FiltresJournalAudit = {
    dateDebut: valeur(searchParams, "dateDebut") ?? "",
    dateFin: valeur(searchParams, "dateFin") ?? "",
    acteur: valeur(searchParams, "acteur"),
    patientIdentifiantSante: valeur(searchParams, "patient"),
    action: valeur(searchParams, "action"),
    etablissementId: valeur(searchParams, "etablissementId"),
  };

  const resultat = await genererCsvJournalAudit(filtres, jeton);

  if ("error" in resultat) {
    return NextResponse.json(
      { error: resultat.error },
      { status: 403, headers: { "Cache-Control": "private, no-store" } }
    );
  }

  return new NextResponse(resultat.contenu, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-audit-${filtres.dateDebut}-${filtres.dateFin}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
