import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  PREFIXE_EMPREINTE,
  calculerEmpreinteOrdonnance,
  contenuCanoniqueOrdonnance,
  contenuDepuisOrdonnanceEnBase,
  empreinteCourte,
  serialiserCanonique,
  verifierIntegriteOrdonnance,
  type ContenuOrdonnance,
  type OrdonnanceEnBase,
} from "./empreinte";

function contenu(surcharge: Partial<ContenuOrdonnance> = {}): ContenuOrdonnance {
  return {
    patientId: "patient-1",
    prescripteurId: "medecin-1",
    etablissementId: "etab-1",
    date: new Date("2026-09-26T10:00:00.000Z"),
    instructions: "A prendre pendant les repas",
    lignes: [
      { medicamentId: "med-a", posologie: "1 comprime 3 fois par jour", quantite: 30, dureeTraitementJours: 10, nonSubstituable: false },
      { medicamentId: "med-b", posologie: "1 gelule le soir", quantite: 10, dureeTraitementJours: 10, nonSubstituable: true },
    ],
    ...surcharge,
  };
}

function ordonnanceEnBase(surcharge: Partial<OrdonnanceEnBase> = {}): OrdonnanceEnBase {
  const c = contenu();
  return {
    patientId: c.patientId,
    medecinPrescripteurId: c.prescripteurId,
    date: c.date,
    instructions: c.instructions,
    empreinteContenu: calculerEmpreinteOrdonnance(c),
    consultation: { etablissementId: c.etablissementId },
    lignes: c.lignes,
    ...surcharge,
  };
}

describe("serialiserCanonique", () => {
  it("conserve les cles des objets imbriques (l'ancien algorithme les supprimait)", () => {
    const ancien = JSON.stringify({ lignes: [{ medicamentId: "x" }] }, ["lignes"]);
    expect(ancien).toBe('{"lignes":[{}]}');

    expect(serialiserCanonique({ lignes: [{ medicamentId: "x" }] })).toBe('{"lignes":[{"medicamentId":"x"}]}');
  });

  it("trie les cles a tous les niveaux", () => {
    expect(serialiserCanonique({ b: { z: 1, a: 2 }, a: 0 })).toBe('{"a":0,"b":{"a":2,"z":1}}');
  });

  it("refuse une valeur indefinie plutot que de l'ignorer", () => {
    expect(() => serialiserCanonique({ a: undefined })).toThrow();
  });
});

describe("empreinte d'ordonnance", () => {
  it("couvre lignes, patient, prescripteur, etablissement et date dans le contenu canonique", () => {
    const canonique = contenuCanoniqueOrdonnance(contenu());

    for (const fragment of [
      "med-a",
      "1 comprime 3 fois par jour",
      "patient-1",
      "medecin-1",
      "etab-1",
      "2026-09-26T10:00:00.000Z",
      "A prendre pendant les repas",
    ]) {
      expect(canonique).toContain(fragment);
    }
  });

  it("porte le prefixe de version et un SHA-256 du contenu canonique", () => {
    const c = contenu();
    const attendu = createHash("sha256").update(contenuCanoniqueOrdonnance(c)).digest("hex");

    expect(calculerEmpreinteOrdonnance(c)).toBe(`${PREFIXE_EMPREINTE}${attendu}`);
  });

  it("ne depend pas de l'ordre des lignes renvoye par la base", () => {
    const c = contenu();
    const inverse = contenu({ lignes: [...c.lignes].reverse() });

    expect(calculerEmpreinteOrdonnance(inverse)).toBe(calculerEmpreinteOrdonnance(c));
  });

  it("change des qu'un champ du contenu change", () => {
    const base = calculerEmpreinteOrdonnance(contenu());
    const [ligneA, ligneB] = contenu().lignes;

    const variantes: Partial<ContenuOrdonnance>[] = [
      { patientId: "patient-2" },
      { prescripteurId: "medecin-2" },
      { etablissementId: "etab-2" },
      { date: new Date("2026-09-26T10:00:00.001Z") },
      { instructions: "A jeun" },
      { lignes: [ligneA] },
      { lignes: [{ ...ligneA, quantite: 31 }, ligneB] },
      { lignes: [{ ...ligneA, posologie: "2 comprimes 3 fois par jour" }, ligneB] },
      { lignes: [{ ...ligneA, dureeTraitementJours: 11 }, ligneB] },
      { lignes: [{ ...ligneA, medicamentId: "med-z" }, ligneB] },
      { lignes: [ligneA, { ...ligneB, nonSubstituable: false }] },
    ];

    for (const variante of variantes) {
      expect(calculerEmpreinteOrdonnance(contenu(variante))).not.toBe(base);
    }
  });
});

describe("CA-2 : integrite recalculee sur les donnees en base", () => {
  it("l'empreinte recalculee correspond a l'empreinte enregistree", () => {
    const ordonnance = ordonnanceEnBase();

    expect(verifierIntegriteOrdonnance(ordonnance.empreinteContenu, contenuDepuisOrdonnanceEnBase(ordonnance))).toBe(
      "conforme"
    );
  });

  it("reste conforme quand la base renvoie les lignes dans un autre ordre", () => {
    const ordonnance = ordonnanceEnBase();
    const relue = ordonnanceEnBase({ lignes: [...ordonnance.lignes].reverse() });

    expect(verifierIntegriteOrdonnance(ordonnance.empreinteContenu, contenuDepuisOrdonnanceEnBase(relue))).toBe(
      "conforme"
    );
  });

  it("detecte une ligne modifiee apres signature", () => {
    const ordonnance = ordonnanceEnBase();
    const modifiee = ordonnanceEnBase({
      lignes: [{ ...ordonnance.lignes[0], quantite: 300 }, ordonnance.lignes[1]],
    });

    expect(verifierIntegriteOrdonnance(ordonnance.empreinteContenu, contenuDepuisOrdonnanceEnBase(modifiee))).toBe(
      "alteree"
    );
  });

  it("detecte un changement de patient, de prescripteur, d'etablissement ou de date", () => {
    const ordonnance = ordonnanceEnBase();
    const alterations: Partial<OrdonnanceEnBase>[] = [
      { patientId: "patient-2" },
      { medecinPrescripteurId: "medecin-2" },
      { consultation: { etablissementId: "etab-2" } },
      { date: new Date("2027-01-01T00:00:00.000Z") },
    ];

    for (const alteration of alterations) {
      const relue = ordonnanceEnBase(alteration);
      expect(verifierIntegriteOrdonnance(ordonnance.empreinteContenu, contenuDepuisOrdonnanceEnBase(relue))).toBe(
        "alteree"
      );
    }
  });

  it("classe une empreinte sans prefixe comme ancien format, non verifiable", () => {
    const ancienne = createHash("sha256").update('{"instructions":"x","lignes":[{}]}').digest("hex");

    expect(verifierIntegriteOrdonnance(ancienne, contenu())).toBe("ancien_format");
  });
});

describe("empreinteCourte", () => {
  it("renvoie les 8 premiers caracteres hexadecimaux, avec ou sans prefixe", () => {
    expect(empreinteCourte("v2:0123456789abcdef")).toBe("01234567");
    expect(empreinteCourte("0123456789abcdef")).toBe("01234567");
  });
});
