import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    referentielSimple: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
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
  basculerActifEntreeReferentielSimpleAction,
  creerEntreeReferentielSimpleAction,
  getReferentielSimpleActif,
  getReferentielSimpleComplet,
  reordonnerEntreeReferentielSimpleAction,
} from "@/modules/administration/referentiels-simples";
import { REFERENTIELS_SIMPLES, TYPES_REFERENTIEL_SIMPLE } from "@/modules/administration/referentiels-simples-catalogue";

const p = prisma as unknown as {
  referentielSimple: {
    count: Mock;
    createMany: Mock;
    findMany: Mock;
    findUnique: Mock;
    create: Mock;
    update: Mock;
    delete: Mock;
    deleteMany: Mock;
    aggregate: Mock;
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

function ligne(id: string, ordre: number, surcharge: Record<string, unknown> = {}) {
  return {
    id,
    type: "service",
    code: id,
    libelle: `Libelle ${id}`,
    ordre,
    actif: true,
    dateModification: new Date("2026-09-27T10:00:00.000Z"),
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
  p.referentielSimple.count.mockResolvedValue(0);
  p.referentielSimple.createMany.mockResolvedValue({ count: 0 });
});

describe("catalogue des referentiels simples", () => {
  it("reprend les 15 services de la section 18.4 du pack", () => {
    expect(REFERENTIELS_SIMPLES.service.entreesParDefaut).toHaveLength(15);
    const codes = REFERENTIELS_SIMPLES.service.entreesParDefaut.map((entree) => entree.code);
    for (const attendu of ["medecine_generale", "pediatrie", "maternite", "urgences", "orl", "sante_mentale"]) {
      expect(codes).toContain(attendu);
    }
  });

  it("limite les types d'etablissement aux quatre valeurs que le depot traite", () => {
    expect(REFERENTIELS_SIMPLES.type_etablissement.entreesParDefaut.map((entree) => entree.code)).toEqual([
      "centre_sante",
      "hopital",
      "laboratoire",
      "pharmacie",
    ]);
  });

  it("n'a aucun code en double dans une meme liste et des codes bien formes", () => {
    for (const type of TYPES_REFERENTIEL_SIMPLE) {
      const codes = REFERENTIELS_SIMPLES[type].entreesParDefaut.map((entree) => entree.code);
      expect(new Set(codes).size).toBe(codes.length);
      expect(codes.every((code) => /^[a-z0-9_]+$/.test(code))).toBe(true);
    }
  });
});

describe("getReferentielSimpleComplet", () => {
  it("ne renvoie rien aux autres roles, ni pour un type inconnu", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect(await getReferentielSimpleComplet("service")).toEqual([]);

    getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
    expect(await getReferentielSimpleComplet("inconnu")).toEqual([]);
    expect(p.referentielSimple.findMany).not.toHaveBeenCalled();
  });

  it("seme les valeurs de depart absentes en une seule insertion groupee qui ignore les doublons, puis liste tout", async () => {
    p.referentielSimple.findMany.mockResolvedValue([ligne("a", 0), ligne("b", 1, { actif: false })]);

    const entrees = await getReferentielSimpleComplet("service");

    expect(p.referentielSimple.createMany).toHaveBeenCalledTimes(1);
    const appel = p.referentielSimple.createMany.mock.calls[0][0] as { data: { type: string; code: string; ordre: number }[]; skipDuplicates: boolean };
    expect(appel.skipDuplicates).toBe(true);
    expect(appel.data).toHaveLength(15);
    expect(appel.data.every((entree) => entree.type === "service")).toBe(true);
    expect(appel.data.map((entree) => entree.ordre)).toEqual(Array.from({ length: 15 }, (_, index) => index));
    expect(entrees).toHaveLength(2);
    expect(entrees[1].actif).toBe(false);
    expect(entrees[0].dateModification).toBe("2026-09-27T10:00:00.000Z");
  });
});

describe("getReferentielSimpleActif", () => {
  it("est ouverte a tout utilisateur connecte, refuse sans session et ne renvoie que les actifs", async () => {
    p.referentielSimple.findMany.mockResolvedValue([ligne("a", 0)]);

    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    expect(await getReferentielSimpleActif("specialite")).toEqual([{ code: "a", libelle: "Libelle a" }]);
    expect((p.referentielSimple.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ type: "specialite", actif: true });

    getSessionMock.mockResolvedValue(null);
    expect(await getReferentielSimpleActif("specialite")).toEqual([]);
  });

  it("renvoie une liste vide pour un type inconnu", async () => {
    expect(await getReferentielSimpleActif("n-importe-quoi")).toEqual([]);
  });

  it("ne fait qu'une requete de comptage, sans aucune ecriture, quand les valeurs de depart sont deja en base", async () => {
    p.referentielSimple.count.mockResolvedValue(15);
    p.referentielSimple.findMany.mockResolvedValue([]);

    await getReferentielSimpleActif("service");
    await getReferentielSimpleActif("service");

    expect(p.referentielSimple.count).toHaveBeenCalledTimes(2);
    expect(p.referentielSimple.createMany).not.toHaveBeenCalled();
  });
});

describe("creerEntreeReferentielSimpleAction", () => {
  beforeEach(() => {
    p.referentielSimple.findUnique.mockResolvedValue(null);
    p.referentielSimple.aggregate.mockResolvedValue({ _max: { ordre: 4 } });
    p.referentielSimple.create.mockResolvedValue({});
  });

  it("refuse tout autre role", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await creerEntreeReferentielSimpleAction(etatInitial, formulaire({ type: "service", code: "x", libelle: "X" }));

    expect(resultat.success).toBe(false);
    expect(p.referentielSimple.create).not.toHaveBeenCalled();
  });

  it("refuse un type inconnu, un code mal forme et un libelle vide ou trop long", async () => {
    const cas = [
      { type: "virus", code: "x", libelle: "X" },
      { type: "service", code: "Code avec espace", libelle: "X" },
      { type: "service", code: "", libelle: "X" },
      { type: "service", code: "x", libelle: "" },
      { type: "service", code: "x", libelle: "y".repeat(121) },
    ];

    for (const champs of cas) {
      expect((await creerEntreeReferentielSimpleAction(etatInitial, formulaire(champs))).success).toBe(false);
    }
    expect(p.referentielSimple.create).not.toHaveBeenCalled();
  });

  it("refuse un code deja present dans ce referentiel", async () => {
    p.referentielSimple.findUnique.mockResolvedValue({ id: "existant" });

    const resultat = await creerEntreeReferentielSimpleAction(etatInitial, formulaire({ type: "service", code: "urgences", libelle: "Urgences" }));

    expect(resultat.error).toContain("existe deja");
  });

  it("ajoute l'entree a la fin de la liste, active, code en minuscules, et la journalise", async () => {
    const resultat = await creerEntreeReferentielSimpleAction(
      etatInitial,
      formulaire({ type: "specialite", code: " DERMATOLOGIE ", libelle: " Dermatologie " })
    );

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.referentielSimple.create.mock.calls[0][0]).toEqual({
      data: { type: "specialite", code: "dermatologie", libelle: "Dermatologie", ordre: 5, actif: true },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-admin",
      action: "creation_referentiel_simple",
      donneeConcernee: "referentiel_simple:specialite:dermatologie",
    });
  });
});

