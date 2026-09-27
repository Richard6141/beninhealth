import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    prescription: { findUnique: vi.fn() },
    consultation: { findMany: vi.fn(async () => []) },
    priseEnChargeInfirmiere: { findMany: vi.fn(async () => []) },
  },
}));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonTelechargement } from "@/modules/prescription/jetons-telechargement";
import { GET } from "./route";

const p = prisma as unknown as {
  prescription: { findUnique: Mock };
  consultation: { findMany: Mock };
  priseEnChargeInfirmiere: { findMany: Mock };
};
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

function prescription(surcharges: Record<string, unknown> = {}) {
  return {
    id: "presc-1",
    patientId: "pat-1",
    numero: "RX-0001-0001",
    date: new Date("2026-09-27T09:00:00.000Z"),
    empreinteContenu: "abcdef0123456789",
    patient: {
      userId: "user-patient",
      identifiantSante: "BJ-SANTE-0001",
      dateNaissance: new Date("1990-01-01"),
      sexe: "F",
      user: { prenom: "Awa", nom: "Kora" },
    },
    medecinPrescripteur: {
      specialite: "Médecine générale",
      numeroOrdre: "ORD-123",
      user: { prenom: "Roméo", nom: "Dossou" },
    },
    consultation: {
      etablissement: {
        nom: "Hôpital de Ouidah",
        adresse: "Route de Ouidah",
        telephoneEtablissement: "+22901000000",
      },
    },
    lignes: [
      {
        medicament: { nom: "Paracétamol", dosage: "500 mg", forme: "comprimé" },
        posologie: "1 comprimé 3 fois par jour",
        nonSubstituable: false,
        quantite: 21,
        dureeTraitementJours: 7,
      },
    ],
    ...surcharges,
  };
}

async function appeler(prescriptionId: string, jeton: string | null) {
  const url = new URL(`http://localhost/api/patient/prescriptions/${prescriptionId}/telecharger`);
  if (jeton !== null) url.searchParams.set("jeton", jeton);
  return GET(new Request(url), { params: Promise.resolve({ id: prescriptionId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  p.prescription.findUnique.mockResolvedValue(prescription());
  p.consultation.findMany.mockResolvedValue([]);
  p.priseEnChargeInfirmiere.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/patient/prescriptions/[id]/telecharger (F-CIT-06, F-PRE-04)", () => {
  it("refuse sans jeton", async () => {
    const reponse = await appeler("presc-1", null);
    expect(reponse.status).toBe(410);
    expect(p.prescription.findUnique).not.toHaveBeenCalled();
  });

  it("refuse un jeton inconnu ou deja consomme", async () => {
    const jeton = creerJetonTelechargement("presc-1");
    await appeler("presc-1", jeton);

    const reponse = await appeler("presc-1", jeton);
    expect(reponse.status).toBe(410);
  });

  it("refuse un jeton emis pour une autre prescription", async () => {
    const jeton = creerJetonTelechargement("presc-autre");
    const reponse = await appeler("presc-1", jeton);
    expect(reponse.status).toBe(410);
  });

  it("404 si l'ordonnance est introuvable", async () => {
    p.prescription.findUnique.mockResolvedValue(null);
    const jeton = creerJetonTelechargement("presc-1");

    const reponse = await appeler("presc-1", jeton);
    expect(reponse.status).toBe(404);
  });

  it("genere le PDF, journalise le telechargement et pose les bons en-tetes", async () => {
    const jeton = creerJetonTelechargement("presc-1");

    const reponse = await appeler("presc-1", jeton);

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("application/pdf");
    expect(reponse.headers.get("Content-Disposition")).toContain("RX-0001-0001");
    expect(reponse.headers.get("Cache-Control")).toContain("no-store");

    const octets = new Uint8Array(await reponse.arrayBuffer());
    expect(octets.length).toBeGreaterThan(0);
    // Signature de fichier PDF ("%PDF").
    expect(String.fromCharCode(...octets.slice(0, 4))).toBe("%PDF");

    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: "user-patient",
        action: "telechargement_ordonnance_pdf",
        donneeConcernee: "prescription:presc-1",
      })
    );
  });

  it("ne cherche pas le poids d'un patient adulte", async () => {
    const jeton = creerJetonTelechargement("presc-1");

    await appeler("presc-1", jeton);

    expect(p.consultation.findMany).not.toHaveBeenCalled();
    expect(p.priseEnChargeInfirmiere.findMany).not.toHaveBeenCalled();
  });

  it("cherche le poids recent d'un patient sous le seuil pediatrique", async () => {
    p.prescription.findUnique.mockResolvedValue(
      prescription({ patient: { ...prescription().patient, dateNaissance: new Date("2020-01-01") } })
    );
    const jeton = creerJetonTelechargement("presc-1");

    const reponse = await appeler("presc-1", jeton);

    expect(reponse.status).toBe(200);
    expect(p.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patientId: "pat-1" }) })
    );
  });
});
