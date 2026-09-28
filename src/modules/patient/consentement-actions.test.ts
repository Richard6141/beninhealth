import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() },
    journalAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import { grantConsentAction, revokeConsentAction, type PatientActionState } from "@/modules/patient/actions";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  consentement: { findUnique: Mock; upsert: Mock; update: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const ETAT: PatientActionState = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const patientAvecUser = {
  id: "pat-1",
  userId: "user-pat",
  user: { nom: "Adjovi", prenom: "Awa", niveauVerification: "N2" },
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"], sessionId: "s-1" });
  p.patient.findUnique.mockResolvedValue(patientAvecUser);
  p.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
});

describe("grantConsentAction", () => {
  beforeEach(() => {
    p.professionnelSante.findUnique.mockResolvedValue({ userId: "pro-1", statutValidation: "valide" });
    p.consentement.upsert.mockResolvedValue({ id: "cons-1" });
  });

  it("accorde le consentement et notifie le beneficiaire (N-CONSENT-GRANTED), sans exposer le patient a un autre professionnel", async () => {
    const resultat = await grantConsentAction(
      ETAT,
      formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "FULL", duree: "12mois" })
    );

    expect(resultat.success).toBe(true);
    expect(p.consentement.upsert).toHaveBeenCalledTimes(1);
    expect(p.consentement.upsert.mock.calls[0][0]).toMatchObject({
      create: expect.objectContaining({ niveauAcces: "FULL" }),
      update: expect.objectContaining({ niveauAcces: "FULL" }),
    });
    expect(creerNotificationMock).toHaveBeenCalledTimes(1);
    const [destinataire, type, message, lien] = creerNotificationMock.mock.calls[0];
    expect(destinataire).toBe("pro-1");
    expect(type).toBe("consentement_accorde");
    expect(message).toContain("Awa Adjovi");
    expect(message).toContain("dossier complet");
    expect(message).toContain("Tout le dossier (hors informations sensibles)");
    expect(lien).toBe("/app/medecin/patients");
  });

  it("refuse un professionnel non valide, sans creer de consentement ni notifier", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ userId: "pro-1", statutValidation: "en_attente" });

    const resultat = await grantConsentAction(
      ETAT,
      formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "FULL", duree: "12mois" })
    );

    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse un acteur qui n'est pas un professionnel de sante connu (Zero Trust)", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);

    const resultat = await grantConsentAction(
      ETAT,
      formulaire({ acteurAutoriseId: "inconnu", typeAcces: "dossier_complet", niveauAcces: "FULL", duree: "12mois" })
    );

    expect(resultat.success).toBe(false);
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse sans session, sans toucher a la base", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await grantConsentAction(
      ETAT,
      formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "FULL", duree: "12mois" })
    );

    expect(resultat.success).toBe(false);
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });

  it("refuse des donnees invalides (type d'acces, niveau ou duree absents)", async () => {
    const resultat = await grantConsentAction(ETAT, formulaire({ acteurAutoriseId: "pro-1" }));

    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("refuse un niveau invalide", async () => {
    const resultat = await grantConsentAction(
      ETAT,
      formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "TOUT", duree: "12mois" })
    );

    expect(resultat.success).toBe(false);
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  describe("niveau FULL_SENSITIVE (RG-ACC-13, CA-2)", () => {
    it("l'accorde a un patient de compte verifie N2", async () => {
      const resultat = await grantConsentAction(
        ETAT,
        formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "FULL_SENSITIVE", duree: "12mois" })
      );

      expect(resultat.success).toBe(true);
      expect(p.consentement.upsert.mock.calls[0][0]).toMatchObject({
        create: expect.objectContaining({ niveauAcces: "FULL_SENSITIVE" }),
      });
    });

    it("le refuse a un patient de compte non verifie (N0/N1), sans creer ni notifier", async () => {
      p.patient.findUnique.mockResolvedValue({
        ...patientAvecUser,
        user: { ...patientAvecUser.user, niveauVerification: "N1" },
      });

      const resultat = await grantConsentAction(
        ETAT,
        formulaire({ acteurAutoriseId: "pro-1", typeAcces: "dossier_complet", niveauAcces: "FULL_SENSITIVE", duree: "12mois" })
      );

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("N2");
      expect(p.consentement.upsert).not.toHaveBeenCalled();
      expect(creerNotificationMock).not.toHaveBeenCalled();
    });
  });
});

describe("revokeConsentAction", () => {
  const consentementActif = { id: "cons-1", patientId: "pat-1", acteurAutoriseId: "pro-1", typeAcces: "consultations" };

  beforeEach(() => {
    p.consentement.findUnique.mockResolvedValue(consentementActif);
    p.consentement.update.mockResolvedValue({});
  });

  it("retire le consentement et notifie le beneficiaire (N-CONSENT-REVOKED)", async () => {
    const resultat = await revokeConsentAction(ETAT, formulaire({ consentementId: "cons-1" }));

    expect(resultat.success).toBe(true);
    expect(p.consentement.update).toHaveBeenCalledWith({
      where: { id: "cons-1" },
      data: { statut: "retire", dateFin: expect.any(Date) },
    });
    expect(creerNotificationMock).toHaveBeenCalledTimes(1);
    const [destinataire, type, message] = creerNotificationMock.mock.calls[0];
    expect(destinataire).toBe("pro-1");
    expect(type).toBe("consentement_retire");
    expect(message).toContain("Awa Adjovi");
    expect(message).toContain("consultations");
  });

  it("refuse un consentement qui appartient a un autre patient (Zero Trust), sans notifier", async () => {
    p.consentement.findUnique.mockResolvedValue({ ...consentementActif, patientId: "pat-autre" });

    const resultat = await revokeConsentAction(ETAT, formulaire({ consentementId: "cons-1" }));

    expect(resultat.success).toBe(false);
    expect(p.consentement.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse un consentement introuvable", async () => {
    p.consentement.findUnique.mockResolvedValue(null);

    const resultat = await revokeConsentAction(ETAT, formulaire({ consentementId: "inconnu" }));

    expect(resultat.success).toBe(false);
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await revokeConsentAction(ETAT, formulaire({ consentementId: "cons-1" }));

    expect(resultat.success).toBe(false);
    expect(p.consentement.findUnique).not.toHaveBeenCalled();
  });
});
