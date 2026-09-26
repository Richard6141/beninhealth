import { describe, expect, it } from "vitest";
import { memeTelephoneBenin, normaliserTelephoneBenin } from "@/lib/telephone";

describe("normaliserTelephoneBenin", () => {
  it.each([
    ["97 00 00 00", "+2290197000000"],
    ["0197000000", "+2290197000000"],
    ["01 97 00 00 00", "+2290197000000"],
    ["+229 97 00 00 00", "+2290197000000"],
    ["+22997000000", "+2290197000000"],
    ["+229 01 97 00 00 00", "+2290197000000"],
    ["00229 97000000", "+2290197000000"],
    ["229 0197000000", "+2290197000000"],
  ])("normalise %s vers %s", (saisie, attendu) => {
    expect(normaliserTelephoneBenin(saisie)).toBe(attendu);
  });

  it.each(["", "abc", "1234", "+33 6 12 34 56 78", "0297000000", "+229 970000"])(
    "refuse la saisie non beninoise ou incomplete %s",
    (saisie) => {
      expect(normaliserTelephoneBenin(saisie)).toBeNull();
    }
  );
});

describe("memeTelephoneBenin", () => {
  it("rapproche l'ancienne et la nouvelle forme du meme numero", () => {
    expect(memeTelephoneBenin("+229 97 00 00 00", "0197000000")).toBe(true);
  });

  it("distingue deux numeros differents", () => {
    expect(memeTelephoneBenin("97000000", "97000001")).toBe(false);
  });

  it("ne rapproche jamais deux saisies invalides", () => {
    expect(memeTelephoneBenin("abc", "abc")).toBe(false);
  });
});
