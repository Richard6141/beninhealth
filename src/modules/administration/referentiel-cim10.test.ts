import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    diagnosticCim10: {
      count: vi.fn(),
      createMany: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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
  basculerDiagnosticCim10Action,
  creerDiagnosticCim10Action,
  getReferentielCim10Complet,
  rechercherDiagnosticsCim10,
} from "@/modules/administration/referentiel-cim10";
import { DIAGNOSTICS_CIM10_PAR_DEFAUT } from "@/modules/administration/cim10-catalogue";

const p = prisma as unknown as {
  diagnosticCim10: { count: Mock; createMany: Mock; findMany: Mock; findUnique: Mock; create: Mock; update: Mock; delete: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function diagnostic(code: string, libelle: string, surcharge: Record<string, unknown> = {}) {
  return {
    id: `id-${code}`,
    code,
    libelle,
    chapitre: "I. Maladies infectieuses et parasitaires",
    groupeMaladie: "autre",
    sensible: false,
    actif: true,
    ...surcharge,
  };
}

const BASE = [
  diagnostic("A09", "Diarrhée et gastro-entérite d'origine présumée infectieuse", { groupeMaladie: "diarrhee" }),
  diagnostic("B20", "Maladie due au VIH", { groupeMaladie: "vih", sensible: true }),
  diagnostic("B50", "Paludisme à Plasmodium falciparum", { groupeMaladie: "paludisme" }),
  diagnostic("B54", "Paludisme, sans précision", { groupeMaladie: "paludisme" }),
  diagnostic("R50.9", "Fièvre, sans précision"),
  diagnostic("Z34", "Surveillance d'une grossesse normale", { actif: false }),
];

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
  p.diagnosticCim10.count.mockResolvedValue(0);
  p.diagnosticCim10.createMany.mockResolvedValue({ count: 0 });
});

describe("getReferentielCim10Complet", () => {
  it("ne renvoie rien aux autres roles", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    expect(await getReferentielCim10Complet()).toEqual([]);
    expect(p.diagnosticCim10.findMany).not.toHaveBeenCalled();
  });

  it("seme la sous-liste en une seule insertion groupee qui ignore les doublons, groupe, chapitre et caractere sensible deduits du code", async () => {
    p.diagnosticCim10.findMany.mockResolvedValue(BASE);

    await getReferentielCim10Complet();

    expect(p.diagnosticCim10.createMany).toHaveBeenCalledTimes(1);
    const appel = p.diagnosticCim10.createMany.mock.calls[0][0] as {
      data: { code: string; groupeMaladie: string; sensible: boolean; chapitre: string }[];
      skipDuplicates: boolean;
    };
    expect(appel.skipDuplicates).toBe(true);
    expect(appel.data).toHaveLength(DIAGNOSTICS_CIM10_PAR_DEFAUT.length);
    expect(appel.data.find((entree) => entree.code === "B20")).toMatchObject({ groupeMaladie: "vih", sensible: true });
    expect(appel.data.find((entree) => entree.code === "B50")).toMatchObject({ groupeMaladie: "paludisme", sensible: false });
    expect(appel.data.find((entree) => entree.code === "O04")?.sensible).toBe(true);
    expect(appel.data.every((entree) => entree.chapitre.length > 0)).toBe(true);
  });

  it("ne fait qu'un comptage, sans ecriture, quand la sous-liste de depart est deja en base", async () => {
    p.diagnosticCim10.count.mockResolvedValue(DIAGNOSTICS_CIM10_PAR_DEFAUT.length);
    p.diagnosticCim10.findMany.mockResolvedValue(BASE);

    await getReferentielCim10Complet();

    expect(p.diagnosticCim10.count).toHaveBeenCalledTimes(1);
    expect(p.diagnosticCim10.createMany).not.toHaveBeenCalled();
  });

  it("filtre par un texte sans tenir compte des accents ni de la casse, actifs et desactives confondus", async () => {
    p.diagnosticCim10.findMany.mockResolvedValue(BASE);

    expect((await getReferentielCim10Complet("DIARRHEE")).map((entree) => entree.code)).toEqual(["A09"]);
    expect((await getReferentielCim10Complet("b5")).map((entree) => entree.code)).toEqual(["B50", "B54"]);
    expect((await getReferentielCim10Complet("grossesse")).map((entree) => entree.code)).toEqual(["Z34"]);
    expect(await getReferentielCim10Complet("zzzz")).toEqual([]);
  });
});

