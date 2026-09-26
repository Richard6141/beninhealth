import { describe, expect, it } from "vitest";
import { estCollisionUnicite, FORMAT_NUMERO_EXAMEN, genererNumeroExamen } from "@/modules/laboratoire/numero-examen";

describe("genererNumeroExamen (F-LAB-01)", () => {
  it("respecte le format LB-XXXX-XXXX", () => {
    for (let i = 0; i < 200; i += 1) {
      expect(genererNumeroExamen()).toMatch(FORMAT_NUMERO_EXAMEN);
    }
  });

  it("ne contient jamais 0, 1, I ni O dans les deux blocs", () => {
    for (let i = 0; i < 200; i += 1) {
      const blocs = genererNumeroExamen().slice(3).replace("-", "");
      expect(blocs).not.toMatch(/[01IO]/);
    }
  });

  it("produit des numeros distincts (tirage aleatoire, pas un compteur)", () => {
    const numeros = new Set(Array.from({ length: 500 }, () => genererNumeroExamen()));
    expect(numeros.size).toBe(500);
  });
});

describe("estCollisionUnicite", () => {
  it("reconnait une violation de contrainte unique Prisma (P2002) et rien d'autre", () => {
    expect(estCollisionUnicite({ code: "P2002" })).toBe(true);
    expect(estCollisionUnicite({ code: "P2025" })).toBe(false);
    expect(estCollisionUnicite(new Error("autre"))).toBe(false);
    expect(estCollisionUnicite(null)).toBe(false);
    expect(estCollisionUnicite("P2002")).toBe(false);
  });
});
