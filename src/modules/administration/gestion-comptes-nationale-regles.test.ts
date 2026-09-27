import { describe, expect, it } from "vitest";
import {
  estCompteAdministrateur,
  exigeDoubleValidation,
  verifierActionSurCompte,
  verifierDecisionSurDemande,
  verifierRenvoiInvitation,
  type ContexteCible,
} from "@/modules/administration/gestion-comptes-nationale-regles";

function cible(surcharges: Partial<ContexteCible> = {}): ContexteCible {
  return {
    id: "cible-1",
    roles: ["medecin"],
    statut: "actif",
    mfaActif: true,
    statutValidationProfessionnel: "valide",
    ...surcharges,
  };
}

describe("exigeDoubleValidation (RG-ADM-30)", () => {
  it("un compte administrateur exige un second administrateur pour toute action", () => {
    for (const type of ["suspension", "reactivation", "reinitialisation_2fa"] as const) {
      expect(exigeDoubleValidation(type, { roles: ["admin_national"] })).toBe(true);
    }
  });

  it("un compte non administrateur ne l'exige pas", () => {
    for (const roles of [["medecin"], ["patient"], ["admin_etablissement"], ["laboratoire", "pharmacien"]]) {
      expect(exigeDoubleValidation("suspension", { roles })).toBe(false);
    }
  });

  it("l'invitation d'un administrateur l'exige toujours, sans compte cible", () => {
    expect(exigeDoubleValidation("invitation_admin", null)).toBe(true);
  });

  it("estCompteAdministrateur ne reconnait que admin_national", () => {
    expect(estCompteAdministrateur(["admin_national"])).toBe(true);
    expect(estCompteAdministrateur(["admin_etablissement", "medecin"])).toBe(false);
  });
});

describe("verifierActionSurCompte : chaque garde refuse a lui seul", () => {
  it("garde 1, jamais sur son propre compte, quelle que soit l'action", () => {
    for (const type of ["suspension", "reactivation", "reinitialisation_2fa"] as const) {
      const erreur = verifierActionSurCompte({
        type,
        acteurId: "cible-1",
        cible: cible({ statut: type === "reactivation" ? "suspendu" : "actif" }),
        nombreAdminsActifsAutres: 5,
      });
      expect(erreur).toContain("propre compte");
    }
  });

  it("garde 2, on ne suspend pas le dernier administrateur national actif", () => {
    const dernier = cible({ roles: ["admin_national"] });

    expect(verifierActionSurCompte({ type: "suspension", acteurId: "autre", cible: dernier, nombreAdminsActifsAutres: 0 })).toContain("dernier administrateur");
    expect(verifierActionSurCompte({ type: "suspension", acteurId: "autre", cible: dernier, nombreAdminsActifsAutres: 1 })).toBeNull();
  });

  it("garde 2 ne concerne pas un compte qui n'est pas administrateur", () => {
    expect(verifierActionSurCompte({ type: "suspension", acteurId: "autre", cible: cible(), nombreAdminsActifsAutres: 0 })).toBeNull();
  });

  it("garde 3, seule la suspension d'un compte actif est possible", () => {
    for (const statut of ["suspendu", "termine", "sans_compte", "ferme"]) {
      expect(verifierActionSurCompte({ type: "suspension", acteurId: "autre", cible: cible({ statut }), nombreAdminsActifsAutres: 3 })).toContain("actif");
    }
  });

  it("garde 4, seule la reactivation d'un compte suspendu est possible", () => {
    for (const statut of ["actif", "termine", "sans_compte", "ferme"]) {
      expect(verifierActionSurCompte({ type: "reactivation", acteurId: "autre", cible: cible({ statut }), nombreAdminsActifsAutres: 3 })).toContain("suspendu");
    }
    expect(verifierActionSurCompte({ type: "reactivation", acteurId: "autre", cible: cible({ statut: "suspendu" }), nombreAdminsActifsAutres: 3 })).toBeNull();
  });

  it("garde 5, un professionnel refuse a la validation ne se reactive pas ici", () => {
    const erreur = verifierActionSurCompte({
      type: "reactivation",
      acteurId: "autre",
      cible: cible({ statut: "suspendu", statutValidationProfessionnel: "rejete" }),
      nombreAdminsActifsAutres: 3,
    });
    expect(erreur).toContain("validation");
  });

  it("garde 6, pas de reinitialisation d'un second facteur qui n'existe pas", () => {
    expect(verifierActionSurCompte({ type: "reinitialisation_2fa", acteurId: "autre", cible: cible({ mfaActif: false }), nombreAdminsActifsAutres: 3 })).toContain("second facteur");
    expect(verifierActionSurCompte({ type: "reinitialisation_2fa", acteurId: "autre", cible: cible({ mfaActif: true }), nombreAdminsActifsAutres: 3 })).toBeNull();
  });

  it("une action legitime passe tous les gardes", () => {
    expect(verifierActionSurCompte({ type: "suspension", acteurId: "autre", cible: cible(), nombreAdminsActifsAutres: 2 })).toBeNull();
  });
});

describe("verifierDecisionSurDemande (quatre yeux)", () => {
  const maintenant = new Date("2026-09-27T12:00:00Z");
  const valide = {
    statut: "en_attente",
    demandeParId: "admin-1",
    decideurId: "admin-2",
    expireLe: new Date("2026-09-28T12:00:00Z"),
    maintenant,
  };

  it("un second administrateur peut decider une demande en attente non expiree", () => {
    expect(verifierDecisionSurDemande(valide)).toBeNull();
  });

  it("le demandeur ne peut pas decider sa propre demande", () => {
    expect(verifierDecisionSurDemande({ ...valide, decideurId: "admin-1" })).toContain("autre administrateur");
  });

  it("une demande deja traitee ne se decide pas une seconde fois", () => {
    for (const statut of ["approuvee", "refusee", "expiree"]) {
      expect(verifierDecisionSurDemande({ ...valide, statut })).toContain("déjà");
    }
  });

  it("une demande expiree ne se decide plus", () => {
    expect(verifierDecisionSurDemande({ ...valide, expireLe: new Date("2026-09-27T11:59:59Z") })).toContain("expiré");
  });

  it("a l'instant exact de l'expiration, la demande est encore valable", () => {
    expect(verifierDecisionSurDemande({ ...valide, expireLe: maintenant })).toBeNull();
  });
});

describe("compte invite (F-AUTH-05)", () => {
  it("un compte invite ne peut ni etre suspendu ni etre reactive", () => {
    const invite = cible({ statut: "invite" });

    expect(verifierActionSurCompte({ type: "suspension", acteurId: "admin-1", cible: invite, nombreAdminsActifsAutres: 3 })).toContain("renvoyez l'invitation");
    expect(verifierActionSurCompte({ type: "reactivation", acteurId: "admin-1", cible: invite, nombreAdminsActifsAutres: 3 })).toContain("renvoyez l'invitation");
  });

  it("le renvoi d'invitation : jamais son propre compte, seulement un compte invite", () => {
    expect(verifierRenvoiInvitation({ acteurId: "admin-1", cible: { id: "cible-1", statut: "invite" } })).toBeNull();
    expect(verifierRenvoiInvitation({ acteurId: "admin-1", cible: { id: "admin-1", statut: "invite" } })).toContain("propre compte");
    for (const statut of ["actif", "suspendu", "termine", "fusionne"]) {
      expect(verifierRenvoiInvitation({ acteurId: "admin-1", cible: { id: "cible-1", statut } })).toContain("déjà activé");
    }
  });
});
