import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * getTableauBordEtablissement (F-PIL-01) : aucun test n'existait pour cette
 * fonction avant ce jour. Cible principale ici : les deux ajouts du
 * 2026-09-27 (IND-07 taux d'absence, IND-11 delai d'attente moyen) et leur
 * masquage RG-PIL-02 ; le reste (IND-01/02/03/08, activite par
 * professionnel) est deja exerce en usage reel, non reteste exhaustivement.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    agregatQuotidien: { findMany: vi.fn() },
    consultation: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getTableauBordEtablissement } from "./lecture";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock };
  etablissementSanitaire: { findUnique: Mock };
  agregatQuotidien: { findMany: Mock };
  consultation: { groupBy: Mock };
};
const getSessionMock = getSession as unknown as Mock;

/** Une ligne d'AgregatQuotidien pour aujourd'hui, IND-07 ou IND-11. */
function ligne(indicateur: string, dimensionLibre: string, valeur: number) {
  return { indicateur, dimensionLibre, valeur, date: new Date(), dateCalcul: new Date() };
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_etablissement"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1" });
  p.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-1", nom: "Centre de Sante Akpakpa" });
  p.agregatQuotidien.findMany.mockResolvedValue([]);
  p.consultation.groupBy.mockResolvedValue([]);
  p.professionnelSante.findMany.mockResolvedValue([]);
});

describe("getTableauBordEtablissement : acces", () => {
  it.each(["medecin", "infirmier", "admin_national", "patient"] as const)("le role %s n'a aucun acces", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    expect(await getTableauBordEtablissement("7j")).toBeNull();
  });

  it("sans session : null", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getTableauBordEtablissement("7j")).toBeNull();
  });
});

describe("getTableauBordEtablissement : IND-07, taux d'absence (RG-PIL-02)", () => {
  it("calcule le taux normalement a partir de 20 honores+absences", async () => {
    p.agregatQuotidien.findMany.mockImplementation(async ({ where }: { where: { indicateur?: { in?: string[] } } }) => {
      if (where.indicateur?.in?.includes("IND-07")) {
        return [ligne("IND-07", "pris", 25), ligne("IND-07", "honores", 18), ligne("IND-07", "annules", 2), ligne("IND-07", "absences", 2)];
      }
      return [];
    });

    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.rendezVousDuJour).toEqual({ pris: 25, honores: 18, annules: "< 5", absences: "< 5" });
    // 2 absences / (18 honores + 2 absences) = 10.0 %, denominateur 20 : juste au seuil, calculable.
    expect(tableau?.tauxAbsenceRendezVous).toBe("10.0 %");
  });

  it("'effectif insuffisant' sous 20 honores+absences, sans jamais reveler le taux exact", async () => {
    p.agregatQuotidien.findMany.mockImplementation(async ({ where }: { where: { indicateur?: { in?: string[] } } }) => {
      if (where.indicateur?.in?.includes("IND-07")) {
        return [ligne("IND-07", "pris", 5), ligne("IND-07", "honores", 4), ligne("IND-07", "absences", 1)];
      }
      return [];
    });

    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.tauxAbsenceRendezVous).toBe("effectif insuffisant");
  });

  it("aucun rendez-vous aujourd'hui : rendezVousDuJour est null, taux 'effectif insuffisant'", async () => {
    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.rendezVousDuJour).toBeNull();
    expect(tableau?.tauxAbsenceRendezVous).toBe("effectif insuffisant");
  });
});

describe("getTableauBordEtablissement : IND-11, delai d'attente moyen (RG-PIL-02)", () => {
  it("calcule la moyenne a partir de 5 mesures", async () => {
    p.agregatQuotidien.findMany.mockImplementation(async ({ where }: { where: { indicateur?: { in?: string[] } } }) => {
      if (where.indicateur?.in?.includes("IND-11")) {
        return [ligne("IND-11", "somme_minutes", 150), ligne("IND-11", "nombre_mesures", 5)];
      }
      return [];
    });

    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.delaiAttenteMoyen).toBe("30 min");
  });

  it("masque la moyenne sous 5 mesures", async () => {
    p.agregatQuotidien.findMany.mockImplementation(async ({ where }: { where: { indicateur?: { in?: string[] } } }) => {
      if (where.indicateur?.in?.includes("IND-11")) {
        return [ligne("IND-11", "somme_minutes", 80), ligne("IND-11", "nombre_mesures", 3)];
      }
      return [];
    });

    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.delaiAttenteMoyen).toBe("< 5 mesures");
  });

  it("aucune mesure aujourd'hui : 'aucune mesure', pas '0 min'", async () => {
    const tableau = await getTableauBordEtablissement("7j");

    expect(tableau?.delaiAttenteMoyen).toBe("aucune mesure");
  });
});
