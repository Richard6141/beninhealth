import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));

import { DUREE_JETON_EXPORT_MS, creerJetonExportDonnees, jetonExportDonneesValide } from "./jeton-export-donnees";

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

describe("jeton d'export des donnees personnelles (F-CIT-13)", () => {
  it("est valable pour le compte pour lequel il a ete cree", () => {
    const jeton = creerJetonExportDonnees("user-1", MAINTENANT);

    expect(jetonExportDonneesValide(jeton, "user-1", MAINTENANT)).toBe(true);
  });

  it("est refuse pour un autre compte (un jeton copie ne sert a rien)", () => {
    const jeton = creerJetonExportDonnees("user-1", MAINTENANT);

    expect(jetonExportDonneesValide(jeton, "user-2", MAINTENANT)).toBe(false);
  });

  it("expire exactement apres cinq minutes", () => {
    const jeton = creerJetonExportDonnees("user-1", MAINTENANT);
    const juste = new Date(MAINTENANT.getTime() + DUREE_JETON_EXPORT_MS);
    const apres = new Date(MAINTENANT.getTime() + DUREE_JETON_EXPORT_MS + 1);

    expect(DUREE_JETON_EXPORT_MS).toBe(5 * 60 * 1000);
    expect(jetonExportDonneesValide(jeton, "user-1", juste)).toBe(true);
    expect(jetonExportDonneesValide(jeton, "user-1", apres)).toBe(false);
  });

  it("refuse une expiration prolongee a la main (la signature couvre l'expiration)", () => {
    const jeton = creerJetonExportDonnees("user-1", MAINTENANT);
    const [, signature] = jeton.split(".");
    const prolonge = `${MAINTENANT.getTime() + 24 * 60 * 60 * 1000}.${signature}`;

    expect(jetonExportDonneesValide(prolonge, "user-1", MAINTENANT)).toBe(false);
  });

  it("refuse une signature alteree, un jeton vide, absent ou mal forme", () => {
    const jeton = creerJetonExportDonnees("user-1", MAINTENANT);

    expect(jetonExportDonneesValide(`${jeton}x`, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide(`${jeton}.autre`, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide("", "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide(null, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide(undefined, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide("abc", "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportDonneesValide("NaN.abc", "user-1", MAINTENANT)).toBe(false);
  });

  it("n'est pas interchangeable avec un jeton d'un autre usage (etiquette de signature distincte)", async () => {
    const { creerJetonPresentation } = await import("@/modules/prescription/presentation");
    const autre = creerJetonPresentation("user-1", "presc-1", MAINTENANT);

    expect(jetonExportDonneesValide(autre, "user-1", MAINTENANT)).toBe(false);
  });
});
