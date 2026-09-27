import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test" })) }));

import { DUREE_JETON_EXPORT_AUDIT_MS, creerJetonExportAudit, jetonExportAuditValide } from "./jeton-export-audit";

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

describe("jeton d'export du journal d'audit (F-AUD-01)", () => {
  it("est valable pour le compte pour lequel il a ete cree", () => {
    const jeton = creerJetonExportAudit("user-1", MAINTENANT);

    expect(jetonExportAuditValide(jeton, "user-1", MAINTENANT)).toBe(true);
  });

  it("est refuse pour un autre compte (un jeton copie ne sert a rien)", () => {
    const jeton = creerJetonExportAudit("user-1", MAINTENANT);

    expect(jetonExportAuditValide(jeton, "user-2", MAINTENANT)).toBe(false);
  });

  it("expire exactement apres cinq minutes", () => {
    const jeton = creerJetonExportAudit("user-1", MAINTENANT);
    const juste = new Date(MAINTENANT.getTime() + DUREE_JETON_EXPORT_AUDIT_MS);
    const apres = new Date(MAINTENANT.getTime() + DUREE_JETON_EXPORT_AUDIT_MS + 1);

    expect(DUREE_JETON_EXPORT_AUDIT_MS).toBe(5 * 60 * 1000);
    expect(jetonExportAuditValide(jeton, "user-1", juste)).toBe(true);
    expect(jetonExportAuditValide(jeton, "user-1", apres)).toBe(false);
  });

  it("refuse une expiration prolongee a la main (la signature couvre l'expiration)", () => {
    const jeton = creerJetonExportAudit("user-1", MAINTENANT);
    const [, signature] = jeton.split(".");
    const prolonge = `${MAINTENANT.getTime() + 24 * 60 * 60 * 1000}.${signature}`;

    expect(jetonExportAuditValide(prolonge, "user-1", MAINTENANT)).toBe(false);
  });

  it("refuse une signature alteree, un jeton vide, absent ou mal forme", () => {
    const jeton = creerJetonExportAudit("user-1", MAINTENANT);

    expect(jetonExportAuditValide(`${jeton}x`, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide(`${jeton}.autre`, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide("", "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide(null, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide(undefined, "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide("abc", "user-1", MAINTENANT)).toBe(false);
    expect(jetonExportAuditValide("NaN.abc", "user-1", MAINTENANT)).toBe(false);
  });

  it("n'est pas interchangeable avec un jeton d'un autre usage (etiquette de signature distincte)", async () => {
    const { creerJetonExportDonnees } = await import("@/modules/patient/jeton-export-donnees");
    const autre = creerJetonExportDonnees("user-1", MAINTENANT);

    expect(jetonExportAuditValide(autre, "user-1", MAINTENANT)).toBe(false);
  });
});
