import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
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

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { annulerExamenAction } from "@/modules/laboratoire/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock };
  examenMedical: { findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function examen(surcharges: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    demandeurId: "prof-medecin",
    laboratoireId: "labo-etab",
    statut: "demande",
    patient: { userId: "user-patient" },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-medecin", etablissementId: "hopital" });
  p.professionnelSante.findMany.mockResolvedValue([{ userId: "labo-1" }, { userId: "labo-2" }]);
  p.examenMedical.findUnique.mockResolvedValue(examen());
});

describe("annulerExamenAction : motif et notifications (F-LAB-06)", () => {
  it("refuse une annulation sans motif, sans rien modifier ni notifier", async () => {
    const resultat = await annulerExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("motif");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("annule, journalise le motif et previent le patient et chaque membre du laboratoire", async () => {
    const resultat = await annulerExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Demande faite par erreur" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.update.mock.calls[0][0].data.statut).toBe("annule");
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Demande faite par erreur");

    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires).toEqual(expect.arrayContaining(["user-patient", "labo-1", "labo-2"]));
    expect(destinataires).toHaveLength(3);
  });

  it("le message au patient ne contient ni le motif ni le nom de l'examen ; celui du laboratoire contient le motif", async () => {
    await annulerExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Motif confidentiel" }));

    const messagePatient = creerNotificationMock.mock.calls.find((appel) => appel[0] === "user-patient")![2] as string;
    const messageLabo = creerNotificationMock.mock.calls.find((appel) => appel[0] === "labo-1")![2] as string;
    expect(messagePatient).not.toContain("Motif confidentiel");
    expect(messageLabo).toContain("Motif confidentiel");
  });

  it("refuse l'annulation par un medecin qui n'est pas le demandeur", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examen({ demandeurId: "autre-medecin" }));

    const resultat = await annulerExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Motif valable" }));

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse l'annulation d'un examen dont le resultat est deja saisi", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examen({ statut: "resultat_saisi" }));

    const resultat = await annulerExamenAction(etatInitial, formulaire({ examenId: "ex-1", motif: "Motif valable" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("plus etre annule");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });
});
