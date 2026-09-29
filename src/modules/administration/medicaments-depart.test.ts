import { describe, expect, it } from "vitest";
import { allergieCorrespondante } from "@/modules/prescription/referentiel-allergies";
import { rechercherMedicaments } from "@/modules/prescription/recherche-medicaments";
import { FORMAT_CODE_ATC, FORMES_CONNUES } from "./referentiel-medicaments-catalogue";
import { MEDICAMENTS_DEPART, memePresentation } from "./medicaments-depart";
import { DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC } from "./correspondance-allergie-atc-catalogue";

const compact = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");

describe("catalogue de depart des medicaments (F-PRE-03)", () => {
  it("compte pres de 90 presentations, dont une majorite d'essentiels", () => {
    expect(MEDICAMENTS_DEPART.length).toBeGreaterThanOrEqual(85);
    expect(MEDICAMENTS_DEPART.filter((m) => m.essentiel).length).toBeGreaterThan(MEDICAMENTS_DEPART.length / 2);
  });

  it("n'utilise que des formes connues de l'ecran d'administration", () => {
    for (const m of MEDICAMENTS_DEPART) {
      expect(FORMES_CONNUES as readonly string[], `${m.nom} ${m.dosage}`).toContain(m.forme);
    }
  });

  it("donne a chaque presentation un code ATC valide, une classe et un dosage", () => {
    for (const m of MEDICAMENTS_DEPART) {
      expect(m.codeAtc, `${m.nom} ${m.dosage}`).toMatch(FORMAT_CODE_ATC);
      expect(m.classeTherapeutique.trim(), `${m.nom} ${m.dosage}`).not.toBe("");
      expect(m.dosage.trim(), m.nom).not.toBe("");
      expect(m.principeActif.trim(), m.nom).not.toBe("");
    }
  });

  it("n'a aucune presentation en double (DCI, dosage, forme)", () => {
    const cles = MEDICAMENTS_DEPART.map((m) => `${compact(m.principeActif)}|${compact(m.dosage)}|${compact(m.forme)}`);

    expect(new Set(cles).size).toBe(cles.length);
  });

  it("n'a que des limites d'age entieres et positives", () => {
    for (const m of MEDICAMENTS_DEPART) {
      if (m.ageMinimumMois !== null) {
        expect(Number.isInteger(m.ageMinimumMois), m.nom).toBe(true);
        expect(m.ageMinimumMois, m.nom).toBeGreaterThan(0);
      }
    }
  });

  it("porte des codes ATC couverts par la table de correspondance allergie (penicillines, sulfamides, ains, iode...)", () => {
    // RG-PRE-10 : la correspondance allergie -> classe se fait desormais par
    // prefixe de code ATC (voir referentiel-allergies.ts et
    // correspondance-allergie-atc-catalogue.ts), plus par le champ texte
    // libre classeTherapeutique. Ce test verifie l'integration entre les
    // vrais codeAtc du catalogue de depart et les vrais prefixes du
    // catalogue de correspondance de depart, sans mock ni base.
    const parClasse = (classe: string) => MEDICAMENTS_DEPART.filter((m) => m.classeTherapeutique === classe);

    for (const m of parClasse("penicillines"))
      expect(allergieCorrespondante(m, ["Penicilline"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("Penicilline");
    for (const m of parClasse("sulfamides"))
      expect(allergieCorrespondante(m, ["Sulfamide"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("Sulfamide");
    for (const m of parClasse("ains"))
      expect(allergieCorrespondante(m, ["AINS"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("AINS");
    for (const m of parClasse("cephalosporines"))
      expect(allergieCorrespondante(m, ["Cephalosporine"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("Cephalosporine");
    for (const m of parClasse("opioides"))
      expect(allergieCorrespondante(m, ["Morphine"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("Morphine");
    for (const m of parClasse("produits iodes"))
      expect(allergieCorrespondante(m, ["Iode"], DEFAUTS_CORRESPONDANCE_ALLERGIE_ATC), m.nom).toBe("Iode");
    expect(parClasse("penicillines").length).toBeGreaterThan(5);
    expect(parClasse("ains").length).toBeGreaterThan(3);
  });

  it("ne declenche pas d'alerte penicilline pour un antalgique", () => {
    const paracetamol = MEDICAMENTS_DEPART.find((m) => m.principeActif === "Paracétamol");

    expect(paracetamol).toBeDefined();
    expect(allergieCorrespondante(paracetamol!, ["Penicilline"])).toBeNull();
  });

  it("se retrouve par la recherche : DCI sans accent, nom commercial, essentiels d'abord", () => {
    const catalogue = MEDICAMENTS_DEPART.map((m) => ({ ...m }));

    const paracetamol = rechercherMedicaments(catalogue, "paracetamol");
    expect(paracetamol.length).toBe(3);
    expect(paracetamol.every((m) => m.essentiel)).toBe(true);

    expect(rechercherMedicaments(catalogue, "clamoxyl").every((m) => m.principeActif === "Amoxicilline")).toBe(true);
    expect(rechercherMedicaments(catalogue, "coartem").map((m) => m.principeActif)).toEqual(["Artéméther / Luméfantrine"]);

    expect(rechercherMedicaments(catalogue, "ibuprofene").length).toBe(3);
  });
});

describe("memePresentation : rapprochement avec les medicaments deja en base", () => {
  const coartemCatalogue = MEDICAMENTS_DEPART.find((m) => m.nomsCommerciaux.includes("Coartem"))!;
  const doliprane500 = MEDICAMENTS_DEPART.find((m) => m.principeActif === "Paracétamol" && m.dosage === "500 mg")!;
  const amoxicilline500 = MEDICAMENTS_DEPART.find((m) => m.principeActif === "Amoxicilline" && m.dosage === "500 mg")!;

  it("reconnait les trois medicaments de la demonstration (DCI ecrite autrement, marque dans le nom)", () => {
    const coartemDemo = { nom: "Coartem", principeActif: "Arthemeter / Lumefantrine", dosage: "20 mg / 120 mg", forme: "comprime" };
    const dolipraneDemo = { nom: "Doliprane", principeActif: "Paracetamol", dosage: "500 mg", forme: "comprime" };
    const amodexDemo = { nom: "Amodex", principeActif: "Amoxicilline", dosage: "500 mg", forme: "gelule" };

    expect(memePresentation(coartemDemo, coartemCatalogue)).toBe(true);
    expect(memePresentation(dolipraneDemo, doliprane500)).toBe(true);
    expect(memePresentation(amodexDemo, amoxicilline500)).toBe(true);
  });

  it("ne confond pas deux dosages ni deux formes d'une meme DCI", () => {
    const existant = { nom: "Amodex", principeActif: "Amoxicilline", dosage: "500 mg", forme: "gelule" };
    const amoxicilline1g = MEDICAMENTS_DEPART.find((m) => m.principeActif === "Amoxicilline" && m.dosage === "1 g")!;
    const sirop = MEDICAMENTS_DEPART.find((m) => m.principeActif === "Amoxicilline" && m.forme === "suspension")!;

    expect(memePresentation(existant, amoxicilline1g)).toBe(false);
    expect(memePresentation(existant, sirop)).toBe(false);
  });

  it("ignore casse, accents et espaces du dosage", () => {
    const existant = { nom: "X", principeActif: "PARACÉTAMOL", dosage: "500MG", forme: "Comprime" };

    expect(memePresentation(existant, doliprane500)).toBe(true);
  });

  it("ne rapproche pas des medicaments differents de meme dosage et forme", () => {
    const existant = { nom: "Autre", principeActif: "Ibuprofene", dosage: "500 mg", forme: "comprime" };

    expect(memePresentation(existant, doliprane500)).toBe(false);
  });
});
