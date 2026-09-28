import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { viderCompteursDebit } from "@/lib/limite-debit";

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/modules/identity/mfa-totp", () => ({ verifierSecondFacteur: vi.fn() }));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { verifierSecondFacteur } from "@/modules/identity/mfa-totp";
import {
  ECHECS_MAX_REAUTHENTIFICATION,
  enregistrerEchecReauthentification,
  enregistrerReauthentificationReussie,
  motDePasseEtCodeMfaValides,
  reauthentificationBloquee,
  reauthentificationRecente,
} from "@/modules/identity/reauthentification";

const p = prisma as unknown as { user: { findUnique: Mock } };
const compareMock = bcrypt.compare as unknown as Mock;
const verifierSecondFacteurMock = verifierSecondFacteur as unknown as Mock;

const MAINTENANT = new Date("2026-09-28T12:00:00.000Z");

function compte(surcharges: Record<string, unknown> = {}) {
  return { motDePasseHash: "hash", mfaActif: false, ...surcharges };
}

beforeEach(() => {
  viderCompteursDebit();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  p.user.findUnique.mockReset();
  compareMock.mockReset();
  verifierSecondFacteurMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("reauthentificationRecente / enregistrerReauthentificationReussie (RG-AUTH-53, fenetre de 5 minutes)", () => {
  it("aucun succes enregistre : pas recente", () => {
    expect(reauthentificationRecente("user-1")).toBe(false);
  });

  it("juste apres un succes : recente", () => {
    enregistrerReauthentificationReussie("user-1");
    expect(reauthentificationRecente("user-1")).toBe(true);
  });

  it("moins de 5 minutes apres un succes : toujours recente", () => {
    enregistrerReauthentificationReussie("user-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 4 * 60 * 1000));
    expect(reauthentificationRecente("user-1")).toBe(true);
  });

  it("5 minutes ou plus apres un succes : plus recente", () => {
    enregistrerReauthentificationReussie("user-1");
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 5 * 60 * 1000));
    expect(reauthentificationRecente("user-1")).toBe(false);
  });

  it("le succes d'un autre utilisateur ne compte pas pour celui-ci", () => {
    enregistrerReauthentificationReussie("user-1");
    expect(reauthentificationRecente("user-2")).toBe(false);
  });

  it("un succes enregistre pour un acte sensible couvre les autres actes sensibles (fenetre globale, plus de cloisonnement par type)", () => {
    // Simule : signature d'une ordonnance, puis export de donnees dans la foulee.
    enregistrerReauthentificationReussie("user-1");
    expect(reauthentificationRecente("user-1")).toBe(true);
  });
});

describe("reauthentificationBloquee / enregistrerEchecReauthentification (RG-AUTH-53, 3 echecs)", () => {
  it("jamais bloque avant tout echec", () => {
    expect(reauthentificationBloquee("user-1")).toBe(false);
  });

  it(`pas encore bloque avant le ${ECHECS_MAX_REAUTHENTIFICATION}e echec`, () => {
    for (let i = 0; i < ECHECS_MAX_REAUTHENTIFICATION - 1; i++) {
      const troisieme = enregistrerEchecReauthentification("user-1");
      expect(troisieme).toBe(false);
    }
    expect(reauthentificationBloquee("user-1")).toBe(false);
  });

  it(`le ${ECHECS_MAX_REAUTHENTIFICATION}e echec est signale et bloque les suivants`, () => {
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");
    const troisieme = enregistrerEchecReauthentification("user-1");

    expect(troisieme).toBe(true);
    expect(reauthentificationBloquee("user-1")).toBe(true);
  });

  it("les echecs d'un utilisateur ne bloquent pas un autre", () => {
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");
    enregistrerEchecReauthentification("user-1");

    expect(reauthentificationBloquee("user-2")).toBe(false);
  });
});

describe("motDePasseEtCodeMfaValides (RG-AUTH-53, mot de passe + code MFA si actif)", () => {
  it("compte introuvable : refuse, aucune comparaison de mot de passe", async () => {
    p.user.findUnique.mockResolvedValue(null);

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "");

    expect(resultat).toEqual({ valide: false, motif: "compte_introuvable" });
    expect(compareMock).not.toHaveBeenCalled();
  });

  it("mot de passe incorrect : refuse sans jamais regarder le code MFA", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: true }));
    compareMock.mockResolvedValue(false);

    const resultat = await motDePasseEtCodeMfaValides("user-1", "mauvais", "123456");

    expect(resultat).toEqual({ valide: false, motif: "mot_de_passe_incorrect" });
    expect(verifierSecondFacteurMock).not.toHaveBeenCalled();
  });

  it("mot de passe correct, MFA inactive : valide sans exiger de code", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: false }));
    compareMock.mockResolvedValue(true);

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "");

    expect(resultat).toEqual({ valide: true });
    expect(verifierSecondFacteurMock).not.toHaveBeenCalled();
  });

  it("mot de passe correct, MFA active, code vide : refuse, code obligatoire", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: true }));
    compareMock.mockResolvedValue(true);

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "   ");

    expect(resultat).toEqual({ valide: false, motif: "code_mfa_requis" });
    expect(verifierSecondFacteurMock).not.toHaveBeenCalled();
  });

  it("mot de passe correct, MFA active, code incorrect : refuse", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: true }));
    compareMock.mockResolvedValue(true);
    verifierSecondFacteurMock.mockResolvedValue(null);

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "000000");

    expect(resultat).toEqual({ valide: false, motif: "code_mfa_incorrect" });
  });

  it("mot de passe correct, MFA active, code TOTP correct : valide", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: true }));
    compareMock.mockResolvedValue(true);
    verifierSecondFacteurMock.mockResolvedValue("totp");

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "123456");

    expect(resultat).toEqual({ valide: true });
  });

  it("mot de passe correct, MFA active, code de secours valide : valide (meme voie que le TOTP)", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: true }));
    compareMock.mockResolvedValue(true);
    verifierSecondFacteurMock.mockResolvedValue("secours");

    const resultat = await motDePasseEtCodeMfaValides("user-1", "Passw0rd!", "AAAAA-BBBBB");

    expect(resultat).toEqual({ valide: true });
  });
});
