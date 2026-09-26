import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Signature d'une prescription et numero d'Ordre verifie (F-ADM-03,
 * interrupteur professionnels.exige_validation_ordre) : un professionnel dont
 * le numero n'est pas verifie ne signe rien, avant meme la re-authentification.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn() } }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/administration/validation-professionnels-controle", () => ({
  professionnelValide: vi.fn(async () => true),
  MESSAGE_ORDRE_NON_VERIFIE: "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.",
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    consultation: { findUnique: vi.fn() },
    prescription: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { professionnelValide } from "@/modules/administration/validation-professionnels-controle";
import { creerPrescriptionAction } from "./actions";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  consultation: { findUnique: Mock };
  prescription: { create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const ordreVerifieMock = professionnelValide as unknown as Mock;
const compareMock = bcrypt.compare as unknown as Mock;

const ETAT = { error: null, success: false };

function formulaire(): FormData {
  const formData = new FormData();
  formData.set("consultationId", "c-1");
  formData.set("instructions", "");
  formData.set("motDePasseSignature", "MotDePasse1!");
  formData.set("lignesJSON", "[]");
  return formData;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  ordreVerifieMock.mockResolvedValue(true);
  prismaMock.user.findUnique.mockResolvedValue({ id: "user-med", motDePasseHash: "hash" });
  compareMock.mockResolvedValue(false);
});

describe("creerPrescriptionAction et numero d'Ordre non verifie", () => {
  it("refuse avec un message clair, avant la re-authentification et toute lecture de la consultation", async () => {
    ordreVerifieMock.mockResolvedValue(false);

    const resultat = await creerPrescriptionAction(ETAT, formulaire());

    expect(resultat).toEqual({ error: "Votre numéro d'Ordre n'est pas encore vérifié par le ministère.", success: false });
    expect(ordreVerifieMock).toHaveBeenCalledWith("user-med");
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(compareMock).not.toHaveBeenCalled();
    expect(prismaMock.consultation.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.prescription.create).not.toHaveBeenCalled();
  });

  it("ne change rien quand le controle passe : le parcours normal continue (ici jusqu'a la validation du formulaire)", async () => {
    const resultat = await creerPrescriptionAction(ETAT, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).not.toContain("numéro d'Ordre");
    expect(ordreVerifieMock).toHaveBeenCalledTimes(1);
  });

  it("le role est verifie avant le controle : un non-medecin ne declenche aucune lecture d'etat de verification", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-x", roles: ["infirmier"] });

    const resultat = await creerPrescriptionAction(ETAT, formulaire());

    expect(resultat.error).toContain("medecins");
    expect(ordreVerifieMock).not.toHaveBeenCalled();
  });
});
