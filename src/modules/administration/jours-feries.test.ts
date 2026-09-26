import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    jourFerie: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      createMany: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  basculerActifJourFerieAction,
  creerJourFerieAction,
  genererJoursFeriesAction,
  getJoursFeries,
} from "@/modules/administration/jours-feries";

const p = prisma as unknown as {
  jourFerie: {
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
    delete: Mock;
    deleteMany: Mock;
    createMany: Mock;
    upsert: Mock;
  };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
});

describe("getJoursFeries", () => {
  it("ne renvoie rien aux autres roles", async () => {
    for (const role of ["medecin", "patient", "admin_etablissement", "pharmacien"]) {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      expect(await getJoursFeries(2026)).toEqual([]);
    }
    expect(p.jourFerie.findMany).not.toHaveBeenCalled();
  });

  it("refuse une annee hors plage ou non entiere sans interroger la base", async () => {
    for (const annee of [2019, 2101, 2026.5, Number.NaN]) {
      expect(await getJoursFeries(annee)).toEqual([]);
    }
    expect(p.jourFerie.findMany).not.toHaveBeenCalled();
  });

  it("borne la lecture a l'annee demandee et renvoie des jours civils", async () => {
    p.jourFerie.findMany.mockResolvedValue([
      { id: "j1", date: new Date("2026-12-25T00:00:00.000Z"), libelle: "Noël", actif: true, source: "genere" },
    ]);

    const jours = await getJoursFeries(2026);

    const requete = p.jourFerie.findMany.mock.calls[0][0] as { where: { date: { gte: Date; lte: Date } } };
    expect(requete.where.date.gte.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(requete.where.date.lte.toISOString()).toBe("2026-12-31T00:00:00.000Z");
    expect(jours).toEqual([{ id: "j1", date: "2026-12-25", libelle: "Noël", actif: true, source: "genere" }]);
  });
});

describe("creerJourFerieAction", () => {
  beforeEach(() => {
    p.jourFerie.findUnique.mockResolvedValue(null);
    p.jourFerie.create.mockResolvedValue({ id: "j1" });
  });

  it("refuse tout autre role que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await creerJourFerieAction(etatInitial, formulaire({ date: "2026-10-01", libelle: "Test" }));

    expect(resultat.success).toBe(false);
    expect(p.jourFerie.create).not.toHaveBeenCalled();
  });

  it("refuse les dates impossibles ou mal formees et les libelles vides ou trop longs", async () => {
    const cas = [
      { date: "2026-02-30", libelle: "Faux" },
      { date: "27/09/2026", libelle: "Faux" },
      { date: "", libelle: "Faux" },
      { date: "2026-10-01", libelle: "" },
      { date: "2026-10-01", libelle: "x".repeat(101) },
    ];

    for (const champs of cas) {
      expect((await creerJourFerieAction(etatInitial, formulaire(champs))).success).toBe(false);
    }
    expect(p.jourFerie.create).not.toHaveBeenCalled();
  });

  it("refuse une date qui existe deja", async () => {
    p.jourFerie.findUnique.mockResolvedValue({ id: "existant" });

    const resultat = await creerJourFerieAction(etatInitial, formulaire({ date: "2026-08-25", libelle: "Maouloud" }));

    expect(resultat.error).toContain("existe deja");
    expect(p.jourFerie.create).not.toHaveBeenCalled();
  });

  it("cree un jour ferie actif, saisi a la main, et le journalise", async () => {
    const resultat = await creerJourFerieAction(etatInitial, formulaire({ date: "2026-08-25", libelle: " Maouloud " }));

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = p.jourFerie.create.mock.calls[0][0] as { data: { date: Date; libelle: string; actif: boolean; source: string } };
    expect(data.date.toISOString()).toBe("2026-08-25T00:00:00.000Z");
    expect(data).toMatchObject({ libelle: "Maouloud", actif: true, source: "saisie" });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-admin",
      action: "creation_referentiel_jours_feries",
      donneeConcernee: "referentiel_jours_feries:2026-08-25",
    });
  });
});

describe("basculerActifJourFerieAction (RG-ADM-20)", () => {
  it("refuse tout autre role", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await basculerActifJourFerieAction(etatInitial, formulaire({ id: "j1" }));

    expect(resultat.success).toBe(false);
    expect(p.jourFerie.update).not.toHaveBeenCalled();
  });

  it("refuse un identifiant inconnu", async () => {
    p.jourFerie.findUnique.mockResolvedValue(null);

    const resultat = await basculerActifJourFerieAction(etatInitial, formulaire({ id: "inconnu" }));

    expect(resultat.error).toContain("introuvable");
  });

  it("desactive un jour actif et reactive un jour desactive, sans jamais supprimer", async () => {
    for (const actifAvant of [true, false]) {
      p.jourFerie.findUnique.mockResolvedValue({
        id: "j1",
        date: new Date("2026-12-25T00:00:00.000Z"),
        libelle: "Noël",
        actif: actifAvant,
      });

      const resultat = await basculerActifJourFerieAction(etatInitial, formulaire({ id: "j1" }));

      expect(resultat).toEqual({ error: null, success: true });
      const appel = p.jourFerie.update.mock.calls.at(-1)?.[0] as { where: { id: string }; data: { actif: boolean } };
      expect(appel.where).toEqual({ id: "j1" });
      expect(appel.data.actif).toBe(!actifAvant);
    }
    expect(p.jourFerie.delete).not.toHaveBeenCalled();
    expect(p.jourFerie.deleteMany).not.toHaveBeenCalled();
    expect(journaliserMock).toHaveBeenCalledTimes(2);
  });
});

describe("genererJoursFeriesAction", () => {
  beforeEach(() => {
    p.jourFerie.createMany.mockResolvedValue({ count: 10 });
  });

  it("refuse tout autre role et une annee hors plage", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect((await genererJoursFeriesAction(etatInitial, formulaire({ annee: "2026" }))).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
    for (const annee of ["2019", "2101", "abc", "2026.5", ""]) {
      expect((await genererJoursFeriesAction(etatInitial, formulaire({ annee }))).success).toBe(false);
    }
    expect(p.jourFerie.createMany).not.toHaveBeenCalled();
  });

  it("ajoute les dix jours de l'annee comme generes, sans jamais ecraser une date deja presente", async () => {
    const resultat = await genererJoursFeriesAction(etatInitial, formulaire({ annee: "2026" }));

    expect(resultat).toEqual({ error: null, success: true, nombreAjoutes: 10 });

    const appel = p.jourFerie.createMany.mock.calls[0][0] as {
      data: { date: Date; libelle: string; actif: boolean; source: string }[];
      skipDuplicates: boolean;
    };
    expect(appel.skipDuplicates).toBe(true);
    expect(appel.data).toHaveLength(10);
    expect(appel.data.every((jour) => jour.source === "genere" && jour.actif)).toBe(true);
    expect(appel.data.map((jour) => jour.date.toISOString().slice(0, 10))).toContain("2026-04-06");
    expect(p.jourFerie.update).not.toHaveBeenCalled();
    expect(p.jourFerie.upsert).not.toHaveBeenCalled();
  });

  it("rapporte le nombre de jours reellement ajoutes quand une partie existait deja", async () => {
    p.jourFerie.createMany.mockResolvedValue({ count: 4 });

    const resultat = await genererJoursFeriesAction(etatInitial, formulaire({ annee: "2026" }));

    expect(resultat.nombreAjoutes).toBe(4);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "generation_referentiel_jours_feries" });
    expect((journaliserMock.mock.calls[0][0] as { justification: string }).justification).toContain("4 ajoute(s) sur 10");
  });
});
