import { describe, expect, it } from "vitest";
import {
  AGE_POIDS_REQUIS_ANS,
  DUREE_TRAITEMENT_MAX_JOURS,
  FENETRE_POIDS_JOURS,
  NOMBRE_LIGNES_MAX,
  poidsRecent,
  poidsRequisPourPatient,
} from "./regles-ordonnance";

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");

function ilYaJours(jours: number): Date {
  return new Date(MAINTENANT.getTime() - jours * 24 * 60 * 60 * 1000);
}

describe("constantes du pack", () => {
  it("reprennent RG-PRE-01, RG-PRE-02 et la borne de duree", () => {
    expect(NOMBRE_LIGNES_MAX).toBe(10);
    expect(AGE_POIDS_REQUIS_ANS).toBe(12);
    expect(FENETRE_POIDS_JOURS).toBe(30);
    expect(DUREE_TRAITEMENT_MAX_JOURS).toBe(90);
  });
});

describe("poidsRequisPourPatient (RG-PRE-02)", () => {
  it("exige le poids sous 12 ans", () => {
    expect(poidsRequisPourPatient(new Date("2020-01-15"), MAINTENANT)).toBe(true);
    expect(poidsRequisPourPatient(new Date("2014-09-27"), MAINTENANT)).toBe(true);
  });

  it("ne l'exige plus le jour des 12 ans", () => {
    expect(poidsRequisPourPatient(new Date("2014-09-26"), MAINTENANT)).toBe(false);
    expect(poidsRequisPourPatient(new Date("1990-05-01"), MAINTENANT)).toBe(false);
  });
});

describe("poidsRecent", () => {
  it("renvoie null sans mesure", () => {
    expect(poidsRecent([], MAINTENANT)).toBeNull();
  });

  it("ignore les mesures sans poids, a poids nul ou negatif", () => {
    expect(
      poidsRecent(
        [
          { date: ilYaJours(1), poidsKg: null },
          { date: ilYaJours(1), poidsKg: 0 },
          { date: ilYaJours(1), poidsKg: -3 },
        ],
        MAINTENANT
      )
    ).toBeNull();
  });

  it("garde une mesure du jour et une mesure a 30 jours pile, refuse 31 jours", () => {
    expect(poidsRecent([{ date: MAINTENANT, poidsKg: 18 }], MAINTENANT)?.poidsKg).toBe(18);
    expect(poidsRecent([{ date: ilYaJours(30), poidsKg: 18 }], MAINTENANT)?.poidsKg).toBe(18);
    expect(poidsRecent([{ date: ilYaJours(31), poidsKg: 18 }], MAINTENANT)).toBeNull();
  });

  it("refuse une mesure datee dans le futur", () => {
    expect(poidsRecent([{ date: new Date(MAINTENANT.getTime() + 60_000), poidsKg: 18 }], MAINTENANT)).toBeNull();
  });

  it("retient la mesure valide la plus recente, quel que soit l'ordre", () => {
    const retenu = poidsRecent(
      [
        { date: ilYaJours(20), poidsKg: 17 },
        { date: ilYaJours(2), poidsKg: 18.5 },
        { date: ilYaJours(10), poidsKg: 17.8 },
        { date: ilYaJours(90), poidsKg: 12 },
      ],
      MAINTENANT
    );

    expect(retenu?.poidsKg).toBe(18.5);
  });
});
