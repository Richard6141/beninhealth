import { describe, expect, it } from "vitest";
import { construireAnterieurs, type ExamenPourAnterieurs } from "@/modules/laboratoire/anterieurs";

function examen(id: string, jour: string, surcharges: Partial<ExamenPourAnterieurs> = {}): ExamenPourAnterieurs {
  return {
    id,
    patientId: "patient-1",
    typeExamen: "Glycemie a jeun",
    date: new Date(`${jour}T10:00:00Z`),
    statut: "termine",
    resultat: `Resultat ${id}`,
    ...surcharges,
  };
}

describe("construireAnterieurs (F-LAB-04)", () => {
  it("renvoie les resultats valides plus anciens du meme patient et du meme examen, du plus recent au plus ancien", () => {
    const examens = [examen("a", "2026-01-10"), examen("b", "2026-03-10"), examen("c", "2026-06-10"), examen("courant", "2026-09-10", { statut: "resultat_saisi" })];

    const anterieurs = construireAnterieurs(examens, 3)("courant");

    expect(anterieurs.map((x) => x.resultat)).toEqual(["Resultat c", "Resultat b", "Resultat a"]);
  });

  it("limite le nombre d'antecedents aux plus recents", () => {
    const examens = [examen("a", "2026-01-10"), examen("b", "2026-03-10"), examen("c", "2026-06-10"), examen("courant", "2026-09-10", { statut: "resultat_saisi" })];

    expect(construireAnterieurs(examens, 2)("courant").map((x) => x.resultat)).toEqual(["Resultat c", "Resultat b"]);
  });

  it("ignore un autre patient, un autre type d'examen et tout resultat non valide", () => {
    const examens = [
      examen("autre-patient", "2026-01-10", { patientId: "patient-2" }),
      examen("autre-examen", "2026-02-10", { typeExamen: "Creatinine" }),
      examen("non-valide", "2026-03-10", { statut: "resultat_saisi" }),
      examen("annule", "2026-04-10", { statut: "annule" }),
      examen("bon", "2026-05-10"),
      examen("courant", "2026-09-10", { statut: "resultat_saisi" }),
    ];

    expect(construireAnterieurs(examens, 3)("courant").map((x) => x.resultat)).toEqual(["Resultat bon"]);
  });

  it("n'inclut jamais l'examen lui-meme ni un examen plus recent", () => {
    const examens = [examen("ancien", "2026-01-10"), examen("courant", "2026-05-10"), examen("futur", "2026-09-10")];

    expect(construireAnterieurs(examens, 3)("courant").map((x) => x.resultat)).toEqual(["Resultat ancien"]);
    expect(construireAnterieurs(examens, 3)("ancien")).toEqual([]);
  });

  it("renvoie une liste vide pour un examen inconnu ou sans antecedent", () => {
    const examens = [examen("seul", "2026-01-10")];

    expect(construireAnterieurs(examens, 3)("inconnu")).toEqual([]);
    expect(construireAnterieurs(examens, 3)("seul")).toEqual([]);
  });

  it("expose la date de la demande en ISO", () => {
    const examens = [examen("ancien", "2026-01-10"), examen("courant", "2026-05-10")];

    expect(construireAnterieurs(examens, 3)("courant")[0].date).toBe("2026-01-10T10:00:00.000Z");
  });
});
