import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.1" })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/identity/actions", () => ({ getMonProfil: vi.fn() }));
vi.mock("@/modules/clinical/actions", () => ({ getMesConsultations: vi.fn() }));
vi.mock("@/modules/facility/actions", () => ({ getMesRendezVous: vi.fn() }));
vi.mock("@/modules/prescription/actions", () => ({ getMesPrescriptions: vi.fn() }));
vi.mock("@/modules/laboratoire/actions", () => ({ getMesExamens: vi.fn() }));
vi.mock("@/modules/vaccination/actions", () => ({ getMesVaccinations: vi.fn() }));
vi.mock("./actions", () => ({ getMesConsentements: vi.fn(), getMonDossierPatient: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

import bcrypt from "bcryptjs";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { verifierMotDePasseExportAction } from "./droits-donnees";
import { jetonExportDonneesValide } from "./jeton-export-donnees";

const p = prisma as unknown as { user: { findUnique: Mock } };
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");
const ETAT_INITIAL = { error: null, success: false };

function formulaire(motDePasse: string): FormData {
  const donnees = new FormData();
  donnees.set("motDePasse", motDePasse);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  p.user.findUnique.mockResolvedValue({ id: "user-1", motDePasseHash: "hash" });
  compareMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("verifierMotDePasseExportAction (F-CIT-13, re-authentification)", () => {
  it("delivre un jeton valable pour le compte apres un mot de passe correct, et journalise", async () => {
    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("Demo1234!"));

    expect(resultat.success).toBe(true);
    expect(resultat.error).toBeNull();
    expect(resultat.jeton).toBeTruthy();
    expect(jetonExportDonneesValide(resultat.jeton, "user-1", MAINTENANT)).toBe(true);
    expect(jetonExportDonneesValide(resultat.jeton, "user-2", MAINTENANT)).toBe(false);
    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "export_donnees_demande" }));
  });

  it("ne delivre aucun jeton sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("Demo1234!"));

    expect(resultat).toEqual({ error: "Session expiree. Veuillez vous reconnecter.", success: false });
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("refuse un compte qui n'est pas patient (les routes le sont aussi)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-2", roles: ["medecin"] });

    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("Demo1234!"));

    expect(resultat.success).toBe(false);
    expect(resultat.jeton).toBeUndefined();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe incorrect sans jeton ni journal de demande", async () => {
    compareMock.mockResolvedValue(false);

    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("mauvais"));

    expect(resultat).toEqual({ error: "Mot de passe incorrect.", success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe vide", async () => {
    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire(""));

    expect(resultat.success).toBe(false);
    expect(resultat.jeton).toBeUndefined();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("bloque l'etape apres 5 mots de passe incorrects, meme avec le bon mot de passe ensuite", async () => {
    compareMock.mockResolvedValue(false);

    for (let essai = 0; essai < 5; essai += 1) {
      const echec = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("mauvais"));
      expect(echec.error).toBe("Mot de passe incorrect.");
    }

    compareMock.mockResolvedValue(true);
    compareMock.mockClear();
    const bloque = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("Demo1234!"));

    expect(bloque.success).toBe(false);
    expect(bloque.error).toMatch(/Trop de tentatives/);
    expect(bloque.jeton).toBeUndefined();
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("le blocage est propre au compte : un autre patient n'est pas touche", async () => {
    compareMock.mockResolvedValue(false);
    for (let essai = 0; essai < 5; essai += 1) {
      await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("mauvais"));
    }

    getSessionMock.mockResolvedValue({ userId: "user-3", roles: ["patient"] });
    p.user.findUnique.mockResolvedValue({ id: "user-3", motDePasseHash: "hash" });
    compareMock.mockResolvedValue(true);

    const resultat = await verifierMotDePasseExportAction(ETAT_INITIAL, formulaire("Demo1234!"));

    expect(resultat.success).toBe(true);
    expect(jetonExportDonneesValide(resultat.jeton, "user-3", MAINTENANT)).toBe(true);
  });
});