describe("basculerActifEntreeReferentielSimpleAction (RG-ADM-20)", () => {
  it("refuse tout autre role et une entree inconnue", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect((await basculerActifEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "a" }))).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
    p.referentielSimple.findUnique.mockResolvedValue(null);
    expect((await basculerActifEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "a" }))).error).toContain("introuvable");
  });

  it("active et desactive sans jamais supprimer", async () => {
    for (const actifAvant of [true, false]) {
      p.referentielSimple.findUnique.mockResolvedValue(ligne("a", 0, { actif: actifAvant }));

      const resultat = await basculerActifEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "a" }));

      expect(resultat).toEqual({ error: null, success: true });
      const appel = p.referentielSimple.update.mock.calls.at(-1)?.[0] as { data: { actif: boolean } };
      expect(appel.data.actif).toBe(!actifAvant);
    }
    expect(p.referentielSimple.delete).not.toHaveBeenCalled();
    expect(p.referentielSimple.deleteMany).not.toHaveBeenCalled();
    expect(journaliserMock).toHaveBeenCalledTimes(2);
  });
});

describe("reordonnerEntreeReferentielSimpleAction", () => {
  beforeEach(() => {
    p.referentielSimple.findUnique.mockResolvedValue(ligne("b", 1));
    p.referentielSimple.findMany.mockResolvedValue([ligne("a", 0), ligne("b", 1), ligne("c", 2)]);
    p.referentielSimple.update.mockResolvedValue({});
  });

  it("refuse tout autre role et une direction inconnue", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect((await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "b", direction: "haut" }))).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
    expect((await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "b", direction: "gauche" }))).success).toBe(false);
    expect(p.referentielSimple.update).not.toHaveBeenCalled();
  });

  it("echange l'ordre avec le voisin du dessus", async () => {
    const resultat = await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "b", direction: "haut" }));

    expect(resultat).toEqual({ error: null, success: true });
    const ecritures = p.referentielSimple.update.mock.calls.map((appel) => appel[0] as { where: { id: string }; data: { ordre: number } });
    expect(ecritures).toContainEqual({ where: { id: "b" }, data: { ordre: 0 } });
    expect(ecritures).toContainEqual({ where: { id: "a" }, data: { ordre: 1 } });
    expect(ecritures.find((ecriture) => ecriture.where.id === "c")).toBeUndefined();
  });

  it("echange avec le voisin du dessous", async () => {
    await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "b", direction: "bas" }));

    const ecritures = p.referentielSimple.update.mock.calls.map((appel) => appel[0] as { where: { id: string }; data: { ordre: number } });
    expect(ecritures).toContainEqual({ where: { id: "b" }, data: { ordre: 2 } });
    expect(ecritures).toContainEqual({ where: { id: "c" }, data: { ordre: 1 } });
  });

  it("refuse de sortir de la liste par le haut ou par le bas", async () => {
    p.referentielSimple.findUnique.mockResolvedValue(ligne("a", 0));
    expect((await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "a", direction: "haut" }))).error).toContain("extremite");

    p.referentielSimple.findUnique.mockResolvedValue(ligne("c", 2));
    expect((await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "c", direction: "bas" }))).error).toContain("extremite");
    expect(p.referentielSimple.update).not.toHaveBeenCalled();
  });

  it("corrige des ordres egaux (creation concurrente) en reecrivant des ordres consecutifs", async () => {
    p.referentielSimple.findMany.mockResolvedValue([ligne("a", 0), ligne("b", 0), ligne("c", 0)]);
    p.referentielSimple.findUnique.mockResolvedValue(ligne("b", 0));

    await reordonnerEntreeReferentielSimpleAction(etatInitial, formulaire({ id: "b", direction: "haut" }));

    const ecritures = new Map(
      p.referentielSimple.update.mock.calls.map((appel) => [(appel[0] as { where: { id: string } }).where.id, (appel[0] as { data: { ordre: number } }).data.ordre])
    );
    // "b" est deja a 0 : pas de reecriture ; "a" et "c" recoivent 1 et 2, donc trois ordres distincts.
    const ordreFinal = (id: string) => ecritures.get(id) ?? 0;
    expect(ordreFinal("b")).toBe(0);
    expect(ordreFinal("a")).toBe(1);
    expect(ordreFinal("c")).toBe(2);
  });
});
