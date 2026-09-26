import { describe, expect, it } from "vitest";
import { enTetesSecurite } from "./en-tetes-securite";

function valeur(enTetes: { key: string; value: string }[], nom: string): string | undefined {
  return enTetes.find((enTete) => enTete.key === nom)?.value;
}

describe("enTetesSecurite", () => {
  it("interdit l'affichage dans un cadre, les objets et les formulaires vers un autre site", () => {
    const csp = valeur(enTetesSecurite(false), "Content-Security-Policy");

    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("n'impose aucune directive de script ou de style (elles casseraient les pages sans nonce)", () => {
    const csp = valeur(enTetesSecurite(true), "Content-Security-Policy") ?? "";

    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("style-src");
    expect(csp).not.toContain("default-src");
  });

  it("pose les en-tetes de base dans tous les environnements", () => {
    const enTetes = enTetesSecurite(false);

    expect(valeur(enTetes, "X-Frame-Options")).toBe("DENY");
    expect(valeur(enTetes, "X-Content-Type-Options")).toBe("nosniff");
    expect(valeur(enTetes, "Referrer-Policy")).toBe("same-origin");
    expect(valeur(enTetes, "Permissions-Policy")).toContain("camera=()");
    expect(valeur(enTetes, "Permissions-Policy")).toContain("geolocation=()");
  });

  it("n'envoie HSTS qu'en production, sans preload", () => {
    expect(valeur(enTetesSecurite(false), "Strict-Transport-Security")).toBeUndefined();

    const hsts = valeur(enTetesSecurite(true), "Strict-Transport-Security");
    expect(hsts).toContain("max-age=63072000");
    expect(hsts).not.toContain("preload");
  });
});
