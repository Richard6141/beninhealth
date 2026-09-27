import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { rendezVous: { findFirst: vi.fn(), count: vi.fn() } } }));

import { prisma } from "@/lib/prisma";
import { verifierReglesReservation } from "./regles-reservation";
import { MESSAGE_MEME_JOUR, MESSAGE_PLAFOND_ATTEINT, MESSAGE_TROP_LOIN, MESSAGE_TROP_PROCHE } from "./regles-rendez-vous";

const prismaMock = prisma as unknown as { rendezVous: { findFirst: Mock; count: Mock } };

const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);
const JOUR = 24 * 3600_000;

const BASE = { patientId: "pat-1", etablissementId: "etab-1", maintenant: MAINTENANT };

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.rendezVous.findFirst.mockResolvedValue(null);
  prismaMock.rendezVous.count.mockResolvedValue(0);
});

describe("verifierReglesReservation", () => {
  it("accepte une demande dans la fenetre, sans autre rendez-vous", async () => {
    expect(await verifierReglesReservation({ ...BASE, date: dans(3 * JOUR) })).toBeNull();
  });

  it("refuse hors fenetre sans interroger la base", async () => {
    expect(await verifierReglesReservation({ ...BASE, date: dans(1800_000) })).toBe(MESSAGE_TROP_PROCHE);
    expect(await verifierReglesReservation({ ...BASE, date: dans(31 * JOUR) })).toBe(MESSAGE_TROP_LOIN);
    expect(prismaMock.rendezVous.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.rendezVous.count).not.toHaveBeenCalled();
  });

  it("refuse un second rendez-vous le meme jour local dans le meme etablissement (statuts actifs seulement)", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue({ id: "rdv-existant" });

    const message = await verifierReglesReservation({ ...BASE, date: dans(3 * JOUR) });

    expect(message).toBe(MESSAGE_MEME_JOUR);
    const { where } = prismaMock.rendezVous.findFirst.mock.calls[0][0];
    expect(where.patientId).toBe("pat-1");
    expect(where.etablissementId).toBe("etab-1");
    expect(where.statut).toEqual({ in: ["demande", "confirme", "en_consultation"] });
    expect(where.date.lt.getTime() - where.date.gte.getTime()).toBe(JOUR);
  });

  it("refuse au 4e rendez-vous futur actif (RG-RDV-02), accepte au 3e", async () => {
    prismaMock.rendezVous.count.mockResolvedValue(3);
    expect(await verifierReglesReservation({ ...BASE, date: dans(3 * JOUR) })).toBe(MESSAGE_PLAFOND_ATTEINT);

    prismaMock.rendezVous.count.mockResolvedValue(2);
    expect(await verifierReglesReservation({ ...BASE, date: dans(3 * JOUR) })).toBeNull();
    expect(prismaMock.rendezVous.count).toHaveBeenCalledWith({
      where: { patientId: "pat-1", date: { gt: MAINTENANT }, statut: { in: ["demande", "confirme", "en_consultation"] } },
    });
  });

  it("un deplacement ne compte pas le rendez-vous qu'il remplace", async () => {
    await verifierReglesReservation({ ...BASE, date: dans(3 * JOUR), rendezVousRemplaceId: "rdv-ancien" });

    expect(prismaMock.rendezVous.findFirst.mock.calls[0][0].where.id).toEqual({ not: "rdv-ancien" });
    expect(prismaMock.rendezVous.count.mock.calls[0][0].where.id).toEqual({ not: "rdv-ancien" });
  });

  it("au guichet : aucun delai minimum, horizon de 90 jours, mais memes plafonds", async () => {
    expect(await verifierReglesReservation({ ...BASE, date: dans(600_000), guichet: true })).toBeNull();
    expect(await verifierReglesReservation({ ...BASE, date: dans(60 * JOUR), guichet: true })).toBeNull();

    prismaMock.rendezVous.count.mockResolvedValue(3);
    expect(await verifierReglesReservation({ ...BASE, date: dans(600_000), guichet: true })).toBe(MESSAGE_PLAFOND_ATTEINT);
  });
});
