import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de src/modules/facility/disponibilites.ts (F-ETA-05, perimetre
 * reduit). Prisma et session mockes, meme approche que
 * src/modules/audit/integrite.test.ts.
 */

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findUnique: vi.fn() },
    creneauDisponibilite: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { ajouterCreneauAction } from "./disponibilites";
import { dateDansUnCreneauDisponible } from "./creneau-disponible";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  creneauDisponibilite: { findMany: Mock; create: Mock; findUnique: Mock; delete: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function creerFormData(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("dateDansUnCreneauDisponible (RG-ETA-43, fuseau Africa/Porto-Novo)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("autorise tout si aucun creneau n'est configure (limite assumee documentee)", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([]);
    const resultat = await dateDansUnCreneauDisponible("prof-1", new Date("2026-09-28T10:00:00.000Z"));
    expect(resultat).toBe(true);
  });

  it("autorise un instant a l'interieur d'un creneau defini, en tenant compte du decalage UTC+1", async () => {
    // Lundi 28/09/2026, creneau local 08:00-12:00 (Porto-Novo, UTC+1).
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { jourSemaine: 1, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    // 09:00 UTC == 10:00 heure locale Porto-Novo, dans le creneau.
    const resultat = await dateDansUnCreneauDisponible("prof-1", new Date("2026-09-28T09:00:00.000Z"));
    expect(resultat).toBe(true);
  });

  it("refuse un instant hors du creneau (heure)", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { jourSemaine: 1, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    // 13:00 UTC == 14:00 heure locale, hors creneau.
    const resultat = await dateDansUnCreneauDisponible("prof-1", new Date("2026-09-28T13:00:00.000Z"));
    expect(resultat).toBe(false);
  });

  it("refuse un instant hors du creneau (mauvais jour)", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { jourSemaine: 2, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    const resultat = await dateDansUnCreneauDisponible("prof-1", new Date("2026-09-28T09:00:00.000Z"));
    expect(resultat).toBe(false);
  });

  it("la borne de fin est exclusive", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { jourSemaine: 1, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    // 11:00 UTC == 12:00 heure locale pile, exclu.
    const resultat = await dateDansUnCreneauDisponible("prof-1", new Date("2026-09-28T11:00:00.000Z"));
    expect(resultat).toBe(false);
  });
});

describe("ajouterCreneauAction (RG-ETA-40, chevauchement)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
    prismaMock.professionnelSante.findUnique
      .mockResolvedValueOnce({ id: "admin-prof-1", etablissementId: "etab-1" }) // admin lui-meme
      .mockResolvedValueOnce({ id: "prof-cible", etablissementId: "etab-1" }); // professionnel cible
    prismaMock.creneauDisponibilite.create.mockResolvedValue({ id: "creneau-nouveau" });
  });

  it("rejette un creneau qui chevauche un creneau existant le meme jour", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    const resultat = await ajouterCreneauAction(
      { error: null, success: false },
      creerFormData({ professionnelId: "prof-cible", jourSemaine: "1", heureDebut: "10:00", heureFin: "14:00" })
    );
    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/chevauche/);
    expect(prismaMock.creneauDisponibilite.create).not.toHaveBeenCalled();
  });

  it("accepte un creneau qui ne chevauche pas un creneau existant le meme jour", async () => {
    prismaMock.creneauDisponibilite.findMany.mockResolvedValue([
      { heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 },
    ]);
    const resultat = await ajouterCreneauAction(
      { error: null, success: false },
      creerFormData({ professionnelId: "prof-cible", jourSemaine: "1", heureDebut: "13:00", heureFin: "17:00" })
    );
    expect(resultat.success).toBe(true);
    expect(prismaMock.creneauDisponibilite.create).toHaveBeenCalled();
  });

  it("rejette si l'heure de fin n'est pas apres l'heure de debut", async () => {
    const resultat = await ajouterCreneauAction(
      { error: null, success: false },
      creerFormData({ professionnelId: "prof-cible", jourSemaine: "1", heureDebut: "14:00", heureFin: "10:00" })
    );
    expect(resultat.success).toBe(false);
  });

  it("rejette si l'appelant ne gere pas ce professionnel (etablissement different)", async () => {
    prismaMock.professionnelSante.findUnique.mockReset();
    prismaMock.professionnelSante.findUnique
      .mockResolvedValueOnce({ id: "admin-prof-1", etablissementId: "etab-1" })
      .mockResolvedValueOnce({ id: "prof-autre-etab", etablissementId: "etab-AUTRE" });
    const resultat = await ajouterCreneauAction(
      { error: null, success: false },
      creerFormData({ professionnelId: "prof-autre-etab", jourSemaine: "1", heureDebut: "08:00", heureFin: "12:00" })
    );
    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/gérez pas/);
  });
});
