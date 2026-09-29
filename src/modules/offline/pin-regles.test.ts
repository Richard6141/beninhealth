import { describe, expect, it } from "vitest";
import { validerConfirmationPin, validerPin } from "./pin-regles";

describe("pin-regles (F-COM-01) : validation du code PIN a 6 chiffres", () => {
  it("refuse un PIN qui n'a pas exactement 6 chiffres", () => {
    expect(validerPin("12345").valide).toBe(false);
    expect(validerPin("1234567").valide).toBe(false);
    expect(validerPin("12a456").valide).toBe(false);
  });

  it("refuse explicitement 000000 et 123456 (texte exact du pack)", () => {
    expect(validerPin("000000").valide).toBe(false);
    expect(validerPin("123456").valide).toBe(false);
  });

  it("refuse une autre suite triviale (repetition, suite croissante ou decroissante)", () => {
    expect(validerPin("777777").valide).toBe(false);
    expect(validerPin("234567").valide).toBe(false);
    expect(validerPin("987654").valide).toBe(false);
  });

  it("refuse une date evidente (JJMMAA ou MMJJAA)", () => {
    expect(validerPin("150390").valide).toBe(false); // 15/03/90
    expect(validerPin("311299").valide).toBe(false); // 31/12/99
  });

  it("accepte un PIN sans motif evident", () => {
    const resultat = validerPin("482917");
    expect(resultat.valide).toBe(true);
    expect(resultat.erreur).toBeNull();
  });

  it("validerConfirmationPin refuse deux saisies differentes", () => {
    const resultat = validerConfirmationPin("482917", "482918");
    expect(resultat.valide).toBe(false);
    expect(resultat.erreur).toContain("ne correspondent pas");
  });

  it("validerConfirmationPin accepte deux saisies identiques et valides", () => {
    const resultat = validerConfirmationPin("482917", "482917");
    expect(resultat.valide).toBe(true);
  });
});
