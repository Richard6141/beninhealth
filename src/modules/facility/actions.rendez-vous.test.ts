import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Actions de rendez-vous du module facility : garde de statut (RG-RDV-00) et
 * double reservation (RG-RDV-03). Prisma est simule ; la garantie d'atomicite
 * elle-meme (index unique partiel) est prouvee sur la vraie base par le
 * script de concurrence decrit dans docs/coordination-agents.md.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("./creneau-disponible", () => ({ dateDansUnCreneauDisponible: vi.fn(async () => true) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import {
  annulerRendezVousAction,
  annulerRendezVousProfessionnelAction,
  confirmerRendezVousAction,
  creerRendezVousAction,
} from "./actions";
import { MESSAGE_CRENEAU_PRIS, TRANSITIONS } from "./rendez-vous-etats";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  rendezVous: { findUnique: Mock; findFirst: Mock; create: Mock; updateMany: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETAT_INITIAL = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-1" });
  prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-1" });
  prismaMock.professionnelSante.findUnique.mockResolvedValue({
    id: "pro-1",
    userId: "user-pro",
    etablissementId: "etab-1",
    statutValidation: "valide",
  });
  prismaMock.rendezVous.findFirst.mockResolvedValue(null);
  prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 1 });
});

describe("annulerRendezVousAction (patient)", () => {
  it("annule un rendez-vous encore actif et le journalise dans la meme transaction", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1" });

    const resultat = await annulerRendezVousAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme"] } },
      data: { statut: "annule" },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse d'annuler un rendez-vous deja termine, annule ou absent, sans rien journaliser", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-1" });
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await annulerRendezVousAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.annuler.refus, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse le rendez-vous d'un autre patient (Zero Trust)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", patientId: "pat-autre" });

    const resultat = await annulerRendezVousAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });
});

describe("confirmerRendezVousAction et annulerRendezVousProfessionnelAction", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
  });

  it("ne reconfirme pas un rendez-vous annule et ne notifie pas le patient", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({
      id: "rdv-1",
      professionnelId: "pro-1",
      date: new Date("2099-01-05T09:00:00.000Z"),
      patient: { userId: "user-1" },
    });
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await confirmerRendezVousAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.confirmer.refus, success: false });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande"] } },
      data: { statut: "confirme" },
    });
    expect(creerNotificationMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("confirme un rendez-vous en attente et notifie le patient", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({
      id: "rdv-1",
      professionnelId: "pro-1",
      date: new Date("2099-01-05T09:00:00.000Z"),
      patient: { userId: "user-1" },
    });

    const resultat = await confirmerRendezVousAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(creerNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("refuse l'annulation par le professionnel d'un rendez-vous deja clos", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue({ id: "rdv-1", professionnelId: "pro-1" });
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await annulerRendezVousProfessionnelAction(ETAT_INITIAL, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.annuler.refus, success: false });
  });
});

describe("creerRendezVousAction : double reservation (RG-RDV-03)", () => {
  const CHAMPS = { etablissementId: "etab-1", professionnelId: "pro-1", date: "2099-01-05T09:00", motif: "Controle" };

  it("refuse un creneau deja pris detecte a la lecture", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue({ id: "rdv-existant" });

    const resultat = await creerRendezVousAction(ETAT_INITIAL, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_CRENEAU_PRIS, success: false });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse proprement quand une demande simultanee a pris le creneau entre la lecture et l'ecriture (P2002)", async () => {
    prismaMock.rendezVous.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" })
    );

    const resultat = await creerRendezVousAction(ETAT_INITIAL, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_CRENEAU_PRIS, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("une autre erreur d'ecriture reste une erreur generique (pas de faux message de creneau pris)", async () => {
    prismaMock.rendezVous.create.mockRejectedValue(new Error("connexion perdue"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultat = await creerRendezVousAction(ETAT_INITIAL, formulaire(CHAMPS));

    expect(resultat.success).toBe(false);
    expect(resultat.error).not.toBe(MESSAGE_CRENEAU_PRIS);
  });

  it("cree la demande quand le creneau est libre", async () => {
    prismaMock.rendezVous.create.mockResolvedValue({ id: "rdv-nouveau" });

    const resultat = await creerRendezVousAction(ETAT_INITIAL, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: "pat-1", professionnelId: "pro-1", statut: "demande" }),
    });
  });
});
