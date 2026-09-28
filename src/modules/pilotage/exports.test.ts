import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import bcrypt from "bcryptjs";

/**
 * Actions de ré-authentification des exports de pilotage (F-PIL-05,
 * RG-PIL-40) : le jeton n'est émis qu'après vérification réelle du mot de
 * passe, du motif et du droit d'exporter pour la portée demandée.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-actions-export" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifierExportPilotageEtablissementAction, verifierExportPilotageNationalAction } from "./exports";
import { verifierJetonExport } from "./jeton-export";

const prismaMock = prisma as unknown as {
  user: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
};
const getSessionMock = getSession as unknown as Mock;

const ETAT_INITIAL = { error: null, success: false };
let hashMotDePasse: string;

beforeAll(async () => {
  hashMotDePasse = await bcrypt.hash("MotDePasseCorrect1", 4);
});

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

describe("verifierExportPilotageNationalAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"], sessionId: "s-1" });
    prismaMock.user.findUnique.mockResolvedValue({ id: "admin-1", motDePasseHash: hashMotDePasse });
  });

  it("émet un jeton lié à l'utilisateur, à la session et à la portée après un mot de passe correct", async () => {
    const etat = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "reunion" })
    );

    expect(etat.success).toBe(true);
    expect(etat.jeton).toBeTruthy();
    expect(verifierJetonExport(etat.jeton, { utilisateurId: "admin-1", sessionId: "s-1", portee: "national" })).toMatchObject({
      motif: "reunion",
    });
    // Jamais valable pour l'autre portée ni pour une autre session.
    expect(verifierJetonExport(etat.jeton, { utilisateurId: "admin-1", sessionId: "s-1", portee: "etablissement" })).toBeNull();
    expect(verifierJetonExport(etat.jeton, { utilisateurId: "admin-1", sessionId: "s-2", portee: "national" })).toBeNull();
  });

  it("n'émet aucun jeton avec un mot de passe incorrect", async () => {
    const etat = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MauvaisMotDePasse", motif: "reunion" })
    );
    expect(etat.success).toBe(false);
    expect(etat.jeton).toBeUndefined();
  });

  it("exige un motif de la liste, et un texte pour « autre »", async () => {
    const sansMotif = await verifierExportPilotageNationalAction(ETAT_INITIAL, formulaire({ motDePasse: "MotDePasseCorrect1" }));
    const autreSansTexte = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "autre", motifTexte: "ab" })
    );
    expect(sansMotif.success).toBe(false);
    expect(autreSansTexte.success).toBe(false);
    expect(sansMotif.jeton).toBeUndefined();
    expect(autreSansTexte.jeton).toBeUndefined();
  });

  it("exige au moins 10 caractères pour le texte libre du motif « autre »", async () => {
    const neufCaracteres = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "autre", motifTexte: "123456789" })
    );
    const dixCaracteres = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "autre", motifTexte: "1234567890" })
    );
    expect(neufCaracteres.success).toBe(false);
    expect(neufCaracteres.jeton).toBeUndefined();
    expect(dixCaracteres.success).toBe(true);
  });

  it("garde le texte libre du motif « autre » dans le jeton", async () => {
    const etat = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "autre", motifTexte: "Audit du trimestre" })
    );
    expect(verifierJetonExport(etat.jeton, { utilisateurId: "admin-1", sessionId: "s-1", portee: "national" })?.motifTexte).toBe(
      "Audit du trimestre"
    );
  });

  it("refuse un compte sans le rôle national, avant même de regarder le mot de passe", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"], sessionId: "s-9" });
    const etat = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "reunion" })
    );
    expect(etat.success).toBe(false);
    expect(etat.jeton).toBeUndefined();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    const etat = await verifierExportPilotageNationalAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "reunion" })
    );
    expect(etat.success).toBe(false);
    expect(etat.jeton).toBeUndefined();
  });
});

describe("verifierExportPilotageEtablissementAction", () => {
  it("exige le rôle d'administrateur d'établissement rattaché à un établissement", async () => {
    vi.clearAllMocks();
    prismaMock.user.findUnique.mockResolvedValue({ id: "adm-1", motDePasseHash: hashMotDePasse });

    getSessionMock.mockResolvedValue({ userId: "adm-1", roles: ["admin_etablissement"], sessionId: "s-3" });
    prismaMock.professionnelSante.findUnique.mockResolvedValue(null);
    const sansEtablissement = await verifierExportPilotageEtablissementAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "planification" })
    );
    expect(sansEtablissement.jeton).toBeUndefined();

    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1" });
    const avecEtablissement = await verifierExportPilotageEtablissementAction(
      ETAT_INITIAL,
      formulaire({ motDePasse: "MotDePasseCorrect1", motif: "planification" })
    );
    expect(verifierJetonExport(avecEtablissement.jeton, { utilisateurId: "adm-1", sessionId: "s-3", portee: "etablissement" })).toMatchObject({
      motif: "planification",
    });
  });
});
