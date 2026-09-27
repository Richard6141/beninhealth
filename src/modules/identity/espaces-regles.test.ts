import { describe, expect, it } from "vitest";
import { accueilDeLEspace, estNomRole, estRoleProfessionnel, rolesEffectifs } from "./espaces-regles";

describe("rolesEffectifs (RG-AUTH-60)", () => {
  it("renvoie tous les roles tant qu'aucun espace n'a ete choisi", () => {
    expect(rolesEffectifs(["patient", "medecin"], null)).toEqual(["patient", "medecin"]);
    expect(rolesEffectifs(["patient", "medecin"], undefined)).toEqual(["patient", "medecin"]);
    expect(rolesEffectifs(["patient", "medecin"], "")).toEqual(["patient", "medecin"]);
  });

  it("restreint au seul espace choisi quand le compte le possede", () => {
    expect(rolesEffectifs(["patient", "medecin"], "medecin")).toEqual(["medecin"]);
  });

  it("ignore un espace que le compte ne possede pas ou qui n'est pas un role", () => {
    expect(rolesEffectifs(["patient"], "admin_national")).toEqual(["patient"]);
    expect(rolesEffectifs(["patient"], "root")).toEqual(["patient"]);
  });
});

describe("espaces", () => {
  it("chaque role a une page d'accueil", () => {
    expect(accueilDeLEspace("patient")).toBe("/app/patient");
    expect(accueilDeLEspace("admin_national")).toBe("/app/ministere");
    expect(accueilDeLEspace("admin_etablissement")).toBe("/app/etablissement");
    for (const role of ["medecin", "infirmier", "pharmacien", "laboratoire", "agent_communautaire"] as const) {
      expect(accueilDeLEspace(role)).toBe("/app/medecin");
    }
  });

  it("les roles professionnels sont ceux qui ont un profil professionnel", () => {
    expect(estRoleProfessionnel("medecin")).toBe(true);
    expect(estRoleProfessionnel("admin_etablissement")).toBe(true);
    expect(estRoleProfessionnel("patient")).toBe(false);
    expect(estRoleProfessionnel("admin_national")).toBe(false);
  });

  it("estNomRole rejette tout ce qui n'est pas un role connu", () => {
    expect(estNomRole("medecin")).toBe(true);
    expect(estNomRole("pirate")).toBe(false);
    expect(estNomRole(null)).toBe(false);
    expect(estNomRole(42)).toBe(false);
  });
});
