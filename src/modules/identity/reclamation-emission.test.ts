import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async (valeur: string) => `hash:${valeur}`) } }));

import { creerCodeReclamation, texteSmsCodeReclamation } from "./reclamation-emission";

function txFactice() {
  return {
    codeReclamationDossier: { updateMany: vi.fn(), create: vi.fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("creerCodeReclamation : partage entre generation manuelle et envoi automatique (F-AUTH-03)", () => {
  it("invalide les codes precedents avant de creer le nouveau, et retourne le code en clair", async () => {
    const tx = txFactice();
    const ordre: string[] = [];
    (tx.codeReclamationDossier.updateMany as Mock).mockImplementation(async () => {
      ordre.push("invalidation");
      return { count: 1 };
    });
    (tx.codeReclamationDossier.create as Mock).mockImplementation(async () => {
      ordre.push("creation");
      return { id: "code-1" };
    });

    const code = await creerCodeReclamation(tx as never, "pat-1");

    expect(ordre).toEqual(["invalidation", "creation"]);
    expect(code).toHaveLength(8);
    expect(tx.codeReclamationDossier.updateMany).toHaveBeenCalledWith({
      where: { patientId: "pat-1", consommeLe: null, expireLe: { gt: expect.any(Date) } },
      data: { expireLe: expect.any(Date) },
    });
    const donneesCreation = (tx.codeReclamationDossier.create as Mock).mock.calls[0][0].data;
    expect(donneesCreation.patientId).toBe("pat-1");
    expect(donneesCreation.codeHash).toBe(`hash:${code}`);
    expect(donneesCreation.expireLe).toBeInstanceOf(Date);
  });

  it("jamais le meme code deux appels de suite (aleatoire)", async () => {
    const tx1 = txFactice();
    const tx2 = txFactice();

    const code1 = await creerCodeReclamation(tx1 as never, "pat-1");
    const code2 = await creerCodeReclamation(tx2 as never, "pat-1");

    expect(code1).not.toBe(code2);
  });
});

describe("texteSmsCodeReclamation", () => {
  it("inclut le code et la duree de validite", () => {
    expect(texteSmsCodeReclamation("ABCD2345")).toBe(
      "Votre code pour activer votre compte BHIP : ABCD2345. Valable 30 jours."
    );
  });
});
