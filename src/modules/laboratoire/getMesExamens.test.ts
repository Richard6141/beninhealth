import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    examenMedical: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getMesExamens } from "@/modules/laboratoire/actions";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  examenMedical: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function examen(surcharges: Record<string, unknown> = {}) {
  return {
    id: "ex-1",
    numero: "LB-2026-0001",
    consultationId: null,
    renseignementsCliniques: null,
    typeExamen: "Glycémie à jeun",
    date: new Date("2026-09-20T08:00:00Z"),
    statut: "termine",
    resultat: "Resultat texte libre",
    resultatsParametres: null,
    dateResultat: new Date("2026-09-21T08:00:00Z"),
    laboratoire: { nom: "Labo Central" },
    sensible: false,
    resultatAnnonceAuPatient: false,
    identiteVerifiee: true,
    datePrelevement: null,
    typeEchantillon: null,
    identifiantEchantillon: null,
    motifRejetEchantillon: null,
    niveauUrgence: "normale",
    aJeunRequis: false,
    versionResultat: 1,
    demandeur: { user: { nom: "Kponou", prenom: "Awa" } },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-patient" });
  p.patient.findUnique.mockResolvedValue({
    id: "pat-1",
    userId: "user-patient",
    sexe: "F",
    dateNaissance: new Date("1990-01-01T00:00:00Z"),
  });
  p.examenMedical.findMany.mockResolvedValue([examen()]);
});

describe("getMesExamens (F-CIT-06 : resultat structure et masquage RG-CIT-20)", () => {
  it("renvoie un tableau vide sans session ou sans profil patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getMesExamens()).toEqual([]);
  });

  it("masque resultat, dateResultat ET resultatsParametres pour un examen non termine", async () => {
    p.examenMedical.findMany.mockResolvedValue([
      examen({
        statut: "en_cours",
        resultatsParametres: [{ code: "GLYCEMIE_JEUN", libelle: "Glycémie à jeun", unite: "g/L", valeur: 0.9, indicateur: "N" }],
      }),
    ]);

    const [resume] = await getMesExamens();

    expect(resume.resultat).toBeNull();
    expect(resume.dateResultat).toBeNull();
    expect(resume.resultatsParametres).toBeNull();
  });

  it("masque aussi resultatsParametres pour un examen sensible non encore annonce (RG-CIT-20, meme si termine)", async () => {
    p.examenMedical.findMany.mockResolvedValue([
      examen({
        sensible: true,
        resultatAnnonceAuPatient: false,
        resultatsParametres: [{ code: "GLYCEMIE_JEUN", libelle: "Glycémie à jeun", unite: "g/L", valeur: 0.9, indicateur: "N" }],
      }),
    ]);

    const [resume] = await getMesExamens();

    expect(resume.resultat).toBeNull();
    expect(resume.resultatsParametres).toBeNull();
  });

  it("laisse le resultat texte visible, sans resultatsParametres, quand l'examen n'a pas de parametres structures", async () => {
    const [resume] = await getMesExamens();

    expect(resume.resultat).toBe("Resultat texte libre");
    expect(resume.resultatsParametres).toBeNull();
  });

  it("enrichit chaque parametre structure d'une plage normale ajustee au sexe du patient, sans toucher a l'indicateur deja calcule", async () => {
    p.examenMedical.findMany.mockResolvedValue([
      examen({
        resultatsParametres: [
          { code: "HEMOGLOBINE", libelle: "Hemoglobine", unite: "g/dL", valeur: 13, indicateur: "N" },
        ],
      }),
    ]);

    const [resume] = await getMesExamens();

    expect(resume.resultatsParametres).toEqual([
      {
        code: "HEMOGLOBINE",
        libelle: "Hemoglobine",
        unite: "g/dL",
        valeur: 13,
        indicateur: "N",
        plageNormaleAffichee: { min: 12, max: 15.5 },
      },
    ]);
  });

  it("plage normale null pour un code de parametre absent du referentiel (snapshot ancien ou externe), sans faire echouer la lecture", async () => {
    p.examenMedical.findMany.mockResolvedValue([
      examen({
        resultatsParametres: [
          { code: "CODE_INCONNU", libelle: "Parametre disparu", unite: "u", valeur: 1, indicateur: "N" },
        ],
      }),
    ]);

    const [resume] = await getMesExamens();

    expect(resume.resultatsParametres?.[0].plageNormaleAffichee).toBeNull();
  });
});
