import { describe, expect, it } from "vitest";
import { MAX_ECHECS_PIN, doitEffacerApresEchecsPin, instantaneExpire } from "./regles-expiration";

describe("regles-expiration (RG-COM-02, RG-COM-03)", () => {
  it("doitEffacerApresEchecsPin est faux sous la limite de 5", () => {
    expect(doitEffacerApresEchecsPin(0)).toBe(false);
    expect(doitEffacerApresEchecsPin(4)).toBe(false);
  });

  it("doitEffacerApresEchecsPin devient vrai a partir du 5e echec", () => {
    expect(doitEffacerApresEchecsPin(MAX_ECHECS_PIN)).toBe(true);
    expect(doitEffacerApresEchecsPin(6)).toBe(true);
  });

  it("instantaneExpire est faux si aucun instantane n'a encore ete telecharge", () => {
    expect(instantaneExpire(null)).toBe(false);
  });

  it("instantaneExpire est faux avant 30 jours", () => {
    const ilYa29Jours = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
    expect(instantaneExpire(ilYa29Jours)).toBe(false);
  });

  it("instantaneExpire est vrai a partir de 30 jours", () => {
    const ilYa30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(instantaneExpire(ilYa30Jours)).toBe(true);
  });
});
