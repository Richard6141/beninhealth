import { describe, expect, it } from "vitest";
import {
  normaliserNumeroOrdre,
  numeroOrdreValide,
  professionDepuisRole,
} from "@/modules/identity/identite-professionnelle";

describe("professionDepuisRole", () => {
  it.each(["medecin", "infirmier", "pharmacien", "laboratoire", "agent_communautaire"])(
    "%s est une profession clinique",
    (role) => {
      expect(professionDepuisRole(role)).toBe(role);
    }
  );

  it.each(["patient", "admin_etablissement", "admin_national", "toString", ""])(
    "%s n'est pas une profession clinique",
    (role) => {
      expect(professionDepuisRole(role)).toBeNull();
    }
  );
});

describe("normaliserNumeroOrdre", () => {
  it("retire les espaces et met en majuscules", () => {
    expect(normaliserNumeroOrdre(" onmb 1234 / b ")).toBe("ONMB1234/B");
  });

  it("une saisie vide ou faite d'espaces vaut 'non renseigne'", () => {
    expect(normaliserNumeroOrdre("")).toBeNull();
    expect(normaliserNumeroOrdre("   ")).toBeNull();
  });

  it("deux saisies du meme numero sous des formes differentes donnent la meme forme", () => {
    expect(normaliserNumeroOrdre("om 0042")).toBe(normaliserNumeroOrdre("OM0042"));
  });
});

describe("numeroOrdreValide", () => {
  it("accepte lettres, chiffres et separateurs usuels", () => {
    expect(numeroOrdreValide("ONMB-1234/B")).toBe(true);
    expect(numeroOrdreValide("0042")).toBe(true);
  });

  it("refuse les caracteres inattendus, un debut par separateur et un numero trop long", () => {
    expect(numeroOrdreValide("12'; DROP")).toBe(false);
    expect(numeroOrdreValide("-1234")).toBe(false);
    expect(numeroOrdreValide("A".repeat(41))).toBe(false);
  });
});
