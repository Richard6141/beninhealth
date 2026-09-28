import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    vaccination: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
// F-PIL-07 : IND-10 (vaccinations), hors du perimetre de ce fichier.
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { enregistrerVaccinationAction, retirerVaccinationAction } from "@/modules/vaccination/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  patient: { findUnique: Mock };
  consentement: { findUnique: Mock };
  vaccination: { findFirst: Mock; findUnique: Mock; create: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    patientId: "patient-1",
    vaccin: "BCG",
    numeroDose: "1",
    dateAdministration: "2026-01-05",
    numeroLot: "LOT-42",
    siteInjection: "Bras gauche",
    voie: "intradermique",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function consentement(surcharges: Record<string, unknown> = {}) {
  return { statut: "actif", dateFin: null, typeAcces: "dossier_complet", ...surcharges };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-infirmier", roles: ["infirmier"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", etablissementId: "etab-1" });
  p.patient.findUnique.mockResolvedValue({ id: "patient-1", dateNaissance: new Date("2026-01-01T12:00:00Z") });
  p.consentement.findUnique.mockResolvedValue(consentement());
  p.vaccination.findFirst.mockResolvedValue(null);
  p.vaccination.create.mockResolvedValue({ id: "vac-1" });
});

describe("enregistrerVaccinationAction : droits et controles (F-CLI-11)", () => {
  it("enregistre une vaccination conforme avec un consentement dossier_complet", async () => {
    const resultat = await enregistrerVaccinationAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.vaccination.create).toHaveBeenCalledTimes(1);
  });

  it("accepte aussi un consentement limite aux consultations", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "consultations" }));

    expect((await enregistrerVaccinationAction(etatInitial, formulaire())).success).toBe(true);
  });

  it("regression : refuse un consentement d'urgence ou limite a un autre domaine (ecriture interdite)", async () => {
    for (const typeAcces of ["urgence", "reference", "examens", "documents", "prescriptions"]) {
      p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces }));

      const resultat = await enregistrerVaccinationAction(etatInitial, formulaire());

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("consentement");
    }
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse un consentement expire ou retire", async () => {
    p.consentement.findUnique.mockResolvedValueOnce(consentement({ dateFin: new Date("2020-01-01") }));
    expect((await enregistrerVaccinationAction(etatInitial, formulaire())).success).toBe(false);

    p.consentement.findUnique.mockResolvedValueOnce(consentement({ statut: "retire" }));
    expect((await enregistrerVaccinationAction(etatInitial, formulaire())).success).toBe(false);
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse un role sans droit (le patient n'enregistre pas de vaccination)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-patient", roles: ["patient"] });

    const resultat = await enregistrerVaccinationAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse une date d'administration dans le futur", async () => {
    const resultat = await enregistrerVaccinationAction(etatInitial, formulaire({ dateAdministration: "2999-01-01" }));

    expect(resultat.error).toContain("futur");
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("signale un doublon sans enregistrer, puis l'accepte une fois confirme", async () => {
    p.vaccination.findFirst.mockResolvedValue({ id: "existante" });

    const avertissement = await enregistrerVaccinationAction(etatInitial, formulaire());
    expect(avertissement.avertissementDoublon).toBe(true);
    expect(p.vaccination.create).not.toHaveBeenCalled();

    const confirme = await enregistrerVaccinationAction(etatInitial, formulaire({ confirmerDoublon: "true" }));
    expect(confirme.success).toBe(true);
  });

  it("signale un age trop jeune sans enregistrer, puis l'accepte une fois confirme", async () => {
    const trop = { vaccin: "Rougeole", dateAdministration: "2026-02-01" };

    const avertissement = await enregistrerVaccinationAction(etatInitial, formulaire(trop));
    expect(avertissement.avertissementAge).toBe(true);
    expect(p.vaccination.create).not.toHaveBeenCalled();

    const confirme = await enregistrerVaccinationAction(etatInitial, formulaire({ ...trop, confirmerAge: "true" }));
    expect(confirme.success).toBe(true);
  });
});

describe("retirerVaccinationAction : retrait motive (RG-CLI-100)", () => {
  const formulaireRetrait = (motif: string) => {
    const donnees = new FormData();
    donnees.set("vaccinationId", "vac-1");
    donnees.set("motif", motif);
    return donnees;
  };

  beforeEach(() => {
    p.vaccination.findUnique.mockResolvedValue({ id: "vac-1", patientId: "patient-1", professionnelId: "prof-1", saisieParErreur: false });
  });

  it("retire une vaccination de son auteur avec un motif suffisant, sans jamais la supprimer", async () => {
    const resultat = await retirerVaccinationAction(etatInitial, formulaireRetrait("Saisie sur le mauvais patient"));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.vaccination.update).toHaveBeenCalledWith({
      where: { id: "vac-1" },
      data: { saisieParErreur: true, motifRetrait: "Saisie sur le mauvais patient" },
    });
  });

  it("refuse un motif trop court", async () => {
    const resultat = await retirerVaccinationAction(etatInitial, formulaireRetrait("erreur"));

    expect(resultat.success).toBe(false);
    expect(p.vaccination.update).not.toHaveBeenCalled();
  });

  it("refuse le retrait par un autre professionnel que l'auteur", async () => {
    p.vaccination.findUnique.mockResolvedValue({ id: "vac-1", patientId: "patient-1", professionnelId: "autre", saisieParErreur: false });

    expect((await retirerVaccinationAction(etatInitial, formulaireRetrait("Saisie sur le mauvais patient"))).success).toBe(false);
    expect(p.vaccination.update).not.toHaveBeenCalled();
  });

  it("refuse le retrait avec un consentement d'urgence seulement", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "urgence" }));

    expect((await retirerVaccinationAction(etatInitial, formulaireRetrait("Saisie sur le mauvais patient"))).success).toBe(false);
    expect(p.vaccination.update).not.toHaveBeenCalled();
  });

  it("refuse de retirer deux fois la meme vaccination", async () => {
    p.vaccination.findUnique.mockResolvedValue({ id: "vac-1", patientId: "patient-1", professionnelId: "prof-1", saisieParErreur: true });

    const resultat = await retirerVaccinationAction(etatInitial, formulaireRetrait("Saisie sur le mauvais patient"));

    expect(resultat.error).toContain("deja");
    expect(p.vaccination.update).not.toHaveBeenCalled();
  });
});
