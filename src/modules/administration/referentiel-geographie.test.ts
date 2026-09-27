import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { departement: { findMany: vi.fn() } },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getReferentielGeographie } from "@/modules/administration/referentiel-geographie";

const p = prisma as unknown as { departement: { findMany: Mock } };
const getSessionMock = getSession as unknown as Mock;

function departement(surcharges: Record<string, unknown> = {}) {
  return {
    id: "dep-1",
    code: "ATL",
    nom: "Atlantique",
    communes: [{ id: "com-1", nom: "Ouidah", _count: { etablissements: 3 } }],
    zonesSanitaires: [{ id: "zone-1", code: "ATL-A-AFFINER", nom: "Zone sanitaire a affiner (ATL)", _count: { etablissements: 0 } }],
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
  p.departement.findMany.mockResolvedValue([departement()]);
});

describe("getReferentielGeographie (F-ADM-04, lecture seule)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getReferentielGeographie()).toBeNull();
    expect(p.departement.findMany).not.toHaveBeenCalled();
  });

  it("refuse tout role autre qu'admin_national", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    expect(await getReferentielGeographie()).toBeNull();
    expect(p.departement.findMany).not.toHaveBeenCalled();
  });

  it("renvoie les departements avec leurs communes et zones, comptage d'etablissements inclus", async () => {
    const resultat = await getReferentielGeographie();

    expect(resultat).toEqual([
      {
        id: "dep-1",
        code: "ATL",
        nom: "Atlantique",
        communes: [{ id: "com-1", nom: "Ouidah", nombreEtablissements: 3 }],
        zonesSanitaires: [
          { id: "zone-1", code: "ATL-A-AFFINER", nom: "Zone sanitaire a affiner (ATL)", nombreEtablissements: 0 },
        ],
      },
    ]);
  });

  it("un departement sans zone sanitaire renvoie un tableau vide, jamais une exception", async () => {
    p.departement.findMany.mockResolvedValue([departement({ zonesSanitaires: [] })]);

    const resultat = await getReferentielGeographie();

    expect(resultat?.[0].zonesSanitaires).toEqual([]);
  });
});
