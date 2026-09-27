import { describe, expect, it } from "vitest";
import {
  analyserSerie,
  analyserSeries,
  construireSeriesHebdomadaires,
  dispersionRobuste,
  lundiDe,
  lundisDesSemainesCompletes,
  mediane,
  NOMBRE_MAXIMUM_SIGNAUX,
  type SerieHebdomadaire,
} from "@/modules/ai/analyse-agregats";
import { executerJeuAnalyse, JEU_ANALYSE } from "@/modules/ai/jeu-evaluation-analyse";

function serie(valeurs: number[], territoire = "Atlantique", code = "IND-01", libelle = "Consultations"): SerieHebdomadaire {
  return {
    code,
    libelle,
    territoire,
    semaines: valeurs.map((valeur, index) => ({ debut: new Date(Date.UTC(2026, 5, 1 + index * 7)).toISOString().slice(0, 10), valeur })),
  };
}

describe("jeu d'evaluation de l'analyse des agregats (F-IA-04, RG-IA-20)", () => {
  it("passe sur tous les cas fictifs, masquage compris", () => {
    const resultat = executerJeuAnalyse();

    expect(resultat.echecs).toEqual([]);
    expect(resultat.conformes).toBe(resultat.total);
    expect(resultat.total).toBe(JEU_ANALYSE.length);
  });
});

describe("statistiques robustes", () => {
  it("mediane d'un nombre pair et impair de valeurs", () => {
    expect(mediane([3, 1, 2])).toBe(2);
    expect(mediane([4, 1, 3, 2])).toBe(2.5);
    expect(mediane([])).toBe(0);
  });

  it("la dispersion n'est jamais nulle, meme sur une serie constante", () => {
    expect(dispersionRobuste([50, 50, 50, 50, 50, 50])).toBeGreaterThanOrEqual(Math.sqrt(50));
    expect(dispersionRobuste([0, 0, 0, 0, 0])).toBe(1);
  });

  it("une valeur extreme ne fausse pas la dispersion (resistance de la MAD)", () => {
    const sans = dispersionRobuste([40, 42, 39, 41, 38, 40, 43, 41]);
    const avec = dispersionRobuste([40, 42, 39, 41, 38, 40, 43, 900]);

    expect(avec).toBeLessThan(sans * 2);
  });
});

describe("pics et chutes de la derniere semaine", () => {
  it("un pic net est signale avec son explication chiffree", () => {
    const [signal] = analyserSerie(serie([40, 42, 39, 41, 38, 40, 43, 41, 95]));

    expect(signal.type).toBe("pic");
    expect(signal.observe).toBe(95);
    expect(signal.attendu).toBe(40.5);
    expect(signal.explication).toContain("95 consultations");
    expect(signal.explication).toContain("médiane de 40.5");
    expect(signal.explication).toContain("seuil de 3");
  });

  it("moins de 10 unites observees : jamais de pic, meme relatif", () => {
    expect(analyserSerie(serie([2, 2, 3, 2, 3, 2, 3, 2, 9]))).toEqual([]);
  });

  it("une chute n'est signalee que sur une activite habituelle d'au moins 20", () => {
    expect(analyserSerie(serie([60, 62, 58, 61, 59, 60, 63, 61, 12])).map((signal) => signal.type)).toEqual(["chute"]);
    expect(analyserSerie(serie([10, 12, 11, 10, 9, 12, 11, 10, 0]))).toEqual([]);
  });

  it("une mediane inferieure a 5 est masquee et aucun score exact n'est donne (RG-PIL-02)", () => {
    const [signal] = analyserSerie(serie([3, 3, 3, 4, 3, 3, 4, 3, 30]));

    expect(signal.type).toBe("pic");
    expect(signal.attendu).toBe("< 5");
    expect(signal.mesure).toBe(3);
    expect(signal.explication).toContain("médiane inférieure à 5");
    expect(signal.explication).toContain("valeur exacte non affichée");
    expect(signal.explication).not.toMatch(/médiane de [1-4]/);
  });

  it("une chute vers un effectif inferieur a 5 masque la valeur observee", () => {
    const [signal] = analyserSerie(serie([40, 42, 39, 41, 38, 40, 43, 41, 2]));

    expect(signal.type).toBe("chute");
    expect(signal.observe).toBe("< 5");
    expect(signal.explication).toContain("moins de 5 consultations");
    expect(signal.mesure).toBe(-3);
  });

  it("moins de 6 semaines d'historique : aucune conclusion (jamais simulee)", () => {
    expect(analyserSerie(serie([40, 41, 90]))).toEqual([]);
    expect(analyserSerie(serie([40, 41, 42, 43, 90]))).toEqual([]);
  });

  it("la reference est constituee des 8 semaines qui precedent, pas de toute la serie", () => {
    const [signal] = analyserSerie(serie([500, 500, 500, 500, 40, 42, 39, 41, 38, 40, 43, 41, 95]));

    expect(signal.attendu).toBe(40.5);
    expect(signal.explication).toContain("8 semaines précédentes");
  });
});

