import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    examenMedical: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true) } }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import { validerResultatExamenAction } from "@/modules/laboratoire/actions";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  examenMedical: { findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(): FormData {
  const donnees = new FormData();
  donnees.set("examenId", "ex-1");
  donnees.set("motDePasse", "secret");
  return donnees;
}

function examenEnAttenteDeValidation(sensible: boolean) {
  return {
    id: "ex-1",
    laboratoireId: "labo-etab",
    statut: "resultat_saisi",
    sensible,
    saisiParId: "prof-saisie",
    resultat: "Resultat de test",
    resultatsParametres: null,
    patient: { userId: "user-patient" },
    demandeur: { userId: "user-medecin" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "labo-2", roles: ["laboratoire"] });
  p.user.findUnique.mockResolvedValue({ id: "labo-2", motDePasseHash: "hash" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-validation", etablissementId: "labo-etab" });
});

describe("validerResultatExamenAction : notification du patient (RG-LAB-41)", () => {
  it("un examen NON sensible previent le patient et le medecin demandeur a la validation", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examenEnAttenteDeValidation(false));

    const resultat = await validerResultatExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires).toContain("user-patient");
    expect(destinataires).toContain("user-medecin");
  });

  it("regression : un examen SENSIBLE ne previent PAS le patient a la validation, seulement le medecin", async () => {
    p.examenMedical.findUnique.mockResolvedValue(examenEnAttenteDeValidation(true));

    const resultat = await validerResultatExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.update).toHaveBeenCalled();
    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires).not.toContain("user-patient");
    expect(destinataires).toContain("user-medecin");
  });

  it("refuse l'auto-validation (quatre yeux) sans rien notifier", async () => {
    p.examenMedical.findUnique.mockResolvedValue({ ...examenEnAttenteDeValidation(false), saisiParId: "prof-validation" });

    const resultat = await validerResultatExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("vous-meme");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});