describe("rechercherDiagnosticsCim10 (F-CLI-06)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    p.diagnosticCim10.findMany.mockResolvedValue(BASE.filter((entree) => entree.actif));
  });

  it("est reservee aux roles qui creent une consultation", async () => {
    for (const role of ["patient", "pharmacien", "laboratoire", "admin_etablissement"]) {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      expect(await rechercherDiagnosticsCim10("palu")).toEqual([]);
    }
    getSessionMock.mockResolvedValue(null);
    expect(await rechercherDiagnosticsCim10("palu")).toEqual([]);
    expect(p.diagnosticCim10.findMany).not.toHaveBeenCalled();
  });

  it("exige deux caracteres au moins", async () => {
    expect(await rechercherDiagnosticsCim10("")).toEqual([]);
    expect(await rechercherDiagnosticsCim10("b")).toEqual([]);
    expect(await rechercherDiagnosticsCim10("  ")).toEqual([]);
  });

  it("ne cherche que parmi les diagnostics actifs", async () => {
    await rechercherDiagnosticsCim10("paludisme");

    expect((p.diagnosticCim10.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ actif: true });
  });

  it("trouve par libelle sans accents ni casse et renvoie groupe et caractere sensible", async () => {
    const resultat = await rechercherDiagnosticsCim10("diarrhee");

    expect(resultat).toEqual([
      {
        code: "A09",
        libelle: "Diarrhée et gastro-entérite d'origine présumée infectieuse",
        groupeMaladie: "diarrhee",
        sensible: false,
      },
    ]);
    expect((await rechercherDiagnosticsCim10("VIH"))[0]).toMatchObject({ code: "B20", sensible: true, groupeMaladie: "vih" });
  });

  it("classe : code exact, puis code qui commence par la saisie, puis libelle qui commence, puis le reste", async () => {
    p.diagnosticCim10.findMany.mockResolvedValue([
      diagnostic("R50.9", "Fièvre, sans précision"),
      diagnostic("B50", "Paludisme à Plasmodium falciparum"),
      diagnostic("B54", "Paludisme, sans précision"),
      diagnostic("A99", "Fièvre hémorragique virale, sans précision"),
    ]);

    expect((await rechercherDiagnosticsCim10("b50")).map((entree) => entree.code)).toEqual(["B50"]);
    expect((await rechercherDiagnosticsCim10("b5")).map((entree) => entree.code)).toEqual(["B50", "B54"]);
    // "fievre" : libelle qui commence par la saisie (R50.9, A99), classes par code.
    expect((await rechercherDiagnosticsCim10("fievre")).map((entree) => entree.code)).toEqual(["A99", "R50.9"]);
    // "sans precision" : contenu dans le libelle.
    expect((await rechercherDiagnosticsCim10("sans precision")).map((entree) => entree.code)).toEqual(["A99", "B54", "R50.9"]);
  });

  it("borne le nombre de resultats (20 par defaut, 50 au maximum)", async () => {
    p.diagnosticCim10.findMany.mockResolvedValue(
      Array.from({ length: 80 }, (_, index) => diagnostic(`A${String(index).padStart(2, "0")}`, `Maladie numero ${index}`))
    );

    expect(await rechercherDiagnosticsCim10("maladie")).toHaveLength(20);
    expect(await rechercherDiagnosticsCim10("maladie", 1000)).toHaveLength(50);
    expect(await rechercherDiagnosticsCim10("maladie", 5)).toHaveLength(5);
    expect(await rechercherDiagnosticsCim10("maladie", -3)).toHaveLength(1);
  });
});

