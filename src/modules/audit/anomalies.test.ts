import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    signalementAnomalieAcces: { findMany: vi.fn(async () => []), findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { cloturerSignalementAction, getSignalementsAnomalies } from "@/modules/audit/anomalies";

const p = prisma as unknown as {
  signalementAnomalieAcces: { findMany: Mock; findUnique: Mock; update: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.signalementAnomalieAcces.findMany.mockResolvedValue([]);
});

describe("getSignalementsAnomalies : lecture pure (plus de detection dans le GET)", () => {
  it("ne lit que la table, ne cree jamais rien", async () => {
    p.signalementAnomalieAcces.findMany.mockResolvedValue([
      {
        id: "s-1",
        regle: "acces_urgence_frequents",
        utilisateur: { nom: "Kora", prenom: "Awa" },
        detail: "4 accès",
        dateDetection: new Date("2026-09-20T00:00:00Z"),
        statut: "nouveau",
        commentaire: null,
        reviewer: null,
        dateRevue: null,
      },
    ]);

    const signalements = await getSignalementsAnomalies();

    expect(signalements).toHaveLength(1);
    expect(signalements?.[0]).toMatchObject({ regle: "Accès d'urgence fréquents", utilisateurNomComplet: "Awa Kora", statut: "nouveau" });
  });

  it("refuse tout role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"] });

    expect(await getSignalementsAnomalies()).toBeNull();
    expect(p.signalementAnomalieAcces.findMany).not.toHaveBeenCalled();
  });

  it("null sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getSignalementsAnomalies()).toBeNull();
  });
});

describe("cloturerSignalementAction", () => {
  it("exige un commentaire d'au moins 10 caracteres", async () => {
    const resultat = await cloturerSignalementAction(etatInitial, formulaire({ signalementId: "s-1", commentaire: "court" }));

    expect(resultat.success).toBe(false);
    expect(p.signalementAnomalieAcces.findUnique).not.toHaveBeenCalled();
  });

  it("ferme le signalement et journalise, sans le commentaire dans donneeConcernee", async () => {
    p.signalementAnomalieAcces.findUnique.mockResolvedValue({ id: "s-1", statut: "nouveau", regle: "acces_urgence_frequents" });

    const resultat = await cloturerSignalementAction(etatInitial, formulaire({ signalementId: "s-1", commentaire: "Verifie avec le professionnel, legitime." }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.signalementAnomalieAcces.update).toHaveBeenCalledWith({
      where: { id: "s-1" },
      data: { statut: "ferme", commentaire: "Verifie avec le professionnel, legitime.", reviewerId: "admin-1", dateRevue: expect.any(Date) },
    });
    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "cloture_signalement_anomalie", donneeConcernee: "signalement_anomalie:s-1" }), expect.anything());
  });

  it("refuse un signalement deja ferme", async () => {
    p.signalementAnomalieAcces.findUnique.mockResolvedValue({ id: "s-1", statut: "ferme", regle: "acces_urgence_frequents" });

    const resultat = await cloturerSignalementAction(etatInitial, formulaire({ signalementId: "s-1", commentaire: "Nouveau commentaire suffisant." }));

    expect(resultat.error).toContain("déjà fermé");
    expect(p.signalementAnomalieAcces.update).not.toHaveBeenCalled();
  });

  it("refuse tout role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["infirmier"] });

    const resultat = await cloturerSignalementAction(etatInitial, formulaire({ signalementId: "s-1", commentaire: "Commentaire suffisant ici." }));

    expect(resultat.success).toBe(false);
    expect(p.signalementAnomalieAcces.findUnique).not.toHaveBeenCalled();
  });
});
