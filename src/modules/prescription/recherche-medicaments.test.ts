import { describe, expect, it } from "vitest";
import {
  MAX_RESULTATS_RECHERCHE_MEDICAMENT,
  MIN_CARACTERES_RECHERCHE_MEDICAMENT,
  normaliserPourRecherche,
  rechercherMedicaments,
  termeMedicamentSuffisant,
  type MedicamentRecherchable,
} from "./recherche-medicaments";

function medicament(surcharge: Partial<MedicamentRecherchable> = {}): MedicamentRecherchable {
  return {
    nom: "Amoxicilline",
    principeActif: "Amoxicilline",
    dosage: "500 mg",
    forme: "gelule",
    nomsCommerciaux: [],
    essentiel: false,
    ...surcharge,
  };
}

const CATALOGUE: MedicamentRecherchable[] = [
  medicament({ nom: "Amodex", principeActif: "Amoxicilline", nomsCommerciaux: ["Clamoxyl", "Amoxil"], essentiel: true }),
  medicament({ nom: "Amoxicilline sirop", principeActif: "Amoxicilline", dosage: "250 mg/5 ml", forme: "suspension", essentiel: true }),
  medicament({ nom: "Doliprane", principeActif: "Paracétamol", dosage: "500 mg", forme: "comprime", nomsCommerciaux: ["Efferalgan", "Dafalgan"], essentiel: true }),
  medicament({ nom: "Advil", principeActif: "Ibuprofene", dosage: "200 mg", forme: "comprime", essentiel: false }),
  medicament({ nom: "Amoxicilline Forte", principeActif: "Amoxicilline", dosage: "1 g", forme: "comprime", essentiel: false }),
];

describe("normaliserPourRecherche", () => {
  it("retire les accents, passe en minuscules et compacte les espaces", () => {
    expect(normaliserPourRecherche("  Paracétamol   ÉNORME ")).toBe("paracetamol enorme");
  });
});

