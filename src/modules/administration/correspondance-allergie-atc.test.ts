import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    correspondanceAllergieAtc: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
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
  basculerActifCorrespondanceAllergieAtcAction,
  creerCorrespondanceAllergieAtcAction,
  getCorrespondancesAllergieAtcActives,
  getCorrespondancesAllergieAtcCompletes,
} from "@/modules/administration/correspondance-allergie-atc";
import { DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC } from "@/modules/administration/correspondance-allergie-atc-catalogue";

const p = prisma as unknown as {
  correspondanceAllergieAtc: {
    count: Mock;
    createMany: Mock;
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
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

function ligne(surcharge: Record<string, unknown> = {}) {
  return {
    id: "corr-1",
    allergie: "penicilline",
    libelleClasse: "Pénicillines",
    prefixesAtc: "J01C",
    actif: true,
    dateModification: new Date("2026-09-29T10:00:00.000Z"),
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
  p.correspondanceAllergieAtc.count.mockResolvedValue(0);
  p.correspondanceAllergieAtc.createMany.mockResolvedValue({ count: 0 });
});

describe("catalogue de depart des correspondances allergie -> ATC", () => {
  it("reprend les classes citees par la section 18.4 du pack : penicillines, cephalosporines, sulfamides, AINS, aspirine, iode", () => {
    const allergies = DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC.map((entree) => entree.allergie);
    for (const attendue of ["penicilline", "cephalosporine", "sulfamide", "ains", "aspirine", "iode"]) {
      expect(allergies).toContain(attendue);
    }
  });

  it("n'a aucun terme d'allergie en double et au moins un prefixe ATC par entree", () => {
    const allergies = DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC.map((entree) => entree.allergie);
    expect(new Set(allergies).size).toBe(allergies.length);
    for (const entree of DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC) {
      expect(entree.prefixesAtc.length, entree.allergie).toBeGreaterThan(0);
      for (const prefixe of entree.prefixesAtc) {
        expect(prefixe, entree.allergie).toMatch(/^[A-Z0-9]{1,7}$/);
      }
    }
  });
});

describe("getCorrespondancesAllergieAtcCompletes", () => {
  it("est reservee a la ressource RBAC referentiel_medicament (admin_national) : liste vide pour un medecin", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    expect(await getCorrespondancesAllergieAtcCompletes()).toEqual([]);
    expect(p.correspondanceAllergieAtc.findMany).not.toHaveBeenCalled();
  });

  it("seme les valeurs de depart absentes puis liste tout, actives et desactivees", async () => {
    p.correspondanceAllergieAtc.findMany.mockResolvedValue([ligne(), ligne({ id: "corr-2", allergie: "iode", actif: false })]);

    const entrees = await getCorrespondancesAllergieAtcCompletes();

    expect(p.correspondanceAllergieAtc.createMany).toHaveBeenCalledTimes(1);
    const appel = p.correspondanceAllergieAtc.createMany.mock.calls[0][0] as {
      data: { allergie: string; prefixesAtc: string }[];
      skipDuplicates: boolean;
    };
    expect(appel.skipDuplicates).toBe(true);
    expect(appel.data).toHaveLength(DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC.length);

    expect(entrees).toHaveLength(2);
    expect(entrees[0].prefixesAtc).toEqual(["J01C"]);
    expect(entrees[1].actif).toBe(false);
  });
});

describe("getCorrespondancesAllergieAtcActives", () => {
  it("refuse sans session et ne renvoie que les entrees actives, prefixes eclates en tableau", async () => {
    p.correspondanceAllergieAtc.findMany.mockResolvedValue([ligne({ prefixesAtc: "J01E,P01BD" })]);

    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    const actives = await getCorrespondancesAllergieAtcActives();
    expect(actives).toEqual([{ allergie: "penicilline", libelleClasse: "Pénicillines", prefixesAtc: ["J01E", "P01BD"] }]);
    expect((p.correspondanceAllergieAtc.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ actif: true });

    getSessionMock.mockResolvedValue(null);
    expect(await getCorrespondancesAllergieAtcActives()).toEqual([]);
  });
});

describe("creerCorrespondanceAllergieAtcAction", () => {
  it("refuse hors du role admin_national", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await creerCorrespondanceAllergieAtcAction(
      etatInitial,
      formulaire({ allergie: "latex", libelleClasse: "Latex", prefixesAtc: "D01" })
    );

    expect(resultat.success).toBe(false);
    expect(p.correspondanceAllergieAtc.create).not.toHaveBeenCalled();
  });

  it("rejette un prefixe ATC mal forme", async () => {
    const resultat = await creerCorrespondanceAllergieAtcAction(
      etatInitial,
      formulaire({ allergie: "latex", libelleClasse: "Latex", prefixesAtc: "!!!" })
    );

    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/prefixe/i);
  });

  it("refuse une allergie deja liee a une classe", async () => {
    p.correspondanceAllergieAtc.findUnique.mockResolvedValue(ligne());

    const resultat = await creerCorrespondanceAllergieAtcAction(
      etatInitial,
      formulaire({ allergie: "Penicilline", libelleClasse: "Pénicillines", prefixesAtc: "J01C" })
    );

    expect(resultat.success).toBe(false);
    expect(p.correspondanceAllergieAtc.create).not.toHaveBeenCalled();
  });

  it("cree l'entree, normalise le terme d'allergie et journalise", async () => {
    p.correspondanceAllergieAtc.findUnique.mockResolvedValue(null);

    const resultat = await creerCorrespondanceAllergieAtcAction(
      etatInitial,
      formulaire({ allergie: " Latex ", libelleClasse: "Latex", prefixesAtc: "d01ag, D01AG" })
    );

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.correspondanceAllergieAtc.create).toHaveBeenCalledWith({
      data: { allergie: "latex", libelleClasse: "Latex", prefixesAtc: "D01AG", actif: true },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });
});

describe("basculerActifCorrespondanceAllergieAtcAction", () => {
  it("refuse hors du role admin_national", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await basculerActifCorrespondanceAllergieAtcAction(etatInitial, formulaire({ id: "corr-1" }));

    expect(resultat.success).toBe(false);
    expect(p.correspondanceAllergieAtc.update).not.toHaveBeenCalled();
  });

  it("inverse actif (RG-ADM-20 : jamais de suppression) et journalise", async () => {
    p.correspondanceAllergieAtc.findUnique.mockResolvedValue(ligne({ actif: true }));

    const resultat = await basculerActifCorrespondanceAllergieAtcAction(etatInitial, formulaire({ id: "corr-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.correspondanceAllergieAtc.update).toHaveBeenCalledWith({
      where: { id: "corr-1" },
      data: { actif: false, dateModification: expect.any(Date) },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });
});
