import { describe, expect, it } from "vitest";
import {
  composerPosologie,
  frequenceIncomplete,
  prisesParJour,
  quantiteSuggeree,
  type ChampsPosologie,
} from "@/modules/prescription/posologie";

function champs(surcharges: Partial<ChampsPosologie> = {}): ChampsPosologie {
  return {
    dose: 1,
    unite: "comprime",
    voie: "orale",
    frequenceMode: "fois_par_jour",
    frequenceFoisParJour: 3,
    frequenceHeures: null,
    frequenceMaxParJour: null,
    moments: [],
    dureeTraitementJours: 7,
    ...surcharges,
  };
}

describe("frequenceIncomplete (F-PRE-01, 3 modes de frequence)", () => {
  it("complet pour fois_par_jour avec un nombre entre 1 et 6", () => {
    expect(frequenceIncomplete(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: 1 }))).toBe(false);
    expect(frequenceIncomplete(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: 6 }))).toBe(false);
  });

  it("incomplet pour fois_par_jour hors de 1 a 6, ou absent", () => {
    expect(frequenceIncomplete(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: 0 }))).toBe(true);
    expect(frequenceIncomplete(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: 7 }))).toBe(true);
    expect(frequenceIncomplete(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: null }))).toBe(true);
  });

  it("toutes_les_x_heures : complet avec un nombre d'heures positif, incomplet sinon", () => {
    expect(frequenceIncomplete(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: 8 }))).toBe(false);
    expect(frequenceIncomplete(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: 0 }))).toBe(true);
    expect(frequenceIncomplete(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: null }))).toBe(true);
  });

  it("si_besoin : complet avec un maximum par 24h positif, incomplet sinon", () => {
    expect(frequenceIncomplete(champs({ frequenceMode: "si_besoin", frequenceMaxParJour: 4 }))).toBe(false);
    expect(frequenceIncomplete(champs({ frequenceMode: "si_besoin", frequenceMaxParJour: 0 }))).toBe(true);
    expect(frequenceIncomplete(champs({ frequenceMode: "si_besoin", frequenceMaxParJour: null }))).toBe(true);
  });
});

describe("prisesParJour", () => {
  it("fois_par_jour : renvoie directement le nombre", () => {
    expect(prisesParJour(champs({ frequenceMode: "fois_par_jour", frequenceFoisParJour: 3 }))).toBe(3);
  });

  it("toutes_les_x_heures : arrondit au nombre entier de prises qui tient dans 24h", () => {
    expect(prisesParJour(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: 8 }))).toBe(3);
    expect(prisesParJour(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: 24 }))).toBe(1);
    // 24 / 5 = 4.8, jamais une prise partielle.
    expect(prisesParJour(champs({ frequenceMode: "toutes_les_x_heures", frequenceHeures: 5 }))).toBe(4);
  });

  it("si_besoin : aucune frequence fixe, null", () => {
    expect(prisesParJour(champs({ frequenceMode: "si_besoin", frequenceMaxParJour: 4 }))).toBeNull();
  });
});

describe("quantiteSuggeree (RG du pack : dose x prises par jour x jours, arrondie au superieur)", () => {
  it("calcule et arrondit au superieur", () => {
    expect(
      quantiteSuggeree(champs({ dose: 1, frequenceMode: "fois_par_jour", frequenceFoisParJour: 3, dureeTraitementJours: 7 }))
    ).toBe(21);
    expect(
      quantiteSuggeree(champs({ dose: 0.5, frequenceMode: "fois_par_jour", frequenceFoisParJour: 3, dureeTraitementJours: 7 }))
    ).toBe(Math.ceil(0.5 * 3 * 7));
  });

  it("null quand la frequence est si_besoin (aucun rythme fixe)", () => {
    expect(quantiteSuggeree(champs({ frequenceMode: "si_besoin", frequenceMaxParJour: 4 }))).toBeNull();
  });
});

describe("composerPosologie", () => {
  it("compose une phrase lisible, fois_par_jour, sans moments", () => {
    const phrase = composerPosologie(
      champs({ dose: 1, unite: "gelule", voie: "orale", frequenceMode: "fois_par_jour", frequenceFoisParJour: 3, dureeTraitementJours: 7 })
    );
    expect(phrase).toBe("1 gélule 3 fois par jour pendant 7 jours, par voie orale");
  });

  it("pluralise l'unite quand la dose est superieure a 1", () => {
    const phrase = composerPosologie(champs({ dose: 2, unite: "comprime", dureeTraitementJours: 1 }));
    expect(phrase).toContain("2 comprimés");
    expect(phrase).toContain("pendant 1 jour,");
  });

  it("mode toutes_les_x_heures", () => {
    const phrase = composerPosologie(
      champs({ frequenceMode: "toutes_les_x_heures", frequenceFoisParJour: null, frequenceHeures: 8 })
    );
    expect(phrase).toContain("toutes les 8 heures");
  });

  it("mode si_besoin avec le maximum par 24h", () => {
    const phrase = composerPosologie(
      champs({ frequenceMode: "si_besoin", frequenceFoisParJour: null, frequenceMaxParJour: 4 })
    );
    expect(phrase).toContain("si besoin (maximum 4 par 24 h)");
  });

  it("ajoute les moments choisis, dans l'ordre du referentiel quel que soit l'ordre de saisie", () => {
    const phrase = composerPosologie(champs({ moments: ["coucher", "matin"] }));
    expect(phrase).toContain("le matin, au coucher");
  });

  it("aucune mention de moments quand la liste est vide", () => {
    const phrase = composerPosologie(champs({ moments: [] }));
    expect(phrase).not.toContain("matin");
  });

  it("jamais de tiret cadratin ni demi-cadratin dans la phrase composee", () => {
    // Codepoints (8211 = demi-cadratin, 8212 = cadratin) plutot que le
    // caractere ou l'echappement litteral, tous deux bannis dans ce depot
    // meme a l'interieur du test qui les detecte.
    const tiretsInterdits = [String.fromCodePoint(8211), String.fromCodePoint(8212)];
    const phrase = composerPosologie(champs({ moments: ["matin", "midi", "soir", "coucher"] }));
    for (const tiret of tiretsInterdits) {
      expect(phrase).not.toContain(tiret);
    }
  });
});
