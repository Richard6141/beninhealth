import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    consultation: { findUnique: vi.fn(), findMany: vi.fn() },
    priseEnChargeInfirmiere: { findMany: vi.fn() },
    patient: { findUnique: vi.fn() },
    medicament: { findMany: vi.fn() },
    prescription: { findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    evenementPrescription: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerPrescriptionAction, renouvelerPrescriptionAction } from "@/modules/prescription/actions";
import { PREFIXE_EMPREINTE, verifierIntegriteOrdonnance } from "./empreinte";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  consultation: { findUnique: Mock; findMany: Mock };
  priseEnChargeInfirmiere: { findMany: Mock };
  patient: { findUnique: Mock };
  medicament: { findMany: Mock };
  prescription: { findMany: Mock; findUnique: Mock; count: Mock; create: Mock };
  evenementPrescription: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const ilYaJours = (jours: number) => new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000);
const etatInitial = { error: null, success: false };

function medicaments(nombre: number) {
  return Array.from({ length: nombre }, (_, i) => ({
    id: `med-${i}`,
    nom: `Medicament ${i}`,
    principeActif: `principe-${i}`,
    dosage: "500 mg",
    forme: "comprime",
    classeTherapeutique: `classe-${i}`,
    ageMinimumMois: null,
    contreIndiqueGrossesse: false,
  }));
}

function lignesSoumises(nombre: number, dureeJours = 7) {
  return medicaments(nombre).map((medicament) => ({
    medicamentId: medicament.id,
    dose: 1,
    unite: "comprime",
    voie: "orale",
    frequence: "1x/j",
    quantite: 7,
    dureeTraitementJours: dureeJours,
  }));
}

function formulaireCreation(lignes: unknown[]): FormData {
  const donnees = new FormData();
  donnees.set("consultationId", "cons-1");
  donnees.set("instructions", "Apres les repas");
  donnees.set("motDePasseSignature", "Demo1234!");
  donnees.set("lignesJSON", JSON.stringify(lignes));
  return donnees;
}

function patient(dateNaissance: string) {
  return {
    id: "pat-1",
    dateNaissance: new Date(dateNaissance),
    allergies: "[]",
    sexe: "M",
    grossesseEnCours: false,
  };
}

const ADULTE = "1990-05-01";
const ENFANT_DE_HUIT_ANS = "2018-03-10";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);

  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  compareMock.mockResolvedValue(true);
  p.user.findUnique.mockResolvedValue({ id: "user-med", motDePasseHash: "hash" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1" });
  p.consultation.findUnique.mockResolvedValue({
    id: "cons-1",
    professionnelId: "pro-1",
    patientId: "pat-1",
    etablissementId: "etab-1",
  });
  p.consultation.findMany.mockResolvedValue([]);
  p.priseEnChargeInfirmiere.findMany.mockResolvedValue([]);
  p.patient.findUnique.mockResolvedValue(patient(ADULTE));
  p.medicament.findMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    medicaments(12).filter((medicament) => where.id.in.includes(medicament.id))
  );
  p.prescription.findMany.mockResolvedValue([]);
  p.prescription.count.mockResolvedValue(0);
  p.prescription.create.mockResolvedValue({ id: "presc-1" });
  p.evenementPrescription.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("creerPrescriptionAction, RG-PRE-01 (de 1 a 10 lignes)", () => {
  it("refuse 11 lignes sans rien enregistrer", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(11)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("plus de 10 lignes");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("accepte 10 lignes dont une de 90 jours, et enregistre une empreinte verifiable", async () => {
    const lignes = lignesSoumises(10);
    lignes[0].dureeTraitementJours = 90;

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignes));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.prescription.create).toHaveBeenCalledTimes(1);

    const { data } = p.prescription.create.mock.calls[0][0] as {
      data: {
        patientId: string;
        medecinPrescripteurId: string;
        date: Date;
        instructions: string;
        empreinteContenu: string;
        lignes: {
          create: {
            medicamentId: string;
            posologie: string;
            quantite: number;
            dureeTraitementJours: number;
          }[];
        };
      };
    };

    expect(data.lignes.create).toHaveLength(10);
    expect(data.empreinteContenu.startsWith(PREFIXE_EMPREINTE)).toBe(true);

    // CA-2 : l'empreinte recalculee sur ce qui a ete ecrit correspond a celle enregistree.
    const relue = {
      patientId: data.patientId,
      prescripteurId: data.medecinPrescripteurId,
      etablissementId: "etab-1",
      date: data.date,
      instructions: data.instructions,
      lignes: data.lignes.create.map((ligne) => ({ ...ligne, nonSubstituable: false })),
    };
    expect(verifierIntegriteOrdonnance(data.empreinteContenu, relue)).toBe("conforme");
  });

  it("refuse une ordonnance sans ligne", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation([]));

    expect(resultat.success).toBe(false);
    expect(p.prescription.create).not.toHaveBeenCalled();
  });
});

