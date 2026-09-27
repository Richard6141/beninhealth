import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/** Expiration des demandes de rendez-vous sans reponse (F-RDV-03, RG-RDV-20). */

vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { rendezVous: { findMany: vi.fn(), updateMany: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { creerNotification } from "@/modules/notification/creer";
import { expirerDemandesSansReponse } from "./expiration-demandes";

const prismaMock = prisma as unknown as { rendezVous: { findMany: Mock; updateMany: Mock } };
const notificationMock = creerNotification as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const HEURE = 3600_000;
const JOUR = 24 * HEURE;
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);

function demande(id: string, dateCreation: Date, date: Date) {
  return { id, dateCreation, date, patient: { userId: `user-${id}` }, etablissement: { nom: "CS Akpakpa" } };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 1 });
});

describe("expirerDemandesSansReponse", () => {
  it("cherche les demandes dont un des deux delais est ecoule", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([]);

    await expirerDemandesSansReponse(MAINTENANT);

    expect(prismaMock.rendezVous.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          statut: "demande",
          OR: [{ dateCreation: { lte: dans(-JOUR) } }, { date: { lte: dans(HEURE) } }],
        },
      })
    );
  });

  it("expire une demande de plus de 24 heures et previent le patient", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([demande("a", dans(-JOUR - 1000), dans(10 * JOUR))]);

    const nombre = await expirerDemandesSansReponse(MAINTENANT);

    expect(nombre).toBe(1);
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "a", statut: { in: ["demande"] } },
      data: { statut: "expire" },
    });
    expect(notificationMock).toHaveBeenCalledWith("user-a", "rendez_vous_expire", expect.stringContaining("CS Akpakpa"), "/app/patient/rendez-vous");
  });

  it("expire une demande dont le creneau est dans moins d'1 heure, meme toute recente", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([demande("b", dans(-2 * HEURE), dans(30 * 60_000))]);

    expect(await expirerDemandesSansReponse(MAINTENANT)).toBe(1);
  });

  it("laisse une demande recente dont le creneau est lointain (le filtre de base est revalide par la regle pure)", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([demande("c", dans(-HEURE), dans(10 * JOUR))]);

    expect(await expirerDemandesSansReponse(MAINTENANT)).toBe(0);
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("ne previent pas quand la demande a ete traitee entre la lecture et l'ecriture", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([demande("d", dans(-JOUR - 1000), dans(10 * JOUR))]);
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    expect(await expirerDemandesSansReponse(MAINTENANT)).toBe(0);
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("traite chaque demande independamment et survit a une notification en echec", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([
      demande("e", dans(-JOUR - 1000), dans(10 * JOUR)),
      demande("f", dans(-JOUR - 2000), dans(11 * JOUR)),
    ]);
    notificationMock.mockRejectedValueOnce(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await expirerDemandesSansReponse(MAINTENANT)).toBe(2);
    expect(notificationMock).toHaveBeenCalledTimes(2);
  });
});
