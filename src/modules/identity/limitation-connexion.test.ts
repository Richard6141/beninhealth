import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    journalAudit: { create: vi.fn() },
    codeVerificationEmail: { deleteMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ createSession: vi.fn(), getSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn() }));
vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return { default: { compare, hash }, compare, hash };
});
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { loginAction } from "@/modules/identity/actions";
import {
  ECHECS_MAX_PAR_ADRESSE,
  ECHECS_MAX_PAR_COMPTE,
  ECHECS_MAX_PAR_COMPTE_24H,
  ECHECS_MFA_MAX_PAR_COMPTE,
  MESSAGE_COMPTE_VERROUILLE_24H,
  MESSAGE_TROP_DE_TENTATIVES,
  connexionBloquee,
  enregistrerEchecConnexion,
  enregistrerEchecMfa,
  mfaBloquee,
  typeVerrouillageCompte,
} from "@/modules/identity/limitation-connexion";

const prismaMock = prisma as unknown as { user: { findUnique: Mock }; journalAudit: { create: Mock } };
const bcryptMock = bcrypt as unknown as { compare: Mock };
const headersMock = headers as unknown as Mock;

function formulaire(email: string, motDePasse: string): FormData {
  const donnees = new FormData();
  donnees.set("email", email);
  donnees.set("motDePasse", motDePasse);
  return donnees;
}

const etatInitial = { error: null };

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "10.0.0.1" }));
  prismaMock.user.findUnique.mockResolvedValue({
    id: "u-1",
    email: "jeanne@example.com",
    statut: "actif",
    motDePasseHash: "hash",
    mfaActif: false,
    roles: [{ nom: "patient" }],
  });
  bcryptMock.compare.mockResolvedValue(false);
});

describe("loginAction : verrouillage apres des echecs repetes", () => {
  it("bloque le 6e essai en 15 minutes sur un compte, meme avec le bon mot de passe, sans interroger la base", async () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) {
      expect((await loginAction(etatInitial, formulaire("jeanne@example.com", "faux"))).error).toBe("Identifiants incorrects.");
    }

    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.user.findUnique.mockClear();
    const resultat = await loginAction(etatInitial, formulaire("jeanne@example.com", "le-bon-mot-de-passe"));

    expect(resultat.error).toBe(MESSAGE_TROP_DE_TENTATIVES);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("un email inconnu se bloque exactement comme un email connu (aucune fuite sur l'existence du compte)", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) {
      await loginAction(etatInitial, formulaire("inconnu@example.com", "faux"));
    }

    expect((await loginAction(etatInitial, formulaire("inconnu@example.com", "faux"))).error).toBe(MESSAGE_TROP_DE_TENTATIVES);
  });

  it("le verrouillage d'un compte ne bloque pas un autre compte", async () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) {
      await loginAction(etatInitial, formulaire("jeanne@example.com", "faux"));
    }
    const resultat = await loginAction(etatInitial, formulaire("autre@example.com", "faux"));
    expect(resultat.error).toBe("Identifiants incorrects.");
  });

  it("la casse de l'email ne permet pas de contourner le compteur", async () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) {
      await loginAction(etatInitial, formulaire(i % 2 === 0 ? "Jeanne@Example.com" : "jeanne@example.com", "faux"));
    }
    expect((await loginAction(etatInitial, formulaire("JEANNE@EXAMPLE.COM", "faux"))).error).toBe(MESSAGE_TROP_DE_TENTATIVES);
  });

  it("une adresse qui essaie beaucoup de comptes differents est bloquee", async () => {
    for (let i = 0; i < ECHECS_MAX_PAR_ADRESSE; i++) {
      await loginAction(etatInitial, formulaire(`compte${i}@example.com`, "faux"));
    }
    expect((await loginAction(etatInitial, formulaire("nouveau@example.com", "faux"))).error).toBe(MESSAGE_TROP_DE_TENTATIVES);
  });

  it("des connexions reussies ne comptent jamais comme des echecs", async () => {
    bcryptMock.compare.mockResolvedValue(true);
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE + 3; i++) {
      const resultat = await loginAction(etatInitial, formulaire("jeanne@example.com", "bon"));
      expect(resultat.error).toBeNull();
    }
  });

  it("trace chaque echec d'un compte existant au journal, jamais celui d'un compte inconnu", async () => {
    await loginAction(etatInitial, formulaire("jeanne@example.com", "faux"));
    expect(prismaMock.journalAudit.create.mock.calls[0][0].data).toMatchObject({
      utilisateurId: "u-1",
      action: "connexion_echec",
      adresseTechnique: "10.0.0.1",
    });

    prismaMock.journalAudit.create.mockClear();
    prismaMock.user.findUnique.mockResolvedValue(null);
    await loginAction(etatInitial, formulaire("inconnu@example.com", "faux"));
    expect(prismaMock.journalAudit.create).not.toHaveBeenCalled();
  });

  it("un echec d'ecriture du journal ne change pas la reponse", async () => {
    prismaMock.journalAudit.create.mockRejectedValue(new Error("panne"));
    expect((await loginAction(etatInitial, formulaire("jeanne@example.com", "faux"))).error).toBe("Identifiants incorrects.");
  });

  it("sans adresse identifiable, seul le compteur par compte s'applique", async () => {
    headersMock.mockResolvedValue(new Headers());
    for (let i = 0; i < ECHECS_MAX_PAR_ADRESSE; i++) {
      await loginAction(etatInitial, formulaire(`compte${i}@example.com`, "faux"));
    }
    expect((await loginAction(etatInitial, formulaire("nouveau@example.com", "faux"))).error).toBe("Identifiants incorrects.");
  });
});

