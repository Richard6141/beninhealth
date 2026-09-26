import { describe, expect, it } from "vitest";
import {
  dateDepuisChaineLocaleBenin,
  jourEtMinutesLocalesBenin,
  veilleA18hBenin,
} from "./fuseau-horaire";

/**
 * Tests de src/lib/fuseau-horaire.ts : le calcul doit rester correct quel
 * que soit le fuseau horaire configure sur la machine qui execute les tests
 * (voir docs/coordination-agents.md, F-ETA-05, pour l'incident d'origine :
 * un serveur configure sur Europe/London coincide avec UTC+1 tant que
 * l'heure d'ete britannique est active, puis diverge fin octobre).
 */
describe("dateDepuisChaineLocaleBenin", () => {
  it("interprete une heure locale Africa/Porto-Novo (UTC+1) en instant UTC", () => {
    const resultat = dateDepuisChaineLocaleBenin("2026-10-14T09:30");
    expect(resultat.toISOString()).toBe("2026-10-14T08:30:00.000Z");
  });

  it("accepte les secondes optionnelles", () => {
    const resultat = dateDepuisChaineLocaleBenin("2026-10-14T09:30:15");
    expect(resultat.toISOString()).toBe("2026-10-14T08:30:15.000Z");
  });

  it("renvoie une Date invalide pour une chaine mal formee", () => {
    const resultat = dateDepuisChaineLocaleBenin("pas une date");
    expect(Number.isNaN(resultat.getTime())).toBe(true);
  });
});

describe("jourEtMinutesLocalesBenin", () => {
  it("convertit un instant UTC en jour/minutes locaux Africa/Porto-Novo", () => {
    // Lundi 28/09/2026 09:00 UTC == 10:00 heure locale (UTC+1).
    const resultat = jourEtMinutesLocalesBenin(new Date("2026-09-28T09:00:00.000Z"));
    expect(resultat).toEqual({ jourSemaine: 1, minutes: 10 * 60 });
  });

  it("fait basculer le jour local pres de minuit UTC", () => {
    // 23:30 UTC un lundi == 00:30 locale, donc mardi en heure locale.
    const resultat = jourEtMinutesLocalesBenin(new Date("2026-09-28T23:30:00.000Z"));
    expect(resultat).toEqual({ jourSemaine: 2, minutes: 30 });
  });
});

describe("veilleA18hBenin", () => {
  it("calcule 18h00 heure locale la veille du rendez-vous", () => {
    // Rendez-vous 14/10/2026 09:30 locale (08:30 UTC) -> veille 13/10 18:00
    // locale == 13/10 17:00 UTC.
    const rendezVous = dateDepuisChaineLocaleBenin("2026-10-14T09:30");
    const resultat = veilleA18hBenin(rendezVous);
    expect(resultat.toISOString()).toBe("2026-10-13T17:00:00.000Z");
  });

  it("reste correct pour un rendez-vous pris tres tot le matin (bascule de jour)", () => {
    // Rendez-vous 01/01/2027 00:30 locale (31/12/2026 23:30 UTC) -> veille
    // 31/12/2026 18:00 locale == 31/12/2026 17:00 UTC.
    const rendezVous = dateDepuisChaineLocaleBenin("2027-01-01T00:30");
    const resultat = veilleA18hBenin(rendezVous);
    expect(resultat.toISOString()).toBe("2026-12-31T17:00:00.000Z");
  });
});
