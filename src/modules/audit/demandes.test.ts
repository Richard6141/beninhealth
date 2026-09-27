import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journalAudit: { findMany: vi.fn(), findUnique: vi.fn() },
    traitementDemandePersonne: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { getDemandesPersonnes, traiterDemandePersonneAction } from "@/modules/audit/demandes";

const p = prisma as unknown as {
  journalAudit: { findMany: Mock; findUnique: Mock };
  traitementDemandePersonne: { create: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function entree(surcharges: Record<string, unknown> = {}) {
  return {
    id: "ja-signalement",
    action: "signalement_acces_suspect",
    date: new Date("2026-09-10T00:00:00Z"),
    utilisateur: { nom: "Kora", prenom: "Awa" },
    justification: "Accès non reconnu par le patient",
    donneeConcernee: "journal_audit:ja-acces-original",
    traitementDemande: null,
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.journalAudit.findMany.mockResolvedValue([]);
});

describe("getDemandesPersonnes : trace liee (F-AUD-04, consulter les traces liees)", () => {
  it("resout l'acces mis en cause d'un signalement d'acces suspect", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action?: unknown; id?: unknown } }) => {
      if (where.id) {
        return [
          {
            id: "ja-acces-original",
            action: "consultation_resume_patient",
            date: new Date("2026-09-05T10:00:00Z"),
            utilisateur: { nom: "Dossou", prenom: "Roméo" },
            adresseTechnique: "10.0.0.5",
            donneeConcernee: "patient:p-1",
          },
        ];
      }
      return [entree()];
    });

    const [demande] = (await getDemandesPersonnes()) ?? [];

    expect(demande.traceLiee).toEqual({
      action: "consultation_resume_patient",
      date: "2026-09-05T10:00:00.000Z",
      acteurNomComplet: "Roméo Dossou",
      adresseTechnique: "10.0.0.5",
      donneeConcernee: "patient:p-1",
    });
  });

  it("null pour une demande de rectification (donneeConcernee = patient:<id>, rien a examiner)", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action?: unknown } }) =>
      where.action ? [entree({ id: "ja-rect", action: "demande_rectification", donneeConcernee: "patient:p-1" })] : []
    );

    const [demande] = (await getDemandesPersonnes()) ?? [];

    expect(demande.traceLiee).toBeNull();
  });

  it("null si la trace d'origine a disparu (jamais une exception)", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action?: unknown; id?: unknown } }) => (where.id ? [] : [entree()]));

    const [demande] = (await getDemandesPersonnes()) ?? [];

    expect(demande.traceLiee).toBeNull();
  });

  it("une seule requete batch pour toutes les traces liees, jamais une par demande", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action?: unknown; id?: unknown } }) => {
      if (where.id) return [];
      return [entree({ id: "ja-1", donneeConcernee: "journal_audit:ja-a" }), entree({ id: "ja-2", donneeConcernee: "journal_audit:ja-b" })];
    });

    await getDemandesPersonnes();

    const appelsAvecId = p.journalAudit.findMany.mock.calls.filter((appel) => "id" in appel[0].where);
    expect(appelsAvecId).toHaveLength(1);
    expect(appelsAvecId[0][0].where.id).toEqual({ in: ["ja-a", "ja-b"] });
  });

  it("refuse tout role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"] });

    expect(await getDemandesPersonnes()).toBeNull();
    expect(p.journalAudit.findMany).not.toHaveBeenCalled();
  });
});

describe("traiterDemandePersonneAction", () => {
  it("exige une reponse d'au moins 10 caracteres", async () => {
    const resultat = await traiterDemandePersonneAction(etatInitial, formulaire({ journalAuditId: "ja-1", reponse: "court" }));

    expect(resultat.success).toBe(false);
    expect(p.journalAudit.findUnique).not.toHaveBeenCalled();
  });

  it("cree le traitement, journalise et notifie le demandeur", async () => {
    p.journalAudit.findUnique.mockResolvedValue({ id: "ja-1", action: "signalement_acces_suspect", utilisateurId: "u-demandeur", date: new Date("2026-09-01T00:00:00Z"), traitementDemande: null });

    const resultat = await traiterDemandePersonneAction(etatInitial, formulaire({ journalAuditId: "ja-1", reponse: "Verifie, acces legitime de votre medecin traitant." }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.traitementDemandePersonne.create).toHaveBeenCalledWith({ data: { journalAuditId: "ja-1", traiteParId: "admin-1", reponse: "Verifie, acces legitime de votre medecin traitant." } });
    expect(journaliserMock).toHaveBeenCalled();
    expect(creerNotificationMock).toHaveBeenCalledWith("u-demandeur", "reponse_demande_personne", expect.stringContaining("Verifie, acces legitime"));
  });

  it("refuse de traiter une demande deja traitee", async () => {
    p.journalAudit.findUnique.mockResolvedValue({ id: "ja-1", action: "demande_rectification", utilisateurId: "u-1", date: new Date(), traitementDemande: { id: "t-1" } });

    const resultat = await traiterDemandePersonneAction(etatInitial, formulaire({ journalAuditId: "ja-1", reponse: "Deja repondu auparavant." }));

    expect(resultat.error).toContain("deja ete traitee");
    expect(p.traitementDemandePersonne.create).not.toHaveBeenCalled();
  });

  it("refuse une entree qui n'est pas une demande de personne", async () => {
    p.journalAudit.findUnique.mockResolvedValue({ id: "ja-1", action: "connexion", utilisateurId: "u-1", date: new Date(), traitementDemande: null });

    const resultat = await traiterDemandePersonneAction(etatInitial, formulaire({ journalAuditId: "ja-1", reponse: "Reponse quelconque suffisante." }));

    expect(resultat.error).toContain("introuvable");
  });

  it("refuse tout role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["laboratoire"] });

    const resultat = await traiterDemandePersonneAction(etatInitial, formulaire({ journalAuditId: "ja-1", reponse: "Reponse quelconque suffisante." }));

    expect(resultat.success).toBe(false);
    expect(p.journalAudit.findUnique).not.toHaveBeenCalled();
  });
});
