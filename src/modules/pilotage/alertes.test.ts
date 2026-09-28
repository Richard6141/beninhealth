import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agregatQuotidien: { findMany: vi.fn() },
    healthAlertReview: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn() },
    zoneSanitaire: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getAlertesEpidemiologiques } from "@/modules/pilotage/alertes";

const p = prisma as unknown as {
  agregatQuotidien: { findMany: Mock };
  healthAlertReview: { findMany: Mock; findUnique: Mock; create: Mock; createMany: Mock; update: Mock };
  zoneSanitaire: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.healthAlertReview.findMany.mockResolvedValue([
    {
      id: "alerte-1",
      zoneSanitaireId: "zone-lit",
      groupeMaladies: "paludisme",
      semaine: "2026-W40",
      casObserves: 12,
      seuilCalcule: 10,
      statut: "nouvelle",
      commentaire: null,
      motifFermeture: null,
      reviewer: null,
      dateCreation: new Date("2026-09-30T10:00:00.000Z"),
      dateRevue: null,
    },
  ]);
  p.zoneSanitaire.findMany.mockResolvedValue([{ id: "zone-lit", nom: "Zone sanitaire a affiner (LIT)" }]);
});

describe("getAlertesEpidemiologiques (F-PIL-06) : lecture pure", () => {
  it("n'execute plus aucune detection ni ecriture au chargement de l'ecran", async () => {
    const alertes = await getAlertesEpidemiologiques();

    expect(alertes).toHaveLength(1);
    expect(alertes?.[0]).toMatchObject({ zoneSanitaireNom: "Zone sanitaire a affiner (LIT)", groupeMaladiesLibelle: "Paludisme" });
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
    expect(p.healthAlertReview.create).not.toHaveBeenCalled();
    expect(p.healthAlertReview.createMany).not.toHaveBeenCalled();
    expect(p.healthAlertReview.update).not.toHaveBeenCalled();
  });

  it("refuse sans session ou sans droit de lecture analytics", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getAlertesEpidemiologiques()).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "patient-1", roles: ["patient"] });
    expect(await getAlertesEpidemiologiques()).toBeNull();
    expect(p.healthAlertReview.findMany).not.toHaveBeenCalled();
  });
});
