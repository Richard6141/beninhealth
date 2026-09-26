import { describe, expect, it } from "vitest";
import { can, type Role } from "@/security/permissions";

/**
 * Tests unitaires de la fonction pure `can` (RBAC). Aucun mock necessaire :
 * la matrice de permissions est figee dans permissions.ts et `can` ne fait
 * que la consulter.
 *
 * Pour chacun des 8 roles de la plateforme : au moins un cas ou `can` doit
 * retourner true (permission reellement accordee dans la matrice) et au
 * moins un cas ou elle doit retourner false (permission plausible mais non
 * accordee a ce role). Le comportement fail-safe (role ou ressource inconnus)
 * est teste separement.
 */

describe("can (permissions RBAC)", () => {
  describe("role patient", () => {
    it("autorise la lecture de son propre dossier", () => {
      expect(can("patient", "read", "propre_dossier")).toBe(true);
    });

    it("refuse la suppression de son propre dossier (non accordee)", () => {
      expect(can("patient", "delete", "propre_dossier")).toBe(false);
    });
  });

  describe("role medecin", () => {
    it("autorise la creation d'une prescription", () => {
      expect(can("medecin", "create", "prescription")).toBe(true);
    });

    it("refuse la suppression d'une prescription (non accordee)", () => {
      expect(can("medecin", "delete", "prescription")).toBe(false);
    });

    it("F-LAB-06 : autorise la mise a jour d'un examen medical (annulation de sa propre demande)", () => {
      expect(can("medecin", "update", "examen_medical")).toBe(true);
    });
  });

  describe("role infirmier", () => {
    it("autorise la mise a jour d'une consultation", () => {
      expect(can("infirmier", "update", "consultation")).toBe(true);
    });

    it("refuse la creation d'une consultation (droit reserve au medecin)", () => {
      expect(can("infirmier", "create", "consultation")).toBe(false);
    });
  });

  describe("role agent_communautaire", () => {
    it("autorise la creation d'un suivi communautaire", () => {
      expect(can("agent_communautaire", "create", "suivi_communautaire")).toBe(true);
    });

    it("refuse la lecture du dossier d'un patient (pas d'acces au dossier clinique complet)", () => {
      expect(can("agent_communautaire", "read", "patient")).toBe(false);
    });
  });

  describe("role pharmacien", () => {
    it("autorise la mise a jour du catalogue de medicaments", () => {
      expect(can("pharmacien", "update", "medicament")).toBe(true);
    });

    it("refuse la suppression d'un medicament (non accordee)", () => {
      expect(can("pharmacien", "delete", "medicament")).toBe(false);
    });
  });

  describe("role laboratoire", () => {
    it("autorise la mise a jour d'un examen medical (saisie de resultat)", () => {
      expect(can("laboratoire", "update", "examen_medical")).toBe(true);
    });

    it("refuse la creation d'un examen medical (non accordee)", () => {
      expect(can("laboratoire", "create", "examen_medical")).toBe(false);
    });
  });

  describe("role admin_etablissement", () => {
    it("autorise la suppression d'un etablissement sanitaire", () => {
      expect(can("admin_etablissement", "delete", "etablissement_sanitaire")).toBe(true);
    });

    it("refuse la lecture des analytics (reservee a admin_national)", () => {
      expect(can("admin_etablissement", "read", "analytics")).toBe(false);
    });

    it("autorise la lecture du journal d'audit (F-AUD-01, scope a son etablissement)", () => {
      expect(can("admin_etablissement", "read", "journal_audit")).toBe(true);
    });

    it("autorise la revue d'un acces d'urgence (F-AUD-02)", () => {
      expect(can("admin_etablissement", "create", "revue_acces_urgence")).toBe(true);
    });
  });

  describe("role admin_national", () => {
    it("autorise la lecture des analytics (donnees agregees)", () => {
      expect(can("admin_national", "read", "analytics")).toBe(true);
    });

    it("refuse la creation d'analytics (lecture seule pour ce role)", () => {
      expect(can("admin_national", "create", "analytics")).toBe(false);
    });

    it("autorise la lecture du journal d'audit (F-AUD-01, echelle plateforme)", () => {
      expect(can("admin_national", "read", "journal_audit")).toBe(true);
    });

    it("autorise la revue d'un acces d'urgence (F-AUD-02)", () => {
      expect(can("admin_national", "create", "revue_acces_urgence")).toBe(true);
    });
  });

  describe("validation des professionnels (F-ADM-03), reservee a admin_national", () => {
    it("autorise admin_national a lire la file et a decider", () => {
      expect(can("admin_national", "read", "validation_professionnel")).toBe(true);
      expect(can("admin_national", "update", "validation_professionnel")).toBe(true);
    });

    it("refuse a tout autre role, y compris admin_etablissement (il ne peut pas se valider lui-meme, RG-ADM-11)", () => {
      const autres: Role[] = ["patient", "medecin", "infirmier", "agent_communautaire", "pharmacien", "laboratoire", "admin_etablissement"];
      for (const role of autres) {
        expect(can(role, "read", "validation_professionnel")).toBe(false);
        expect(can(role, "update", "validation_professionnel")).toBe(false);
      }
    });

    it("n'accorde aucun droit clinique a admin_national par ce biais (RG-ROL-06)", () => {
      expect(can("admin_national", "read", "patient")).toBe(false);
      expect(can("admin_national", "read", "consultation")).toBe(false);
    });
  });

  describe("acces d'urgence (F-CLI-10), reserve a medecin et infirmier", () => {
    it("autorise le medecin a declencher un acces d'urgence", () => {
      expect(can("medecin", "create", "acces_urgence")).toBe(true);
    });

    it("autorise l'infirmier a declencher un acces d'urgence", () => {
      expect(can("infirmier", "create", "acces_urgence")).toBe(true);
    });

    it("refuse a un role sans lien clinique de declencher un acces d'urgence", () => {
      expect(can("pharmacien", "create", "acces_urgence")).toBe(false);
    });
  });

  describe("comportement fail-safe", () => {
    it("retourne false sans lever d'exception pour un role qui n'existe pas dans la matrice", () => {
      const roleInvalide = "role_inexistant" as Role;

      expect(() => can(roleInvalide, "read", "propre_dossier")).not.toThrow();
      expect(can(roleInvalide, "read", "propre_dossier")).toBe(false);
    });

    it("retourne false pour une ressource inventee, meme pour un role par ailleurs valide", () => {
      expect(can("patient", "read", "ressource_qui_n_existe_pas")).toBe(false);
    });

    it("retourne false pour une action valide sur une ressource inventee, pour chaque role", () => {
      const roles: Role[] = [
        "patient",
        "medecin",
        "infirmier",
        "agent_communautaire",
        "pharmacien",
        "laboratoire",
        "admin_etablissement",
        "admin_national",
      ];

      for (const role of roles) {
        expect(can(role, "read", "ressource_qui_n_existe_pas")).toBe(false);
      }
    });
  });
});
