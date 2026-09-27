import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de la logique de validation de updatePatientProfileAction, avec
 * @/lib/prisma et @/lib/session mockes (meme approche que
 * src/modules/identity/actions.test.ts : jamais de vraie connexion base de
 * donnees dans ces tests).
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    journalAudit: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/session", () => ({
  getSession: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { updatePatientProfileAction, type PatientActionState } from "@/modules/patient/actions";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock; update: Mock };
  journalAudit: { create: Mock };
  $transaction: Mock;
};

const getSessionMock = getSession as unknown as Mock;

const ETAT_INITIAL: PatientActionState = { error: null, success: false };

function buildFormData(donnees: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(donnees)) {
    formData.set(cle, valeur);
  }
  return formData;
}

// F-CIT-04 : allergies, antecedents, maladies chroniques et contacts d'urgence
// sont geres par src/modules/patient/informations-declarees.ts depuis ce
// soir (versionnement declare/confirme/retire, RG-CIT-30/31) ; cette action
// ne garde que le groupe sanguin et la grossesse.
const donneesValides = {
  groupeSanguin: "O+",
};

describe("updatePatientProfileAction (validation)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "patient-1", roles: ["patient"] });
  });

  it("rejette un groupe sanguin invalide sans toucher a prisma", async () => {
    const formData = buildFormData({ ...donneesValides, groupeSanguin: "XYZ" });

    const resultat = await updatePatientProfileAction(ETAT_INITIAL, formData);

    expect(resultat.success).toBe(false);
    expect(resultat.error).toBeTruthy();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });

  it("accepte des donnees valides (groupe sanguin connu)", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ id: "dossier-1", userId: "patient-1" });
    prismaMock.$transaction.mockResolvedValue([{}, {}]);

    const resultat = await updatePatientProfileAction(ETAT_INITIAL, buildFormData(donneesValides));

    expect(resultat.success).toBe(true);
    expect(resultat.error).toBeNull();
  });

  it("refuse toute action si la session est absente, sans meme valider les donnees", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await updatePatientProfileAction(
      ETAT_INITIAL,
      buildFormData({ ...donneesValides, groupeSanguin: "XYZ" })
    );

    expect(resultat.success).toBe(false);
    expect(resultat.error).toBeTruthy();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });
});
