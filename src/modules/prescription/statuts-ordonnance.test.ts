import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    prescription: { findUnique: vi.fn(), update: vi.fn() },
    evenementPrescription: { create: vi.fn() },
    delivrance: { findUnique: vi.fn(), update: vi.fn() },
    ligneDelivrance: { groupBy: vi.fn() },
    // F-CIT-08 : destinataireNotificationPatient (non mockee ici, voir plus
    // bas) lit ces deux tables elle-meme pour router vers le tuteur d'une
    // personne a charge, meme pattern que rappels-rendez-vous.test.ts.
    patient: { findUnique: vi.fn() },
    consentement: { findFirst: vi.fn() },
    $queryRaw: vi.fn(async () => [{ id: "presc-1" }]),
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  return { default: { compare }, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn(async () => true) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerNotification } from "@/modules/notification/creer";
import {
  annulerDelivranceAction,
  annulerPrescriptionAction,
  arreterPrescriptionAction,
  delivrerPrescriptionAction,
} from "@/modules/prescription/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  prescription: { findUnique: Mock; update: Mock };
  evenementPrescription: { create: Mock };
  delivrance: { findUnique: Mock; update: Mock };
  ligneDelivrance: { groupBy: Mock };
  patient: { findUnique: Mock };
  consentement: { findFirst: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const notifierMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };
const MOTIF = "Motif de test suffisamment long";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function prescription(statut: string, surcharge: Record<string, unknown> = {}) {
  return {
    id: "presc-1",
    numero: "RX-2026-0001",
    statut,
    patientId: "pat-1",
    medecinPrescripteurId: "pro-med",
    patient: { userId: "user-pat" },
    delivrances: [],
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.evenementPrescription.create.mockResolvedValue({});
  p.prescription.update.mockResolvedValue({});
  // F-CIT-08 : par defaut un patient normal, notifie directement.
  p.patient.findUnique.mockResolvedValue({ userId: "user-pat", user: { statut: "actif" } });
});

