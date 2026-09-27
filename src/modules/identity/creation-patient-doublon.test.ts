import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findMany: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    user: { create: vi.fn() },
    consentement: { create: vi.fn() },
    journalAudit: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "hash") }, hash: vi.fn(async () => "hash") }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerPatientParProfessionnelAction, type CreationPatientActionState } from "@/modules/identity/actions";

const p = prisma as unknown as {
  patient: { findMany: Mock };
  professionnelSante: { findUnique: Mock };
  user: { create: Mock };
  consentement: { create: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;

const ETAT: CreationPatientActionState = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const champsValides = {
  nom: "Adjovi",
  prenom: "Awa",
  sexe: "F",
  dateNaissance: "1990-04-23",
  telephone: "",
  contactUrgenceNom: "",
  contactUrgenceTelephone: "",
};

const candidatExistant = {
  id: "pat-existant",
  dateNaissance: new Date("1990-04-23T00:00:00Z"),
  sexe: "F",
  user: { nom: "Adjovi", prenom: "Awa", telephone: "+2290197123456" },
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "medecin-1", roles: ["medecin"], sessionId: "s-1" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-1", userId: "medecin-1" });
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      user: { create: p.user.create },
      consentement: { create: p.consentement.create },
      journalAudit: { create: vi.fn() },
    };
    return fn(tx);
  });
  p.user.create.mockResolvedValue({ id: "user-neuf", patient: { id: "pat-neuf" } });
});

describe("creerPatientParProfessionnelAction : detection de doublon (RG-CLI-20)", () => {
  it("aucun doublon : cree directement le dossier, sans jeton", async () => {
    p.patient.findMany.mockResolvedValue([]);

    const resultat = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    expect(resultat.success).toBe(true);
    expect(resultat.candidatDoublon).toBeUndefined();
    expect(p.user.create).toHaveBeenCalledTimes(1);
  });

  it("un doublon detecte renvoie un candidat masque et un jeton, sans creer de compte", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);

    const resultat = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    expect(resultat.success).toBe(false);
    expect(resultat.candidatDoublon).toEqual({
      initiales: "AA",
      anneeNaissance: 1990,
      sexe: "F",
      telephoneMasque: "••••3456",
    });
    expect(resultat.doublonToken).toBeTruthy();
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("cocher 'creer quand meme' SANS le jeton emis par la detection ne suffit plus a forcer la creation (le controle est refait)", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);

    const resultat = await creerPatientParProfessionnelAction(
      ETAT,
      formulaire({ ...champsValides, confirmerMalgreDoublon: "on", justificationDoublon: "Deuxieme personne, verifiee sur pièce" })
    );

    expect(resultat.success).toBe(false);
    expect(resultat.candidatDoublon).toBeTruthy();
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("un jeton emis pour une autre date de naissance ne force pas la creation (empreinte liee a l'identite complete)", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);
    const premier = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    const resultat = await creerPatientParProfessionnelAction(
      ETAT,
      formulaire({
        ...champsValides,
        dateNaissance: "1991-05-10",
        confirmerMalgreDoublon: "on",
        justificationDoublon: "Deuxieme personne, verifiee sur pièce",
        doublonToken: premier.doublonToken!,
      })
    );

    // Le jeton ne correspond plus a l'empreinte (date differente) : le
    // controle est refait, et retrouve le meme candidat (mock sans filtre
    // reel sur la date), donc aucune creation.
    expect(resultat.success).toBe(false);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("un jeton emis pour un AUTRE professionnel ne force pas la creation", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);
    const premier = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    getSessionMock.mockResolvedValue({ userId: "medecin-2", roles: ["medecin"], sessionId: "s-2" });
    const resultat = await creerPatientParProfessionnelAction(
      ETAT,
      formulaire({
        ...champsValides,
        confirmerMalgreDoublon: "on",
        justificationDoublon: "Deuxieme personne, verifiee sur pièce",
        doublonToken: premier.doublonToken!,
      })
    );

    expect(resultat.success).toBe(false);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("avec le jeton exact renvoye par la detection et une justification suffisante, la creation forcee reussit", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);
    const premier = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    const resultat = await creerPatientParProfessionnelAction(
      ETAT,
      formulaire({
        ...champsValides,
        confirmerMalgreDoublon: "on",
        justificationDoublon: "Deuxieme personne, verifiee sur pièce d'identité",
        doublonToken: premier.doublonToken!,
      })
    );

    expect(resultat.success).toBe(true);
    expect(p.user.create).toHaveBeenCalledTimes(1);
  });

  it("refuse une justification trop courte avant meme de verifier le jeton", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);
    const premier = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    const resultat = await creerPatientParProfessionnelAction(
      ETAT,
      formulaire({
        ...champsValides,
        confirmerMalgreDoublon: "on",
        justificationDoublon: "court",
        doublonToken: premier.doublonToken!,
      })
    );

    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/au moins 10/);
    expect(p.patient.findMany).toHaveBeenCalledTimes(1);
  });

  it("un jeton falsifie ou vide ne force jamais la creation", async () => {
    p.patient.findMany.mockResolvedValue([candidatExistant]);

    for (const jeton of ["", "n-importe-quoi", "a.b.c"]) {
      const resultat = await creerPatientParProfessionnelAction(
        ETAT,
        formulaire({
          ...champsValides,
          confirmerMalgreDoublon: "on",
          justificationDoublon: "Deuxieme personne, verifiee sur pièce",
          doublonToken: jeton,
        })
      );
      expect(resultat.success).toBe(false);
    }
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("refuse un role sans permission (Zero Trust), avant toute lecture de la base", async () => {
    getSessionMock.mockResolvedValue({ userId: "pat-1", roles: ["patient"], sessionId: "s-1" });

    const resultat = await creerPatientParProfessionnelAction(ETAT, formulaire(champsValides));

    expect(resultat.success).toBe(false);
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });
});

