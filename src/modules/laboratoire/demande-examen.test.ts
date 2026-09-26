import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    consentement: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    examenMedical: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import { demanderExamenAction } from "@/modules/laboratoire/actions";
import { FORMAT_NUMERO_EXAMEN } from "@/modules/laboratoire/numero-examen";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock };
  consentement: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock };
  examenMedical: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(): FormData {
  const donnees = new FormData();
  donnees.set("patientId", "patient-1");
  donnees.set("laboratoireId", "labo-etab");
  donnees.set("typeExamen", "Glycemie a jeun");
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-medecin", etablissementId: "hopital" });
  p.professionnelSante.findMany.mockResolvedValue([{ userId: "labo-1" }, { userId: "labo-2" }]);
  p.consentement.findUnique.mockResolvedValue({ statut: "actif", dateFin: null, typeAcces: "dossier_complet" });
  p.etablissementSanitaire.findUnique.mockResolvedValue({ id: "labo-etab", type: "laboratoire" });
  p.examenMedical.create.mockImplementation(async ({ data }: { data: { numero: string } }) => ({ id: "ex-1", numero: data.numero }));
});

describe("demanderExamenAction : numero LB et notification du laboratoire (F-LAB-01)", () => {
  it("attribue un numero LB-XXXX-XXXX a la demande", async () => {
    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.create.mock.calls[0][0].data.numero).toMatch(FORMAT_NUMERO_EXAMEN);
  });

  it("previent chaque membre du laboratoire, sans nom de patient ni d'examen dans le message", async () => {
    await demanderExamenAction(etatInitial, formulaire());

    const destinataires = creerNotificationMock.mock.calls.map((appel) => appel[0]);
    expect(destinataires).toEqual(["labo-1", "labo-2"]);
    const message = creerNotificationMock.mock.calls[0][2] as string;
    expect(message).not.toContain("Glycemie");
    expect(message).not.toContain("patient-1");
  });

  it("rejoue la demande avec un nouveau numero apres une collision d'unicite (P2002)", async () => {
    p.examenMedical.create
      .mockRejectedValueOnce({ code: "P2002" })
      .mockImplementation(async ({ data }: { data: { numero: string } }) => ({ id: "ex-1", numero: data.numero }));

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.examenMedical.create).toHaveBeenCalledTimes(2);
  });

  it("abandonne avec une erreur claire si la collision persiste apres 5 essais", async () => {
    p.examenMedical.create.mockRejectedValue({ code: "P2002" });
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).toHaveBeenCalledTimes(5);
    expect(creerNotificationMock).not.toHaveBeenCalled();
    erreurConsole.mockRestore();
  });

  it("une erreur autre qu'une collision n'est pas rejouee", async () => {
    p.examenMedical.create.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await demanderExamenAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.examenMedical.create).toHaveBeenCalledTimes(1);
    erreurConsole.mockRestore();
  });
});
