import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    examenMedical: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : (operations as (tx: unknown) => unknown)(prisma)
  );
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
// Frontiere du module : la logique interne (routage vers le tuteur d'une
// personne a charge) est testee dans son propre fichier
// (facility/destinataire-notification-patient.test.ts), pas ici.
vi.mock("@/modules/facility/destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { destinataireNotificationPatient } from "@/modules/facility/destinataire-notification-patient";
import { libererExamenAction } from "@/modules/laboratoire/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  examenMedical: { findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const destinataireNotificationPatientMock = destinataireNotificationPatient as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function examen(surcharges: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    laboratoireId: "labo-etab",
    statut: "demande",
    patient: { id: "pat-1", userId: "user-patient", user: { statut: "actif" } },
    demandeur: { userId: "user-demandeur" },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-labo", roles: ["laboratoire"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-labo", etablissementId: "labo-etab" });
  p.examenMedical.findUnique.mockResolvedValue(examen());
  destinataireNotificationPatientMock.mockResolvedValue("user-patient");
});

describe("libererExamenAction : liberation par le laboratoire avant prelevement (F-LAB-06)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Erreur de saisie" }));

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("refuse une liberation sans motif, sans rien modifier ni notifier", async () => {
    const resultat = await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("motif");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse un laboratoire different de celui assigne (Zero Trust)", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-autre", etablissementId: "autre-labo" });

    const resultat = await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Erreur de saisie" }));

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("refuse une demande deja prelevee (statut en_cours)", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examen({ statut: "en_cours" }));

    const resultat = await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Erreur de saisie" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("preleve");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("libere, journalise le motif et previent le patient et le medecin demandeur, jamais le laboratoire", async () => {
    const resultat = await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Prise en charge par erreur" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.update.mock.calls[0][0].data.statut).toBe("annule");
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      action: "liberation_examen_laboratoire",
      donneeConcernee: "examen_medical:ex-1",
    });
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Prise en charge par erreur");

    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires.sort()).toEqual(["user-demandeur", "user-patient"]);
    expect(destinataireNotificationPatientMock).toHaveBeenCalledWith("pat-1");
  });

  it("le message au medecin demandeur contient le motif, jamais le nom de l'examen dans celui du patient", async () => {
    await libererExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Motif confidentiel" }));

    const messagePatient = creerNotificationMock.mock.calls.find((appel) => appel[0] === "user-patient")![2] as string;
    const messageDemandeur = creerNotificationMock.mock.calls.find((appel) => appel[0] === "user-demandeur")![2] as string;
    expect(messagePatient).not.toContain("Motif confidentiel");
    expect(messageDemandeur).toContain("Motif confidentiel");
  });
});
