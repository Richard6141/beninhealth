import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de loginAction, avec @/lib/prisma et
 * @/lib/session entierement mockes (jamais de vraie connexion base de
 * donnees dans ces tests).
 *
 * A propos du mock de next/navigation : redirect() leve normalement une
 * exception speciale (NEXT_REDIRECT) pour interrompre le rendu, ce qui n'a
 * de sens que dans un vrai contexte de rendu Next. Plutot que de laisser
 * l'implementation reelle et de devoir catcher cette exception dans chaque
 * test qui l'atteint, on mocke directement redirect() en vi.fn() : cela
 * permet de verifier avec quel argument il a ete appele, simplement et sans
 * dependre d'un detail d'implementation interne de Next.js.
 */

// Secret deterministe (32+ caracteres, exige par jose/HS256) : loginAction et
// verifierCodeEmailEtConnecterAction signent/verifient un vrai jeton JWT
// (jose n'est pas mocke, c'est une fonction pure rapide, pas une frontiere
// d'E/S comme prisma/session/bcrypt).
process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    journalAudit: {
      create: vi.fn(),
    },
    codeVerificationEmail: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  destroySession: vi.fn(),
}));

vi.mock("@/lib/mail", () => ({
  envoyerEmail: vi.fn(),
}));

vi.mock("bcryptjs", () => {
  const compare = vi.fn();
  const hash = vi.fn();
  return { default: { compare, hash }, compare, hash };
});

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { createSession } from "@/lib/session";
import { envoyerEmail } from "@/lib/mail";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import {
  loginAction,
  verifierCodeEmailEtConnecterAction,
  type AuthActionState,
} from "@/modules/identity/actions";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock; create: Mock; update: Mock };
  journalAudit: { create: Mock };
  codeVerificationEmail: { deleteMany: Mock; create: Mock; findFirst: Mock; update: Mock };
  $transaction: Mock;
};

const createSessionMock = createSession as unknown as Mock;
const envoyerEmailMock = envoyerEmail as unknown as Mock;
const bcryptMock = bcrypt as unknown as { compare: Mock; hash: Mock };
const redirectMock = redirect as unknown as Mock;

const ETAT_INITIAL: AuthActionState = { error: null };

function buildFormData(donnees: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(donnees)) {
    formData.set(cle, valeur);
  }
  return formData;
}