describe("creerPrescriptionAction, duree bornee a 90 jours", () => {
  it("refuse 91 jours", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1, 91)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("90 jours");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });
});

describe("creerPrescriptionAction, RG-PRE-02 (poids sous 12 ans)", () => {
  beforeEach(() => {
    p.patient.findUnique.mockResolvedValue(patient(ENFANT_DE_HUIT_ANS));
  });

  it("refuse la signature sans aucun poids", async () => {
    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("poids");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse un poids relevé il y a plus de 30 jours", async () => {
    p.consultation.findMany.mockResolvedValue([{ date: ilYaJours(40), poidsKg: 24 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat.success).toBe(false);
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("accepte un poids de consultation relevé il y a 20 jours", async () => {
    p.consultation.findMany.mockResolvedValue([{ date: ilYaJours(20), poidsKg: 24 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("accepte un poids relevé par l'infirmier lors d'une prise en charge recente", async () => {
    p.priseEnChargeInfirmiere.findMany.mockResolvedValue([{ date: ilYaJours(1), poidsKg: 24.5 }]);

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("ne demande aucun poids a un adulte", async () => {
    p.patient.findUnique.mockResolvedValue(patient(ADULTE));

    const resultat = await creerPrescriptionAction(etatInitial, formulaireCreation(lignesSoumises(1)));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.priseEnChargeInfirmiere.findMany).not.toHaveBeenCalled();
  });
});

describe("renouvelerPrescriptionAction", () => {
  function ancienne(surcharge: Record<string, unknown> = {}, nombreLignes = 2, dureeJours = 7) {
    return {
      id: "presc-ancienne",
      numero: "RX-2026-0001",
      patientId: "pat-1",
      instructions: "Apres les repas",
      patient: patient(ADULTE),
      lignes: medicaments(nombreLignes).map((medicament) => ({
        medicamentId: medicament.id,
        medicament,
        posologie: "1 comprime 1 fois par jour",
        quantite: 7,
        dureeTraitementJours: dureeJours,
        nonSubstituable: false,
      })),
      ...surcharge,
    };
  }

  function formulaireRenouvellement(): FormData {
    const donnees = new FormData();
    donnees.set("prescriptionId", "presc-ancienne");
    donnees.set("consultationId", "cons-1");
    donnees.set("motDePasseSignature", "Demo1234!");
    return donnees;
  }

  it("refuse de renouveler une ordonnance de plus de 10 lignes", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({}, 11));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("plus de 10 lignes");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse de renouveler une ligne de plus de 90 jours", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({}, 2, 120));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("90 jours");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("refuse de renouveler pour un enfant de moins de 12 ans sans poids recent", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne({ patient: patient(ENFANT_DE_HUIT_ANS) }));

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("poids");
    expect(p.prescription.create).not.toHaveBeenCalled();
  });

  it("renouvelle une ordonnance conforme et enregistre une empreinte verifiable", async () => {
    p.prescription.findUnique.mockResolvedValue(ancienne());

    const resultat = await renouvelerPrescriptionAction(etatInitial, formulaireRenouvellement());

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = p.prescription.create.mock.calls[0][0] as {
      data: {
        patientId: string;
        medecinPrescripteurId: string;
        date: Date;
        instructions: string;
        empreinteContenu: string;
        lignes: { create: { medicamentId: string; posologie: string; quantite: number; dureeTraitementJours: number; nonSubstituable: boolean }[] };
      };
    };

    const relue = {
      patientId: data.patientId,
      prescripteurId: data.medecinPrescripteurId,
      etablissementId: "etab-1",
      date: data.date,
      instructions: data.instructions,
      lignes: data.lignes.create,
    };
    expect(verifierIntegriteOrdonnance(data.empreinteContenu, relue)).toBe("conforme");
  });
});
