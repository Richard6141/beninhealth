import { describe, expect, it } from "vitest";
import {
  GROUPES_SENSIBLES,
  LIBELLES_GROUPES_CIM10,
  chapitreCim10PourCode,
  groupeCim10PourCode,
  groupeEstSensible,
  type GroupeCim10,
} from "./cim10-groupes";
import { DIAGNOSTICS_CIM10_PAR_DEFAUT } from "./cim10-catalogue";

function attendre(codes: string[], groupe: GroupeCim10): void {
  for (const code of codes) {
    expect(groupeCim10PourCode(code), code).toBe(groupe);
  }
}

describe("groupeCim10PourCode : tableau de la section 18.6 du pack", () => {
  it("VIH : B20 a B24 et Z21", () => {
    attendre(["B20", "B22.7", "B24", "Z21"], "vih");
    attendre(["B25", "Z22"], "autre");
  });

  it("IST : A50 a A64", () => {
    attendre(["A50", "A53.9", "A54", "A60", "A64"], "ist");
    attendre(["A49", "A65"], "autre");
  });

  it("interruption de grossesse : O04 a O07, et le reste de O reste des complications de la grossesse", () => {
    attendre(["O04", "O05", "O06", "O07"], "interruption_grossesse");
    attendre(["O00", "O03", "O08", "O14", "O80", "O99"], "complication_grossesse");
  });

  it("violences et maltraitances : T74, Y05 a Y07, X85 a Y09", () => {
    attendre(["T74", "T74.1", "Y05", "Y07", "X85", "X99", "Y00", "Y08", "Y09"], "violence");
    attendre(["X84", "Y10", "T75"], "autre");
  });

  it("addictions F10 a F19, troubles mentaux F00 a F99 sauf F10 a F19", () => {
    attendre(["F10", "F17", "F19.2"], "addiction");
    attendre(["F00", "F09", "F20", "F32", "F41", "F99"], "trouble_mental");
  });

  it("fievre typhoide A01.0 avant les maladies diarrheiques A00 a A09", () => {
    attendre(["A01.0"], "typhoide");
    attendre(["A00", "A00.9", "A01.1", "A03.9", "A06.0", "A09"], "diarrhee");
    attendre(["A10"], "autre");
  });

  it("tuberculose A15 a A19, meningite A39 et G00 a G03, fievres hemorragiques A90 a A99", () => {
    attendre(["A15", "A16", "A19"], "tuberculose");
    attendre(["A20"], "autre");
    attendre(["A39", "G00", "G01", "G03"], "meningite");
    attendre(["G04"], "autre");
    attendre(["A90", "A95", "A96.2", "A98.4", "A99"], "fievre_hemorragique");
    attendre(["A89"], "autre");
  });

  it("paludisme B50 a B54, rougeole B05", () => {
    attendre(["B50", "B50.9", "B51", "B54"], "paludisme");
    attendre(["B55"], "autre");
    attendre(["B05", "B05.9"], "rougeole");
    attendre(["B06", "B04"], "autre");
  });

  it("IRA J00 a J22, HTA I10 a I15, diabete E10 a E14, drepanocytose D57, malnutrition E40 a E46, infections cutanees L00 a L08", () => {
    attendre(["J00", "J06", "J18", "J22"], "ira");
    attendre(["J23", "J45"], "autre");
    attendre(["I10", "I11", "I15"], "hta");
    attendre(["I16", "I50"], "autre");
    attendre(["E10", "E11", "E14"], "diabete");
    attendre(["E15", "E66"], "autre");
    attendre(["D57", "D57.1"], "drepanocytose");
    attendre(["D58", "D50"], "autre");
    attendre(["E40", "E43", "E46"], "malnutrition");
    attendre(["E47"], "autre");
    attendre(["L00", "L02", "L08"], "infection_cutanee");
    attendre(["L09", "L20"], "autre");
  });

  it("accepte les minuscules et les espaces, refuse un code mal forme", () => {
    expect(groupeCim10PourCode(" b50.9 ")).toBe("paludisme");
    for (const code of ["", "B5", "50B", "B500", "B50.", "B50,9", "hello"]) {
      expect(groupeCim10PourCode(code), code).toBe("autre");
    }
  });
});

