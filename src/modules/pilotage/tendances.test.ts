import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * exporterComparaisonCSV (F-PIL-04, RG-PIL-40/41, corrige le 2026-09-28) :
 * meme exigence que exporterRepartitionCSV (F-PIL-05, analytics/actions.test.ts)
 * - jeton signe de re-authentification (portee nationale), pas de production
 * sans lui, masquage deja assure par getComparaisonTerritoires, export
 * journalise avec le motif du jeton en clair.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-tendances-export" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.9" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    departement: { findMany: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn() },
    agregatQuotidien: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonExportAudit } from "@/modules/audit/jeton-export-audit";
import { creerJetonExport } from "@/modules/pilotage/jeton-export";
import { exporterComparaisonCSV } from "./tendances";
import type { FiltresTendances } from "./tendances-constantes";

const prismaMock = prisma as unknown as {
  departement: { findMany: Mock };
  etablissementSanitaire: { findMany: Mock };
  agregatQuotidien: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const SESSION_NATIONAL = { userId: "admin-1", roles: ["admin_national"], sessionId: "s-1" };

const FILTRES: FiltresTendances = {
  indicateurCode: "IND-01",
  granularite: "mois",
  territoireIds: ["dep-1", "dep-2"],
  periodeMois: 3,
};

function jeton(surcharge: Partial<Parameters<typeof creerJetonExport>[0]> = {}, maintenantMs?: number): string {
  return creerJetonExport(
    { utilisateurId: "admin-1", sessionId: "s-1", portee: "national", motif: "rapport_mensuel", ...surcharge },
    maintenantMs
  );
}

describe("exporterComparaisonCSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    prismaMock.departement.findMany.mockResolvedValue([
      { id: "dep-1", code: "ATL", nom: "Atlantique" },
      { id: "dep-2", code: "LIT", nom: "Littoral" },
    ]);
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "e-1", commune: { departementId: "dep-1" }, zoneSanitaire: null },
      { id: "e-2", commune: { departementId: "dep-2" }, zoneSanitaire: null },
    ]);
    prismaMock.agregatQuotidien.findMany.mockResolvedValue([]);
  });

  it("refuse sans jeton : aucune lecture, aucune trace d'export", async () => {
    const resultat = await exporterComparaisonCSV(FILTRES, null);
    expect(resultat).toHaveProperty("error");
    expect(prismaMock.departement.findMany).not.toHaveBeenCalled();
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
      expect(await exporterComparaisonCSV(FILTRES, valeur)).toHaveProperty("error");
    }
    expect(prismaMock.departement.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton valide d'un autre usage (export du journal d'audit)", async () => {
    const resultat = await exporterComparaisonCSV(FILTRES, creerJetonExportAudit("admin-1"));
    expect(resultat).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await exporterComparaisonCSV(FILTRES, jeton())).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("garde le contrôle de rôle : un jeton valide ne suffit pas sans admin_national", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION_NATIONAL, roles: ["admin_etablissement"] });
    expect(await exporterComparaisonCSV(FILTRES, jeton())).toEqual({ error: "Droits insuffisants." });
    expect(prismaMock.departement.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("accepte un jeton emis pour un AUTRE export de pilotage national (une seule confirmation couvre tous les exports de cette portee)", async () => {
    // Meme module jeton-export.ts, meme portee "national" : par conception
    // (voir la docstring de jeton-export.ts), reutilisable pour repartition
    // ET tendances sans redemander le mot de passe dans les 5 minutes.
    const resultat = await exporterComparaisonCSV(FILTRES, jeton());
    expect(resultat).toHaveProperty("contenu");
  });

  it("avec un jeton valide, exporte les donnees deja masquees (RG-PIL-02) au format attendu", async () => {
    const resultat = await exporterComparaisonCSV(FILTRES, jeton());
    if (!("contenu" in resultat)) throw new Error(`Export refusé : ${resultat.error}`);

    const lignes = resultat.contenu.split("\n");
    expect(lignes[0]).toBe("Periode;Atlantique;Littoral");
  });

  it("aucune donnée pour la sélection : erreur explicite, pas de journal", async () => {
    prismaMock.departement.findMany.mockResolvedValue([]);
    const resultat = await exporterComparaisonCSV(FILTRES, jeton());
    expect(resultat).toEqual({ error: "Aucune donnée à exporter pour cette sélection." });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("journalise l'export sous une action dédiée avec le motif du jeton en clair", async () => {
    await exporterComparaisonCSV(FILTRES, jeton({ motif: "autre", motifTexte: "Revue budgétaire du trimestre" }));

    // getComparaisonTerritoires journalise deja sa propre consultation
    // (ANALYTICS_VIEW, RG-PIL-21) a chaque appel, y compris celui-ci fait en
    // interne par l'export : en plus de cette entree, l'export en ajoute une
    // seconde, dediee, avec le motif du jeton.
    const entreeExport = journaliserMock.mock.calls
      .map((appel) => appel[0])
      .find((entree) => entree.action === "export_pilotage_tendances_csv");
    expect(entreeExport).toMatchObject({
      utilisateurId: "admin-1",
      action: "export_pilotage_tendances_csv",
      adresseTechnique: "10.0.0.9",
    });
    expect(entreeExport.donneeConcernee).toContain("pilotage_national:tendances");
    expect(entreeExport.justification).toContain("Revue budgétaire du trimestre");
  });
});
