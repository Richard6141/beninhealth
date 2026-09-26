import { describe, expect, it } from "vitest";
import {
  dateDepuisJourCivil,
  dimancheDePaques,
  jourCivilBenin,
  jourCivilDepuisDate,
  jourCivilValide,
  joursFeriesDeterministes,
} from "./jours-feries-calcul";

describe("dimancheDePaques", () => {
  it("donne les dates connues du calendrier gregorien", () => {
    expect(dimancheDePaques(2024)).toEqual({ mois: 3, jour: 31 });
    expect(dimancheDePaques(2025)).toEqual({ mois: 4, jour: 20 });
    expect(dimancheDePaques(2026)).toEqual({ mois: 4, jour: 5 });
    expect(dimancheDePaques(2027)).toEqual({ mois: 3, jour: 28 });
    expect(dimancheDePaques(2028)).toEqual({ mois: 4, jour: 16 });
  });

  it("gere les cas limites de l'algorithme (Paques le 22 mars et le 25 avril)", () => {
    expect(dimancheDePaques(2285)).toEqual({ mois: 3, jour: 22 });
    expect(dimancheDePaques(1943)).toEqual({ mois: 4, jour: 25 });
  });
});

describe("joursFeriesDeterministes", () => {
  it("liste dix jours pour 2026, dans l'ordre chronologique", () => {
    const jours = joursFeriesDeterministes(2026);

    expect(jours.map((jour) => jour.date)).toEqual([
      "2026-01-01",
      "2026-01-10",
      "2026-04-06",
      "2026-05-01",
      "2026-05-14",
      "2026-05-25",
      "2026-08-01",
      "2026-08-15",
      "2026-11-01",
      "2026-12-25",
    ]);
  });

  it("calcule les fetes mobiles a partir de Paques (lundi de Paques, Ascension, lundi de Pentecote)", () => {
    const libelles = new Map(joursFeriesDeterministes(2027).map((jour) => [jour.libelle, jour.date]));

    expect(libelles.get("Lundi de Pâques")).toBe("2027-03-29");
    expect(libelles.get("Ascension")).toBe("2027-05-06");
    expect(libelles.get("Lundi de Pentecôte")).toBe("2027-05-17");
  });

  it("franchit un changement de mois quand Paques est tardif", () => {
    const libelles = new Map(joursFeriesDeterministes(2025).map((jour) => [jour.libelle, jour.date]));

    expect(libelles.get("Lundi de Pâques")).toBe("2025-04-21");
    expect(libelles.get("Ascension")).toBe("2025-05-29");
    expect(libelles.get("Lundi de Pentecôte")).toBe("2025-06-09");
  });

  it("ne genere jamais de fete musulmane (dependant de la lune, a saisir a la main)", () => {
    const libelles = joursFeriesDeterministes(2026).map((jour) => jour.libelle.toLowerCase());

    for (const mot of ["fitr", "kebir", "maouloud", "korit", "tabaski"]) {
      expect(libelles.some((libelle) => libelle.includes(mot))).toBe(false);
    }
  });

  it("ne produit que des dates valides et sans doublon", () => {
    for (const annee of [2024, 2026, 2028, 2100]) {
      const jours = joursFeriesDeterministes(annee);

      expect(jours.every((jour) => jourCivilValide(jour.date))).toBe(true);
      expect(new Set(jours.map((jour) => jour.date)).size).toBe(jours.length);
    }
  });
});

describe("jourCivilBenin (UTC+1)", () => {
  it("bascule au lendemain a 23h00 UTC", () => {
    expect(jourCivilBenin(new Date("2026-12-24T22:59:59.999Z"))).toBe("2026-12-24");
    expect(jourCivilBenin(new Date("2026-12-24T23:00:00.000Z"))).toBe("2026-12-25");
  });

  it("franchit le changement d'annee", () => {
    expect(jourCivilBenin(new Date("2026-12-31T23:30:00.000Z"))).toBe("2027-01-01");
  });
});

describe("jourCivilValide", () => {
  it("accepte une vraie date et refuse les dates impossibles ou mal formees", () => {
    expect(jourCivilValide("2026-09-27")).toBe(true);
    expect(jourCivilValide("2028-02-29")).toBe(true);
    expect(jourCivilValide("2026-02-29")).toBe(false);
    expect(jourCivilValide("2026-02-30")).toBe(false);
    expect(jourCivilValide("2026-13-01")).toBe(false);
    expect(jourCivilValide("27/09/2026")).toBe(false);
    expect(jourCivilValide("2026-9-7")).toBe(false);
    expect(jourCivilValide("")).toBe(false);
  });
});

describe("conversion vers une colonne DATE", () => {
  it("fait l'aller-retour sans decalage de fuseau", () => {
    const date = dateDepuisJourCivil("2026-12-25");

    expect(date.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(jourCivilDepuisDate(date)).toBe("2026-12-25");
  });
});
