import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    departement: { findMany: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn() },
    agregatQuotidien: { findMany: vi.fn() },
    appelIa: { create: vi.fn() },
    // Toute autre table serait un acces non prevu : les mocks ci-dessus sont les seuls qui existent.
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import { getAnalyseAgregats } from "@/modules/ai/analyse-lecture";
import { lundisDesSemainesCompletes } from "@/modules/ai/analyse-agregats";

const p = prisma as unknown as {
  departement: { findMany: Mock };
  etablissementSanitaire: { findMany: Mock };
  agregatQuotidien: { findMany: Mock };
  appelIa: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const fonctionnaliteMock = estFonctionnaliteActive as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

/** Une ligne par semaine complete, sur l'etablissement e-1 (departement d-1). */
function lignesPourValeurs(valeurs: number[]) {
  const lundis = lundisDesSemainesCompletes(new Date(), 12);
  return valeurs.map((valeur, index) => ({ etablissementId: "e-1", date: new Date(`${lundis[index]}T00:00:00.000Z`), valeur }));
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  fonctionnaliteMock.mockResolvedValue(true);
  p.departement.findMany.mockResolvedValue([{ id: "d-1", nom: "Atlantique" }]);
  p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "e-1", commune: { departementId: "d-1" }, zoneSanitaire: null }]);
  p.agregatQuotidien.findMany.mockResolvedValue([]);
  p.appelIa.create.mockResolvedValue({});
});

describe("getAnalyseAgregats : acces (F-IA-04)", () => {
  it.each(["patient", "medecin", "infirmier", "pharmacien", "laboratoire", "admin_etablissement"] as const)("le role %s n'a aucun acces", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    expect(await getAnalyseAgregats()).toBeNull();
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
  });

  it("sans session : null", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getAnalyseAgregats()).toBeNull();
  });

  it("fonctionnalite ai.analytics desactivee (RG-IA-02) : rien n'est lu ni journalise", async () => {
    fonctionnaliteMock.mockResolvedValue(false);

    const resultat = await getAnalyseAgregats();

    expect(fonctionnaliteMock).toHaveBeenCalledWith("ai.analytics");
    expect(resultat).toMatchObject({ actif: false, signaux: [], seriesAnalysees: 0 });
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });
});

describe("getAnalyseAgregats : lecture des agregats seulement", () => {
  it("un pic sur la derniere semaine complete est signale, journalise et compte, sans texte de dossier", async () => {
    p.agregatQuotidien.findMany.mockImplementation(async ({ where }: { where: { indicateur: string } }) =>
      where.indicateur === "IND-01" ? lignesPourValeurs([40, 40, 42, 39, 41, 38, 40, 43, 41, 40, 42, 200]) : []
    );

    const resultat = await getAnalyseAgregats();

    expect(resultat?.actif).toBe(true);
    expect(resultat?.seriesAnalysees).toBe(1);
    const pic = resultat?.signaux.find((signal) => signal.type === "pic");
    expect(pic).toMatchObject({ code: "IND-01", territoire: "Atlantique", observe: 200 });
    expect(pic?.explication).toContain("200 consultations");

    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "ANALYTICS_VIEW", utilisateurId: "u-admin" }));
    expect(p.appelIa.create.mock.calls[0][0].data).toMatchObject({ fonctionnalite: "analyse_agregats", statut: "ok", nombreSources: 1, pucesLues: resultat?.signaux.length });
  });

  it("n'interroge que les agregats quotidiens, sur la fenetre des 12 semaines completes, par indicateur comparable", async () => {
    await getAnalyseAgregats();

    const codes = p.agregatQuotidien.findMany.mock.calls.map((appel) => appel[0].where.indicateur).sort();
    expect(codes).toEqual(["IND-01", "IND-02", "IND-04", "IND-07", "IND-08", "IND-10"]);
    for (const [requete] of p.agregatQuotidien.findMany.mock.calls) {
      expect(requete.select).toEqual({ etablissementId: true, date: true, valeur: true });
      expect(requete.where.date.lt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("un etablissement sans departement connu est ignore plutot que rattache au hasard", async () => {
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "e-1", commune: null, zoneSanitaire: null }]);
    p.agregatQuotidien.findMany.mockResolvedValue(lignesPourValeurs([40, 40, 42, 39, 41, 38, 40, 43, 41, 40, 42, 200]));

    const resultat = await getAnalyseAgregats();

    expect(resultat?.seriesAnalysees).toBe(0);
    expect(resultat?.signaux).toEqual([]);
  });

  it("sans agregat (base de demonstration vide) : aucun signal, jamais d'invention", async () => {
    const resultat = await getAnalyseAgregats();

    expect(resultat).toMatchObject({ actif: true, signaux: [], seriesAnalysees: 0 });
  });
});
