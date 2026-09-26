import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    examenMedical: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { saisirResultatExamenAction } from "@/modules/laboratoire/actions";
import { REFERENTIEL_EXAMENS } from "@/modules/laboratoire/referentiel-examens";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  examenMedical: { findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;

const libelleGlycemie = REFERENTIEL_EXAMENS.find((e) => e.code === "GLYCEMIE")!.libelle;
const libelleSansParametres = "Examen hors referentiel structure";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const etatInitial = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "labo-1", roles: ["laboratoire"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-labo", etablissementId: "labo-etab" });
  p.examenMedical.findUnique.mockResolvedValue({
    id: "ex-1",
    laboratoireId: "labo-etab",
    statut: "en_cours",
    typeExamen: libelleGlycemie,
    patient: { sexe: "F" },
    resultat: null,
    commentaireValidation: null,
  });
});

describe("saisirResultatExamenAction : saisie structuree par parametre (F-LAB-03)", () => {
  it("regression : les valeurs du formulaire (parametresJson) atteignent l'action et le resultat est enregistre", async () => {
    const valeurs = JSON.stringify([{ code: "GLYCEMIE_JEUN", valeur: "0,9" }]);
    const resultat = await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", resultat: "", parametresJson: valeurs }));

    expect(resultat).toEqual({ error: null, success: true });
    const donnees = p.examenMedical.update.mock.calls[0][0].data;
    expect(donnees.statut).toBe("resultat_saisi");
    expect(donnees.resultatsParametres).toEqual([
      expect.objectContaining({ code: "GLYCEMIE_JEUN", valeur: 0.9, indicateur: "N" }),
    ]);
    expect(donnees.resultat).toContain("Glycémie à jeun : 0.9 g/L");
  });

  it("chez un enfant, la plage adulte est marquee et l'hemoglobine utilise le seuil OMS de l'age", async () => {
    const dateNaissance = new Date();
    dateNaissance.setFullYear(dateNaissance.getFullYear() - 8);
    p.examenMedical.findUnique.mockResolvedValue({
      id: "ex-1",
      laboratoireId: "labo-etab",
      statut: "en_cours",
      typeExamen: REFERENTIEL_EXAMENS.find((e) => e.code === "TAUX_HEMOGLOBINE")!.libelle,
      patient: { sexe: "M", dateNaissance },
      resultat: null,
      commentaireValidation: null,
    });

    await saisirResultatExamenAction(
      etatInitial,
      formulaire({ examenId: "ex-1", parametresJson: JSON.stringify([{ code: "HEMOGLOBINE", valeur: "11.7" }]) })
    );

    const donnees = p.examenMedical.update.mock.calls[0][0].data;
    expect(donnees.resultatsParametres[0]).toMatchObject({ indicateur: "N" });
    expect(donnees.resultatsParametres[0]).not.toHaveProperty("referenceAdulteParDefaut");

    p.examenMedical.findUnique.mockResolvedValue({
      id: "ex-1",
      laboratoireId: "labo-etab",
      statut: "en_cours",
      typeExamen: libelleGlycemie,
      patient: { sexe: "M", dateNaissance },
      resultat: null,
      commentaireValidation: null,
    });
    await saisirResultatExamenAction(
      etatInitial,
      formulaire({ examenId: "ex-1", parametresJson: JSON.stringify([{ code: "GLYCEMIE_JEUN", valeur: "0.9" }]) })
    );

    const enfantGlycemie = p.examenMedical.update.mock.calls[1][0].data;
    expect(enfantGlycemie.resultatsParametres[0].referenceAdulteParDefaut).toBe(true);
    expect(enfantGlycemie.resultat).toContain("reference adulte");
  });

  it("une valeur trop haute donne l'indicateur H sans bloquer la saisie", async () => {
    const valeurs = JSON.stringify([{ code: "GLYCEMIE_JEUN", valeur: "1.5" }]);
    await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: valeurs }));
    expect(p.examenMedical.update.mock.calls[0][0].data.resultatsParametres[0].indicateur).toBe("H");
  });

  it("refuse une valeur physiologiquement impossible (RG-LAB-20), sans rien enregistrer", async () => {
    const valeurs = JSON.stringify([{ code: "GLYCEMIE_JEUN", valeur: "50" }]);
    const resultat = await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: valeurs }));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("physiologiquement");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("refuse une valeur manquante, non numerique, ou un JSON illisible", async () => {
    expect((await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: "[]" }))).error).toContain("obligatoire");
    expect(
      (await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: JSON.stringify([{ code: "GLYCEMIE_JEUN", valeur: "abc" }]) }))).error
    ).toContain("nombre");
    expect((await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: "pas du json" }))).error).toContain("Format");
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("un examen hors du referentiel structure garde la saisie en texte libre", async () => {
    p.examenMedical.findUnique.mockResolvedValue({
      id: "ex-2",
      laboratoireId: "labo-etab",
      statut: "en_cours",
      typeExamen: libelleSansParametres,
      patient: { sexe: "M" },
      resultat: null,
      commentaireValidation: null,
    });
    const resultat = await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-2", resultat: "Negatif" }));
    expect(resultat.success).toBe(true);
    expect(p.examenMedical.update.mock.calls[0][0].data.resultat).toBe("Negatif");
  });

  it("refuse un role autre que laboratoire", async () => {
    getSessionMock.mockResolvedValue({ userId: "m", roles: ["medecin"] });
    const resultat = await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: "[]" }));
    expect(resultat.success).toBe(false);
    expect(p.examenMedical.update).not.toHaveBeenCalled();
  });

  it("refuse l'examen d'un autre laboratoire", async () => {
    p.examenMedical.findUnique.mockResolvedValue({ id: "ex-1", laboratoireId: "autre", statut: "en_cours", typeExamen: libelleGlycemie, patient: { sexe: "F" } });
    const resultat = await saisirResultatExamenAction(etatInitial, formulaire({ examenId: "ex-1", parametresJson: "[]" }));
    expect(resultat.success).toBe(false);
  });
});
