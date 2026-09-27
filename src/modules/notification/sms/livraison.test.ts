import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { envoiSms: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() } },
}));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  DELAIS_REPRISE_MINUTES,
  delaiAvantReprise,
  livrerSms,
  NOMBRE_MAXIMUM_TENTATIVES,
  relancerSmsEnAttente,
  tenterLivraison,
} from "@/modules/notification/sms/livraison";
import type { SmsProvider } from "@/modules/notification/sms/provider";

const p = prisma as unknown as { envoiSms: { create: Mock; updateMany: Mock; findUnique: Mock; update: Mock; findMany: Mock } };

const maintenant = new Date("2026-09-27T10:00:00.000Z");
const minutes = (n: number) => new Date(maintenant.getTime() + n * 60 * 1000);

const fournisseurOk: SmsProvider = { send: vi.fn(async () => ({ statut: "simule" as const })) };
const fournisseurEnPanne: SmsProvider = {
  send: vi.fn(async () => {
    throw new Error("passerelle indisponible\n   code 503");
  }),
};

function ligne(tentatives: number) {
  return { destinataire: "+22997000000", texte: "BHIP : test", categorie: "rendez_vous", modele: null, tentatives };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.envoiSms.updateMany.mockResolvedValue({ count: 1 });
  p.envoiSms.update.mockResolvedValue({});
  p.envoiSms.create.mockResolvedValue({ id: "sms-1" });
  p.envoiSms.findMany.mockResolvedValue([]);
});

describe("delais de reprise (RG-NOT-03)", () => {
  it("trois reprises apres 1, 5 puis 30 minutes, donc quatre tentatives au plus", () => {
    expect([...DELAIS_REPRISE_MINUTES]).toEqual([1, 5, 30]);
    expect(NOMBRE_MAXIMUM_TENTATIVES).toBe(4);
    expect([1, 2, 3, 4].map(delaiAvantReprise)).toEqual([1, 5, 30, null]);
    expect(delaiAvantReprise(0)).toBeNull();
  });
});

describe("tenterLivraison", () => {
  it("reclame la ligne echue par une mise a jour conditionnelle avec un bail, avant toute tentative", async () => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(1));

    await tenterLivraison("sms-1", fournisseurOk, maintenant);

    expect(p.envoiSms.updateMany).toHaveBeenCalledWith({
      where: { id: "sms-1", statut: "en_attente", prochaineTentativeLe: { lte: maintenant } },
      data: { tentatives: { increment: 1 }, prochaineTentativeLe: minutes(10) },
    });
  });

  it("succes : statut du fournisseur, plus de prochaine tentative ni d'erreur", async () => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(1));

    expect(await tenterLivraison("sms-1", fournisseurOk, maintenant)).toBe("livre");

    expect(p.envoiSms.update).toHaveBeenCalledWith({
      where: { id: "sms-1" },
      data: { statut: "simule", dateEnvoi: maintenant, prochaineTentativeLe: null, derniereErreur: null },
    });
  });

  it("une ligne deja reclamee par une autre instance est ignoree, sans appeler le fournisseur", async () => {
    p.envoiSms.updateMany.mockResolvedValue({ count: 0 });
    (fournisseurOk.send as Mock).mockClear();

    expect(await tenterLivraison("sms-1", fournisseurOk, maintenant)).toBe("ignore");

    expect(fournisseurOk.send).not.toHaveBeenCalled();
    expect(p.envoiSms.update).not.toHaveBeenCalled();
  });

  it.each([
    [1, 1],
    [2, 5],
    [3, 30],
  ])("echec de la tentative %i : reprise programmee dans %i minutes", async (tentative, delai) => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(tentative));

    expect(await tenterLivraison("sms-1", fournisseurEnPanne, maintenant)).toBe("reessai");

    const donnees = p.envoiSms.update.mock.calls[0][0].data;
    expect(donnees.prochaineTentativeLe).toEqual(minutes(delai));
    expect(donnees.statut).toBeUndefined();
  });

  it("echec de la quatrieme tentative : statut echec, plus de reprise (RG-NOT-03)", async () => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(4));

    expect(await tenterLivraison("sms-1", fournisseurEnPanne, maintenant)).toBe("echec");

    expect(p.envoiSms.update.mock.calls[0][0].data).toMatchObject({ statut: "echec", prochaineTentativeLe: null });
  });

  it("l'erreur conservee est le seul message technique, sur une ligne et tronque, sans texte ni destinataire", async () => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(1));
    const longue: SmsProvider = { send: vi.fn(async () => { throw new Error(`x${"y".repeat(500)}`); }) };

    await tenterLivraison("sms-1", longue, maintenant);
    await tenterLivraison("sms-1", fournisseurEnPanne, maintenant);

    const [premiere, seconde] = p.envoiSms.update.mock.calls.map((appel) => appel[0].data.derniereErreur as string);
    expect(premiere.length).toBeLessThanOrEqual(200);
    expect(seconde).toBe("passerelle indisponible code 503");
    expect(seconde).not.toContain("+229");
    expect(seconde).not.toContain("BHIP");
  });

  it("une ligne disparue apres la reclamation est ignoree", async () => {
    p.envoiSms.findUnique.mockResolvedValue(null);

    expect(await tenterLivraison("sms-1", fournisseurOk, maintenant)).toBe("ignore");
  });
});

describe("livrerSms", () => {
  it("depose la ligne en attente puis tente aussitot ; un echec du fournisseur ne remonte jamais a l'appelant", async () => {
    p.envoiSms.findUnique.mockResolvedValue(ligne(1));

    await expect(livrerSms({ destinataire: "+22997000000", texte: "BHIP : test", categorie: "rendez_vous", modele: null }, fournisseurEnPanne, maintenant)).resolves.toBeUndefined();

    expect(p.envoiSms.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ statut: "en_attente", tentatives: 0, prochaineTentativeLe: maintenant }),
      select: { id: true },
    });
    expect(p.envoiSms.update.mock.calls[0][0].data.prochaineTentativeLe).toEqual(minutes(1));
  });
});

describe("relancerSmsEnAttente", () => {
  it("ne reprend que les lignes en attente dont l'echeance est atteinte", async () => {
    await relancerSmsEnAttente(fournisseurOk, maintenant);

    expect(p.envoiSms.findMany).toHaveBeenCalledWith({
      where: { statut: "en_attente", prochaineTentativeLe: { lte: maintenant } },
      select: { id: true },
      take: 100,
    });
  });

  it("compte les lignes traitees, pas celles qu'une autre instance a deja prises", async () => {
    p.envoiSms.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.envoiSms.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    p.envoiSms.findUnique.mockResolvedValue(ligne(1));

    expect(await relancerSmsEnAttente(fournisseurOk, maintenant)).toBe(1);
  });

  it("scenario complet : quatre echecs successifs menent a l'etat echec, jamais a une cinquieme tentative", async () => {
    const etats: string[] = [];
    for (const tentative of [1, 2, 3, 4]) {
      p.envoiSms.findUnique.mockResolvedValue(ligne(tentative));
      etats.push(await tenterLivraison("sms-1", fournisseurEnPanne, maintenant));
    }

    expect(etats).toEqual(["reessai", "reessai", "reessai", "echec"]);
  });
});
