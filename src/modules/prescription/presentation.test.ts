import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));

import {
  DUREE_PRESENTATION_MS,
  creerJetonPresentation,
  debutJourBenin,
  debutJourSuivantBenin,
  jetonPresentationValide,
} from "./presentation";

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");

describe("jeton de presentation d'ordonnance (F-PHA-02, RG-PHA-02)", () => {
  it("est valable pour le pharmacien et l'ordonnance pour lesquels il a ete cree", () => {
    const jeton = creerJetonPresentation("user-ph", "presc-1", MAINTENANT);

    expect(jetonPresentationValide(jeton, "user-ph", "presc-1", MAINTENANT)).toBe(true);
  });

  it("est refuse pour un autre pharmacien (un jeton copie ne sert a rien)", () => {
    const jeton = creerJetonPresentation("user-ph", "presc-1", MAINTENANT);

    expect(jetonPresentationValide(jeton, "user-autre", "presc-1", MAINTENANT)).toBe(false);
  });

  it("est refuse pour une autre ordonnance", () => {
    const jeton = creerJetonPresentation("user-ph", "presc-1", MAINTENANT);

    expect(jetonPresentationValide(jeton, "user-ph", "presc-2", MAINTENANT)).toBe(false);
  });

  it("expire apres la duree de presentation", () => {
    const jeton = creerJetonPresentation("user-ph", "presc-1", MAINTENANT);
    const juste = new Date(MAINTENANT.getTime() + DUREE_PRESENTATION_MS);
    const apres = new Date(MAINTENANT.getTime() + DUREE_PRESENTATION_MS + 1);

    expect(jetonPresentationValide(jeton, "user-ph", "presc-1", juste)).toBe(true);
    expect(jetonPresentationValide(jeton, "user-ph", "presc-1", apres)).toBe(false);
  });

  it("refuse un jeton dont l'expiration a ete repoussee a la main", () => {
    const jeton = creerJetonPresentation("user-ph", "presc-1", MAINTENANT);
    const [, signature] = jeton.split(".");
    const prolonge = `${MAINTENANT.getTime() + 10 * DUREE_PRESENTATION_MS}.${signature}`;

    expect(jetonPresentationValide(prolonge, "user-ph", "presc-1", MAINTENANT)).toBe(false);
  });

  it("refuse les jetons absents ou mal formes", () => {
    for (const jeton of [undefined, null, "", "abc", ".", "123.", ".abc", "1.2.3", "pas-un-nombre.signature"]) {
      expect(jetonPresentationValide(jeton, "user-ph", "presc-1", MAINTENANT)).toBe(false);
    }
  });
});

describe("jour civil au Benin (UTC+1)", () => {
  it("le jour commence a 23h00 UTC la veille", () => {
    expect(debutJourBenin(new Date("2026-09-26T12:00:00.000Z")).toISOString()).toBe("2026-09-25T23:00:00.000Z");
  });

  it("23h30 UTC est deja le lendemain au Benin", () => {
    expect(debutJourBenin(new Date("2026-09-26T23:30:00.000Z")).toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });

  it("le jour suivant commence 24 h plus tard", () => {
    expect(debutJourSuivantBenin(new Date("2026-09-26T12:00:00.000Z")).toISOString()).toBe("2026-09-26T23:00:00.000Z");
  });
});
