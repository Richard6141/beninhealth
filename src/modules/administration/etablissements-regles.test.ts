import { describe, expect, it } from "vitest";
import {
  analyserServices,
  normaliserNomTerritoire,
  pointDansTerritoire,
  verifierChangementType,
  verifierCoordonnees,
  verifierPointDansDepartement,
  type GeometrieTerritoire,
} from "@/modules/administration/etablissements-regles";

const CARRE: GeometrieTerritoire = {
  nom: "Ouémé",
  type: "Polygon",
  coordonnees: [
    [[2, 6], [3, 6], [3, 7], [2, 7], [2, 6]],
    // Trou : le carre de 0,5 de cote au centre n'est pas dans le territoire.
    [[2.25, 6.25], [2.75, 6.25], [2.75, 6.75], [2.25, 6.75], [2.25, 6.25]],
  ],
};

const DEUX_ILES: GeometrieTerritoire = {
  nom: "Iles",
  type: "MultiPolygon",
  coordonnees: [
    [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
  ],
};

describe("verifierCoordonnees (F-ADM-02)", () => {
  it("accepte un point du Benin", () => {
    expect(verifierCoordonnees(6.3654, 2.4183)).toBeNull();
    expect(verifierCoordonnees(11.3, 2.2)).toBeNull();
  });

  it("refuse un point hors du pays, y compris une latitude et une longitude inversees", () => {
    expect(verifierCoordonnees(48.85, 2.35)).toContain("hors du Bénin");
    expect(verifierCoordonnees(2.4183, 6.3654)).toContain("hors du Bénin");
    expect(verifierCoordonnees(0, 0)).toContain("hors du Bénin");
  });

  it("refuse une valeur qui n'est pas un nombre", () => {
    expect(verifierCoordonnees(Number.NaN, 2)).toContain("nombres");
    expect(verifierCoordonnees(6.4, Number.POSITIVE_INFINITY)).toContain("nombres");
  });
});

describe("pointDansTerritoire", () => {
  it("dedans, dehors et dans un trou", () => {
    expect(pointDansTerritoire(2.1, 6.1, CARRE)).toBe(true);
    expect(pointDansTerritoire(3.5, 6.5, CARRE)).toBe(false);
    expect(pointDansTerritoire(2.5, 6.5, CARRE)).toBe(false);
  });

  it("un multipolygone : n'importe quelle partie convient, l'espace entre les parties non", () => {
    expect(pointDansTerritoire(0.5, 0.5, DEUX_ILES)).toBe(true);
    expect(pointDansTerritoire(5.5, 5.5, DEUX_ILES)).toBe(true);
    expect(pointDansTerritoire(3, 3, DEUX_ILES)).toBe(false);
  });
});

describe("verifierPointDansDepartement", () => {
  it("rapproche 'Oueme' de 'Ouémé' et valide un point dedans", () => {
    expect(normaliserNomTerritoire("Ouémé")).toBe("oueme");
    expect(verifierPointDansDepartement(6.1, 2.1, "Oueme", [CARRE])).toBeNull();
  });

  it("refuse un point hors du departement, avec son nom dans le message", () => {
    expect(verifierPointDansDepartement(6.5, 3.5, "Oueme", [CARRE])).toContain("département Oueme");
  });

  it("sans contour connu pour le departement, aucun refus n'est invente", () => {
    expect(verifierPointDansDepartement(6.5, 3.5, "Atlantide", [CARRE])).toBeNull();
    expect(verifierPointDansDepartement(6.5, 3.5, "Oueme", [])).toBeNull();
  });
});

describe("analyserServices", () => {
  it("une ligne par service, sans lignes vides ni doublons (casse ignoree)", () => {
    expect(analyserServices("Urgences\r\n\n  Maternité \nurgences\nLaboratoire")).toEqual({ services: ["Urgences", "Maternité", "Laboratoire"] });
  });

  it("refuse un service trop long ou trop de services", () => {
    expect(analyserServices("x".repeat(81))).toEqual({ erreur: expect.stringContaining("80") });
    expect(analyserServices(Array.from({ length: 41 }, (_, index) => `Service ${index}`).join("\n"))).toEqual({ erreur: expect.stringContaining("40") });
  });

  it("une zone vide donne une liste vide", () => {
    expect(analyserServices("  \n ")).toEqual({ services: [] });
  });
});

describe("verifierChangementType", () => {
  it("le meme type ou un type sans donnee rattachee se change librement", () => {
    expect(verifierChangementType("hopital", "hopital", { examensRecus: 9, delivrancesFaites: 9 })).toBeNull();
    expect(verifierChangementType("centre_sante", "hopital", { examensRecus: 0, delivrancesFaites: 0 })).toBeNull();
    expect(verifierChangementType("laboratoire", "hopital", { examensRecus: 0, delivrancesFaites: 4 })).toBeNull();
  });

  it("un laboratoire qui a recu des examens et une pharmacie qui a delivre ne changent plus de type", () => {
    expect(verifierChangementType("laboratoire", "hopital", { examensRecus: 1, delivrancesFaites: 0 })).toContain("examens");
    expect(verifierChangementType("pharmacie", "centre_sante", { examensRecus: 0, delivrancesFaites: 1 })).toContain("ordonnances");
  });
});
