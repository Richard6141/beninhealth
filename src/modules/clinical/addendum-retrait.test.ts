import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Addendum et retrait d'une consultation validee (F-CLI-08, RG-CLI-00,
 * RG-CLI-70, RG-AUTH-53) : une consultation validee ne se modifie jamais, elle
 * se complete par un addendum ou se retire (jamais supprimee) par son auteur,
 * dans les 12 mois.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn(), findFirst: vi.fn() },
    consultation: { findUnique: vi.fn(), update: vi.fn() },
    addendumConsultation: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import { ajouterAddendumConsultationAction, retirerConsultationAction } from "./actions";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock; findFirst: Mock };
  consultation: { findUnique: Mock; update: Mock };
  addendumConsultation: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const notificationMock = creerNotification as unknown as Mock;
const evenementPilotageMock = publierEvenementPilotage as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;

const ETAT = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const CONSULTATION = {
  id: "c-1",
  professionnelId: "pro-1",
  patientId: "pat-1",
  etablissementId: "etab-1",
  date: new Date("2026-06-01T09:00:00Z"),
  statut: "terminee",
  saisieParErreur: false,
  dateValidation: new Date("2026-06-01T09:30:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", userId: "user-med", etablissementId: "etab-1" });
  prismaMock.consultation.findUnique.mockResolvedValue(CONSULTATION);
  prismaMock.addendumConsultation.create.mockResolvedValue({ id: "add-1" });
  prismaMock.user.findUnique.mockResolvedValue({ id: "user-med", motDePasseHash: "hash" });
  prismaMock.professionnelSante.findFirst.mockResolvedValue({ userId: "admin-etab" });
  compareMock.mockResolvedValue(true);
});

const addendum = (surcharges: Record<string, string> = {}) =>
  ajouterAddendumConsultationAction(ETAT, formulaire({ consultationId: "c-1", motif: "complement_information", contenu: "Resultat de la goutte epaisse recu : positif.", ...surcharges }));

const retrait = (surcharges: Record<string, string> = {}) =>
  retirerConsultationAction(ETAT, formulaire({ consultationId: "c-1", motif: "Mauvais patient", motDePasse: "MotDePasse1!", ...surcharges }));

describe("ajouterAddendumConsultationAction", () => {
  it("refuse sans session et pour tout role autre que medecin", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await addendum()).success).toBe(false);

    for (const role of ["infirmier", "pharmacien", "admin_etablissement", "patient"]) {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      const resultat = await addendum();
      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("medecins");
    }
    expect(prismaMock.addendumConsultation.create).not.toHaveBeenCalled();
  });

  it("valide le motif (liste du pack) et le contenu (1 a 2000 caracteres)", async () => {
    expect((await addendum({ motif: "au_hasard" })).success).toBe(false);
    expect((await addendum({ contenu: "   " })).success).toBe(false);
    expect((await addendum({ contenu: "a".repeat(2001) })).success).toBe(false);
    expect((await addendum({ contenu: "a".repeat(2000) })).success).toBe(true);
  });

  it("n'accepte que l'auteur de la consultation", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, professionnelId: "pro-autre" });
    expect((await addendum()).error).toContain("introuvable");

    prismaMock.consultation.findUnique.mockResolvedValue(null);
    expect((await addendum()).error).toContain("introuvable");

    expect(prismaMock.addendumConsultation.create).not.toHaveBeenCalled();
  });

  it("n'accepte qu'une consultation validee et non retiree", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, statut: "brouillon" });
    expect((await addendum()).error).toContain("validee");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, saisieParErreur: true });
    expect((await addendum()).error).toContain("retiree");

    expect(prismaMock.addendumConsultation.create).not.toHaveBeenCalled();
  });

  it("RG-CLI-70 : refuse au-dela de 12 mois apres la validation, accepte juste avant", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, dateValidation: new Date("2025-09-26T09:59:00Z") });
    expect((await addendum()).error).toContain("12 mois");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, dateValidation: new Date("2025-09-26T10:01:00Z") });
    expect((await addendum()).success).toBe(true);

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, dateValidation: null });
    expect((await addendum()).error).toContain("12 mois");
  });

  it("ajoute l'addendum signe par le medecin de la session, le journalise, et ne modifie jamais la consultation (RG-CLI-00)", async () => {
    const resultat = await addendum();

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.addendumConsultation.create).toHaveBeenCalledWith({
      data: { consultationId: "c-1", auteurId: "user-med", motif: "complement_information", contenu: "Resultat de la goutte epaisse recu : positif." },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "ajout_addendum", donneeConcernee: "consultation:c-1" });
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });
});

describe("retirerConsultationAction", () => {
  it("refuse sans session et pour tout role autre que medecin", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await retrait()).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-x", roles: ["infirmier"] });
    expect((await retrait()).error).toContain("medecins");
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("exige un motif et le mot de passe", async () => {
    expect((await retrait({ motif: "" })).success).toBe(false);
    expect((await retrait({ motDePasse: "" })).success).toBe(false);
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("RG-AUTH-53 : refuse un mot de passe incorrect avant toute lecture de la consultation", async () => {
    compareMock.mockResolvedValue(false);

    const resultat = await retrait();

    expect(resultat).toEqual({ error: "Mot de passe incorrect.", success: false });
    expect(prismaMock.consultation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it("verifie le mot de passe du compte de la session", async () => {
    await retrait();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { id: "user-med" } });
    expect(compareMock).toHaveBeenCalledWith("MotDePasse1!", "hash");
  });

  it("n'accepte que l'auteur, une consultation validee, non deja retiree, dans les 12 mois", async () => {
    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, professionnelId: "pro-autre" });
    expect((await retrait()).error).toContain("introuvable");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, statut: "brouillon" });
    expect((await retrait()).error).toContain("validee");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, saisieParErreur: true });
    expect((await retrait()).error).toContain("deja ete retiree");

    prismaMock.consultation.findUnique.mockResolvedValue({ ...CONSULTATION, dateValidation: new Date("2025-01-01T00:00:00Z") });
    expect((await retrait()).error).toContain("12 mois");

    expect(prismaMock.consultation.update).not.toHaveBeenCalled();
  });

  it("marque la consultation retiree sans la supprimer, republie l'evenement de pilotage, journalise et previent le responsable", async () => {
    const resultat = await retrait();

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.consultation.update).toHaveBeenCalledWith({
      where: { id: "c-1" },
      data: { saisieParErreur: true, motifRetrait: "Mauvais patient", dateRetrait: MAINTENANT },
    });
    expect(evenementPilotageMock).toHaveBeenCalledWith(expect.anything(), { type: "consultation_retiree", date: CONSULTATION.date, etablissementId: "etab-1" });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "retrait_consultation", donneeConcernee: "consultation:c-1" });
    expect(notificationMock).toHaveBeenCalledWith("admin-etab", "consultation_retiree", expect.any(String), "/app/medecin/consultations");
  });

  it("le retrait aboutit meme sans responsable d'etablissement a prevenir", async () => {
    prismaMock.professionnelSante.findFirst.mockResolvedValue(null);

    expect((await retrait()).success).toBe(true);
    expect(notificationMock).not.toHaveBeenCalled();
  });
});
