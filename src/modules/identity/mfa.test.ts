import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import * as OTPAuth from "otpauth";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn(), update: vi.fn() },
    codeSecoursMfa: { deleteMany: vi.fn(), createMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn(), getSessionPourActivationMfa: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession, getSessionPourActivationMfa } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { viderCompteursDebit } from "@/lib/limite-debit";
import {
  activerMfaAction,
  demarrerEnrolementMfa,
  desactiverMfaAction,
  getStatutMfa,
  regenererCodesSecoursAction,
} from "@/modules/identity/mfa";
import { creerTotp, lireSecretMfa, protegerSecretMfa } from "@/modules/identity/mfa-totp";

const p = prisma as unknown as {
  user: { findUnique: Mock; update: Mock };
  codeSecoursMfa: { deleteMany: Mock; createMany: Mock; count: Mock; updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const getSessionActivationMock = getSessionPourActivationMfa as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const SECRET = new OTPAuth.Secret({ size: 20 }).base32;
const ETAT = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function codeCourant(secret = SECRET): string {
  return creerTotp("a@b.bj", secret).generate();
}

function comptePatient(surcharges: Record<string, unknown> = {}) {
  return { id: "u-1", email: "a@b.bj", motDePasseHash: "hash", mfaActif: false, mfaSecret: null, ...surcharges };
}

function compteAvecMfa() {
  return comptePatient({ mfaActif: true, mfaSecret: protegerSecretMfa("u-1", SECRET) });
}

function session(roles: string[]) {
  return { userId: "u-1", roles, sessionId: "s-1" };
}

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  getSessionMock.mockResolvedValue(session(["patient"]));
  getSessionActivationMock.mockResolvedValue({ ...session(["patient"]), activationMfaRequise: false });
  p.user.findUnique.mockResolvedValue(comptePatient());
  p.user.update.mockResolvedValue({});
  p.codeSecoursMfa.count.mockResolvedValue(10);
  compareMock.mockResolvedValue(true);
});

describe("demarrerEnrolementMfa", () => {
  it("renvoie un secret et un QR code, sans rien ecrire en base", async () => {
    const enrolement = await demarrerEnrolementMfa();

    expect(enrolement?.secretBase32).toMatch(/^[A-Z2-7]+$/);
    expect(enrolement?.qrCodeDataUrl).toMatch(/^data:image\/png/);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("refuse quand la double authentification est deja active (pas de remplacement du secret)", async () => {
    p.user.findUnique.mockResolvedValue(compteAvecMfa());

    expect(await demarrerEnrolementMfa()).toBeNull();
  });

  it("fonctionne pour un compte restreint a l'activation obligatoire", async () => {
    getSessionMock.mockResolvedValue(null);
    getSessionActivationMock.mockResolvedValue({ ...session(["medecin"]), activationMfaRequise: true });

    expect(await demarrerEnrolementMfa()).not.toBeNull();
  });
});

describe("activerMfaAction", () => {
  it("chiffre le secret, active le compte et renvoie dix codes de secours une seule fois", async () => {
    const etat = await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: codeCourant() }));

    expect(etat.success).toBe(true);
    expect(etat.codesSecours).toHaveLength(10);

    const donnees = p.user.update.mock.calls[0][0].data;
    expect(donnees.mfaActif).toBe(true);
    expect(donnees.mfaSecret).not.toContain(SECRET);
    expect(lireSecretMfa("u-1", donnees.mfaSecret).secretBase32).toBe(SECRET);
    expect(p.codeSecoursMfa.createMany.mock.calls[0][0].data).toHaveLength(10);
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse un code incorrect, sans ecrire le secret", async () => {
    const courant = codeCourant();
    const faux = courant === "000000" ? "000001" : "000000";

    const etat = await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: faux }));

    expect(etat.success).toBe(false);
    expect(p.user.update).not.toHaveBeenCalled();
    expect(p.codeSecoursMfa.createMany).not.toHaveBeenCalled();
  });

  it("refuse de remplacer le secret d'un compte deja protege", async () => {
    p.user.findUnique.mockResolvedValue(compteAvecMfa());

    const etat = await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: codeCourant() }));

    expect(etat.success).toBe(false);
    expect(etat.error).toMatch(/deja activee/);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("plafonne les essais : apres 5 codes faux, meme le bon code est refuse", async () => {
    const courant = codeCourant();
    const faux = courant === "000000" ? "000001" : "000000";

    for (let i = 0; i < 5; i++) {
      await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: faux }));
    }
    const etat = await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: codeCourant() }));

    expect(etat.success).toBe(false);
    expect(etat.error).toMatch(/Trop de tentatives/);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionActivationMock.mockResolvedValue(null);

    const etat = await activerMfaAction(ETAT, formulaire({ secretBase32: SECRET, code: codeCourant() }));

    expect(etat.success).toBe(false);
    expect(p.user.update).not.toHaveBeenCalled();
  });
});

