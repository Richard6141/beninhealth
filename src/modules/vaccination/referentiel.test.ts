import { describe, expect, it } from "vitest";
import { controlerAgeVaccination, REGLES_AGE_VACCINS, VACCINS_REFERENTIEL } from "@/modules/vaccination/referentiel";

// Midi UTC : aucun basculement de jour possible quel que soit le fuseau du poste de test.
const midi = (iso: string) => new Date(`${iso}T12:00:00Z`);
const naissance = midi("2026-01-01");

describe("controlerAgeVaccination : age minimum a la 1ere dose (F-CLI-11)", () => {
  it("BCG est conforme des la naissance", () => {
    expect(
      controlerAgeVaccination({ vaccin: "BCG", numeroDose: 1, dateNaissance: naissance, dateAdministration: naissance, dateDerniereDoseMemeVaccin: null })
    ).toEqual({ conforme: true, message: null });
  });

  it("Polio : refusee a 5 semaines, acceptee a 6 semaines", () => {
    const tropTot = controlerAgeVaccination({ vaccin: "Polio", numeroDose: 1, dateNaissance: naissance, dateAdministration: midi("2026-02-05"), dateDerniereDoseMemeVaccin: null });
    expect(tropTot.conforme).toBe(false);
    expect(tropTot.message).toContain("6 semaines");

    const aTemps = controlerAgeVaccination({ vaccin: "Polio", numeroDose: 1, dateNaissance: naissance, dateAdministration: midi("2026-02-12"), dateDerniereDoseMemeVaccin: null });
    expect(aTemps.conforme).toBe(true);
  });

  it("Rougeole : refusee avant 9 mois, acceptee a 9 mois", () => {
    const avant = controlerAgeVaccination({ vaccin: "Rougeole", numeroDose: 1, dateNaissance: naissance, dateAdministration: midi("2026-09-01"), dateDerniereDoseMemeVaccin: null });
    expect(avant.conforme).toBe(false);
    expect(avant.message).toContain("9 mois");

    const apres = controlerAgeVaccination({ vaccin: "Rougeole", numeroDose: 1, dateNaissance: naissance, dateAdministration: midi("2026-10-01"), dateDerniereDoseMemeVaccin: null });
    expect(apres.conforme).toBe(true);
  });
});

describe("controlerAgeVaccination : intervalle minimum entre doses", () => {
  const dosePrecedente = midi("2026-03-01");

  it("Pentavalent : 3 semaines apres la dose precedente est trop court, 4 semaines convient", () => {
    const trop = controlerAgeVaccination({ vaccin: "Pentavalent", numeroDose: 2, dateNaissance: naissance, dateAdministration: midi("2026-03-22"), dateDerniereDoseMemeVaccin: dosePrecedente });
    expect(trop.conforme).toBe(false);
    expect(trop.message).toContain("4 semaines");

    const ok = controlerAgeVaccination({ vaccin: "Pentavalent", numeroDose: 2, dateNaissance: naissance, dateAdministration: midi("2026-03-29"), dateDerniereDoseMemeVaccin: dosePrecedente });
    expect(ok.conforme).toBe(true);
  });

  it("sans dose precedente connue, une dose 2 est conforme (rien a comparer)", () => {
    expect(
      controlerAgeVaccination({ vaccin: "Polio", numeroDose: 2, dateNaissance: naissance, dateAdministration: midi("2026-03-01"), dateDerniereDoseMemeVaccin: null }).conforme
    ).toBe(true);
  });

  it("un vaccin a dose unique (BCG, Fievre jaune) n'impose aucun intervalle", () => {
    expect(
      controlerAgeVaccination({ vaccin: "BCG", numeroDose: 2, dateNaissance: naissance, dateAdministration: midi("2026-03-02"), dateDerniereDoseMemeVaccin: dosePrecedente }).conforme
    ).toBe(true);
  });
});

describe("vaccins sans regle d'age", () => {
  it("un vaccin hors referentiel PEV (VAT, Autre) est toujours conforme", () => {
    for (const vaccin of ["VAT", "Autre", "Vaccin inconnu"]) {
      expect(
        controlerAgeVaccination({ vaccin, numeroDose: 1, dateNaissance: naissance, dateAdministration: naissance, dateDerniereDoseMemeVaccin: null }).conforme
      ).toBe(true);
    }
  });

  it("chaque vaccin qui porte une regle existe dans le referentiel des vaccins proposes", () => {
    for (const vaccin of Object.keys(REGLES_AGE_VACCINS)) {
      expect(VACCINS_REFERENTIEL as readonly string[]).toContain(vaccin);
    }
  });
});
