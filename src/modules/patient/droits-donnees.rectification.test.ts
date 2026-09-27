import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    informationDeclaree: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    demandeRectification: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import {
  demanderRectificationAction,
  getMesDemandesRectificationRecues,
  repondreRectificationAction,
} from "./droits-donnees";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  informationDeclaree: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  demandeRectification: { create: Mock; findMany: Mock; findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const ETAT_INITIAL = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-patient", roles: ["patient"] });
  p.patient.findUnique.mockResolvedValue({ id: "patient-1", userId: "user-patient" });
  p.demandeRectification.create.mockResolvedValue({ id: "demande-1" });
});

describe("demanderRectificationAction : demande generale (sans element precis)", () => {
  it("cree une entree JournalAudit, comportement d'origine inchange (aucun professionnel notifie)", async () => {
    const resultat = await demanderRectificationAction(
      ETAT_INITIAL,
      formulaire({ description: "Mon groupe sanguin affiche est incorrect, il devrait etre O+." })
    );

    expect(resultat.success).toBe(true);
    expect(p.demandeRectification.create.mock.calls[0][0].data).toMatchObject({
      patientId: "patient-1",
      informationDeclareeId: null,
      professionnelDestinataireId: null,
    });
    expect(creerNotificationMock).not.toHaveBeenCalled();
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0].action).toBe("demande_rectification");
  });

  it("refuse une description trop courte", async () => {
    const resultat = await demanderRectificationAction(ETAT_INITIAL, formulaire({ description: "trop court" }));
    expect(resultat.success).toBe(false);
    expect(p.demandeRectification.create).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await demanderRectificationAction(
      ETAT_INITIAL,
      formulaire({ description: "Une description suffisamment longue pour passer." })
    );
    expect(resultat.error).toContain("Session");
  });
});

describe("demanderRectificationAction : signalement d'un element confirme (RG-CIT-30)", () => {
  it("route vers le professionnel confirmant et le notifie", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue({
      id: "info-1",
      patientId: "patient-1",
      statut: "confirme",
      confirmeParId: "pro-1",
    });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", userId: "user-pro-1" });

    const resultat = await demanderRectificationAction(
      ETAT_INITIAL,
      formulaire({
        description: "Cette allergie n'est pas la mienne, je pense a une confusion de dossier.",
        informationDeclareeId: "info-1",
      })
    );

    expect(resultat.success).toBe(true);
    expect(p.demandeRectification.create.mock.calls[0][0].data).toMatchObject({
      informationDeclareeId: "info-1",
      professionnelDestinataireId: "pro-1",
    });
    expect(creerNotificationMock).toHaveBeenCalledWith(
      "user-pro-1",
      "N-CIT-RECTIFICATION-RECUE",
      expect.any(String),
      "/app/medecin/rectifications"
    );
  });

  it("refuse un element d'un autre patient (jamais confiance dans le seul id transmis)", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue({
      id: "info-9",
      patientId: "autre-patient",
      statut: "confirme",
      confirmeParId: "pro-1",
    });

    const resultat = await demanderRectificationAction(
      ETAT_INITIAL,
      formulaire({ description: "Une description suffisamment longue pour passer.", informationDeclareeId: "info-9" })
    );

    expect(resultat.success).toBe(false);
    expect(p.demandeRectification.create).not.toHaveBeenCalled();
  });

  it("refuse un element qui n'est pas confirme (RG-CIT-30 ne s'applique qu'aux elements confirmes)", async () => {
    p.informationDeclaree.findUnique.mockResolvedValue({
      id: "info-2",
      patientId: "patient-1",
      statut: "declare",
      confirmeParId: null,
    });

    const resultat = await demanderRectificationAction(
      ETAT_INITIAL,
      formulaire({ description: "Une description suffisamment longue pour passer.", informationDeclareeId: "info-2" })
    );

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("confirme");
  });
});

describe("getMesDemandesRectificationRecues : lecture reservee au professionnel destinataire", () => {
  it("ne lit que les demandes routees vers le professionnel connecte", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pro-1", roles: ["medecin"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1" });
    p.demandeRectification.findMany.mockResolvedValue([
      {
        id: "demande-1",
        description: "Erreur signalee",
        statut: "en_attente",
        reponseProfessionnel: null,
        dateCreation: new Date("2026-09-28"),
        informationDeclaree: { valeur: "Pénicilline" },
      },
    ]);

    const demandes = await getMesDemandesRectificationRecues();

    expect(p.demandeRectification.findMany.mock.calls[0][0].where).toEqual({ professionnelDestinataireId: "pro-1" });
    expect(demandes).toEqual([
      expect.objectContaining({ id: "demande-1", elementConteste: "Pénicilline", statut: "en_attente" }),
    ]);
  });

  it("refuse un role sans droit read:demande_rectification", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });
    expect(await getMesDemandesRectificationRecues()).toEqual([]);
    expect(p.demandeRectification.findMany).not.toHaveBeenCalled();
  });
});

describe("repondreRectificationAction : reponse reservee au professionnel destinataire", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pro-1", roles: ["medecin"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1" });
  });

  it("refuse une demande adressee a un autre professionnel", async () => {
    p.demandeRectification.findUnique.mockResolvedValue({ id: "demande-1", professionnelDestinataireId: "autre-pro", statut: "en_attente" });

    const resultat = await repondreRectificationAction(ETAT_INITIAL, formulaire({ id: "demande-1", reponse: "Corrige." }));

    expect(resultat.error).toBe("Demande introuvable.");
    expect(p.demandeRectification.update).not.toHaveBeenCalled();
  });

  it("refuse une demande deja traitee", async () => {
    p.demandeRectification.findUnique.mockResolvedValue({ id: "demande-1", professionnelDestinataireId: "pro-1", statut: "traitee" });

    const resultat = await repondreRectificationAction(ETAT_INITIAL, formulaire({ id: "demande-1", reponse: "Corrige." }));

    expect(resultat.success).toBe(false);
    expect(p.demandeRectification.update).not.toHaveBeenCalled();
  });

  it("accepte et journalise une reponse valide", async () => {
    p.demandeRectification.findUnique.mockResolvedValue({ id: "demande-1", professionnelDestinataireId: "pro-1", statut: "en_attente" });

    const resultat = await repondreRectificationAction(
      ETAT_INITIAL,
      formulaire({ id: "demande-1", reponse: "Verifie et corrige dans le dossier." })
    );

    expect(resultat.success).toBe(true);
    expect(p.demandeRectification.update.mock.calls[0][0]).toMatchObject({
      where: { id: "demande-1" },
      data: { statut: "traitee", reponseProfessionnel: "Verifie et corrige dans le dossier." },
    });
    expect(journaliserMock.mock.calls[0][0].action).toBe("reponse_demande_rectification");
  });
});