describe("desactiverMfaAction (RG-AUTH-50, RG-AUTH-52)", () => {
  beforeEach(() => {
    p.user.findUnique.mockResolvedValue(compteAvecMfa());
  });

  it("un patient desactive avec son mot de passe ET un code valide : secret et codes de secours effaces", async () => {
    const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "mdp", code: codeCourant() }));

    expect(etat.success).toBe(true);
    expect(p.user.update.mock.calls[0][0].data).toEqual({ mfaSecret: null, mfaActif: false });
    expect(p.codeSecoursMfa.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
  });

  it("refuse le mot de passe seul, sans code", async () => {
    const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "mdp" }));

    expect(etat.success).toBe(false);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("refuse un bon code avec un mauvais mot de passe", async () => {
    compareMock.mockResolvedValue(false);

    const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "faux", code: codeCourant() }));

    expect(etat.success).toBe(false);
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it.each(["medecin", "infirmier", "pharmacien", "laboratoire", "agent_communautaire", "admin_etablissement", "admin_national"])(
    "refuse a un compte %s : le second facteur est obligatoire, meme avec le bon mot de passe et le bon code",
    async (role) => {
      getSessionMock.mockResolvedValue(session([role]));

      const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "mdp", code: codeCourant() }));

      expect(etat.success).toBe(false);
      expect(etat.error).toMatch(/obligatoire/);
      expect(p.user.update).not.toHaveBeenCalled();
    }
  );

  it("un compte patient et medecin est aussi refuse", async () => {
    getSessionMock.mockResolvedValue(session(["patient", "medecin"]));

    const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "mdp", code: codeCourant() }));

    expect(etat.success).toBe(false);
  });

  it("plafonne les essais de mot de passe ou de code (5 echecs)", async () => {
    compareMock.mockResolvedValue(false);

    for (let i = 0; i < 5; i++) {
      await desactiverMfaAction(ETAT, formulaire({ motDePasse: "faux", code: "123456" }));
    }
    compareMock.mockResolvedValue(true);
    const etat = await desactiverMfaAction(ETAT, formulaire({ motDePasse: "mdp", code: codeCourant() }));

    expect(etat.success).toBe(false);
    expect(etat.error).toMatch(/Trop de tentatives/);
  });
});

describe("regenererCodesSecoursAction", () => {
  beforeEach(() => {
    p.user.findUnique.mockResolvedValue(compteAvecMfa());
  });

  it("remplace les codes apres mot de passe et code valides, et journalise", async () => {
    const etat = await regenererCodesSecoursAction(ETAT, formulaire({ motDePasse: "mdp", code: codeCourant() }));

    expect(etat.success).toBe(true);
    expect(etat.codesSecours).toHaveLength(10);
    expect(p.codeSecoursMfa.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("refuse sans code ou avec un mauvais code, sans toucher aux codes existants", async () => {
    const sansCode = await regenererCodesSecoursAction(ETAT, formulaire({ motDePasse: "mdp" }));
    const mauvais = await regenererCodesSecoursAction(ETAT, formulaire({ motDePasse: "mdp", code: "123456" }));

    expect(sansCode.success).toBe(false);
    expect(mauvais.success).toBe(false);
    expect(p.codeSecoursMfa.deleteMany).not.toHaveBeenCalled();
  });

  it("un code de secours valide est accepte comme second facteur (et se consomme)", async () => {
    p.codeSecoursMfa.updateMany.mockResolvedValue({ count: 1 });

    const etat = await regenererCodesSecoursAction(ETAT, formulaire({ motDePasse: "mdp", code: "ABCDE-FGHJK" }));

    expect(etat.success).toBe(true);
    expect(p.codeSecoursMfa.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("getStatutMfa", () => {
  it("indique l'etat, le caractere obligatoire et les codes restants", async () => {
    p.user.findUnique.mockResolvedValue({ mfaActif: true });
    p.codeSecoursMfa.count.mockResolvedValue(7);
    getSessionActivationMock.mockResolvedValue({ ...session(["medecin"]), activationMfaRequise: false });

    expect(await getStatutMfa()).toEqual({ actif: true, obligatoire: true, codesSecoursRestants: 7 });
  });

  it("un patient sans double authentification : facultative, aucun code", async () => {
    p.user.findUnique.mockResolvedValue({ mfaActif: false });

    expect(await getStatutMfa()).toEqual({ actif: false, obligatoire: false, codesSecoursRestants: 0 });
  });
});