describe("caractere sensible par defaut", () => {
  it("les six groupes sensibles du pack, et seulement eux", () => {
    expect([...GROUPES_SENSIBLES].sort()).toEqual(
      ["addiction", "interruption_grossesse", "ist", "trouble_mental", "vih", "violence"].sort()
    );
  });

  it("un code est sensible si et seulement si son groupe l'est", () => {
    expect(groupeEstSensible(groupeCim10PourCode("B20"))).toBe(true);
    expect(groupeEstSensible(groupeCim10PourCode("F32"))).toBe(true);
    expect(groupeEstSensible(groupeCim10PourCode("O04"))).toBe(true);
    expect(groupeEstSensible(groupeCim10PourCode("B50"))).toBe(false);
    expect(groupeEstSensible(groupeCim10PourCode("O14"))).toBe(false);
    expect(groupeEstSensible(groupeCim10PourCode("R50.9"))).toBe(false);
  });
});

describe("chapitreCim10PourCode", () => {
  it("place les codes dans leur chapitre", () => {
    const cas: [string, string][] = [
      ["A00", "I."],
      ["B99", "I."],
      ["C34", "II."],
      ["D57", "III."],
      ["E11", "IV."],
      ["F32", "V."],
      ["G40", "VI."],
      ["H10", "VII."],
      ["H66", "VIII."],
      ["I10", "IX."],
      ["J45", "X."],
      ["K35", "XI."],
      ["L02", "XII."],
      ["M54", "XIII."],
      ["N39.0", "XIV."],
      ["O80", "XV."],
      ["P22", "XVI."],
      ["Q21", "XVII."],
      ["R50.9", "XVIII."],
      ["S52", "XIX."],
      ["T74", "XIX."],
      ["V01", "XX."],
      ["Y05", "XX."],
      ["Z21", "XXI."],
      ["U07", "XXII."],
    ];

    for (const [code, prefixe] of cas) {
      expect(chapitreCim10PourCode(code).startsWith(prefixe), code).toBe(true);
    }
  });

  it("renvoie une chaine vide pour un code mal forme", () => {
    expect(chapitreCim10PourCode("nimporte")).toBe("");
  });
});

describe("sous-liste CIM-10 de depart", () => {
  it("ne contient que des codes bien formes, sans doublon, avec un libelle", () => {
    const codes = DIAGNOSTICS_CIM10_PAR_DEFAUT.map((diagnostic) => diagnostic.code);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.every((code) => /^[A-Z]\d{2}(\.[0-9A-Z]{1,4})?$/.test(code))).toBe(true);
    expect(DIAGNOSTICS_CIM10_PAR_DEFAUT.every((diagnostic) => diagnostic.libelle.trim().length > 0)).toBe(true);
    expect(codes.length).toBeGreaterThanOrEqual(100);
  });

  it("couvre chacun des vingt groupes de la section 18.6", () => {
    const groupesCouverts = new Set(DIAGNOSTICS_CIM10_PAR_DEFAUT.map((diagnostic) => groupeCim10PourCode(diagnostic.code)));

    for (const groupe of Object.keys(LIBELLES_GROUPES_CIM10) as GroupeCim10[]) {
      if (groupe === "autre") continue;
      expect(groupesCouverts.has(groupe), groupe).toBe(true);
    }
  });

  it("classe les codes de depart selon les regles du pack", () => {
    const groupe = (code: string) => groupeCim10PourCode(code);

    expect(groupe("A01.0")).toBe("typhoide");
    expect(groupe("A09")).toBe("diarrhee");
    expect(groupe("B50")).toBe("paludisme");
    expect(groupe("B20")).toBe("vih");
    expect(groupe("Z21")).toBe("vih");
    expect(groupe("O04")).toBe("interruption_grossesse");
    expect(groupe("O14")).toBe("complication_grossesse");
    expect(groupe("F10")).toBe("addiction");
    expect(groupe("F32")).toBe("trouble_mental");
    expect(groupe("T74")).toBe("violence");
  });
});
