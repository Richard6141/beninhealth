import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: () => ({ NEXTAUTH_SECRET: "secret-de-test-tres-long-0123456789" }) }));

import { chiffrerTexte, dechiffrerTexte, estChiffre } from "@/lib/chiffrement";

beforeEach(() => {
  delete process.env.CLE_CHIFFREMENT_DONNEES;
});

describe("chiffrement de champs (RG-AUTH-51)", () => {
  it("chiffre puis dechiffre, et le texte chiffre ne contient pas le clair", () => {
    const chiffre = chiffrerTexte("JBSWY3DPEHPK3PXP", "mfa:user-1");

    expect(estChiffre(chiffre)).toBe(true);
    expect(chiffre).not.toContain("JBSWY3DPEHPK3PXP");
    expect(dechiffrerTexte(chiffre, "mfa:user-1")).toBe("JBSWY3DPEHPK3PXP");
  });

  it("produit un texte different a chaque appel (IV aleatoire)", () => {
    expect(chiffrerTexte("abc", "c")).not.toBe(chiffrerTexte("abc", "c"));
  });

  it("refuse un contexte different : un secret copie vers un autre compte est illisible", () => {
    const chiffre = chiffrerTexte("secret", "mfa:user-1");

    expect(() => dechiffrerTexte(chiffre, "mfa:user-2")).toThrow();
  });

  it("refuse un texte modifie", () => {
    const chiffre = chiffrerTexte("secret", "mfa:user-1");
    const altere = chiffre.slice(0, -2) + (chiffre.endsWith("A") ? "B" : "A") + chiffre.slice(-1);

    expect(() => dechiffrerTexte(altere, "mfa:user-1")).toThrow();
  });

  it("refuse une valeur en clair ou mal formee", () => {
    expect(estChiffre("JBSWY3DPEHPK3PXP")).toBe(false);
    expect(() => dechiffrerTexte("JBSWY3DPEHPK3PXP", "c")).toThrow();
    expect(() => dechiffrerTexte("chiffre:v1:abc", "c")).toThrow();
  });

  it("une cle dediee remplace celle derivee de NEXTAUTH_SECRET", () => {
    const avecSecretParDefaut = chiffrerTexte("secret", "c");
    process.env.CLE_CHIFFREMENT_DONNEES = "cle-dediee-tres-longue-0123456789";

    expect(() => dechiffrerTexte(avecSecretParDefaut, "c")).toThrow();
    const avecCleDediee = chiffrerTexte("secret", "c");
    expect(dechiffrerTexte(avecCleDediee, "c")).toBe("secret");
  });
});
