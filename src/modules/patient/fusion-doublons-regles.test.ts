import { describe, expect, it } from "vitest";
import {
  ecartsIdentite,
  exigeSecondeApprobation,
  paireCanonique,
  verifierApprobationFusion,
  verifierDefusion,
  verifierDemandeFusion,
} from "@/modules/patient/fusion-doublons-regles";

describe("ecartsIdentite (RG-ADM-41)", () => {
  it("aucun ecart quand sexe et date de naissance sont identiques", () => {
    const identite = { sexe: "F", dateNaissance: new Date("2000-01-01") };
    expect(ecartsIdentite(identite, { sexe: "F", dateNaissance: new Date("2000-01-01") })).toEqual([]);
  });

  it("detecte un ecart de sexe", () => {
    expect(ecartsIdentite({ sexe: "F", dateNaissance: new Date("2000-01-01") }, { sexe: "M", dateNaissance: new Date("2000-01-01") })).toEqual(["sexe"]);
  });

  it("detecte un ecart de date de naissance", () => {
    expect(ecartsIdentite({ sexe: "F", dateNaissance: new Date("2000-01-01") }, { sexe: "F", dateNaissance: new Date("2000-01-02") })).toEqual(["date_naissance"]);
  });

  it("detecte les deux ecarts a la fois", () => {
    expect(ecartsIdentite({ sexe: "F", dateNaissance: new Date("2000-01-01") }, { sexe: "M", dateNaissance: new Date("1999-05-05") })).toEqual(["sexe", "date_naissance"]);
  });
});

describe("exigeSecondeApprobation", () => {
  it("vrai si au moins un ecart, faux sinon", () => {
    expect(exigeSecondeApprobation([])).toBe(false);
    expect(exigeSecondeApprobation(["sexe"])).toBe(true);
    expect(exigeSecondeApprobation(["date_naissance"])).toBe(true);
  });
});

describe("paireCanonique", () => {
  it("ordonne toujours le plus petit id en premier, quel que soit l'ordre d'entree", () => {
    expect(paireCanonique("a", "b")).toEqual(["a", "b"]);
    expect(paireCanonique("b", "a")).toEqual(["a", "b"]);
  });

  it("est stable (idempotente) sur une meme paire", () => {
    const paire1 = paireCanonique("xyz", "abc");
    const paire2 = paireCanonique("abc", "xyz");
    expect(paire1).toEqual(paire2);
  });
});

describe("verifierDemandeFusion", () => {
  const base = { patientConserveId: "p1", patientDoublonId: "p2", statutCompteDoublon: "actif", doublonEstDejaSecondaireActif: false };

  it("accepte une demande normale", () => {
    expect(verifierDemandeFusion(base)).toBeNull();
  });

  it("refuse si les deux ids sont identiques", () => {
    expect(verifierDemandeFusion({ ...base, patientDoublonId: "p1" })).toContain("différents");
  });

  it("refuse un dossier deja fusionne ailleurs", () => {
    expect(verifierDemandeFusion({ ...base, statutCompteDoublon: "fusionne" })).toContain("déjà été fusionné");
  });

  it("refuse un dossier deja absorbe par une fusion active ou en attente", () => {
    expect(verifierDemandeFusion({ ...base, doublonEstDejaSecondaireActif: true })).toContain("déjà été absorbé");
  });

  it("n'interdit pas qu'un dossier ayant deja absorbe un autre soit lui-meme choisi comme principal ou comme secondaire (chaines de fusion)", () => {
    // Le principal (p1) peut deja etre le survivant d'une fusion precedente : rien dans les parametres de la fonction ne l'en empeche.
    expect(verifierDemandeFusion(base)).toBeNull();
  });
});

describe("verifierApprobationFusion (RG-ADM-41, quatre yeux)", () => {
  it("accepte un autre administrateur sur une demande en attente", () => {
    expect(verifierApprobationFusion({ statut: "en_attente", demandeParId: "admin-1", approbateurId: "admin-2" })).toBeNull();
  });

  it("refuse le demandeur lui-meme", () => {
    expect(verifierApprobationFusion({ statut: "en_attente", demandeParId: "admin-1", approbateurId: "admin-1" })).toContain("autre administrateur");
  });

  it("refuse une demande deja traitee", () => {
    for (const statut of ["active", "refusee", "annulee"]) {
      expect(verifierApprobationFusion({ statut, demandeParId: "admin-1", approbateurId: "admin-2" })).toContain("déjà été traitée");
    }
  });
});

describe("verifierDefusion (RG-ADM-40, fenetre de 30 jours)", () => {
  const maintenant = new Date("2026-09-27T12:00:00Z");

  it("accepte une fusion active dans la fenetre", () => {
    expect(verifierDefusion({ statut: "active", defusionLimiteLe: new Date("2026-10-01T00:00:00Z"), maintenant })).toBeNull();
  });

  it("accepte a l'instant exact de la limite", () => {
    expect(verifierDefusion({ statut: "active", defusionLimiteLe: maintenant, maintenant })).toBeNull();
  });

  it("refuse une fusion non active", () => {
    for (const statut of ["en_attente", "refusee", "annulee"]) {
      expect(verifierDefusion({ statut, defusionLimiteLe: new Date("2026-10-01T00:00:00Z"), maintenant })).toContain("n'est plus active");
    }
  });

  it("refuse au-dela de la fenetre de 30 jours", () => {
    expect(verifierDefusion({ statut: "active", defusionLimiteLe: new Date("2026-09-01T00:00:00Z"), maintenant })).toContain("délai");
  });
});
