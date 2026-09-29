import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * RG-CIT-81 du pack (docs/pack claude/specs/08-fiches-citoyen.md:219) : les
 * acces "contexte de soins" (base B4, clinical/actions.ts) DOIVENT etre
 * affiches au patient, avec un bouton "Mettre fin".
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    rendezVous: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.5" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import {
  getMesAccesContexteSoins,
  terminerAccesContexteSoinsAction,
  type PatientActionState,
} from "@/modules/patient/actions";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  rendezVous: { findMany: Mock; findUnique: Mock; update: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const ETAT: PatientActionState = { error: null, success: false };
const MAINTENANT = new Date("2026-09-28T12:00:00.000Z");

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"], sessionId: "s-1" });
  p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
  p.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
});

describe("getMesAccesContexteSoins", () => {
  it("sans dossier patient : liste vide", async () => {
    p.patient.findUnique.mockResolvedValue(null);

    expect(await getMesAccesContexteSoins()).toEqual([]);
    expect(p.rendezVous.findMany).not.toHaveBeenCalled();
  });

  it("filtre sur le patient connecte, les statuts actifs, la fenetre de 72h et le champ de fin", async () => {
    p.rendezVous.findMany.mockResolvedValue([]);

    await getMesAccesContexteSoins();

    expect(p.rendezVous.findMany).toHaveBeenCalledWith({
      where: {
        patientId: "pat-1",
        statut: { in: ["demande", "confirme", "en_consultation"] },
        heureArrivee: { gte: new Date(MAINTENANT.getTime() - 72 * 60 * 60 * 1000) },
        contexteSoinsTermineParPatient: false,
      },
      include: { etablissement: true },
      orderBy: { heureArrivee: "desc" },
    });
  });

  it("calcule expireLe a heureArrivee + 72h, avec le nom de l'etablissement", async () => {
    const heureArrivee = new Date("2026-09-28T10:00:00.000Z");
    p.rendezVous.findMany.mockResolvedValue([
      { id: "rdv-1", heureArrivee, etablissement: { nom: "CS Akpakpa" } },
    ]);

    const resultat = await getMesAccesContexteSoins();

    expect(resultat).toEqual([
      {
        rendezVousId: "rdv-1",
        etablissementNom: "CS Akpakpa",
        expireLe: new Date(heureArrivee.getTime() + 72 * 60 * 60 * 1000).toISOString(),
      },
    ]);
  });
});

describe("terminerAccesContexteSoinsAction", () => {
  beforeEach(() => {
    p.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1" });
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await terminerAccesContexteSoinsAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.success).toBe(false);
    expect(p.rendezVous.update).not.toHaveBeenCalled();
  });

  it("refuse un rendez-vous qui n'appartient pas au patient connecte (Zero Trust)", async () => {
    p.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-autre" });

    const resultat = await terminerAccesContexteSoinsAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.success).toBe(false);
    expect(p.rendezVous.update).not.toHaveBeenCalled();
  });

  it("refuse un rendez-vous introuvable", async () => {
    p.rendezVous.findUnique.mockResolvedValue(null);

    const resultat = await terminerAccesContexteSoinsAction(ETAT, formulaire({ rendezVousId: "rdv-inconnu" }));

    expect(resultat.success).toBe(false);
  });

  it("marque le rendez-vous et journalise, sans jamais toucher a heureArrivee ni au statut", async () => {
    const resultat = await terminerAccesContexteSoinsAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.rendezVous.update).toHaveBeenCalledWith({
      where: { id: "rdv-1" },
      data: { contexteSoinsTermineParPatient: true },
    });
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: "user-pat",
        action: "acces_contexte_soins_termine",
        donneeConcernee: "rendez_vous:rdv-1",
        adresseTechnique: "10.0.0.5",
      })
    );
  });
});
