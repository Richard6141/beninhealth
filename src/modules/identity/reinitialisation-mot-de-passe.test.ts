import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Test cible de reinitialiserMotDePasseAction (CA-1, F-AUTH-09) : verifie
 * que toutes les SessionActive du compte sont fermees a la reinitialisation
 * reussie du mot de passe. Ne re-teste pas l'ensemble du parcours (code,
 * anti-enumeration...), deja couvert ailleurs / evident a la lecture.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NODE_ENV: "test" })) }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn(async () => {}) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    codeReinitialisationMotDePasse: { findFirst: vi.fn(), update: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { reinitialiserMotDePasseAction } from "./reinitialisation-mot-de-passe";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock; update: Mock };
  codeReinitialisationMotDePasse: { findFirst: Mock; update: Mock };
  sessionActive: { deleteMany: Mock };
};

function creerFormData(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

describe("reinitialiserMotDePasseAction ferme les sessions actives (CA-1)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({
      id: "u1",
      statut: "actif",
      roles: [{ nom: "patient" }],
      motDePasseHash: await bcrypt.hash("AncienMotDePasse1", 4),
      email: "u1@example.test",
    });
    prismaMock.codeReinitialisationMotDePasse.findFirst.mockResolvedValue({
      id: "code1",
      codeHash: await bcrypt.hash("123456", 4),
    });
    prismaMock.sessionActive.deleteMany.mockResolvedValue({ count: 2 });
  });

  it("ferme toutes les SessionActive du compte apres un changement de mot de passe reussi", async () => {
    const resultat = await reinitialiserMotDePasseAction(
      { error: null, success: false },
      creerFormData({
        email: "u1@example.test",
        code: "123456",
        nouveauMotDePasse: "NouveauMotDePasse2",
        confirmationMotDePasse: "NouveauMotDePasse2",
      })
    );

    expect(resultat.success).toBe(true);
    expect(prismaMock.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("ne ferme aucune session si le code est incorrect", async () => {
    const resultat = await reinitialiserMotDePasseAction(
      { error: null, success: false },
      creerFormData({
        email: "u1@example.test",
        code: "000000",
        nouveauMotDePasse: "NouveauMotDePasse2",
        confirmationMotDePasse: "NouveauMotDePasse2",
      })
    );

    expect(resultat.success).toBe(false);
    expect(prismaMock.sessionActive.deleteMany).not.toHaveBeenCalled();
  });
});