describe("recherche de medicaments (F-PRE-03)", () => {
  it("ne renvoie rien sous 3 caracteres, meme pour un terme qui correspond", () => {
    expect(MIN_CARACTERES_RECHERCHE_MEDICAMENT).toBe(3);
    expect(rechercherMedicaments(CATALOGUE, "am")).toEqual([]);
    expect(rechercherMedicaments(CATALOGUE, "  a m ")).toEqual([]);
    expect(rechercherMedicaments(CATALOGUE, "")).toEqual([]);
    expect(termeMedicamentSuffisant("am")).toBe(false);
    expect(termeMedicamentSuffisant(" amo ")).toBe(true);
  });

  it("trouve a partir de 3 caracteres, sur la DCI", () => {
    const noms = rechercherMedicaments(CATALOGUE, "amox").map((m) => m.nom);

    expect(noms).toContain("Amodex");
    expect(noms).toContain("Amoxicilline sirop");
    expect(noms).not.toContain("Doliprane");
  });

  it("ignore les accents et la casse, dans les deux sens", () => {
    expect(rechercherMedicaments(CATALOGUE, "PARACETAMOL").map((m) => m.nom)).toEqual(["Doliprane"]);
    expect(rechercherMedicaments(CATALOGUE, "paracétamol").map((m) => m.nom)).toEqual(["Doliprane"]);
    expect(rechercherMedicaments(CATALOGUE, "ibuprofène").map((m) => m.nom)).toEqual(["Advil"]);
  });

  it("cherche aussi dans les noms commerciaux", () => {
    expect(rechercherMedicaments(CATALOGUE, "clamoxyl").map((m) => m.nom)).toEqual(["Amodex"]);
    expect(rechercherMedicaments(CATALOGUE, "DAFALGAN").map((m) => m.nom)).toEqual(["Doliprane"]);
  });

  it("restreint avec plusieurs mots (chaque mot doit se retrouver)", () => {
    const noms = rechercherMedicaments(CATALOGUE, "amoxicilline 250").map((m) => m.nom);

    expect(noms).toEqual(["Amoxicilline sirop"]);
    expect(rechercherMedicaments(CATALOGUE, "amoxicilline comprime").map((m) => m.nom)).toEqual(["Amoxicilline Forte"]);
    expect(rechercherMedicaments(CATALOGUE, "amoxicilline aspirine")).toEqual([]);
  });

  it("classe les essentiels d'abord, puis l'ordre alphabetique", () => {
    const noms = rechercherMedicaments(CATALOGUE, "amox").map((m) => m.nom);

    expect(noms).toEqual(["Amodex", "Amoxicilline sirop", "Amoxicilline Forte"]);
  });

  it("classe par ordre alphabetique de DCI a egalite d'essentiel", () => {
    const catalogue = [
      medicament({ nom: "Zeta", principeActif: "Zolpidem" }),
      medicament({ nom: "Alpha", principeActif: "Alprazolam" }),
      medicament({ nom: "Beta", principeActif: "Alprazolam", dosage: "1 mg" }),
    ];

    expect(rechercherMedicaments(catalogue, "l").length).toBe(0);
    expect(rechercherMedicaments(catalogue, "alp").map((m) => m.nom)).toEqual(["Alpha", "Beta"]);
    expect(rechercherMedicaments(catalogue, "zolp").map((m) => m.nom)).toEqual(["Zeta"]);
  });

  it("classe les dosages dans l'ordre numerique (250 avant 1000)", () => {
    const catalogue = [
      medicament({ nom: "Mille", dosage: "1000 mg" }),
      medicament({ nom: "Deux cent cinquante", dosage: "250 mg" }),
    ];

    expect(rechercherMedicaments(catalogue, "amoxicilline").map((m) => m.nom)).toEqual(["Deux cent cinquante", "Mille"]);
  });

  it("limite a 20 resultats par defaut et ne depasse jamais ce plafond", () => {
    const grand = Array.from({ length: 45 }, (_, index) =>
      medicament({ nom: `Amox ${String(index).padStart(2, "0")}`, principeActif: "Amoxicilline" })
    );

    expect(MAX_RESULTATS_RECHERCHE_MEDICAMENT).toBe(20);
    expect(rechercherMedicaments(grand, "amox")).toHaveLength(20);
    expect(rechercherMedicaments(grand, "amox", 5)).toHaveLength(5);
    expect(rechercherMedicaments(grand, "amox", 500)).toHaveLength(20);
    expect(rechercherMedicaments(grand, "amox", 0)).toHaveLength(1);
  });

  it("ne modifie pas le catalogue recu", () => {
    const copie = CATALOGUE.map((m) => m.nom);

    rechercherMedicaments(CATALOGUE, "amox");

    expect(CATALOGUE.map((m) => m.nom)).toEqual(copie);
  });
});

describe("recherche : les mots numeriques ne matchent qu'un mot entier (pas de sous-chaine)", () => {
  it("\"1 g\" ne retrouve pas a tort une presentation \"120 mg/5 ml\"", () => {
    const catalogue = [
      medicament({ nom: "Paracetamol 1g", principeActif: "Paracétamol", dosage: "1 g", forme: "comprime" }),
      medicament({ nom: "Paracetamol sirop", principeActif: "Paracétamol", dosage: "120 mg/5 ml", forme: "suspension" }),
      medicament({ nom: "Paracetamol 500", principeActif: "Paracétamol", dosage: "500 mg", forme: "comprime" }),
    ];

    expect(rechercherMedicaments(catalogue, "paracetamol 1 g").map((m) => m.nom)).toEqual(["Paracetamol 1g"]);
  });

  it("un dosage numerique exact reste trouvable normalement", () => {
    const catalogue = [
      medicament({ nom: "A", dosage: "500 mg" }),
      medicament({ nom: "B", dosage: "250 mg" }),
    ];

    expect(rechercherMedicaments(catalogue, "amoxicilline 500").map((m) => m.nom)).toEqual(["A"]);
  });
});
