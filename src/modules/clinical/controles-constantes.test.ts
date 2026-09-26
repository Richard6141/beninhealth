import { describe, expect, it } from "vitest";
import {
  ageAnnees,
  calculerIMC,
  controlerFrequenceRespiratoire,
  controlerGlycemie,
  controlerIMC,
  controlerPoids,
  controlerPouls,
  controlerSaturationOxygene,
  controlerTaille,
  controlerTemperature,
  controlerTensionDiastolique,
  controlerTensionSystolique,
} from "./controles-constantes";

/**
 * Controles des constantes vitales (F-CLI-06, RG-CLI-50 et RG-CLI-51) : une
 * valeur impossible est refusee, une valeur inhabituelle demande une
 * confirmation, les seuils dependent de l'age. Dates construites en heure
 * locale, comme le calcul d'age du module.
 */

const REFERENCE = new Date(2026, 8, 26); // 26 septembre 2026
const adulte = new Date(1990, 0, 15);
const enfant4Ans = new Date(2022, 0, 15); // 4 ans
const enfant8Ans = new Date(2018, 0, 15); // 8 ans
const nourrisson6Mois = new Date(2026, 2, 26); // 6 mois
const nouveauNe1Mois = new Date(2026, 7, 26); // 1 mois

const statut = (resultat: { statut: string }) => resultat.statut;

describe("temperature (30 a 45 C acceptee, alerte sous 35,5 et au-dessus de 38,5)", () => {
  it("refuse hors de la plage acceptee", () => {
    expect(statut(controlerTemperature(29.9))).toBe("refus");
    expect(statut(controlerTemperature(45.1))).toBe("refus");
  });

  it("alerte aux extremes de la plage acceptee et pres des seuils", () => {
    expect(statut(controlerTemperature(30))).toBe("alerte");
    expect(statut(controlerTemperature(35.4))).toBe("alerte");
    expect(statut(controlerTemperature(38.6))).toBe("alerte");
    expect(statut(controlerTemperature(45))).toBe("alerte");
  });

  it("accepte une temperature normale, bornes des seuils incluses", () => {
    for (const valeur of [35.5, 36.6, 38.5]) expect(statut(controlerTemperature(valeur))).toBe("ok");
  });

  it("le refus porte le message du pack", () => {
    expect(controlerTemperature(50).message).toBe("Valeur impossible, verifiez la saisie.");
    expect(controlerTemperature(39).message).toBe("Valeur inhabituelle, confirmez-vous ?");
  });
});

