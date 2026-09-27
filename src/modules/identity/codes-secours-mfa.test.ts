import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    codeSecoursMfa: { updateMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import {
  NOMBRE_CODES_SECOURS,
  consommerCodeSecours,
  formaterCodeSecours,
  genererCodesSecours,
  normaliserCodeSecours,
  remplacerCodesSecours,
} from "@/modules/identity/codes-secours-mfa";

const p = prisma as unknown as {
  codeSecoursMfa: { updateMany: Mock; count: Mock; deleteMany: Mock; createMany: Mock };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("genererCodesSecours", () => {
  it("produit dix codes distincts de 10 caracteres sans caractere ambigu", () => {
    const codes = genererCodesSecours();

    expect(codes).toHaveLength(NOMBRE_CODES_SECOURS);
    expect(new Set(codes).size).toBe(NOMBRE_CODES_SECOURS);
    for (const code of codes) {
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/);
    }
  });

  it("ne produit pas deux fois le meme lot", () => {
    expect(genererCodesSecours()).not.toEqual(genererCodesSecours());
  });
});

describe("normaliserCodeSecours", () => {
  it("accepte la forme affichee, les minuscules et les espaces", () => {
    expect(normaliserCodeSecours("abcde-fghjk")).toBe("ABCDEFGHJK");
    expect(normaliserCodeSecours(" ABCDE FGHJK ")).toBe("ABCDEFGHJK");
    expect(normaliserCodeSecours(formaterCodeSecours("ABCDEFGHJK"))).toBe("ABCDEFGHJK");
  });

  it("refuse une saisie de la mauvaise longueur ou avec un caractere ambigu (O, 0, I, 1, L)", () => {
    expect(normaliserCodeSecours("ABCDE")).toBeNull();
    expect(normaliserCodeSecours("ABCDEFGHJKM")).toBeNull();
    expect(normaliserCodeSecours("ABCDE-FGHJ0")).toBeNull();
    expect(normaliserCodeSecours("ABCDE-FGHJL")).toBeNull();
    expect(normaliserCodeSecours("123456")).toBeNull();
  });
});

describe("consommerCodeSecours", () => {
  it("consomme un code une seule fois : la mise a jour est conditionnelle sur utiliseLe: null", async () => {
    p.codeSecoursMfa.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    expect(await consommerCodeSecours("u-1", "ABCDE-FGHJK")).toBe(true);
    expect(await consommerCodeSecours("u-1", "ABCDE-FGHJK")).toBe(false);

    const appel = p.codeSecoursMfa.updateMany.mock.calls[0][0];
    expect(appel.where.userId).toBe("u-1");
    expect(appel.where.utiliseLe).toBeNull();
    expect(appel.where.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(appel.data.utiliseLe).toBeInstanceOf(Date);
  });

  it("ne cherche jamais le code en clair, et l'empreinte depend du code", async () => {
    p.codeSecoursMfa.updateMany.mockResolvedValue({ count: 0 });

    await consommerCodeSecours("u-1", "ABCDE-FGHJK");
    await consommerCodeSecours("u-1", "ABCDE-FGHJM");

    const [premier, second] = p.codeSecoursMfa.updateMany.mock.calls.map((appel) => appel[0].where.empreinte);
    expect(premier).not.toContain("ABCDE");
    expect(premier).not.toBe(second);
  });

  it("refuse sans interroger la base une saisie qui n'a pas la forme d'un code", async () => {
    expect(await consommerCodeSecours("u-1", "123456")).toBe(false);
    expect(p.codeSecoursMfa.updateMany).not.toHaveBeenCalled();
  });
});

describe("remplacerCodesSecours", () => {
  it("supprime les anciens codes, enregistre dix empreintes et renvoie les codes en clair formates", async () => {
    const codes = await remplacerCodesSecours(prisma, "u-1");

    expect(p.codeSecoursMfa.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-1" } });
    const donnees = p.codeSecoursMfa.createMany.mock.calls[0][0].data as Array<{ userId: string; empreinte: string }>;
    expect(donnees).toHaveLength(NOMBRE_CODES_SECOURS);
    expect(codes).toHaveLength(NOMBRE_CODES_SECOURS);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(JSON.stringify(donnees)).not.toContain(code.replace("-", ""));
    }
  });
});
