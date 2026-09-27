import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { envoiSms: { findMany: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { remettreSmsDifferes } from "@/modules/notification/sms/remise-differes";
import type { SmsProvider } from "@/modules/notification/sms/provider";

const p = prisma as unknown as { envoiSms: { findMany: Mock; updateMany: Mock; findUnique: Mock; update: Mock } };

const maintenant = new Date("2026-09-27T06:00:00.000Z");
const fournisseur: SmsProvider = { send: vi.fn(async () => ({ statut: "simule" as const })) };

beforeEach(() => {
  vi.clearAllMocks();
  p.envoiSms.update.mockResolvedValue({});
  p.envoiSms.findUnique.mockResolvedValue({ destinataire: "+22997000000", texte: "BHIP : test", categorie: "rendez_vous", modele: null, tentatives: 1 });
});

describe("remettreSmsDifferes (F-NOT-02, RG-NOT-04)", () => {
  it("ne cherche que les SMS differes dont la date programmee est atteinte", async () => {
    p.envoiSms.findMany.mockResolvedValue([]);

    const remis = await remettreSmsDifferes(maintenant, fournisseur);

    expect(remis).toBe(0);
    expect(p.envoiSms.findMany).toHaveBeenCalledWith({
      where: { statut: "differe", dateProgrammee: { lte: maintenant } },
      select: { id: true },
    });
    expect(p.envoiSms.updateMany).not.toHaveBeenCalled();
  });

  it("remet chaque SMS echu : passage en attente puis livraison tentee tout de suite (RG-NOT-03)", async () => {
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.envoiSms.updateMany.mockResolvedValue({ count: 1 });

    const remis = await remettreSmsDifferes(maintenant, fournisseur);

    expect(remis).toBe(2);
    expect(p.envoiSms.updateMany).toHaveBeenCalledWith({
      where: { id: "a", statut: "differe" },
      data: { statut: "en_attente", tentatives: 0, prochaineTentativeLe: maintenant, dateEnvoi: maintenant },
    });
    expect(fournisseur.send).toHaveBeenCalledTimes(2);
    expect(p.envoiSms.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a" }, data: expect.objectContaining({ statut: "simule" }) }));
  });

  it("ne compte pas un SMS deja remis entre-temps par une autre instance (reclamation conditionnelle)", async () => {
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.envoiSms.updateMany
      .mockResolvedValueOnce({ count: 0 })
      // 2e reclamation (id b : differe -> en_attente), puis celle de la tentative de livraison.
      .mockResolvedValue({ count: 1 });

    const remis = await remettreSmsDifferes(maintenant, fournisseur);

    expect(remis).toBe(1);
    expect(fournisseur.send).toHaveBeenCalledTimes(1);
  });

  it("un fournisseur en panne ne fait pas echouer la remise : la ligne reste en reprise", async () => {
    const enPanne: SmsProvider = { send: vi.fn(async () => { throw new Error("indisponible"); }) };
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }]);
    p.envoiSms.updateMany.mockResolvedValue({ count: 1 });

    await expect(remettreSmsDifferes(maintenant, enPanne)).resolves.toBe(1);

    expect(p.envoiSms.update.mock.calls[0][0].data.prochaineTentativeLe).toEqual(new Date(maintenant.getTime() + 60 * 1000));
  });
});