describe("statuts d'une ordonnance (F-PRE-05)", () => {
  describe("cote medecin", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
      p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-med", etablissementId: "etab-1" });
    });

    it("arreter une ordonnance delivree en partie la passe a arretee, distinct de annulee", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("delivree_partiellement"));

      const resultat = await arreterPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(p.prescription.update).toHaveBeenCalledWith({ where: { id: "presc-1" }, data: { statut: "arretee" } });
      expect(p.evenementPrescription.create.mock.calls[0][0].data.type).toBe("arret");
      expect(notifierMock).toHaveBeenCalledTimes(1);
    });

    it("refuse d'arreter une ordonnance qui n'a pas ete delivree en partie", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("validee"));

      const resultat = await arreterPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat.success).toBe(false);
      expect(p.prescription.update).not.toHaveBeenCalled();
    });

    it("annuler une ordonnance jamais delivree la passe a annulee", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("validee"));

      const resultat = await annulerPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(p.prescription.update).toHaveBeenCalledWith({ where: { id: "presc-1" }, data: { statut: "annulee" } });
    });

    it("refuse d'annuler une ordonnance deja arretee", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("arretee", { delivrances: [{ id: "d1" }] }));

      const resultat = await annulerPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("arretee");
      expect(p.prescription.update).not.toHaveBeenCalled();
    });

    // F-CIT-08 : le patient d'une prescription peut etre une personne a
    // charge sans compte (F-CIT-07). creerNotification(patient.userId, ...)
    // perdait alors silencieusement la notification, le compte
    // "sans_compte" n'etant jamais connecte. Meme correctif que
    // rappels-rendez-vous.test.ts, verifie ici pour annuler/arreter.
    it("annuler : une personne a charge (sans_compte) est notifiee via son tuteur, jamais son compte placeholder", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("validee"));
      p.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
      p.consentement.findFirst.mockResolvedValue({ acteurAutoriseId: "user-tuteur" });

      const resultat = await annulerPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(notifierMock).toHaveBeenCalledWith(
        "user-tuteur",
        "prescription",
        expect.stringContaining("annulee"),
        "/app/patient/prescriptions"
      );
      expect(notifierMock).not.toHaveBeenCalledWith(
        "user-placeholder",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });

    it("arreter : une personne a charge (sans_compte) est notifiee via son tuteur, jamais son compte placeholder", async () => {
      p.prescription.findUnique.mockResolvedValue(prescription("delivree_partiellement"));
      p.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
      p.consentement.findFirst.mockResolvedValue({ acteurAutoriseId: "user-tuteur" });

      const resultat = await arreterPrescriptionAction(
        etatInitial,
        formulaire({ prescriptionId: "presc-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(notifierMock).toHaveBeenCalledWith(
        "user-tuteur",
        "prescription",
        expect.stringContaining("arretee"),
        "/app/patient/prescriptions"
      );
      expect(notifierMock).not.toHaveBeenCalledWith(
        "user-placeholder",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe("cote pharmacie", () => {
    beforeEach(() => {
      getSessionMock.mockResolvedValue({ userId: "user-ph", roles: ["pharmacien"] });
      p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-ph", etablissementId: "etab-ph" });
    });

    it("refuse de delivrer une ordonnance arretee, avec un message qui le dit", async () => {
      p.prescription.findUnique.mockResolvedValue({
        ...prescription("arretee"),
        lignes: [],
        delivrances: [{ id: "deliv-anterieure" }],
      });

      const resultat = await delivrerPrescriptionAction(
        etatInitial,
        formulaire({
          prescriptionId: "presc-1",
          lignesJSON: JSON.stringify([{ lignePrescriptionId: "l1", quantiteDelivree: 1 }]),
        })
      );

      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("arretee");
      expect(p.prescription.update).not.toHaveBeenCalled();
    });

    function delivranceAAnnuler(statutPrescription: string) {
      return {
        id: "deliv-1",
        prescriptionId: "presc-1",
        etablissementId: "etab-ph",
        annulee: false,
        date: new Date(),
        prescription: {
          statut: statutPrescription,
          lignes: [{ id: "l1", quantite: 10 }],
        },
      };
    }

    it("annuler une delivrance ne ressuscite pas une ordonnance arretee", async () => {
      p.delivrance.findUnique.mockResolvedValue(delivranceAAnnuler("arretee"));
      p.delivrance.update.mockResolvedValue({});
      // Reste une delivrance partielle : l'ancien calcul aurait renvoye "delivree_partiellement".
      p.ligneDelivrance.groupBy.mockResolvedValue([{ lignePrescriptionId: "l1", _sum: { quantiteDelivree: 4 } }]);

      const resultat = await annulerDelivranceAction(
        etatInitial,
        formulaire({ delivranceId: "deliv-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(p.prescription.update).toHaveBeenCalledWith({
        where: { id: "presc-1" },
        data: { statut: "arretee" },
      });
    });

    it("annuler la seule delivrance d'une ordonnance active la remet a delivrer (comportement inchange)", async () => {
      p.delivrance.findUnique.mockResolvedValue(delivranceAAnnuler("delivree_partiellement"));
      p.delivrance.update.mockResolvedValue({});
      p.ligneDelivrance.groupBy.mockResolvedValue([]);

      const resultat = await annulerDelivranceAction(
        etatInitial,
        formulaire({ delivranceId: "deliv-1", motif: MOTIF })
      );

      expect(resultat).toEqual({ error: null, success: true });
      expect(p.prescription.update).toHaveBeenCalledWith({
        where: { id: "presc-1" },
        data: { statut: "validee" },
      });
    });

    it("annuler une delivrance qui completait l'ordonnance la repasse a delivree en partie", async () => {
      p.delivrance.findUnique.mockResolvedValue(delivranceAAnnuler("delivree"));
      p.delivrance.update.mockResolvedValue({});
      p.ligneDelivrance.groupBy.mockResolvedValue([{ lignePrescriptionId: "l1", _sum: { quantiteDelivree: 6 } }]);

      await annulerDelivranceAction(etatInitial, formulaire({ delivranceId: "deliv-1", motif: MOTIF }));

      expect(p.prescription.update).toHaveBeenCalledWith({
        where: { id: "presc-1" },
        data: { statut: "delivree_partiellement" },
      });
    });
  });
});