describe("limitation-connexion : second facteur", () => {
  it("bloque un compte apres ECHECS_MFA_MAX_PAR_COMPTE codes TOTP faux, sans toucher aux autres comptes", () => {
    for (let i = 0; i < ECHECS_MFA_MAX_PAR_COMPTE; i++) {
      expect(mfaBloquee("u-1")).toBe(false);
      enregistrerEchecMfa("u-1");
    }
    expect(mfaBloquee("u-1")).toBe(true);
    expect(mfaBloquee("u-2")).toBe(false);
  });

  it("le compteur de connexion et celui du second facteur sont independants", () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) enregistrerEchecConnexion("a@example.com", null);
    expect(connexionBloquee("a@example.com", null)).toBe(true);
    expect(mfaBloquee("u-1")).toBe(false);
  });
});

describe("10 echecs en 24 heures (F-AUTH-02)", () => {
  beforeEach(() => {
    viderCompteursDebit();
    vi.useFakeTimers();
  });

  it("verrouille le compte meme si les echecs sont etales sur plusieurs fenetres de 15 minutes", () => {
    const debut = Date.now();

    for (const decalageMinutes of [0, 16, 32]) {
      vi.setSystemTime(debut + decalageMinutes * 60 * 1000);
      const nombre = decalageMinutes === 32 ? 2 : 4;
      for (let i = 0; i < nombre; i++) {
        expect(connexionBloquee("a@exemple.bj", null)).toBe(false);
        enregistrerEchecConnexion("a@exemple.bj", null);
      }
    }

    // 10 echecs en 32 minutes : chaque fenetre de 15 minutes est sous son plafond de 5, mais le plafond de 24 h est atteint.
    expect(connexionBloquee("a@exemple.bj", null)).toBe(true);

    vi.setSystemTime(debut + 23 * 60 * 60 * 1000);
    expect(connexionBloquee("a@exemple.bj", null)).toBe(true);

    vi.setSystemTime(debut + 25 * 60 * 60 * 1000);
    expect(connexionBloquee("a@exemple.bj", null)).toBe(false);
    vi.useRealTimers();
  });

  it("9 echecs en 24 heures ne verrouillent pas", () => {
    const debut = Date.now();

    for (const decalageMinutes of [0, 16, 32]) {
      vi.setSystemTime(debut + decalageMinutes * 60 * 1000);
      for (let i = 0; i < 3; i++) enregistrerEchecConnexion("b@exemple.bj", null);
    }

    expect(connexionBloquee("b@exemple.bj", null)).toBe(false);
    vi.useRealTimers();
  });

  it("le message de verrouillage propose la reinitialisation du mot de passe", () => {
    expect(MESSAGE_TROP_DE_TENTATIVES).toBe("Trop de tentatives. Réessayez dans 15 minutes ou réinitialisez votre mot de passe.");
  });
});

describe("typeVerrouillageCompte (corrige le 2026-09-29) : distingue le verrou 15 min du verrou 24h", () => {
  beforeEach(() => {
    viderCompteursDebit();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renvoie null sans aucun echec", () => {
    expect(typeVerrouillageCompte("c@exemple.bj")).toBeNull();
  });

  it("renvoie 15min apres 5 echecs rapproches", () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE; i++) enregistrerEchecConnexion("c@exemple.bj", null);
    expect(typeVerrouillageCompte("c@exemple.bj")).toBe("15min");
  });

  it("renvoie 24h apres 10 echecs etales sur plus de 24h de fenetres de 15 min, meme si le verrou 15 min courant est deja expire", () => {
    const debut = Date.now();

    for (const decalageMinutes of [0, 16, 32]) {
      vi.setSystemTime(debut + decalageMinutes * 60 * 1000);
      const nombre = decalageMinutes === 32 ? 2 : 4;
      for (let i = 0; i < nombre; i++) enregistrerEchecConnexion("d@exemple.bj", null);
    }

    // Plus de 15 minutes se sont ecoulees depuis le dernier lot : le verrou
    // 15 min de ce dernier lot (2 echecs, sous le seuil de 5) n'est de toute
    // facon pas actif, seul le verrou 24h (10 echecs cumules) doit ressortir.
    expect(typeVerrouillageCompte("d@exemple.bj")).toBe("24h");
  });

  it("priorise 24h quand les deux verrous sont actifs a la fois", () => {
    for (let i = 0; i < ECHECS_MAX_PAR_COMPTE_24H; i++) enregistrerEchecConnexion("e@exemple.bj", null);
    expect(typeVerrouillageCompte("e@exemple.bj")).toBe("24h");
  });

  it("le message de verrouillage 24h propose aussi la reinitialisation du mot de passe et ne mentionne jamais 15 minutes", () => {
    expect(MESSAGE_COMPTE_VERROUILLE_24H).toContain("24 heures");
    expect(MESSAGE_COMPTE_VERROUILLE_24H).not.toContain("15 minutes");
    expect(MESSAGE_COMPTE_VERROUILLE_24H).toContain("réinitialiser");
  });
});
