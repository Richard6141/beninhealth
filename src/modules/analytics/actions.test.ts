import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * exporterRepartitionCSV (F-PIL-05, RG-PIL-40, RG-PIL-41) : l'ancien export
 * Phase 6 de /app/ministere ne produit plus rien sans le jeton signé de
 * ré-authentification des exports de pilotage (portée nationale), masque les
 * petits effectifs et journalise l'export avec le motif du jeton.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-analytics-export" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.7" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    etablissementSanitaire: { findMany: vi.fn() },
    consultation: { groupBy: vi.fn() },
    rendezVous: { groupBy: vi.fn() },
    professionnelSante: { groupBy: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonExportAudit } from "@/modules/audit/jeton-export-audit";
import { creerJetonExport } from "@/modules/pilotage/jeton-export";
import { exporterRepartitionCSV } from "./actions";

const prismaMock = prisma as unknown as {
  etablissementSanitaire: { findMany: Mock };
  consultation: { groupBy: Mock };
  rendezVous: { groupBy: Mock };
  professionnelSante: { groupBy: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const SESSION_NATIONAL = { userId: "admin-1", roles: ["admin_national"], sessionId: "s-1" };

function jeton(surcharge: Partial<Parameters<typeof creerJetonExport>[0]> = {}, maintenantMs?: number): string {
  return creerJetonExport(
    { utilisateurId: "admin-1", sessionId: "s-1", portee: "national", motif: "rapport_mensuel", ...surcharge },
    maintenantMs
  );
}

describe("exporterRepartitionCSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "e-1", nom: "CHU de Cotonou", localisation: "Cotonou, Littoral", type: "chu" },
      { id: "e-2", nom: "Centre de santé de Kandi", localisation: "Kandi", type: "centre_sante" },
    ]);
    prismaMock.consultation.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 42 } },
      { etablissementId: "e-2", _count: { _all: 3 } },
    ]);
    prismaMock.rendezVous.groupBy.mockResolvedValue([{ etablissementId: "e-1", _count: { _all: 2 } }]);
    prismaMock.professionnelSante.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 12 } },
      { etablissementId: "e-2", _count: { _all: 1 } },
    ]);
  });

  it("refuse sans jeton : aucune lecture, aucune trace d'export", async () => {
    const resultat = await exporterRepartitionCSV(null);
    expect(resultat).toHaveProperty("error");
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton expiré, d'une autre session, d'un autre utilisateur ou de la portée établissement", async () => {
    const refuses = [
      jeton({}, Date.now() - 10 * 60 * 1000),
      jeton({ sessionId: "s-ancienne" }),
      jeton({ utilisateurId: "quelqu-un-d-autre" }),
      jeton({ portee: "etablissement" }),
      "faux.jeton",
    ];
    for (const valeur of refuses) {
      expect(await exporterRepartitionCSV(valeur)).toHaveProperty("error");
    }
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton valide d'un autre usage (export du journal d'audit)", async () => {
    const resultat = await exporterRepartitionCSV(creerJetonExportAudit("admin-1"));
    expect(resultat).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await exporterRepartitionCSV(jeton())).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("garde le contrôle de rôle : un jeton valide ne suffit pas sans admin_national", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION_NATIONAL, roles: ["admin_etablissement"] });
    expect(await exporterRepartitionCSV(jeton())).toEqual({ error: "Droits insuffisants." });
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("avec un jeton valide, exporte en masquant les petits effectifs (RG-PIL-02)", async () => {
    const resultat = await exporterRepartitionCSV(jeton());
    if (!("contenu" in resultat)) throw new Error(`Export refusé : ${resultat.error}`);

    const lignes = resultat.contenu.split("\n");
    expect(lignes[0]).toBe("Etablissement,Localisation,Type,Consultations,RendezVous,Professionnels");
    // Virgule dans la localisation : champ entre guillemets. 2 rendez-vous : "< 5".
    expect(lignes[1]).toBe('CHU de Cotonou,"Cotonou, Littoral",chu,42,< 5,12');
    // 3 consultations : "< 5" ; 0 rendez-vous reste 0.
    expect(lignes[2]).toBe("Centre de santé de Kandi,Kandi,centre_sante,< 5,0,1");
  });

  it("journalise l'export sous une action dédiée avec le motif du jeton en clair", async () => {
    await exporterRepartitionCSV(jeton({ motif: "autre", motifTexte: "Revue budgétaire du trimestre" }));

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    const entree = journaliserMock.mock.calls[0][0];
    expect(entree).toMatchObject({
      utilisateurId: "admin-1",
      action: "export_pilotage_repartition_csv",
      donneeConcernee: "pilotage_national:repartition_etablissements;format=csv",
      adresseTechnique: "10.0.0.7",
    });
    expect(entree.justification).toContain("Revue budgétaire du trimestre");
    expect(entree.justification).toContain("2 ligne(s)");
  });
});
