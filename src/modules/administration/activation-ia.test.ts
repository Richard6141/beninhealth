import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    fonctionnaliteActivable: { upsert: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
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
vi.mock("@/modules/ai/jeu-evaluation-assistant", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/modules/ai/jeu-evaluation-assistant")>();
  return { ...original, executerJeuAssistant: vi.fn(original.executerJeuAssistant) };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { basculerFonctionnaliteAction } from "@/modules/administration/parametres";
import { executerJeuAssistant } from "@/modules/ai/jeu-evaluation-assistant";

const p = prisma as unknown as { fonctionnaliteActivable: { upsert: Mock; findUniqueOrThrow: Mock; update: Mock }; $transaction: Mock };
const getSessionMock = getSession as unknown as Mock;

function formulaire(cle: string): FormData {
  const donnees = new FormData();
  donnees.set("cle", cle);
  return donnees;
}

const etatInitial = { error: null, success: false };

beforeEach(() => {
  vi.resetAllMocks();
  p.$transaction.mockImplementation(async (operations: unknown) =>
    Array.isArray(operations) ? Promise.all(operations) : (operations as (tx: unknown) => unknown)(prisma)
  );
  delete process.env.IA_FOURNISSEUR;
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  p.fonctionnaliteActivable.upsert.mockResolvedValue({});
  p.fonctionnaliteActivable.update.mockResolvedValue({});
});

describe("activation du resume IA subordonnee au jeu d'evaluation (RG-IA-20)", () => {
  it("l'activation aboutit quand le jeu de 20 dossiers passe avec le fournisseur actuel", async () => {
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "ai.summary", actif: false });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("ai.summary"));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fonctionnaliteActivable.update).toHaveBeenCalledWith(expect.objectContaining({ where: { cle: "ai.summary" }, data: expect.objectContaining({ actif: true }) }));
  });

  it("l'activation est refusee quand le jeu echoue (fournisseur desactive) : rien n'est modifie", async () => {
    process.env.IA_FOURNISSEUR = "desactive";
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "ai.summary", actif: false });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("ai.summary"));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Activation refusée");
    expect(p.fonctionnaliteActivable.update).not.toHaveBeenCalled();
  });

  it("une desactivation n'est jamais bloquee, meme si le jeu echoue : la coupure reste toujours possible", async () => {
    process.env.IA_FOURNISSEUR = "desactive";
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "ai.summary", actif: true });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("ai.summary"));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fonctionnaliteActivable.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actif: false }) }));
  });

  it("l'assistant citoyen s'active avec son propre jeu, sans dependre du fournisseur du resume", async () => {
    process.env.IA_FOURNISSEUR = "desactive";
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "ai.citizen_assistant", actif: false });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("ai.citizen_assistant"));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fonctionnaliteActivable.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actif: true }) }));
  });

  it("l'activation de l'assistant est refusee quand son jeu d'evaluation echoue", async () => {
    (executerJeuAssistant as unknown as Mock).mockResolvedValueOnce({
      total: 10,
      conformes: 9,
      echecs: [{ question: "J'ai de la fièvre", regle: "texte", detail: "la reponse n'est pas la reponse fixe" }],
    });
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "ai.citizen_assistant", actif: false });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("ai.citizen_assistant"));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Activation refusée");
    expect(resultat.error).toContain("9/10");
    expect(p.fonctionnaliteActivable.update).not.toHaveBeenCalled();
  });

  it("les autres fonctionnalites ne passent jamais par le jeu d'evaluation", async () => {
    process.env.IA_FOURNISSEUR = "desactive";
    p.fonctionnaliteActivable.findUniqueOrThrow.mockResolvedValue({ cle: "demo.banner", actif: false });

    const resultat = await basculerFonctionnaliteAction(etatInitial, formulaire("demo.banner"));

    expect(resultat).toEqual({ error: null, success: true });
  });
});
