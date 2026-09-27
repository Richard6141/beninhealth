import { describe, expect, it } from "vitest";
import { masquerDelaiMoyen, masquerLigneAvecTotal, masquerPetitEffectif, masquerTaux } from "@/modules/pilotage/masquage";

describe("masquerPetitEffectif (RG-PIL-02)", () => {
  it("masque les valeurs de 1 a 4", () => {
    expect(masquerPetitEffectif(1)).toBe("< 5");
    expect(masquerPetitEffectif(4)).toBe("< 5");
  });

  it("n'affecte pas 0 ni les valeurs de 5 et plus", () => {
    expect(masquerPetitEffectif(0)).toBe(0);
    expect(masquerPetitEffectif(5)).toBe(5);
    expect(masquerPetitEffectif(42)).toBe(42);
  });
});

describe("masquerTaux (RG-PIL-02)", () => {
  it("affiche 'effectif insuffisant' sous 20 au denominateur", () => {
    expect(masquerTaux(3, 19)).toBe("effectif insuffisant");
  });

  it("calcule le taux normalement a partir de 20", () => {
    expect(masquerTaux(10, 20)).toBe("50.0 %");
  });
});

describe("masquerDelaiMoyen (RG-PIL-02, IND-11)", () => {
  it("aucune mesure : le distingue d'un delai masque", () => {
    expect(masquerDelaiMoyen(0, 0)).toBe("aucune mesure");
  });

  it("masque une moyenne calculee sur moins de 5 mesures", () => {
    expect(masquerDelaiMoyen(40, 1)).toBe("< 5 mesures");
    expect(masquerDelaiMoyen(160, 4)).toBe("< 5 mesures");
  });

  it("calcule et arrondit la moyenne a partir de 5 mesures", () => {
    expect(masquerDelaiMoyen(100, 5)).toBe("20 min");
    expect(masquerDelaiMoyen(101, 5)).toBe("20 min");
  });
});

describe("masquerLigneAvecTotal (RG-PIL-03, masquage complementaire)", () => {
  it("masque une deuxieme cellule (la plus petite) quand une seule est masquee par RG-PIL-02", () => {
    const resultat = masquerLigneAvecTotal([
      { cle: "F", valeur: 2 }, // masquee par RG-PIL-02
      { cle: "M", valeur: 8 },
      { cle: "autre", valeur: 30 },
    ]);

    expect(resultat.F).toBe("< 5");
    // "M" (8) est la plus petite valeur restante visible : masquee a son tour.
    expect(resultat.M).toBe("< 5");
    expect(resultat.autre).toBe(30);
  });

  it("ne masque rien de plus si aucune cellule n'est masquee au depart", () => {
    const resultat = masquerLigneAvecTotal([
      { cle: "F", valeur: 12 },
      { cle: "M", valeur: 30 },
    ]);

    expect(resultat.F).toBe(12);
    expect(resultat.M).toBe(30);
  });

  it("ne masque pas de deuxieme cellule si deux cellules ou plus sont deja masquees", () => {
    const resultat = masquerLigneAvecTotal([
      { cle: "F", valeur: 2 },
      { cle: "M", valeur: 3 },
      { cle: "autre", valeur: 40 },
    ]);

    expect(resultat.F).toBe("< 5");
    expect(resultat.M).toBe("< 5");
    expect(resultat.autre).toBe(40);
  });
});
