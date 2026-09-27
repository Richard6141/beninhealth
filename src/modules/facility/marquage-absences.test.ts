import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Marquage automatique des absences (RG-RDV-40) et cloture des visites
 * abandonnees (RG-RDV-41, ajoutee le 2026-09-27) : aucun test n'existait
 * pour ce fichier avant ce jour.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rendezVous: { updateMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { cloturerVisitesAbandonnees, marquerAbsencesDues } from "./marquage-absences";

const p = prisma as unknown as { rendezVous: { updateMany: Mock } };

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  p.rendezVous.updateMany.mockResolvedValue({ count: 0 });
});

describe("marquerAbsencesDues (RG-RDV-40)", () => {
  it("cherche les rendez-vous confirmes sans arrivee, dans la fenetre de 1h a 3 jours", async () => {
    await marquerAbsencesDues(MAINTENANT);

    expect(p.rendezVous.updateMany).toHaveBeenCalledWith({
      where: {
        heureArrivee: null,
        date: { gte: new Date("2026-09-24T12:00:00.000Z"), lt: new Date("2026-09-27T11:00:00.000Z") },
        statut: { in: ["confirme"] },
      },
      data: { statut: "absent" },
    });
  });

  it("renvoie le nombre de rendez-vous marques absents", async () => {
    p.rendezVous.updateMany.mockResolvedValue({ count: 3 });
    expect(await marquerAbsencesDues(MAINTENANT)).toBe(3);
  });
});

describe("cloturerVisitesAbandonnees (RG-RDV-41)", () => {
  it("ne cherche que les visites en_consultation, arrivees il y a 24h a 10 jours", async () => {
    await cloturerVisitesAbandonnees(MAINTENANT);

    expect(p.rendezVous.updateMany).toHaveBeenCalledWith({
      where: {
        statut: "en_consultation",
        heureArrivee: { gte: new Date("2026-09-17T12:00:00.000Z"), lt: new Date("2026-09-26T12:00:00.000Z") },
      },
      data: { statut: "termine" },
    });
  });

  it("ne touche jamais un rendez-vous confirme (arrive mais jamais pris en charge), meme ancien", async () => {
    await cloturerVisitesAbandonnees(MAINTENANT);

    const appel = p.rendezVous.updateMany.mock.calls[0][0];
    expect(appel.where.statut).toBe("en_consultation");
    expect(appel.where.statut).not.toBe("confirme");
  });

  it("renvoie le nombre de visites cloturees", async () => {
    p.rendezVous.updateMany.mockResolvedValue({ count: 2 });
    expect(await cloturerVisitesAbandonnees(MAINTENANT)).toBe(2);
  });
});
