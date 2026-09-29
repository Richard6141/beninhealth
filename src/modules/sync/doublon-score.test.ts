import { describe, expect, it } from "vitest";
import { calculerScoreDoublon, controlerDoublon } from "./doublon-score";

const PERSONNE_REFERENCE = {
  nom: "Dossou",
  prenom: "Akpédjé",
  dateNaissance: new Date("1990-03-15T00:00:00.000Z"),
  sexe: "F",
};

describe("doublon-score (F-COM-02, F-COM-08) : score >= 80 => revue", () => {
  it("un candidat identique obtient un score de 100", () => {
    const score = calculerScoreDoublon(PERSONNE_REFERENCE, PERSONNE_REFERENCE);
    expect(score).toBe(100);
  });

  it("nom + prenom identiques, date et sexe differents : score sous le seuil (70)", () => {
    const score = calculerScoreDoublon(
      { ...PERSONNE_REFERENCE },
      { ...PERSONNE_REFERENCE, dateNaissance: new Date("1985-01-01T00:00:00.000Z"), sexe: "M" }
    );
    expect(score).toBe(70);
  });

  it("nom + prenom + date de naissance identiques (sexe different) : score de 90, au-dessus du seuil", () => {
    const score = calculerScoreDoublon(PERSONNE_REFERENCE, { ...PERSONNE_REFERENCE, sexe: "M" });
    expect(score).toBe(90);
  });

  it("la comparaison ignore les accents et la casse (meme normalisation que le reste du depot)", () => {
    const score = calculerScoreDoublon(PERSONNE_REFERENCE, { ...PERSONNE_REFERENCE, prenom: "AKPEDJE", nom: "dossou" });
    expect(score).toBe(100);
  });

  it("aucune correspondance : score de 0", () => {
    const score = calculerScoreDoublon(PERSONNE_REFERENCE, {
      nom: "Houngbo",
      prenom: "Espoir",
      dateNaissance: new Date("2001-07-04T00:00:00.000Z"),
      sexe: "M",
    });
    expect(score).toBe(0);
  });

  it("controlerDoublon retient le meilleur score parmi plusieurs personnes existantes", () => {
    const resultat = controlerDoublon(PERSONNE_REFERENCE, [
      { nom: "Houngbo", prenom: "Espoir", dateNaissance: new Date("2001-07-04T00:00:00.000Z"), sexe: "M" },
      PERSONNE_REFERENCE,
    ]);
    expect(resultat.meilleurScore).toBe(100);
    expect(resultat.probableDoublon).toBe(true);
  });

  it("controlerDoublon renvoie probableDoublon=false sous le seuil de 80", () => {
    const resultat = controlerDoublon(PERSONNE_REFERENCE, [
      { ...PERSONNE_REFERENCE, dateNaissance: new Date("1985-01-01T00:00:00.000Z"), sexe: "M" },
    ]);
    expect(resultat.meilleurScore).toBe(70);
    expect(resultat.probableDoublon).toBe(false);
  });

  it("controlerDoublon sur une liste vide renvoie un score de 0", () => {
    const resultat = controlerDoublon(PERSONNE_REFERENCE, []);
    expect(resultat.meilleurScore).toBe(0);
    expect(resultat.probableDoublon).toBe(false);
  });
});