describe("creerDiagnosticCim10Action", () => {
  beforeEach(() => {
    p.diagnosticCim10.findUnique.mockResolvedValue(null);
    p.diagnosticCim10.create.mockResolvedValue({});
  });

  it("refuse tout autre role", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    expect((await creerDiagnosticCim10Action(etatInitial, formulaire({ code: "B20", libelle: "VIH" }))).success).toBe(false);
    expect(p.diagnosticCim10.create).not.toHaveBeenCalled();
  });

  it("refuse un code mal forme et un libelle vide ou trop long", async () => {
    for (const champs of [
      { code: "B5", libelle: "X" },
      { code: "paludisme", libelle: "X" },
      { code: "B50", libelle: "" },
      { code: "B50", libelle: "y".repeat(251) },
      { code: "", libelle: "X" },
    ]) {
      expect((await creerDiagnosticCim10Action(etatInitial, formulaire(champs))).success).toBe(false);
    }
    expect(p.diagnosticCim10.create).not.toHaveBeenCalled();
  });

  it("refuse un code deja present", async () => {
    p.diagnosticCim10.findUnique.mockResolvedValue({ id: "existant" });

    expect((await creerDiagnosticCim10Action(etatInitial, formulaire({ code: "B50", libelle: "X" }))).error).toContain("existe deja");
  });

  it("deduit groupe, chapitre et caractere sensible du code, normalise le code, et journalise", async () => {
    const resultat = await creerDiagnosticCim10Action(etatInitial, formulaire({ code: " b24 ", libelle: " Maladie due au VIH, sans precision " }));

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = p.diagnosticCim10.create.mock.calls[0][0] as {
      data: { code: string; libelle: string; chapitre: string; groupeMaladie: string; sensible: boolean; actif: boolean };
    };
    expect(data).toMatchObject({ code: "B24", libelle: "Maladie due au VIH, sans precision", groupeMaladie: "vih", sensible: true, actif: true });
    expect(data.chapitre.startsWith("I.")).toBe(true);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      action: "creation_referentiel_cim10",
      donneeConcernee: "referentiel_cim10:B24",
    });
  });

  it("un diagnostic non sensible par son groupe est cree non sensible", async () => {
    await creerDiagnosticCim10Action(etatInitial, formulaire({ code: "B50.9", libelle: "Paludisme" }));

    expect((p.diagnosticCim10.create.mock.calls[0][0] as { data: { sensible: boolean; groupeMaladie: string } }).data).toMatchObject({
      sensible: false,
      groupeMaladie: "paludisme",
    });
  });
});

describe("basculerDiagnosticCim10Action", () => {
  it("refuse tout autre role, un champ inconnu et un diagnostic introuvable", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect((await basculerDiagnosticCim10Action(etatInitial, formulaire({ id: "a", champ: "actif" }))).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_national"] });
    expect((await basculerDiagnosticCim10Action(etatInitial, formulaire({ id: "a", champ: "libelle" }))).success).toBe(false);

    p.diagnosticCim10.findUnique.mockResolvedValue(null);
    expect((await basculerDiagnosticCim10Action(etatInitial, formulaire({ id: "a", champ: "actif" }))).error).toContain("introuvable");
    expect(p.diagnosticCim10.update).not.toHaveBeenCalled();
  });

  it("desactive et reactive un diagnostic sans jamais le supprimer", async () => {
    for (const actifAvant of [true, false]) {
      p.diagnosticCim10.findUnique.mockResolvedValue(diagnostic("B50", "Paludisme", { actif: actifAvant }));

      expect(await basculerDiagnosticCim10Action(etatInitial, formulaire({ id: "id-B50", champ: "actif" }))).toEqual({
        error: null,
        success: true,
      });
      const ecriture = p.diagnosticCim10.update.mock.calls.at(-1)?.[0] as { data: { actif: boolean } };
      expect(ecriture.data.actif).toBe(!actifAvant);
    }
    expect(p.diagnosticCim10.delete).not.toHaveBeenCalled();
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "basculement_referentiel_cim10" });
  });

  it("marque un code sensible ou le rend non sensible, avec une trace dediee", async () => {
    p.diagnosticCim10.findUnique.mockResolvedValue(diagnostic("B50", "Paludisme", { sensible: false }));

    await basculerDiagnosticCim10Action(etatInitial, formulaire({ id: "id-B50", champ: "sensible" }));

    expect((p.diagnosticCim10.update.mock.calls[0][0] as { data: { sensible: boolean } }).data.sensible).toBe(true);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      action: "modification_sensibilite_cim10",
      donneeConcernee: "referentiel_cim10:B50",
    });
    expect((journaliserMock.mock.calls[0][0] as { justification: string }).justification).toContain("marque sensible");
  });
});
