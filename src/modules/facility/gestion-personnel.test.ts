import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Suspension et reactivation du personnel (F-ETA-04) : un compte ne change
 * d'etat que depuis l'etat attendu ("actif" pour suspendre, "suspendu" pour
 * reactiver), et un refus du ministere (F-ADM-03) ne se leve pas depuis
 * l'etablissement.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() },
    rendezVous: { count: vi.fn() },
    user: { updateMany: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { reactiverPersonnelAction, renseignerNumeroOrdreAction, suspendrePersonnelAction } from "./gestion-personnel";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findFirst: Mock; updateMany: Mock };
  user: { updateMany: Mock; findUnique: Mock; findMany: Mock };
  sessionActive: { deleteMany: Mock };
};
const creerNotificationMock = creerNotification as unknown as Mock;
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETAT = { error: null, success: false };
const MOTIF = "Absence prolongée, accès à suspendre.";

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
  prismaMock.professionnelSante.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
    where.userId === "admin-1"
      ? { id: "pro-admin", userId: "admin-1", etablissementId: "etab-1", specialite: "Administration", statutValidation: "valide" }
      : { id: "pro-cible", userId: "user-cible", etablissementId: "etab-1", specialite: "Médecine générale", statutValidation: "valide" }
  );
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("suspendrePersonnelAction", () => {
  it("suspend un compte actif, ferme ses sessions et journalise", async () => {
    const resultat = await suspendrePersonnelAction(ETAT, formulaire({ userId: "user-cible", motif: MOTIF }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-cible", statut: "actif" }, data: { statut: "suspendu" } });
    expect(prismaMock.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-cible" } });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse de suspendre un compte qui n'est pas actif (ex. affiliation terminee) : sinon il deviendrait reactivable", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await suspendrePersonnelAction(ETAT, formulaire({ userId: "user-cible", motif: MOTIF }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("actif");
    expect(prismaMock.sessionActive.deleteMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });
});

describe("reactiverPersonnelAction", () => {
  it("reactive un compte suspendu et journalise", async () => {
    const resultat = await reactiverPersonnelAction(ETAT, formulaire({ userId: "user-cible" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-cible", statut: "suspendu" }, data: { statut: "actif" } });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("ne reactive jamais un compte qui n'est pas suspendu (affiliation terminee, fusionne, deja actif)", async () => {
    prismaMock.user.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await reactiverPersonnelAction(ETAT, formulaire({ userId: "user-cible" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("suspendu");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("ne leve pas depuis l'etablissement un refus du ministere (F-ADM-03)", async () => {
    prismaMock.professionnelSante.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === "admin-1"
        ? { id: "pro-admin", userId: "admin-1", etablissementId: "etab-1", specialite: "Administration", statutValidation: "valide" }
        : { id: "pro-cible", userId: "user-cible", etablissementId: "etab-1", specialite: "Médecine générale", statutValidation: "rejete" }
    );

    const resultat = await reactiverPersonnelAction(ETAT, formulaire({ userId: "user-cible" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("ministère");
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un appelant qui n'est pas administrateur d'etablissement", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-x", roles: ["medecin"] });

    const resultat = await reactiverPersonnelAction(ETAT, formulaire({ userId: "user-cible" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un membre d'un autre etablissement", async () => {
    prismaMock.professionnelSante.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === "admin-1"
        ? { id: "pro-admin", userId: "admin-1", etablissementId: "etab-1", specialite: "Administration", statutValidation: "valide" }
        : { id: "pro-cible", userId: "user-cible", etablissementId: "etab-2", specialite: "Médecine générale", statutValidation: "valide" }
    );

    const resultat = await reactiverPersonnelAction(ETAT, formulaire({ userId: "user-cible" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("renseignerNumeroOrdreAction (reponse a une demande de complement, F-ADM-03)", () => {
  function cible(champs: Record<string, unknown> = {}) {
    prismaMock.professionnelSante.findUnique.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === "admin-1"
        ? { id: "pro-admin", userId: "admin-1", etablissementId: "etab-1", specialite: "Administration", statutValidation: "valide" }
        : {
            id: "pro-cible",
            userId: "user-cible",
            etablissementId: "etab-1",
            specialite: "Médecine générale",
            statutValidation: "valide",
            profession: null,
            numeroOrdre: null,
            validationDecision: null,
            ...champs,
          }
    );
  }

  beforeEach(() => {
    cible();
    prismaMock.user.findUnique.mockResolvedValue({ roles: [{ nom: "medecin" }, { nom: "patient" }] });
    prismaMock.professionnelSante.findFirst.mockResolvedValue(null);
    prismaMock.professionnelSante.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.user.findMany.mockResolvedValue([{ id: "validateur-1" }]);
  });

  it("enregistre le numero normalise, deduit la profession du role, annule la verification et la demande de complement", async () => {
    const resultat = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: " onmb 123 " }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.professionnelSante.updateMany).toHaveBeenCalledWith({
      where: { id: "pro-cible", statutValidation: { not: "rejete" } },
      data: {
        profession: "medecin",
        numeroOrdre: "ONMB123",
        ordreVerifieLe: null,
        ordreVerifiePar: null,
        validationDecision: null,
        validationMessage: null,
        validationDecideLe: null,
      },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "numero_ordre_renseigne", donneeConcernee: "utilisateur:user-cible" });
  });

  it("previent les validateurs seulement quand une demande de complement etait en cours", async () => {
    await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB123" }));
    expect(creerNotificationMock).not.toHaveBeenCalled();

    cible({ validationDecision: "complement" });
    await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB123" }));
    expect(creerNotificationMock).toHaveBeenCalledWith("validateur-1", "validation_complement_recu", expect.any(String), "/app/ministere/validation-professionnels");
  });

  it("refuse un numero deja pris par une autre personne, sans reveler laquelle", async () => {
    prismaMock.professionnelSante.findFirst.mockResolvedValue({ id: "autre-pro" });

    const resultat = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB123" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("déjà enregistré");
    expect(resultat.error).not.toContain("autre-pro");
    expect(prismaMock.professionnelSante.findFirst).toHaveBeenCalledWith({
      where: { profession: "medecin", numeroOrdre: "ONMB123", id: { not: "pro-cible" } },
      select: { id: true },
    });
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un numero vide ou aux caracteres invalides", async () => {
    for (const saisie of ["", "   ", "AB CD;DROP", "a".repeat(41)]) {
      const resultat = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: saisie }));
      expect(resultat.success).toBe(false);
    }
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("refuse pour un profil refuse par le ministere", async () => {
    cible({ statutValidation: "rejete" });

    const resultat = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB123" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("ministère");
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("refuse pour un compte sans profession reglementee (ex. administrateur)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ roles: [{ nom: "admin_etablissement" }] });

    const resultat = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB123" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("refuse de reenregistrer le meme numero, un membre d'un autre etablissement et un appelant non administrateur", async () => {
    cible({ profession: "medecin", numeroOrdre: "ONMB123" });
    const identique = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "onmb123" }));
    expect(identique.success).toBe(false);

    cible({ etablissementId: "etab-2" });
    const autreEtab = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB999" }));
    expect(autreEtab.success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "user-x", roles: ["medecin"] });
    const nonAdmin = await renseignerNumeroOrdreAction(ETAT, formulaire({ userId: "user-cible", numeroOrdre: "ONMB999" }));
    expect(nonAdmin.success).toBe(false);

    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });
});