describe("loginAction", () => {
  const MESSAGE_ERREUR_GENERIQUE = "Identifiants incorrects.";

  beforeEach(() => {
    vi.clearAllMocks();
    viderCompteursDebit();
  });

  function formulaireConnexion(email: string, motDePasse: string): FormData {
    return buildFormData({ email, motDePasse });
  }

  it("retourne le message generique quand l'email est inconnu", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const resultat = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("inconnu@example.com", "motdepasse123")
    );

    expect(resultat.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("retourne le MEME message generique quand le mot de passe est incorrect", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      statut: "actif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    bcryptMock.compare.mockResolvedValue(false);

    const resultat = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("jeanne.doe@example.com", "mauvais-mot-de-passe")
    );

    expect(resultat.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("retourne le MEME message generique pour un compte dont le statut n'est pas actif", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      statut: "suspendu",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });

    const resultat = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("jeanne.doe@example.com", "motdepasse123")
    );

    expect(resultat.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    // Le statut est verifie avant toute comparaison de mot de passe : le
    // message ne doit jamais varier selon le motif reel du refus.
    expect(bcryptMock.compare).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("le message d'erreur est identique, quel que soit le motif du refus (email, mot de passe, statut)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    const resultatEmailInconnu = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("inconnu@example.com", "motdepasse123")
    );

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "utilisateur-1",
      statut: "actif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    bcryptMock.compare.mockResolvedValueOnce(false);
    const resultatMotDePasseIncorrect = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("jeanne.doe@example.com", "mauvais-mot-de-passe")
    );

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "utilisateur-1",
      statut: "inactif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    const resultatCompteInactif = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("jeanne.doe@example.com", "motdepasse123")
    );

    expect(resultatEmailInconnu.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(resultatMotDePasseIncorrect.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(resultatCompteInactif.error).toBe(MESSAGE_ERREUR_GENERIQUE);
  });

  it("envoie un code de verification par e-mail et ne cree pas encore de session quand les identifiants sont valides", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      email: "jeanne.doe@example.com",
      statut: "actif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    bcryptMock.compare.mockResolvedValue(true);
    bcryptMock.hash.mockResolvedValue("hash-du-code");
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    const resultat = await loginAction(
      ETAT_INITIAL,
      formulaireConnexion("jeanne.doe@example.com", "motdepasse123")
    );

    expect(resultat.error).toBeNull();
    expect(resultat.emailCodeRequis).toBe(true);
    expect(typeof resultat.preAuthToken).toBe("string");
    // Hors production (NODE_ENV=test par defaut sous Vitest), le code est
    // aussi renvoye en clair pour l'affichage a l'ecran (voir AuthActionState.codeDemo).
    expect(resultat.codeDemo).toMatch(/^\d{6}$/);
    expect(envoyerEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jeanne.doe@example.com" })
    );
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("verifierCodeEmailEtConnecterAction", () => {
  const MESSAGE_ERREUR_GENERIQUE = "Code incorrect ou session expiree. Veuillez vous reconnecter.";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function formulaireCode(preAuthToken: string, code: string): FormData {
    return buildFormData({ preAuthToken, code });
  }

  /** Obtient un vrai preAuthToken "email_pending" en passant par loginAction, comme un utilisateur reel. */
  async function obtenirPreAuthTokenEmail(): Promise<string> {
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "utilisateur-1",
      email: "jeanne.doe@example.com",
      statut: "actif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    bcryptMock.compare.mockResolvedValueOnce(true);
    bcryptMock.hash.mockResolvedValueOnce("hash-du-code");
    prismaMock.$transaction.mockResolvedValueOnce([{}, {}]);

    const resultat = await loginAction(
      ETAT_INITIAL,
      buildFormData({ email: "jeanne.doe@example.com", motDePasse: "motdepasse123" })
    );

    vi.clearAllMocks();
    return resultat.preAuthToken!;
  }

  it("refuse un jeton de pre-authentification absent ou de type invalide", async () => {
    const resultat = await verifierCodeEmailEtConnecterAction(
      ETAT_INITIAL,
      formulaireCode("jeton-invalide", "123456")
    );

    expect(resultat.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("refuse un code incorrect ou absent en base et ne cree pas de session", async () => {
    const preAuthToken = await obtenirPreAuthTokenEmail();
    prismaMock.codeVerificationEmail.findFirst.mockResolvedValue(null);

    const resultat = await verifierCodeEmailEtConnecterAction(
      ETAT_INITIAL,
      formulaireCode(preAuthToken, "000000")
    );

    expect(resultat.error).toBe(MESSAGE_ERREUR_GENERIQUE);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("ouvre la session et redirige quand le code est valide et la double authentification n'est pas active", async () => {
    const preAuthToken = await obtenirPreAuthTokenEmail();
    prismaMock.codeVerificationEmail.findFirst.mockResolvedValue({
      id: "code-1",
      codeHash: "hash-du-code",
    });
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.codeVerificationEmail.update.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      statut: "actif",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    // Chemin de succes : comme loginAction avant lui, la fonction se termine
    // par redirigerSelonRoles() sans valeur de retour explicite (redirect()
    // est mocke en no-op ici, contrairement au vrai Next.js qui interrompt le
    // rendu) ; seuls les appels a createSession/redirect sont donc verifies.
    await verifierCodeEmailEtConnecterAction(ETAT_INITIAL, formulaireCode(preAuthToken, "123456"));

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "utilisateur-1",
      roles: ["patient"],
    });
    expect(redirectMock).toHaveBeenCalledWith("/app/patient");
  });

  it("renvoie mfaRequis au lieu de creer une session quand la double authentification est active", async () => {
    const preAuthToken = await obtenirPreAuthTokenEmail();
    prismaMock.codeVerificationEmail.findFirst.mockResolvedValue({
      id: "code-1",
      codeHash: "hash-du-code",
    });
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.codeVerificationEmail.update.mockResolvedValue({});
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      statut: "actif",
      mfaActif: true,
      roles: [{ nom: "patient" }],
    });

    const resultat = await verifierCodeEmailEtConnecterAction(
      ETAT_INITIAL,
      formulaireCode(preAuthToken, "123456")
    );

    expect(resultat.error).toBeNull();
    expect(resultat.mfaRequis).toBe(true);
    expect(typeof resultat.preAuthToken).toBe("string");
    expect(resultat.preAuthToken).not.toBe(preAuthToken);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
