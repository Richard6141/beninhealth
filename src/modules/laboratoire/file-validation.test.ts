import { describe, expect, it } from "vitest";
import { construireFileValidation, type ExamenPourFileValidation } from "./file-validation";

interface ExamenTest extends ExamenPourFileValidation {
  id: string;
}

function examen(partiel: Partial<ExamenTest> & { id: string }): ExamenTest {
  return {
    statut: "resultat_saisi",
    saisiParId: "prof-collegue",
    niveauUrgence: "normal",
    dateResultat: "2026-09-28T08:00:00.000Z",
    date: "2026-09-27T08:00:00.000Z",
    ...partiel,
  };
}

const ids = (liste: readonly ExamenTest[]) => liste.map((e) => e.id);

describe("construireFileValidation (F-LAB-04, file /labo/validation)", () => {
  it("ne retient que les resultats saisis en attente de validation", () => {
    const file = construireFileValidation(
      [
        examen({ id: "a", statut: "resultat_saisi" }),
        examen({ id: "b", statut: "demande" }),
        examen({ id: "c", statut: "en_cours" }),
        examen({ id: "d", statut: "correction_demandee" }),
        examen({ id: "e", statut: "termine" }),
        examen({ id: "f", statut: "annule" }),
      ],
      "moi"
    );

    expect(ids(file.aValider)).toEqual(["a"]);
    expect(file.saisisParMoi).toEqual([]);
  });

  it("quatre yeux : un resultat saisi par le professionnel connecte n'est jamais dans sa liste a valider", () => {
    const file = construireFileValidation(
      [examen({ id: "mien", saisiParId: "moi" }), examen({ id: "collegue", saisiParId: "autre" })],
      "moi"
    );

    expect(ids(file.aValider)).toEqual(["collegue"]);
    expect(ids(file.saisisParMoi)).toEqual(["mien"]);
  });

  it("profil courant introuvable : rien n'est classe comme saisi par moi (le serveur reste seul juge)", () => {
    const file = construireFileValidation([examen({ id: "x", saisiParId: null })], null);

    expect(ids(file.aValider)).toEqual(["x"]);
    expect(file.saisisParMoi).toEqual([]);
  });

  it("urgents d'abord, puis les plus anciennement saisis d'abord", () => {
    const file = construireFileValidation(
      [
        examen({ id: "recent", dateResultat: "2026-09-28T10:00:00.000Z" }),
        examen({ id: "ancien", dateResultat: "2026-09-28T06:00:00.000Z" }),
        examen({ id: "urgent-recent", niveauUrgence: "urgent", dateResultat: "2026-09-28T11:00:00.000Z" }),
        examen({ id: "urgent-ancien", niveauUrgence: "urgent", dateResultat: "2026-09-28T07:00:00.000Z" }),
      ],
      "moi"
    );

    expect(ids(file.aValider)).toEqual(["urgent-ancien", "urgent-recent", "ancien", "recent"]);
  });

  it("sans date de resultat, se replie sur la date de la demande", () => {
    const file = construireFileValidation(
      [
        examen({ id: "avec-date", dateResultat: "2026-09-28T06:00:00.000Z" }),
        examen({ id: "sans-date", dateResultat: null, date: "2026-09-20T06:00:00.000Z" }),
      ],
      "moi"
    );

    expect(ids(file.aValider)).toEqual(["sans-date", "avec-date"]);
  });

  it("ne modifie pas la liste recue", () => {
    const entree = [examen({ id: "2", dateResultat: "2026-09-28T10:00:00.000Z" }), examen({ id: "1", dateResultat: "2026-09-28T06:00:00.000Z" })];
    construireFileValidation(entree, "moi");

    expect(ids(entree)).toEqual(["2", "1"]);
  });
});
