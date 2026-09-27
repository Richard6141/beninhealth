import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    fonctionnaliteActivable: { findMany: vi.fn(), upsert: vi.fn() },
    journalAudit: { findFirst: vi.fn() },
    appelIa: { groupBy: vi.fn(), aggregate: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : (operations as (tx: unknown) => unknown)(prisma)
  );
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { desactiverIaAction, getGouvernanceIa, rejouerJeuEvaluationAction } from "@/modules/ai/gouvernance";
import { JEU_EVALUATION } from "@/modules/ai/jeu-evaluation";

const p = prisma as unknown as {
  fonctionnaliteActivable: { findMany: Mock; upsert: Mock };
  journalAudit: { findFirst: Mock };
  appelIa: { groupBy: Mock; aggregate: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  p.$transaction.mockImplementation(async (operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : (operations as (tx: unknown) => unknown)(prisma)
  );
  delete process.env.IA_FOURNISSEUR;
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  p.fonctionnaliteActivable.findMany.mockResolvedValue([]);
  p.fonctionnaliteActivable.upsert.mockResolvedValue({});
  p.journalAudit.findFirst.mockResolvedValue(null);
  p.appelIa.groupBy.mockResolvedValue([]);
  p.appelIa.aggregate.mockResolvedValue({ _sum: { pucesLues: null, pucesSupprimees: null }, _avg: { dureeMs: null } });
});

describe("acces a la gouvernance de l'IA (F-IA-05)", () => {
  it.each(["patient", "medecin", "infirmier", "pharmacien", "laboratoire", "admin_etablissement"] as const)("le role %s n'a aucun acces", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    expect(await getGouvernanceIa()).toBeNull();
    expect((await rejouerJeuEvaluationAction()).error).toContain("réservée");
    expect((await desactiverIaAction()).success).toBe(false);
    expect(p.fonctionnaliteActivable.upsert).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("sans session, rien n'est accessible", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getGouvernanceIa()).toBeNull();
    expect((await desactiverIaAction()).success).toBe(false);
  });
});

describe("getGouvernanceIa", () => {
  it("sans ligne en base, les deux fonctionnalites d'IA sont desactivees (RG-IA-02) et le fournisseur est local", async () => {
    const gouvernance = await getGouvernanceIa();

    expect(gouvernance?.fonctionnalites).toEqual([
      { cle: "ai.summary", actif: false },
      { cle: "ai.citizen_assistant", actif: false },
    ]);
    expect(gouvernance?.fournisseur).toBe("regles_locales");
    expect(gouvernance?.fiches.length).toBeGreaterThan(0);
    expect(gouvernance?.statistiques.appels).toBe(0);
    expect(gouvernance?.derniereEvaluation).toBeNull();
  });

  it("relit la derniere evaluation depuis le journal d'audit", async () => {
    p.journalAudit.findFirst.mockResolvedValue({ date: new Date("2026-09-27T10:00:00.000Z"), justification: "20/20 dossiers conformes (fournisseur regles_locales, consigne resume-v1)." });
    p.fonctionnaliteActivable.findMany.mockResolvedValue([{ cle: "ai.summary", actif: true }]);

    const gouvernance = await getGouvernanceIa();

    expect(gouvernance?.derniereEvaluation).toEqual({ date: "2026-09-27T10:00:00.000Z", conformes: 20, total: 20 });
    expect(gouvernance?.fonctionnalites[0]).toEqual({ cle: "ai.summary", actif: true });
  });
});

describe("rejouerJeuEvaluationAction (RG-IA-20)", () => {
  it("reussit avec les regles locales et journalise le resultat sans aucun texte de dossier", async () => {
    const resultat = await rejouerJeuEvaluationAction();

    expect(resultat).toMatchObject({ error: null, success: true, conformes: 20, total: 20, echecs: [] });
    const journal = journaliserMock.mock.calls[0][0];
    expect(journal.action).toBe("evaluation_ia_rejouee");
    expect(journal.justification).toContain("20/20 dossiers conformes");
    for (const dossier of JEU_EVALUATION) expect(JSON.stringify(journal)).not.toContain(dossier.identite.nom);
  });

  it("echoue avec un fournisseur desactive : l'evaluation ne peut pas etre validee", async () => {
    process.env.IA_FOURNISSEUR = "desactive";

    const resultat = await rejouerJeuEvaluationAction();

    expect(resultat.success).toBe(false);
    expect(resultat.error).toBeNull();
    expect(resultat.conformes).toBeLessThan(resultat.total);
    expect(resultat.echecs.length).toBeGreaterThan(0);
  });
});

describe("desactiverIaAction (RG-IA-02)", () => {
  it("force les deux fonctionnalites a desactive (jamais une bascule) et journalise", async () => {
    const resultat = await desactiverIaAction();

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fonctionnaliteActivable.upsert).toHaveBeenCalledTimes(2);
    for (const appel of p.fonctionnaliteActivable.upsert.mock.calls) {
      expect(appel[0].update).toMatchObject({ actif: false });
      expect(appel[0].create).toMatchObject({ actif: false });
    }
    expect(p.fonctionnaliteActivable.upsert.mock.calls.map((appel) => appel[0].where.cle).sort()).toEqual(["ai.citizen_assistant", "ai.summary"]);
    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "desactivation_ia", utilisateurId: "u-admin" }), expect.anything());
  });

  it("une erreur base est signalee sans detail", async () => {
    p.fonctionnaliteActivable.upsert.mockRejectedValue(new Error("base indisponible"));
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await desactiverIaAction();

    expect(resultat.success).toBe(false);
    expect(resultat.error).not.toContain("base");
    erreurConsole.mockRestore();
  });
});
