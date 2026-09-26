import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { envoiSms: { findMany: vi.fn(), updateMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { remettreSmsDifferes } from "@/modules/notification/sms/remise-differes";

const p = prisma as unknown as { envoiSms: { findMany: Mock; updateMany: Mock } };

const maintenant = new Date("2026-09-27T06:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("remettreSmsDifferes (F-NOT-02, RG-NOT-04)", () => {
  it("ne cherche que les SMS differes dont la date programmee est atteinte", async () => {
    p.envoiSms.findMany.mockResolvedValue([]);

    const remis = await remettreSmsDifferes(maintenant);

    expect(remis).toBe(0);
    expect(p.envoiSms.findMany).toHaveBeenCalledWith({
      where: { statut: "differe", dateProgrammee: { lte: maintenant } },
      select: { id: true },
    });
    expect(p.envoiSms.updateMany).not.toHaveBeenCalled();
  });

  it("remet chaque SMS echu : statut simule et date d'envoi a l'instant de la remise", async () => {
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.envoiSms.updateMany.mockResolvedValue({ count: 1 });

    const remis = await remettreSmsDifferes(maintenant);

    expect(remis).toBe(2);
    expect(p.envoiSms.updateMany).toHaveBeenCalledWith({
      where: { id: "a", statut: "differe" },
      data: { statut: "simule", dateEnvoi: maintenant },
    });
    expect(p.envoiSms.updateMany).toHaveBeenCalledWith({
      where: { id: "b", statut: "differe" },
      data: { statut: "simule", dateEnvoi: maintenant },
    });
  });

  it("ne compte pas un SMS deja remis entre-temps par une autre instance (reclamation conditionnelle)", async () => {
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.envoiSms.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const remis = await remettreSmsDifferes(maintenant);

    expect(remis).toBe(1);
  });
});
