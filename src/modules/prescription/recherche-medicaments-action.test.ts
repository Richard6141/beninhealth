import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({ prisma: { medicament: { findMany: vi.fn() } } }));
vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() }, compare: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { rechercherMedicamentsAction } from "./actions";

const p = prisma as unknown as { medicament: { findMany: Mock } };
const getSessionMock = getSession as unknown as Mock;

function ligne(surcharge: Record<string, unknown> = {}) {
  return {
    id: "med-1",
    nom: "Amoxicilline",
    principeActif: "Amoxicilline",
    dosage: "500 mg",
    forme: "gelule",
    classeTherapeutique: "penicillines",
    ageMinimumMois: null,
    contreIndiqueGrossesse: false,
    nomsCommerciaux: ["Clamoxyl"],
    codeAtc: "J01CA04",
    essentiel: true,
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  p.medicament.findMany.mockResolvedValue([
    ligne(),
    ligne({ id: "med-2", nom: "Paracétamol", principeActif: "Paracétamol", nomsCommerciaux: ["Doliprane"], classeTherapeutique: "antalgiques", codeAtc: "N02BE01" }),
    ligne({ id: "med-3", nom: "Ibuprofène", principeActif: "Ibuprofène", nomsCommerciaux: [], essentiel: false, classeTherapeutique: "ains", codeAtc: "M01AE01", ageMinimumMois: 3, contreIndiqueGrossesse: true }),
  ]);
});

describe("rechercherMedicamentsAction (F-PRE-03)", () => {
  it("refuse sans session, sans lire le catalogue", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await rechercherMedicamentsAction("amox")).toEqual([]);
    expect(p.medicament.findMany).not.toHaveBeenCalled();
  });

  it("refuse les roles qui ne creent pas d'ordonnance (patient, pharmacien, infirmier)", async () => {
    for (const role of ["patient", "pharmacien", "infirmier", "agent_communautaire", "laboratoire"]) {
      getSessionMock.mockResolvedValue({ userId: "u", roles: [role] });

      expect(await rechercherMedicamentsAction("amox"), role).toEqual([]);
    }
    expect(p.medicament.findMany).not.toHaveBeenCalled();
  });

  it("ne renvoie rien et ne lit rien sous 3 caracteres", async () => {
    expect(await rechercherMedicamentsAction("am")).toEqual([]);
    expect(await rechercherMedicamentsAction("  a ")).toEqual([]);
    expect(await rechercherMedicamentsAction("")).toEqual([]);
    expect(p.medicament.findMany).not.toHaveBeenCalled();
  });

  it("refuse une saisie demesuree ou d'un mauvais type", async () => {
    expect(await rechercherMedicamentsAction("a".repeat(101))).toEqual([]);
    expect(await rechercherMedicamentsAction(42 as unknown as string)).toEqual([]);
    expect(await rechercherMedicamentsAction(null as unknown as string)).toEqual([]);
    expect(p.medicament.findMany).not.toHaveBeenCalled();
  });

  it("ne lit que les medicaments actifs (RG-PRE-20) et seulement les colonnes utiles", async () => {
    await rechercherMedicamentsAction("amox");

    const appel = p.medicament.findMany.mock.calls[0][0];
    expect(appel.where).toEqual({ actif: true });
    expect(Object.keys(appel.select).sort()).toEqual(
      [
        "ageMinimumMois",
        "classeTherapeutique",
        "codeAtc",
        "contreIndiqueGrossesse",
        "dosage",
        "essentiel",
        "forme",
        "id",
        "nom",
        "nomsCommerciaux",
        "principeActif",
      ].sort()
    );
  });

  it("trouve par DCI, sans accent ni casse, avec les champs attendus par le formulaire", async () => {
    const resultats = await rechercherMedicamentsAction("PARACETAMOL");

    expect(resultats).toHaveLength(1);
    expect(resultats[0]).toMatchObject({
      id: "med-2",
      principeActif: "Paracétamol",
      classeTherapeutique: "antalgiques",
      codeAtc: "N02BE01",
      essentiel: true,
      nomsCommerciaux: ["Doliprane"],
    });
  });

  it("trouve par nom commercial", async () => {
    const resultats = await rechercherMedicamentsAction("doliprane");

    expect(resultats.map((m) => m.id)).toEqual(["med-2"]);
  });

  it("renvoie les limites d'age et la contre-indication de grossesse pour les controles de securite", async () => {
    const [ibuprofene] = await rechercherMedicamentsAction("ibuprofene");

    expect(ibuprofene.ageMinimumMois).toBe(3);
    expect(ibuprofene.contreIndiqueGrossesse).toBe(true);
    expect(ibuprofene.essentiel).toBe(false);
  });

  it("classe les essentiels avant les autres", async () => {
    p.medicament.findMany.mockResolvedValue([
      ligne({ id: "a", nom: "Zeta", principeActif: "Zeta produit", essentiel: true }),
      ligne({ id: "b", nom: "Alpha", principeActif: "Alpha produit", essentiel: false }),
    ]);

    const resultats = await rechercherMedicamentsAction("produit");

    expect(resultats.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("plafonne a 20 resultats", async () => {
    p.medicament.findMany.mockResolvedValue(
      Array.from({ length: 60 }, (_, index) => ligne({ id: `m-${index}`, nom: `Amox ${index}` }))
    );

    expect(await rechercherMedicamentsAction("amox")).toHaveLength(20);
  });
});
