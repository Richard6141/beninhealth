import { describe, expect, it } from "vitest";
import {
  DIMENSIONS_PAR_INDICATEUR,
  FILTRES_VIDES,
  auMoinsUnFiltre,
  filtreApplicable,
  lireFiltresDepuisParametres,
  parametresDesFiltres,
} from "./filtres-pilotage";

/** Filtres du centre national de pilotage (F-PIL-02) : lecture d'URL, forme, applicabilite par indicateur. */

describe("lireFiltresDepuisParametres", () => {
  it("aucun parametre : filtres vides", () => {
    expect(lireFiltresDepuisParametres({})).toEqual(FILTRES_VIDES);
  });

  it("lit chaque filtre presente sous sa bonne forme", () => {
    expect(lireFiltresDepuisParametres({ territoire: "d-1", type: "hopital", sexe: "F", age: "1-4 ans" })).toEqual({
      departementId: "d-1",
      typeEtablissement: "hopital",
      sexe: "F",
      trancheAge: "1-4 ans",
    });
  });

  it("un sexe autre que M ou F est ecarte (entree client jamais fiable telle quelle)", () => {
    expect(lireFiltresDepuisParametres({ sexe: "autre" }).sexe).toBeNull();
    expect(lireFiltresDepuisParametres({ sexe: "<script>" }).sexe).toBeNull();
  });

  it("une tranche d'age hors du referentiel standard est ecartee", () => {
    expect(lireFiltresDepuisParametres({ age: "0-200 ans" }).trancheAge).toBeNull();
  });

  it("un territoire ou un type de forme invalide est ecarte (verification de forme seulement, l'existence est revue par le serveur)", () => {
    expect(lireFiltresDepuisParametres({ territoire: "a".repeat(200) }).departementId).toBeNull();
    expect(lireFiltresDepuisParametres({ type: "" }).typeEtablissement).toBeNull();
  });

  it("ne lit que le premier element d'un parametre repete", () => {
    expect(lireFiltresDepuisParametres({ sexe: ["F", "M"] }).sexe).toBe("F");
  });
});

describe("parametresDesFiltres", () => {
  it("un filtre vide ne produit aucun parametre", () => {
    expect(parametresDesFiltres(FILTRES_VIDES)).toEqual([]);
  });

  it("chaque filtre actif produit son parametre", () => {
    expect(parametresDesFiltres({ departementId: "d-1", typeEtablissement: "hopital", sexe: "F", trancheAge: "1-4 ans" })).toEqual([
      ["territoire", "d-1"],
      ["type", "hopital"],
      ["sexe", "F"],
      ["age", "1-4 ans"],
    ]);
  });
});

describe("auMoinsUnFiltre", () => {
  it("faux quand tout est vide, vrai des qu'un seul filtre est actif", () => {
    expect(auMoinsUnFiltre(FILTRES_VIDES)).toBe(false);
    expect(auMoinsUnFiltre({ ...FILTRES_VIDES, sexe: "F" })).toBe(true);
  });
});

describe("filtreApplicable", () => {
  it("sans filtre actif : toujours applicable, meme a un indicateur inconnu", () => {
    expect(filtreApplicable("IND-99", FILTRES_VIDES)).toBe(true);
  });

  it("IND-01 porte sexe et tranche d'age : les deux filtres s'y appliquent", () => {
    expect(filtreApplicable("IND-01", { ...FILTRES_VIDES, sexe: "F", trancheAge: "1-4 ans" })).toBe(true);
  });

  it("IND-04 (paludisme) n'a ni sexe ni tranche d'age dans l'agregat : les deux filtres le rendent inapplicable", () => {
    expect(filtreApplicable("IND-04", { ...FILTRES_VIDES, sexe: "F" })).toBe(false);
    expect(filtreApplicable("IND-04", { ...FILTRES_VIDES, trancheAge: "1-4 ans" })).toBe(false);
  });

  it("IND-10 (vaccinations) a une tranche d'age mais pas de sexe", () => {
    expect(filtreApplicable("IND-10", { ...FILTRES_VIDES, trancheAge: "1-4 ans" })).toBe(true);
    expect(filtreApplicable("IND-10", { ...FILTRES_VIDES, sexe: "F" })).toBe(false);
  });

  it("un indicateur inconnu n'accepte aucun filtre de sexe ni d'age", () => {
    expect(filtreApplicable("IND-99", { ...FILTRES_VIDES, sexe: "F" })).toBe(false);
  });

  it("chaque indicateur du catalogue declare explicitement ses deux dimensions (pas d'oubli silencieux)", () => {
    for (const dimensions of Object.values(DIMENSIONS_PAR_INDICATEUR)) {
      expect(typeof dimensions.sexe).toBe("boolean");
      expect(typeof dimensions.trancheAge).toBe("boolean");
    }
  });
});
