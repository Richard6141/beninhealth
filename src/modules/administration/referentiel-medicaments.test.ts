import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    medicament: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])
  );
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerMedicamentAction, modifierMedicamentAction } from "./referentiel-medicaments";
import {
  NOMBRE_NOMS_COMMERCIAUX_MAX,
  analyserNomsCommerciaux,
  normaliserCodeAtc,
} from "./referentiel-medicaments-catalogue";

const p = prisma as unknown as { medicament: { create: Mock; update: Mock; findUnique: Mock; findMany: Mock } };
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string | null>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) {
    if (valeur !== null) donnees.set(cle, valeur);
  }
  return donnees;
}

// Champs que l'ecran envoie toujours (chaine vide quand rien n'est saisi).
const BASE = {
  nom: "Amoxicilline",
  principeActif: "Amoxicilline",
  dosage: "500 mg",
  forme: "gelule",
  classeTherapeutique: "penicillines",
  ageMinimumMois: "",
  informationsComplementaires: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.medicament.create.mockResolvedValue({ id: "med-1", nom: "Amoxicilline", principeActif: "Amoxicilline" });
  p.medicament.findUnique.mockResolvedValue({ id: "med-1", nom: "Amoxicilline" });
  p.medicament.update.mockResolvedValue({});
});

describe("analyserNomsCommerciaux", () => {
  it("separe par virgules ou points-virgules, retire les espaces et les doublons de casse", () => {
    expect(analyserNomsCommerciaux(" Clamoxyl ; Amoxil,  clamoxyl ,, Amoxil  ")).toEqual(["Clamoxyl", "Amoxil"]);
    expect(analyserNomsCommerciaux("")).toEqual([]);
  });

  it("refuse plus de dix noms ou un nom de plus de 60 caracteres", () => {
    const onze = Array.from({ length: NOMBRE_NOMS_COMMERCIAUX_MAX + 1 }, (_, index) => `Marque${index}`).join(",");

    expect(analyserNomsCommerciaux(onze)).toBeNull();
    expect(analyserNomsCommerciaux("x".repeat(61))).toBeNull();
    expect(analyserNomsCommerciaux("x".repeat(60))).toEqual(["x".repeat(60)]);
  });
});

describe("normaliserCodeAtc", () => {
  it("accepte les cinq niveaux, en majuscules, espaces retires", () => {
    for (const code of ["J", "J01", "J01C", "J01CA", "J01CA04"]) {
      expect(normaliserCodeAtc(code)).toBe(code);
    }
    expect(normaliserCodeAtc(" j01ca04 ")).toBe("J01CA04");
    expect(normaliserCodeAtc("j 01 ca 04")).toBe("J01CA04");
  });

  it("laisse un code vide vide et refuse un format invalide", () => {
    expect(normaliserCodeAtc("")).toBe("");
    expect(normaliserCodeAtc("   ")).toBe("");
    for (const code of ["01J", "J1", "J01C1", "J01CA4", "J01CA044", "JJ01", "J01-CA"]) {
      expect(normaliserCodeAtc(code), code).toBeNull();
    }
  });
});

describe("creerMedicamentAction : champs de recherche (F-PRE-03)", () => {
  it("enregistre les noms commerciaux, le code ATC normalise et l'indicateur essentiel", async () => {
    const resultat = await creerMedicamentAction(
      etatInitial,
      formulaire({ ...BASE, nomsCommerciaux: "Clamoxyl, Amoxil, clamoxyl", codeAtc: "j01ca04", essentiel: "on" })
    );

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.medicament.create).toHaveBeenCalledTimes(1);
    expect(p.medicament.create.mock.calls[0][0].data).toMatchObject({
      nomsCommerciaux: ["Clamoxyl", "Amoxil"],
      codeAtc: "J01CA04",
      essentiel: true,
      actif: true,
    });
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "creation_referentiel_medicament" }),
      expect.anything()
    );
  });

  it("laisse les champs de recherche vides quand ils ne sont pas saisis (case essentiel decochee)", async () => {
    await creerMedicamentAction(etatInitial, formulaire(BASE));

    expect(p.medicament.create.mock.calls[0][0].data).toMatchObject({
      nomsCommerciaux: [],
      codeAtc: "",
      essentiel: false,
    });
  });

  it("refuse un code ATC invalide sans rien enregistrer", async () => {
    const resultat = await creerMedicamentAction(etatInitial, formulaire({ ...BASE, codeAtc: "ZZZ" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/ATC/);
    expect(p.medicament.create).not.toHaveBeenCalled();
  });

  it("refuse trop de noms commerciaux sans rien enregistrer", async () => {
    const onze = Array.from({ length: 11 }, (_, index) => `M${index}`).join(",");

    const resultat = await creerMedicamentAction(etatInitial, formulaire({ ...BASE, nomsCommerciaux: onze }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/noms commerciaux/);
    expect(p.medicament.create).not.toHaveBeenCalled();
  });

  it("reste reservee a l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u", roles: ["medecin"] });

    const resultat = await creerMedicamentAction(etatInitial, formulaire({ ...BASE, essentiel: "on" }));

    expect(resultat.success).toBe(false);
    expect(p.medicament.create).not.toHaveBeenCalled();
  });
});

describe("modifierMedicamentAction : champs de recherche (F-PRE-03)", () => {
  it("met a jour noms commerciaux, code ATC et essentiel", async () => {
    const resultat = await modifierMedicamentAction(
      etatInitial,
      formulaire({ ...BASE, id: "med-1", nomsCommerciaux: "Clamoxyl", codeAtc: "J01CA04", essentiel: "on" })
    );

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.medicament.update.mock.calls[0][0]).toMatchObject({
      where: { id: "med-1" },
      data: { nomsCommerciaux: ["Clamoxyl"], codeAtc: "J01CA04", essentiel: true },
    });
  });

  it("retire l'indicateur essentiel quand la case est decochee", async () => {
    await modifierMedicamentAction(etatInitial, formulaire({ ...BASE, id: "med-1" }));

    expect(p.medicament.update.mock.calls[0][0].data.essentiel).toBe(false);
  });

  it("refuse un code ATC invalide", async () => {
    const resultat = await modifierMedicamentAction(etatInitial, formulaire({ ...BASE, id: "med-1", codeAtc: "1234" }));

    expect(resultat.success).toBe(false);
    expect(p.medicament.update).not.toHaveBeenCalled();
  });
});
