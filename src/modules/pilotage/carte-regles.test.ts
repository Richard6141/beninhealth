import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { DEPARTEMENTS_BENIN } from "./referentiel-territoire";
import {
  COULEURS_CLASSES,
  DEPARTEMENTS_SVG,
  HAUTEUR_VUE,
  LARGEUR_VUE_CARTE,
  NOMBRE_CLASSES,
  classeDeLaValeur,
  legendeDesClasses,
  normaliserNomDepartement,
  plageDePeriode,
  projeter,
} from "./carte-regles";

/** Regles pures de la carte sanitaire (F-PIL-03) : classes, legende, periodes, contours. */

describe("classeDeLaValeur", () => {
  it("une valeur masquee (< 5) tombe toujours dans la classe la plus faible (RG-PIL-02)", () => {
    expect(classeDeLaValeur("< 5", 1000)).toBe(0);
    expect(classeDeLaValeur("< 5", 0)).toBe(0);
  });

  it("sans maximum (rien a comparer) : classe 0 pour tous", () => {
    expect(classeDeLaValeur(0, 0)).toBe(0);
  });

  it("cinq intervalles egaux entre 0 et le maximum, le maximum lui-meme dans la classe 4", () => {
    expect(classeDeLaValeur(0, 100)).toBe(0);
    expect(classeDeLaValeur(19, 100)).toBe(0);
    expect(classeDeLaValeur(20, 100)).toBe(1);
    expect(classeDeLaValeur(59, 100)).toBe(2);
    expect(classeDeLaValeur(60, 100)).toBe(3);
    expect(classeDeLaValeur(80, 100)).toBe(4);
    expect(classeDeLaValeur(100, 100)).toBe(NOMBRE_CLASSES - 1);
  });

  it("ne depasse jamais la derniere classe, meme si la valeur depasse le maximum passe", () => {
    expect(classeDeLaValeur(500, 100)).toBe(NOMBRE_CLASSES - 1);
  });
});

describe("legendeDesClasses", () => {
  it("cinq classes, une couleur par classe, sans trou ni chevauchement entre bornes", () => {
    const legende = legendeDesClasses(100);

    expect(legende).toHaveLength(NOMBRE_CLASSES);
    expect(legende.map((classe) => classe.couleur)).toEqual([...COULEURS_CLASSES]);
    expect(legende.map((classe) => classe.libelle)).toEqual(["0 à 19", "20 à 39", "40 à 59", "60 à 79", "80 à 100"]);
  });

  it("un tres petit maximum : une classe sans aucune valeur entiere est annoncee comme telle, pas avec une borne inventee", () => {
    expect(legendeDesClasses(3).map((classe) => classe.libelle)).toEqual(["0", "1", "aucune valeur", "2", "3"]);
  });

  it("un maximum nul : la legende ne promet pas d'intervalles", () => {
    expect(legendeDesClasses(0).every((classe) => classe.libelle === "0")).toBe(true);
  });

  it("chaque valeur entiere tombe dans l'intervalle affiche pour sa classe", () => {
    const maximum = 137;
    const legende = legendeDesClasses(maximum);

    for (let valeur = 0; valeur <= maximum; valeur += 1) {
      const classe = classeDeLaValeur(valeur, maximum);
      const [basTexte, hautTexte] = legende[classe].libelle.split(" à ");
      const bas = Number(basTexte);
      const haut = hautTexte === undefined ? bas : Number(hautTexte);
      expect(valeur).toBeGreaterThanOrEqual(bas);
      expect(valeur).toBeLessThanOrEqual(haut);
    }
  });
});

describe("plageDePeriode", () => {
  const maintenant = new Date("2026-09-27T15:30:00.000Z");

  it("aujourd'hui : le jour UTC courant, fin exclue", () => {
    const { debut, fin } = plageDePeriode("aujourdhui", maintenant);
    expect(debut.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(fin.toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });

  it("7 jours et 30 jours : fenetre glissante qui inclut aujourd'hui", () => {
    expect(plageDePeriode("7j", maintenant).debut.toISOString()).toBe("2026-09-21T00:00:00.000Z");
    expect(plageDePeriode("30j", maintenant).debut.toISOString()).toBe("2026-08-29T00:00:00.000Z");
  });

  it("ce mois-ci : du 1er du mois", () => {
    expect(plageDePeriode("mois", maintenant).debut.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("contours embarques", () => {
  it("les 12 departements du referentiel ont chacun un contour, rapproches par le nom sans accent", () => {
    const cles = DEPARTEMENTS_SVG.map((departement) => departement.cle).sort();

    expect(DEPARTEMENTS_SVG).toHaveLength(12);
    expect(cles).toEqual(DEPARTEMENTS_BENIN.map((departement) => normaliserNomDepartement(departement.nom)).sort());
  });

  it("chaque trace tient dans la vue et n'est pas vide", () => {
    for (const departement of DEPARTEMENTS_SVG) {
      expect(departement.d.startsWith("M")).toBe(true);
      expect(departement.centre.x).toBeGreaterThanOrEqual(0);
      expect(departement.centre.x).toBeLessThanOrEqual(LARGEUR_VUE_CARTE);
      expect(departement.centre.y).toBeGreaterThanOrEqual(0);
      expect(departement.centre.y).toBeLessThanOrEqual(HAUTEUR_VUE);
    }
  });

  it("un point du Bas-Benin est au sud-est du nord du pays (y vers le sud)", () => {
    const cotonou = projeter(2.42, 6.37);
    const kandi = projeter(2.94, 11.13);

    expect(cotonou.y).toBeGreaterThan(kandi.y);
  });
});

describe("normaliserNomDepartement", () => {
  it("retire accents et casse", () => {
    expect(normaliserNomDepartement("  Ouémé ")).toBe("oueme");
    expect(normaliserNomDepartement("ATACORA")).toBe("atacora");
  });
});