describe("pouls : seuils d'alerte selon l'age (RG-CLI-51)", () => {
  it("adulte : refus sous 20 ou au-dessus de 250, alerte sous 50 ou au-dessus de 120", () => {
    expect(statut(controlerPouls(19, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerPouls(251, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerPouls(49, adulte, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(121, adulte, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(50, adulte, REFERENCE))).toBe("ok");
    expect(statut(controlerPouls(120, adulte, REFERENCE))).toBe("ok");
  });

  it("sans date de naissance : seuils de l'adulte", () => {
    expect(statut(controlerPouls(45, null, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(80, null, REFERENCE))).toBe("ok");
  });

  it("le meme pouls de 95 est normal pour un enfant de 4 ans mais un pouls de 85 ne l'est pas", () => {
    expect(statut(controlerPouls(95, enfant4Ans, REFERENCE))).toBe("ok");
    expect(statut(controlerPouls(85, enfant4Ans, REFERENCE))).toBe("alerte");
  });

  it("enfant de 8 ans : 70 a 120", () => {
    expect(statut(controlerPouls(69, enfant8Ans, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(70, enfant8Ans, REFERENCE))).toBe("ok");
  });

  it("nourrisson de 6 mois : 100 a 160 ; nouveau-ne de 1 mois : 100 a 180", () => {
    expect(statut(controlerPouls(161, nourrisson6Mois, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(170, nouveauNe1Mois, REFERENCE))).toBe("ok");
    expect(statut(controlerPouls(181, nouveauNe1Mois, REFERENCE))).toBe("alerte");
    expect(statut(controlerPouls(99, nouveauNe1Mois, REFERENCE))).toBe("alerte");
  });
});

describe("tension arterielle", () => {
  it("refuse une systolique inferieure ou egale a la diastolique", () => {
    expect(statut(controlerTensionSystolique(80, 80, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerTensionSystolique(70, 90, adulte, REFERENCE))).toBe("refus");
  });

  it("adulte : alerte sous 90 et au-dessus de 140, refus hors de 50 a 300", () => {
    expect(statut(controlerTensionSystolique(120, 80, adulte, REFERENCE))).toBe("ok");
    expect(statut(controlerTensionSystolique(89, 60, adulte, REFERENCE))).toBe("alerte");
    expect(statut(controlerTensionSystolique(141, 80, adulte, REFERENCE))).toBe("alerte");
    expect(statut(controlerTensionSystolique(49, 30, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerTensionSystolique(301, 80, adulte, REFERENCE))).toBe("refus");
  });

  it("enfant de 4 ans : seuil bas 70 + 2 x age = 78, pas de seuil haut", () => {
    expect(statut(controlerTensionSystolique(77, 50, enfant4Ans, REFERENCE))).toBe("alerte");
    expect(statut(controlerTensionSystolique(78, 50, enfant4Ans, REFERENCE))).toBe("ok");
    expect(statut(controlerTensionSystolique(200, 100, enfant4Ans, REFERENCE))).toBe("ok");
  });

  it("diastolique : refus hors de 20 a 200, alerte sous 60 et au-dessus de 90", () => {
    expect(statut(controlerTensionDiastolique(19))).toBe("refus");
    expect(statut(controlerTensionDiastolique(201))).toBe("refus");
    expect(statut(controlerTensionDiastolique(59))).toBe("alerte");
    expect(statut(controlerTensionDiastolique(91))).toBe("alerte");
    expect(statut(controlerTensionDiastolique(80))).toBe("ok");
  });
});

describe("frequence respiratoire : seuil haut selon l'age", () => {
  it("adulte : alerte au-dessus de 24, refus sous 5 ou au-dessus de 80", () => {
    expect(statut(controlerFrequenceRespiratoire(4, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerFrequenceRespiratoire(81, adulte, REFERENCE))).toBe("refus");
    expect(statut(controlerFrequenceRespiratoire(25, adulte, REFERENCE))).toBe("alerte");
    expect(statut(controlerFrequenceRespiratoire(24, adulte, REFERENCE))).toBe("ok");
    expect(statut(controlerFrequenceRespiratoire(6, adulte, REFERENCE))).toBe("ok");
  });

  it("la meme frequence de 35 est normale a 4 ans (40) mais inhabituelle a 8 ans (30)", () => {
    expect(statut(controlerFrequenceRespiratoire(35, enfant4Ans, REFERENCE))).toBe("ok");
    expect(statut(controlerFrequenceRespiratoire(35, enfant8Ans, REFERENCE))).toBe("alerte");
  });

  it("nouveau-ne : jusqu'a 60", () => {
    expect(statut(controlerFrequenceRespiratoire(60, nouveauNe1Mois, REFERENCE))).toBe("ok");
    expect(statut(controlerFrequenceRespiratoire(61, nouveauNe1Mois, REFERENCE))).toBe("alerte");
  });
});

describe("autres constantes", () => {
  it("saturation en oxygene : refus hors de 50 a 100, alerte sous 94", () => {
    expect(statut(controlerSaturationOxygene(49))).toBe("refus");
    expect(statut(controlerSaturationOxygene(101))).toBe("refus");
    expect(statut(controlerSaturationOxygene(93))).toBe("alerte");
    expect(statut(controlerSaturationOxygene(94))).toBe("ok");
    expect(statut(controlerSaturationOxygene(100))).toBe("ok");
  });

  it("poids et taille : seulement des plages de refus", () => {
    expect(statut(controlerPoids(0.2))).toBe("refus");
    expect(statut(controlerPoids(301))).toBe("refus");
    expect(statut(controlerPoids(3.2))).toBe("ok");
    expect(statut(controlerTaille(19))).toBe("refus");
    expect(statut(controlerTaille(251))).toBe("refus");
    expect(statut(controlerTaille(50))).toBe("ok");
  });

  it("glycemie : refus hors de 0,2 a 6, alerte sous 0,7 et au-dessus de 1,8", () => {
    expect(statut(controlerGlycemie(0.1))).toBe("refus");
    expect(statut(controlerGlycemie(6.1))).toBe("refus");
    expect(statut(controlerGlycemie(0.6))).toBe("alerte");
    expect(statut(controlerGlycemie(2))).toBe("alerte");
    expect(statut(controlerGlycemie(1))).toBe("ok");
  });
});

describe("IMC", () => {
  it("n'est pas calculable sans poids, sans taille ou avec une taille nulle", () => {
    expect(calculerIMC(null, 170)).toBeNull();
    expect(calculerIMC(70, null)).toBeNull();
    expect(calculerIMC(70, 0)).toBeNull();
  });

  it("calcule poids / taille en metres au carre", () => {
    expect(calculerIMC(81, 180)).toBeCloseTo(25, 5);
  });

  it("alerte sous 18,5 et a partir de 30, normal entre les deux", () => {
    expect(statut(controlerIMC(18.4))).toBe("alerte");
    expect(statut(controlerIMC(18.5))).toBe("ok");
    expect(statut(controlerIMC(29.99))).toBe("ok");
    expect(statut(controlerIMC(30))).toBe("alerte");
  });
});

describe("ageAnnees", () => {
  it("compte les annees revolues : la veille de l'anniversaire, l'age n'a pas change", () => {
    expect(ageAnnees(new Date(1990, 8, 27), REFERENCE)).toBe(35);
    expect(ageAnnees(new Date(1990, 8, 26), REFERENCE)).toBe(36);
    expect(ageAnnees(new Date(1990, 8, 25), REFERENCE)).toBe(36);
  });
});
