import { describe, expect, it } from "vitest";
import {
  ageEnMois,
  calculerIndicateur,
  evaluerParametre,
  parametresPourExamen,
} from "@/modules/laboratoire/referentiel-parametres-examens";
import { REFERENTIEL_EXAMENS } from "@/modules/laboratoire/referentiel-examens";

describe("ageEnMois", () => {
  it("compte les mois revolus, en tenant compte du jour du mois", () => {
    expect(ageEnMois(new Date("2020-03-15T12:00:00"), new Date("2026-09-26T12:00:00"))).toBe(78);
    expect(ageEnMois(new Date("2020-03-30T12:00:00"), new Date("2026-09-26T12:00:00"))).toBe(77);
  });

  it("ne renvoie jamais un age negatif", () => {
    expect(ageEnMois(new Date("2030-01-01T12:00:00"), new Date("2026-09-26T12:00:00"))).toBe(0);
  });
});

describe("hemoglobine par age : seuils OMS 2011 de la limite basse (F-LAB-03)", () => {
  const H = "HEMOGLOBINE";

  it("6 a 59 mois : limite basse 11,0 g/dL", () => {
    expect(evaluerParametre(H, 10.8, "M", 36)).toEqual({ indicateur: "L", referenceAdulteParDefaut: false });
    expect(evaluerParametre(H, 11.2, "M", 36)).toEqual({ indicateur: "N", referenceAdulteParDefaut: false });
    expect(evaluerParametre(H, 11.0, "F", 6)?.indicateur).toBe("N");
  });

  it("5 a 11 ans : limite basse 11,5 g/dL", () => {
    expect(evaluerParametre(H, 11.2, "F", 96)?.indicateur).toBe("L");
    expect(evaluerParametre(H, 11.6, "F", 96)?.indicateur).toBe("N");
    expect(evaluerParametre(H, 11.5, "M", 60)?.indicateur).toBe("N");
  });

  it("12 a 14 ans : limite basse 12,0 g/dL, quel que soit le sexe", () => {
    expect(evaluerParametre(H, 11.8, "M", 156)?.indicateur).toBe("L");
    expect(evaluerParametre(H, 12.1, "M", 156)?.indicateur).toBe("N");
    expect(evaluerParametre(H, 12.1, "F", 179)?.indicateur).toBe("N");
  });

  it("des 15 ans, retour aux plages adulte par sexe, sans marque", () => {
    expect(evaluerParametre(H, 13.2, "M", 180)).toEqual({ indicateur: "L", referenceAdulteParDefaut: false });
    expect(evaluerParametre(H, 12.5, "F", 180)).toEqual({ indicateur: "N", referenceAdulteParDefaut: false });
  });

  it("age inconnu : plage adulte, sans marque", () => {
    expect(evaluerParametre(H, 13.2, "M", null)).toEqual({ indicateur: "L", referenceAdulteParDefaut: false });
  });

  it("avant 6 mois, aucun seuil OMS : plage adulte MARQUEE reference adulte par defaut", () => {
    expect(evaluerParametre(H, 10, "F", 3)).toEqual({ indicateur: "L", referenceAdulteParDefaut: true });
  });

  it("la borne haute et les seuils critiques restent ceux de l'adulte chez l'enfant", () => {
    expect(evaluerParametre(H, 18, "M", 96)?.indicateur).toBe("H");
    expect(evaluerParametre(H, 6, "M", 96)?.indicateur).toBe("LL");
    expect(evaluerParametre(H, 21, "M", 36)?.indicateur).toBe("HH");
  });
});

describe("autres parametres chez l'enfant : jamais presentes comme une norme pediatrique", () => {
  it("glycemie, creatinine et transaminases : plage adulte appliquee et marquee", () => {
    expect(evaluerParametre("GLYCEMIE_JEUN", 0.9, "M", 120)).toEqual({ indicateur: "N", referenceAdulteParDefaut: true });
    expect(evaluerParametre("CREATININE_SANGUINE", 8, "F", 60)?.referenceAdulteParDefaut).toBe(true);
    expect(evaluerParametre("ASAT", 30, "M", 100)?.referenceAdulteParDefaut).toBe(true);
    expect(evaluerParametre("ALAT", 30, "F", 100)?.referenceAdulteParDefaut).toBe(true);
  });

  it("chez l'adulte ces memes parametres ne sont jamais marques", () => {
    expect(evaluerParametre("GLYCEMIE_JEUN", 0.9, "M", 400)?.referenceAdulteParDefaut).toBe(false);
    expect(evaluerParametre("ASAT", 30, "M", null)?.referenceAdulteParDefaut).toBe(false);
  });
});

describe("limites physiologiques et compatibilite", () => {
  it("une valeur impossible reste rejetee (null), quel que soit l'age", () => {
    expect(evaluerParametre("GLYCEMIE_JEUN", 50, "M", 30)).toBeNull();
    expect(calculerIndicateur("HEMOGLOBINE", 100, "F", 96)).toBeNull();
  });

  it("calculerIndicateur sans age garde son comportement d'origine", () => {
    expect(calculerIndicateur("GLYCEMIE_JEUN", 0.9, "M")).toBe("N");
    expect(calculerIndicateur("GLYCEMIE_JEUN", 1.5, "M")).toBe("H");
    expect(calculerIndicateur("CODE_INCONNU", 1, "M")).toBeNull();
  });

  it("les 4 examens couverts existent dans le referentiel des examens", () => {
    for (const code of ["GLYCEMIE", "CREATININE", "TAUX_HEMOGLOBINE", "TRANSAMINASES"]) {
      const libelle = REFERENTIEL_EXAMENS.find((examen) => examen.code === code)?.libelle;
      expect(libelle).toBeTruthy();
      expect(parametresPourExamen(libelle as string)).not.toBeNull();
    }
  });
});
