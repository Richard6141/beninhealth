import { describe, expect, it } from "vitest";
import { estUuidV7Valide, genererUuidV7, horodatageDepuisUuidV7 } from "./uuid-v7";

describe("uuid-v7 (RG-OFF-02) : identifiant genere sur l'appareil", () => {
  it("genere un UUID au format valide (version 7, variant 10xx)", () => {
    const uuid = genererUuidV7();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(estUuidV7Valide(uuid)).toBe(true);
  });

  it("genere des identifiants distincts a chaque appel", () => {
    const identifiants = new Set(Array.from({ length: 200 }, () => genererUuidV7()));
    expect(identifiants.size).toBe(200);
  });

  it("est triable chronologiquement (prefixe temporel croissant)", () => {
    const premier = genererUuidV7(1_700_000_000_000);
    const second = genererUuidV7(1_700_000_000_001);
    expect(premier < second).toBe(true);
  });

  it("horodatageDepuisUuidV7 restitue l'horodatage encode", () => {
    const horodatage = 1_700_000_123_456;
    const uuid = genererUuidV7(horodatage);
    expect(horodatageDepuisUuidV7(uuid)).toBe(horodatage);
  });

  it("estUuidV7Valide refuse un UUID v4 ou une chaine quelconque", () => {
    expect(estUuidV7Valide("550e8400-e29b-41d4-a716-446655440000")).toBe(false);
    expect(estUuidV7Valide("pas-un-uuid")).toBe(false);
    expect(estUuidV7Valide("")).toBe(false);
  });
});
