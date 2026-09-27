import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

const MAINTENANT = new Date("2026-09-27T10:00:00.000Z");
// RG-AUTH-03 : delai minimal de 60 s entre deux envois pour le meme compte.
const DELAI_MINIMAL_MS = 61_000;

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NODE_ENV: "test", NEXTAUTH_SECRET: "secret-de-test-32-caracteres-minimum-xxxx" })) }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn(async () => {}) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  const hash = vi.fn(async () => "hash");
  return { default: { compare, hash }, compare, hash };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    codeReinitialisationMotDePasse: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { envoyerEmail } from "@/lib/mail";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { prisma } from "@/lib/prisma";
import {
  demanderReinitialisationMotDePasseAction,
  reinitialiserMotDePasseAction,
} from "@/modules/identity/reinitialisation-mot-de-passe";

const p = prisma as unknown as {
  user: { findUnique: Mock };
  codeReinitialisationMotDePasse: { findFirst: Mock };
};
const envoyerEmailMock = envoyerEmail as unknown as Mock;
const headersMock = headers as unknown as Mock;
const bcryptHashMock = bcrypt.hash as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const etatDemande = { message: "", soumis: false };
const etatReset = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "10.0.0.7" }));
  p.user.findUnique.mockResolvedValue({ id: "u-1", email: "jeanne@example.com", statut: "actif", roles: [{ nom: "patient" }], motDePasseHash: "h" });
  p.codeReinitialisationMotDePasse.findFirst.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("demande de reinitialisation : pas d'inondation de courriels", () => {
  it("au-dela de 3 demandes par heure pour un compte, plus aucun courriel, meme reponse", async () => {
    const reponses = [];
    for (let i = 0; i < 6; i++) {
      // Delai minimal respecte entre deux envois (RG-AUTH-03) : sans lui,
      // seule la toute premiere demande passerait, avant meme d'atteindre
      // le plafond de 3 par heure teste ici.
      vi.setSystemTime(new Date(MAINTENANT.getTime() + i * DELAI_MINIMAL_MS));
      reponses.push(await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" })));
    }

    expect(new Set(reponses.map((r) => r.message)).size).toBe(1);
    expect(reponses.every((r) => r.soumis)).toBe(true);
    expect(envoyerEmailMock).toHaveBeenCalledTimes(3);
  });

  it("la casse de l'adresse ne permet pas de contourner la limite", async () => {
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(new Date(MAINTENANT.getTime() + i * DELAI_MINIMAL_MS));
      await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: i % 2 ? "JEANNE@example.com" : "jeanne@example.com" }));
    }
    expect(envoyerEmailMock).toHaveBeenCalledTimes(3);
  });

  it("RG-AUTH-03 : refuse une deuxieme demande pour le meme compte moins de 60 s apres la premiere, meme sous le plafond horaire", async () => {
    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));
    vi.setSystemTime(new Date(MAINTENANT.getTime() + 30_000));

    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));

    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
  });

  it("RG-AUTH-03 : autorise une deuxieme demande 60 s apres la premiere", async () => {
    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));
    vi.setSystemTime(new Date(MAINTENANT.getTime() + DELAI_MINIMAL_MS));

    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));

    expect(envoyerEmailMock).toHaveBeenCalledTimes(2);
  });

  it("une adresse IP qui vise beaucoup de comptes est limitee a 20 demandes par heure", async () => {
    for (let i = 0; i < 25; i++) {
      await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: `compte${i}@example.com` }));
    }
    expect(envoyerEmailMock.mock.calls.length).toBe(20);
  });

  it("la limite d'un compte n'empeche pas un autre compte", async () => {
    for (let i = 0; i < 5; i++) {
      await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));
    }
    envoyerEmailMock.mockClear();
    p.user.findUnique.mockResolvedValue({ id: "u-2", email: "autre@example.com", statut: "actif", roles: [{ nom: "patient" }], motDePasseHash: "h" });
    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "autre@example.com" }));
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("CA-2 : temps de reponse indiscernable entre un compte reel et un compte inexistant/inactif/exclu", () => {
  it("simule le meme cout bcrypt qu'un compte reel quand le compte n'existe pas", async () => {
    p.user.findUnique.mockResolvedValue(null);

    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "personne@example.com" }));

    expect(bcryptHashMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("simule le meme cout bcrypt pour un compte inactif", async () => {
    p.user.findUnique.mockResolvedValue({
      id: "u-2",
      email: "jeanne@example.com",
      statut: "suspendu",
      roles: [{ nom: "patient" }],
      motDePasseHash: "h",
    });

    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));

    expect(bcryptHashMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("simule le meme cout bcrypt pour un compte exclu du libre-service (RG-AUTH-31)", async () => {
    p.user.findUnique.mockResolvedValue({
      id: "u-3",
      email: "admin@example.com",
      statut: "actif",
      roles: [{ nom: "admin_national" }],
      motDePasseHash: "h",
    });

    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "admin@example.com" }));

    expect(bcryptHashMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("un compte reel n'appelle bcrypt.hash qu'une seule fois aussi (meme travail, branche differente)", async () => {
    await demanderReinitialisationMotDePasseAction(etatDemande, formulaire({ email: "jeanne@example.com" }));

    expect(bcryptHashMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("confirmation : le code a 6 chiffres ne se devine pas par essais repetes", () => {
  const saisie = { email: "jeanne@example.com", code: "123456", nouveauMotDePasse: "NouveauMotDePasse1", confirmationMotDePasse: "NouveauMotDePasse1" };

  it("apres 5 echecs en 15 minutes, l'essai suivant est refuse sans meme consulter la base", async () => {
    let dernier = "";
    for (let i = 0; i < 5; i++) {
      const resultat = await reinitialiserMotDePasseAction(etatReset, formulaire(saisie));
      expect(resultat.success).toBe(false);
      dernier = resultat.error ?? "";
    }

    p.user.findUnique.mockClear();
    const bloque = await reinitialiserMotDePasseAction(etatReset, formulaire(saisie));

    expect(bloque.success).toBe(false);
    expect(bloque.error).toBe(dernier);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  it("un compte inconnu se bloque de la meme facon (aucune fuite sur l'existence du compte)", async () => {
    p.user.findUnique.mockResolvedValue(null);
    const messages = new Set<string>();
    for (let i = 0; i < 8; i++) {
      messages.add((await reinitialiserMotDePasseAction(etatReset, formulaire({ ...saisie, email: "inconnu@example.com" }))).error ?? "");
    }
    expect(messages.size).toBe(1);
    expect(p.user.findUnique.mock.calls.length).toBe(5);
  });
});
