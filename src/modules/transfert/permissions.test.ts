import { describe, expect, it } from "vitest";
import { can } from "@/security/permissions";
import type { NomRole } from "@/types";

const TOUS_LES_ROLES: NomRole[] = [
  "patient",
  "medecin",
  "infirmier",
  "pharmacien",
  "laboratoire",
  "agent_communautaire",
  "admin_etablissement",
  "admin_national",
];

describe("permissions de l'acces au dossier par NPI ou telephone", () => {
  it.each(["medecin", "infirmier"] as NomRole[])("%s peut demander un acces et confirmer un code", (role) => {
    expect(can(role, "create", "demande_acces_dossier")).toBe(true);
    expect(can(role, "update", "demande_acces_dossier")).toBe(true);
  });

  it("aucun autre role ne peut demander l'acces au dossier d'un patient par code", () => {
    for (const role of TOUS_LES_ROLES.filter((r) => r !== "medecin" && r !== "infirmier")) {
      expect(can(role, "create", "demande_acces_dossier")).toBe(false);
      expect(can(role, "update", "demande_acces_dossier")).toBe(false);
    }
  });

  it("seul le patient peut voir et repondre aux demandes recues", () => {
    expect(can("patient", "read", "demande_acces_recue")).toBe(true);
    expect(can("patient", "update", "demande_acces_recue")).toBe(true);
    for (const role of TOUS_LES_ROLES.filter((r) => r !== "patient")) {
      expect(can(role, "read", "demande_acces_recue")).toBe(false);
      expect(can(role, "update", "demande_acces_recue")).toBe(false);
    }
  });

  it("le patient ne peut pas se donner le droit de demander l'acces a un autre dossier", () => {
    expect(can("patient", "create", "demande_acces_dossier")).toBe(false);
  });

  it("personne ne peut supprimer une demande", () => {
    for (const role of TOUS_LES_ROLES) {
      expect(can(role, "delete", "demande_acces_dossier")).toBe(false);
      expect(can(role, "delete", "demande_acces_recue")).toBe(false);
    }
  });
});