describe("tendances sur 8 semaines", () => {
  it("une hausse continue est signalee avec ses moyennes et ses variations", () => {
    const signaux = analyserSerie(serie([20, 22, 26, 29, 35, 41, 48, 56]));

    const hausse = signaux.find((signal) => signal.type === "hausse");
    expect(hausse?.mesure).toBeGreaterThanOrEqual(30);
    expect(hausse?.explication).toContain("8 dernières semaines");
    expect(hausse?.explication).toContain("7 hausses sur 7");
  });

  it("une baisse continue est signalee", () => {
    expect(analyserSerie(serie([80, 72, 66, 58, 50, 45, 38, 30])).map((signal) => signal.type)).toContain("baisse");
  });

  it("une variation forte mais en dents de scie n'est ni une tendance ni un pic : 50 est une valeur habituelle de cette serie", () => {
    expect(analyserSerie(serie([30, 50, 30, 50, 30, 50, 30, 50]))).toEqual([]);
    expect(analyserSerie(serie([30, 50, 30, 50, 30, 50, 30, 50, 50]))).toEqual([]);
  });

  it("une moyenne de depart inferieure a 5 ecarte le signal : le pourcentage permettrait de retrouver la valeur masquee", () => {
    expect(analyserSerie(serie([1, 1, 2, 2, 8, 12, 20, 30])).filter((signal) => signal.type === "hausse")).toEqual([]);
  });
});

describe("analyserSeries", () => {
  it("classe les pics avant les tendances, puis par intensite, et plafonne la liste", () => {
    const beaucoup = Array.from({ length: 40 }, (_, index) => serie([40, 42, 39, 41, 38, 40, 43, 41, 95 + index], `Territoire ${String(index).padStart(2, "0")}`));
    const signaux = analyserSeries([serie([20, 22, 26, 29, 35, 41, 48, 56], "Zou"), ...beaucoup]);

    expect(signaux).toHaveLength(NOMBRE_MAXIMUM_SIGNAUX);
    expect(signaux[0].type).toBe("pic");
    expect(Math.abs(signaux[0].mesure)).toBeGreaterThanOrEqual(Math.abs(signaux[1].mesure));
  });

  it("un signal ne contient que des champs agreges", () => {
    for (const signal of analyserSeries([serie([40, 42, 39, 41, 38, 40, 43, 41, 95])])) {
      expect(Object.keys(signal).sort()).toEqual(["attendu", "code", "explication", "libelle", "mesure", "observe", "semaine", "territoire", "type"]);
    }
  });
});

describe("construction des series a partir des agregats quotidiens", () => {
  it("lundiDe renvoie le lundi de la semaine (dimanche compris)", () => {
    expect(lundiDe(new Date("2026-09-27T10:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(lundiDe(new Date("2026-09-21T00:00:00Z")).toISOString().slice(0, 10)).toBe("2026-09-21");
    expect(lundiDe(new Date("2026-09-24T23:59:00Z")).toISOString().slice(0, 10)).toBe("2026-09-21");
  });

  it("les semaines completes excluent la semaine en cours (le dimanche 27, la semaine du 21 n'est pas terminee)", () => {
    const lundis = lundisDesSemainesCompletes(new Date("2026-09-27T10:00:00Z"), 3);

    expect(lundis).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
  });

  it("somme par territoire et par semaine, completant les semaines vides par 0", () => {
    const lundis = ["2026-09-07", "2026-09-14", "2026-09-21"];
    const territoires = new Map([["d1", "Atlantique"], ["d2", "Zou"]]);

    const series = construireSeriesHebdomadaires(
      [
        { territoireId: "d1", date: new Date("2026-09-07T00:00:00Z"), valeur: 10 },
        { territoireId: "d1", date: new Date("2026-09-09T00:00:00Z"), valeur: 5 },
        { territoireId: "d1", date: new Date("2026-09-21T00:00:00Z"), valeur: 7 },
        { territoireId: "d2", date: new Date("2026-09-15T00:00:00Z"), valeur: 4 },
        { territoireId: "d2", date: new Date("2026-08-01T00:00:00Z"), valeur: 99 },
        { territoireId: "inconnu", date: new Date("2026-09-15T00:00:00Z"), valeur: 50 },
      ],
      lundis,
      territoires,
      { code: "IND-01", libelle: "Consultations" }
    );

    expect(series.find((s) => s.territoire === "Atlantique")?.semaines.map((s) => s.valeur)).toEqual([15, 0, 7]);
    expect(series.find((s) => s.territoire === "Zou")?.semaines.map((s) => s.valeur)).toEqual([0, 4, 0]);
    expect(series).toHaveLength(2);
  });

  it("un territoire sans aucune activite sur la fenetre n'a pas de serie", () => {
    const series = construireSeriesHebdomadaires(
      [{ territoireId: "d1", date: new Date("2026-01-01T00:00:00Z"), valeur: 10 }],
      ["2026-09-07"],
      new Map([["d1", "Atlantique"]]),
      { code: "IND-01", libelle: "Consultations" }
    );

    expect(series).toEqual([]);
  });
});
