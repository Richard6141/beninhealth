import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Deverrouillage de l'ecran pour inactivite (F-AUTH-08). Aucun test
 * n'existait pour ce module avant ce jour. Cible principale : le compteur
 * de 3 echecs desormais revalide cote serveur (corrige le 2026-09-28), pas
 * seulement cote client.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn(), destroySession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { destroySession, getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { deverrouillerEcranAction } from "./verrouillage";
import { TENTATIVES_MAX_VERROUILLAGE } from "./verrouillage-regles";

const p = prisma as unknown as { user: { findUnique: Mock } };
const getSessionMock = getSession as unknown as Mock;
const destroySessionMock = destroySession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const bcryptCompareMock = bcrypt.compare as unknown as Mock;

function formulaire(motDePasse: string): FormData {
  const formData = new FormData();
  formData.set("motDePasse", motDePasse);
  return formData;
}

const ETAT_INITIAL = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["medecin"] });
  p.user.findUnique.mockResolvedValue({ id: "user-1", motDePasseHash: "hash" });
});

describe("deverrouillerEcranAction (F-AUTH-08)", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("secret"));
    expect(resultat.success).toBe(false);
    expect(resultat.deconnecte).toBeUndefined();
  });

  it("deverrouille avec le bon mot de passe", async () => {
    bcryptCompareMock.mockResolvedValue(true);
    const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("bon-mot-de-passe"));
    expect(resultat).toEqual({ error: null, success: true });
    expect(destroySessionMock).not.toHaveBeenCalled();
  });

  it("refuse un mot de passe incorrect sans deconnecter avant la limite", async () => {
    bcryptCompareMock.mockResolvedValue(false);
    const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));
    expect(resultat).toEqual({ error: "Mot de passe incorrect.", success: false });
    expect(destroySessionMock).not.toHaveBeenCalled();
  });

  it("journalise chaque tentative echouee", async () => {
    bcryptCompareMock.mockResolvedValue(false);
    await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({ utilisateurId: "user-1", action: "tentative_deverrouillage_echouee" })
    );
  });

  it(`deconnecte reellement (detruit la session) des la ${TENTATIVES_MAX_VERROUILLAGE}e tentative echouee, meme si le client ignorerait son propre compteur`, async () => {
    bcryptCompareMock.mockResolvedValue(false);

    for (let i = 0; i < TENTATIVES_MAX_VERROUILLAGE - 1; i++) {
      const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));
      expect(resultat.deconnecte).toBeUndefined();
      expect(destroySessionMock).not.toHaveBeenCalled();
    }

    const dernier = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));

    expect(dernier).toEqual({ error: expect.any(String), success: false, deconnecte: true });
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
  });

  it("refuse et deconnecte immediatement une tentative supplementaire une fois la limite deja atteinte, sans meme verifier le mot de passe", async () => {
    bcryptCompareMock.mockResolvedValue(false);
    for (let i = 0; i < TENTATIVES_MAX_VERROUILLAGE; i++) {
      await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));
    }
    destroySessionMock.mockClear();
    bcryptCompareMock.mockClear();

    const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("cette-fois-le-bon-mot-de-passe"));

    expect(resultat.deconnecte).toBe(true);
    expect(destroySessionMock).toHaveBeenCalledTimes(1);
    expect(bcryptCompareMock).not.toHaveBeenCalled();
  });

  it("ne mele pas les compteurs de deux utilisateurs differents", async () => {
    bcryptCompareMock.mockResolvedValue(false);
    for (let i = 0; i < TENTATIVES_MAX_VERROUILLAGE; i++) {
      await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));
    }
    destroySessionMock.mockClear();

    getSessionMock.mockResolvedValue({ userId: "user-2", roles: ["medecin"] });
    const resultat = await deverrouillerEcranAction(ETAT_INITIAL, formulaire("faux"));

    expect(resultat.deconnecte).toBeUndefined();
    expect(destroySessionMock).not.toHaveBeenCalled();
  });
});
