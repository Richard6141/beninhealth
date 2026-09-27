import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { appelIa: { updateMany: vi.fn(), count: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { assemblerStatistiques, compterAppelsDeLHeure, purgerCommentairesRetourExpires, statistiquesAppelsIa } from "@/modules/ai/journal";

const p = prisma as unknown as { appelIa: { updateMany: Mock; count: Mock; groupBy: Mock; aggregate: Mock } };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("assemblerStatistiques (F-IA-05)", () => {
  it("calcule les taux de retours inexacts et de puces supprimees", () => {
    const stats = assemblerStatistiques({
      parStatut: [
        { valeur: "ok", nombre: 8 },
        { valeur: "indisponible", nombre: 1 },
        { valeur: "bloque", nombre: 1 },
      ],
      parRetour: [
        { valeur: "utile", nombre: 3 },
        { valeur: "inexact", nombre: 1 },
      ],
      pucesLues: 50,
      pucesSupprimees: 5,
      dureeMoyenneMs: 12.4,
    });

    expect(stats).toMatchObject({
      appels: 10,
      ok: 8,
      indisponibles: 1,
      bloques: 1,
      erreurs: 0,
      retoursUtiles: 3,
      retoursInexacts: 1,
      tauxInexact: 0.25,
      tauxPucesSupprimees: 0.1,
      dureeMoyenneMs: 12,
    });
  });

  it("ne divise jamais par zero : taux nuls quand rien n'a ete note ni lu", () => {
    const stats = assemblerStatistiques({ parStatut: [], parRetour: [], pucesLues: 0, pucesSupprimees: 0, dureeMoyenneMs: null });

    expect(stats.appels).toBe(0);
    expect(stats.tauxInexact).toBeNull();
    expect(stats.tauxPucesSupprimees).toBeNull();
    expect(stats.dureeMoyenneMs).toBeNull();
  });
});

describe("acces base du journal IA", () => {
  it("compte les appels de la derniere heure du seul utilisateur concerne", async () => {
    p.appelIa.count.mockResolvedValue(4);
    const maintenant = new Date("2026-09-27T12:00:00.000Z");

    expect(await compterAppelsDeLHeure("u-1", "resume_dossier", maintenant)).toBe(4);

    expect(p.appelIa.count).toHaveBeenCalledWith({
      where: { utilisateurId: "u-1", fonctionnalite: "resume_dossier", date: { gte: new Date("2026-09-27T11:00:00.000Z") } },
    });
  });

  it("purge uniquement le commentaire libre des lignes de plus de 30 jours, jamais la ligne (RG-IA-08)", async () => {
    p.appelIa.updateMany.mockResolvedValue({ count: 2 });

    const nombre = await purgerCommentairesRetourExpires(new Date("2026-09-27T12:00:00.000Z"));

    expect(nombre).toBe(2);
    expect(p.appelIa.updateMany).toHaveBeenCalledWith({
      where: { commentaireRetour: { not: null }, date: { lt: new Date("2026-08-28T12:00:00.000Z") } },
      data: { commentaireRetour: null },
    });
  });

  it("statistiquesAppelsIa agrege par statut, retour, puces et duree depuis la date donnee", async () => {
    p.appelIa.groupBy
      .mockResolvedValueOnce([{ statut: "ok", _count: { _all: 3 } }])
      .mockResolvedValueOnce([{ retour: "inexact", _count: { _all: 1 } }]);
    p.appelIa.aggregate.mockResolvedValue({ _sum: { pucesLues: 12, pucesSupprimees: 3 }, _avg: { dureeMs: 20 } });

    const stats = await statistiquesAppelsIa("resume_dossier", new Date("2026-09-01T00:00:00.000Z"));

    expect(stats).toMatchObject({ appels: 3, ok: 3, retoursInexacts: 1, tauxInexact: 1, tauxPucesSupprimees: 0.25, dureeMoyenneMs: 20 });
    expect(p.appelIa.groupBy.mock.calls[0][0].where).toEqual({ fonctionnalite: "resume_dossier", date: { gte: new Date("2026-09-01T00:00:00.000Z") } });
  });
});
