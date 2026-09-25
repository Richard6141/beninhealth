import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de registerPatientAction et loginAction, avec @/lib/prisma et
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
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  createSession: vi.fn(),
  getSession: vi.fn(),
  destroySession: vi.fn(),
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
import { createSession } from "@/lib/session";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import {
  loginAction,
  registerPatientAction,
  type AuthActionState,
} from "@/modules/identity/actions";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock; create: Mock; update: Mock };
  journalAudit: { create: Mock };
  $transaction: Mock;
};

const createSessionMock = createSession as unknown as Mock;
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

const donneesInscriptionValides = {
  nom: "Doe",
  prenom: "Jeanne",
  email: "jeanne.doe@example.com",
  telephone: "+22990000000",
  motDePasse: "motdepasse123",
  dateNaissance: "1990-01-01",
  sexe: "F",
};

describe("registerPatientAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejette un email manquant sans appeler prisma.user.create", async () => {
    const formData = buildFormData({ ...donneesInscriptionValides, email: "" });

    const resultat = await registerPatientAction(ETAT_INITIAL, formData);

    expect(resultat.error).toBeTruthy();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejette un email mal forme sans appeler prisma.user.create", async () => {
    const formData = buildFormData({ ...donneesInscriptionValides, email: "pas-un-email" });

    const resultat = await registerPatientAction(ETAT_INITIAL, formData);

    expect(resultat.error).toBeTruthy();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("rejette un mot de passe trop court sans appeler prisma.user.create", async () => {
    const formData = buildFormData({ ...donneesInscriptionValides, motDePasse: "court1" });

    const resultat = await registerPatientAction(ETAT_INITIAL, formData);

    expect(resultat.error).toBeTruthy();
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse un email deja utilise, avec le message dedie, sans appeler prisma.user.create", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "utilisateur-existant" });

    const resultat = await registerPatientAction(ETAT_INITIAL, buildFormData(donneesInscriptionValides));

    expect(resultat.error).toBe("Un compte existe deja avec cet email.");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("cree le compte, ouvre la session et redirige vers l'espace patient quand tout est valide", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(
      async (callback: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          patient: {
            count: vi.fn().mockResolvedValue(0),
          },
          user: {
            create: vi.fn().mockResolvedValue({ id: "nouvel-utilisateur" }),
          },
          journalAudit: {
            create: vi.fn().mockResolvedValue({}),
          },
        };
        return callback(tx);
      }
    );

    await registerPatientAction(ETAT_INITIAL, buildFormData(donneesInscriptionValides));

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "nouvel-utilisateur",
      roles: ["patient"],
    });
    expect(redirectMock).toHaveBeenCalledWith("/app/patient");
  });
});

describe("loginAction", () => {
  const MESSAGE_ERREUR_GENERIQUE = "Identifiants incorrects.";

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("ouvre la session et redirige vers l'espace patient quand les identifiants sont valides", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "utilisateur-1",
      statut: "actif",
      motDePasseHash: "hash-existant",
      mfaActif: false,
      roles: [{ nom: "patient" }],
    });
    bcryptMock.compare.mockResolvedValue(true);
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    await loginAction(ETAT_INITIAL, formulaireConnexion("jeanne.doe@example.com", "motdepasse123"));

    expect(createSessionMock).toHaveBeenCalledWith({
      userId: "utilisateur-1",
      roles: ["patient"],
    });
    expect(redirectMock).toHaveBeenCalledWith("/app/patient");
  });
});
