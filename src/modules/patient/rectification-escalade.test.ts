import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    demandeRectification: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { escaladerDemandesRectificationEnRetard } from "./rectification-escalade";

const p = prisma as unknown as { demandeRectification: { findMany: Mock; update: Mock } };
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-10-28T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("escaladerDemandesRectificationEnRetard (F-CIT-13)", () => {
  it("ne lit que les demandes en_attente routees vers un professionnel, plus vieilles que 30 jours", async () => {
    p.demandeRectification.findMany.mockResolvedValue([]);

    await escaladerDemandesRectificationEnRetard(MAINTENANT);

    const where = p.demandeRectification.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe("en_attente");
    expect(where.professionnelDestinataireId).toEqual({ not: null });
    expect(where.dateCreation.lt.getTime()).toBe(MAINTENANT.getTime() - 30 * 24 * 60 * 60 * 1000);
  });

  it("escalade chaque demande en retard et journalise, retourne le nombre escalade", async () => {
    p.demandeRectification.findMany.mockResolvedValue([
      { id: "demande-1", patient: { userId: "user-patient-1" } },
      { id: "demande-2", patient: { userId: "user-patient-2" } },
    ]);

    const nombre = await escaladerDemandesRectificationEnRetard(MAINTENANT);

    expect(nombre).toBe(2);
    expect(p.demandeRectification.update).toHaveBeenCalledTimes(2);
    expect(p.demandeRectification.update.mock.calls[0][0]).toMatchObject({
      where: { id: "demande-1" },
      data: { statut: "escaladee", dateEscalade: MAINTENANT },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(2);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-patient-1",
      action: "escalade_demande_rectification",
    });
  });

  it("ne fait rien si aucune demande n'est en retard", async () => {
    p.demandeRectification.findMany.mockResolvedValue([]);

    const nombre = await escaladerDemandesRectificationEnRetard(MAINTENANT);

    expect(nombre).toBe(0);
    expect(p.demandeRectification.update).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });
});
