import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de verifierOrdonnancePublique et genererCleVerificationOrdonnance
 * (F-PRE-06, RG-PRE-40). Prisma mocke (meme approche que
 * src/modules/audit/integrite.test.ts), NEXTAUTH_SECRET fixe pour un HMAC
 * deterministe en test.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));

vi.mock("@/lib/prisma", () => ({
  prisma: { prescription: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/prisma";
import { genererCleVerificationOrdonnance, verifierOrdonnancePublique } from "./verification-publique";

const prismaMock = prisma as unknown as { prescription: { findUnique: Mock } };

const PRESCRIPTION_BASE = {
  id: "presc-1",
  numero: "RX-2026-0001",
  statut: "validee",
  medecinPrescripteur: {
    user: { nom: "Hounkpè", prenom: "Amir" },
  },
  consultation: { etablissement: { nom: "CS Akpakpa" } },
};

describe("genererCleVerificationOrdonnance / verifierOrdonnancePublique (RG-PRE-40)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie null si aucune cle n'est fournie (numero seul insuffisant)", async () => {
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", null);
    expect(resultat).toBeNull();
    expect(prismaMock.prescription.findUnique).not.toHaveBeenCalled();
  });

  it("renvoie null si l'ordonnance n'existe pas", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue(null);
    const resultat = await verifierOrdonnancePublique("RX-2026-9999", "peu-importe");
    expect(resultat).toBeNull();
  });

  it("renvoie null si la cle ne correspond pas a l'ordonnance", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue({ ...PRESCRIPTION_BASE, date: new Date("2026-08-01") });
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", "cle-incorrecte");
    expect(resultat).toBeNull();
  });

  it("accepte la cle correcte et renvoie l'affichage minimal (aucune donnee patient/medicament)", async () => {
    const date = new Date("2026-08-01T00:00:00.000Z");
    prismaMock.prescription.findUnique.mockResolvedValue({ ...PRESCRIPTION_BASE, date });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");

    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);

    expect(resultat).not.toBeNull();
    expect(resultat).toMatchObject({
      numero: "RX-2026-0001",
      dateEmission: "2026-08-01",
      prescripteurNomComplet: "Amir Hounkpè",
      etablissementNom: "CS Akpakpa",
      statutAffiche: "valable",
    });
    expect(resultat!.dateValidite).toBeDefined();
    // Aucune cle "patient", "lignes", "medicament" ou "motif" ne doit jamais apparaitre.
    expect(Object.keys(resultat!)).toEqual(["numero", "dateEmission", "prescripteurNomComplet", "etablissementNom", "statutAffiche", "dateValidite"]);
  });

  it("affiche l'etablissement de l'acte (la consultation), pas celui du profil du medecin", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue({
      ...PRESCRIPTION_BASE,
      // Le medecin a un autre etablissement principal : il ne doit pas apparaitre.
      medecinPrescripteur: { user: { nom: "Hounkpè", prenom: "Amir" }, etablissement: { nom: "CHU de Parakou" } },
      consultation: { etablissement: { nom: "Clinique du Littoral" } },
      date: new Date("2026-08-01T00:00:00.000Z"),
    });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");

    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);

    expect(resultat?.etablissementNom).toBe("Clinique du Littoral");
    expect(prismaMock.prescription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ consultation: { select: { etablissement: { select: { nom: true } } } } }),
      })
    );
  });

  it("affiche 'annulee' independamment de la date de validite", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue({
      ...PRESCRIPTION_BASE,
      statut: "annulee",
      date: new Date("2020-01-01"),
    });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);
    expect(resultat?.statutAffiche).toBe("annulee");
    expect(resultat?.dateValidite).toBeUndefined();
  });

  it("affiche 'annulee' pour une ordonnance arretee par son prescripteur (jamais 'valable')", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue({ ...PRESCRIPTION_BASE, statut: "arretee", date: new Date() });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);
    expect(resultat?.statutAffiche).toBe("annulee");
    expect(resultat?.dateValidite).toBeUndefined();
  });

  it("affiche 'delivree' pour une ordonnance entierement delivree", async () => {
    prismaMock.prescription.findUnique.mockResolvedValue({ ...PRESCRIPTION_BASE, statut: "delivree", date: new Date() });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);
    expect(resultat?.statutAffiche).toBe("delivree");
  });

  it("affiche 'expiree' au-dela de la duree de validite par defaut (90 jours)", async () => {
    const ilYA100Jours = new Date();
    ilYA100Jours.setDate(ilYA100Jours.getDate() - 100);
    prismaMock.prescription.findUnique.mockResolvedValue({ ...PRESCRIPTION_BASE, statut: "validee", date: ilYA100Jours });
    const cle = genererCleVerificationOrdonnance("RX-2026-0001", "presc-1");
    const resultat = await verifierOrdonnancePublique("RX-2026-0001", cle);
    expect(resultat?.statutAffiche).toBe("expiree");
    expect(resultat?.dateValidite).toBeUndefined();
  });
});
