import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/clinical/actions", () => ({ getMesConsultations: vi.fn() }));
vi.mock("@/modules/document/actions", () => ({ getMesDocuments: vi.fn() }));
vi.mock("@/modules/laboratoire/actions", () => ({ getMesExamens: vi.fn() }));
vi.mock("@/modules/prescription/actions", () => ({ getMesPrescriptions: vi.fn() }));
vi.mock("@/modules/vaccination/actions", () => ({ getMesVaccinations: vi.fn() }));

import { getSession } from "@/lib/session";
import { getMesConsultations } from "@/modules/clinical/actions";
import { getMesDocuments } from "@/modules/document/actions";
import { getMesExamens } from "@/modules/laboratoire/actions";
import { getMesPrescriptions } from "@/modules/prescription/actions";
import { getMesVaccinations } from "@/modules/vaccination/actions";
import { NOMBRE_ELEMENTS_PAR_PAGE } from "./chronologie-catalogue";
import { getChronologieDossier, getMaConsultationDetail } from "./chronologie";

const getSessionMock = getSession as unknown as Mock;
const consultationsMock = getMesConsultations as unknown as Mock;
const documentsMock = getMesDocuments as unknown as Mock;
const examensMock = getMesExamens as unknown as Mock;
const prescriptionsMock = getMesPrescriptions as unknown as Mock;
const vaccinationsMock = getMesVaccinations as unknown as Mock;

function consultation(surcharge: Record<string, unknown> = {}) {
  return {
    id: "cons-1",
    date: "2026-09-20T08:00:00.000Z",
    motif: "Fievre",
    professionnelNomComplet: "Dr Awa Toure",
    saisieParErreur: false,
    motifRetrait: null,
    ...surcharge,
  };
}

function prescription(surcharge: Record<string, unknown> = {}) {
  return {
    id: "presc-1",
    date: "2026-09-19T08:00:00.000Z",
    numero: "RX-2026-0001",
    statut: "validee",
    medecinNomComplet: "Dr Awa Toure",
    ...surcharge,
  };
}

function examen(surcharge: Record<string, unknown> = {}) {
  return {
    id: "exam-1",
    date: "2026-09-18T08:00:00.000Z",
    dateResultat: "2026-09-19T08:00:00.000Z",
    typeExamen: "Glycemie",
    statut: "termine",
    sensible: false,
    resultatAnnonceAuPatient: true,
    ...surcharge,
  };
}

function vaccination(surcharge: Record<string, unknown> = {}) {
  return {
    id: "vac-1",
    dateAdministration: "2026-09-17T08:00:00.000Z",
    vaccin: "BCG",
    numeroDose: 1,
    lieu: "etablissement",
    etablissementNom: "Centre de Cotonou",
    saisieParErreur: false,
    motifRetrait: null,
    ...surcharge,
  };
}

function document(surcharge: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    dateDocument: "2026-09-16T08:00:00.000Z",
    titre: "Compte rendu",
    auteurNomComplet: "Dr Diallo",
    retirePourErreur: false,
    motifRetrait: null,
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  consultationsMock.mockResolvedValue([]);
  documentsMock.mockResolvedValue([]);
  examensMock.mockResolvedValue([]);
  prescriptionsMock.mockResolvedValue([]);
  vaccinationsMock.mockResolvedValue([]);
});

describe("getChronologieDossier (F-CIT-03)", () => {
  it("renvoie une page vide sans session, sans rien lire", async () => {
    getSessionMock.mockResolvedValue(null);

    const page = await getChronologieDossier();

    expect(page).toEqual({ elements: [], page: 1, nombrePages: 1, totalElements: 0, anneesDisponibles: [] });
    expect(consultationsMock).not.toHaveBeenCalled();
  });

  it("fusionne les cinq sources, du plus recent au plus ancien", async () => {
    consultationsMock.mockResolvedValue([consultation()]);
    prescriptionsMock.mockResolvedValue([prescription()]);
    examensMock.mockResolvedValue([examen()]);
    vaccinationsMock.mockResolvedValue([vaccination()]);
    documentsMock.mockResolvedValue([document()]);

    const page = await getChronologieDossier();

    expect(page.elements.map((e) => e.type)).toEqual(["consultation", "ordonnance", "resultat", "vaccination", "document"]);
    expect(page.totalElements).toBe(5);
  });

  it("filtre par type", async () => {
    consultationsMock.mockResolvedValue([consultation()]);
    vaccinationsMock.mockResolvedValue([vaccination()]);

    const page = await getChronologieDossier({ type: "vaccination" });

    expect(page.elements).toHaveLength(1);
    expect(page.elements[0].type).toBe("vaccination");
    expect(page.totalElements).toBe(1);
  });

  it("filtre par annee", async () => {
    consultationsMock.mockResolvedValue([
      consultation({ id: "c2025", date: "2025-05-01T08:00:00.000Z" }),
      consultation({ id: "c2026", date: "2026-05-01T08:00:00.000Z" }),
    ]);

    const page2025 = await getChronologieDossier({ annee: 2025 });
    expect(page2025.elements.map((e) => e.id)).toEqual(["c2025"]);

    const page2026 = await getChronologieDossier({ annee: 2026 });
    expect(page2026.elements.map((e) => e.id)).toEqual(["c2026"]);
  });

  it("liste les annees disponibles avant filtre, plus recente d'abord", async () => {
    consultationsMock.mockResolvedValue([
      consultation({ id: "c2023", date: "2023-05-01T08:00:00.000Z" }),
      consultation({ id: "c2026", date: "2026-05-01T08:00:00.000Z" }),
    ]);
    vaccinationsMock.mockResolvedValue([vaccination({ dateAdministration: "2024-01-01T08:00:00.000Z" })]);

    const page = await getChronologieDossier({ type: "vaccination" });

    expect(page.anneesDisponibles).toEqual([2026, 2024, 2023]);
  });

  it("pagine a 20 elements, page 2 renvoie le reste", async () => {
    expect(NOMBRE_ELEMENTS_PAR_PAGE).toBe(20);
    consultationsMock.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) =>
        consultation({ id: `c${index}`, date: new Date(2026, 0, 25 - index).toISOString() })
      )
    );

    const page1 = await getChronologieDossier({ page: 1 });
    expect(page1.elements).toHaveLength(20);
    expect(page1.nombrePages).toBe(2);
    expect(page1.totalElements).toBe(25);

    const page2 = await getChronologieDossier({ page: 2 });
    expect(page2.elements).toHaveLength(5);
  });

  it("ramene une page hors bornes a la derniere page valide", async () => {
    consultationsMock.mockResolvedValue([consultation()]);

    const page = await getChronologieDossier({ page: 99 });

    expect(page.page).toBe(1);
    expect(page.elements).toHaveLength(1);
  });

  describe("RG-CIT-20 : resultat non communicable", () => {
    it("affiche le libelle de reserve pour un examen sensible non annonce", async () => {
      examensMock.mockResolvedValue([
        examen({ sensible: true, resultatAnnonceAuPatient: false, resultat: null, dateResultat: null }),
      ]);

      const page = await getChronologieDossier();

      expect(page.elements[0].soustitre).toBe("Un resultat vous sera communique par votre medecin");
    });

    it("affiche le resultat normalement quand il est communicable", async () => {
      const page = await getChronologieDossier({}); // examen() par defaut : non sensible, termine
      examensMock.mockResolvedValue([examen()]);

      const page2 = await getChronologieDossier();
      expect(page2.elements[0].soustitre).toBe("Resultat disponible");
      void page;
    });

    it("affiche 'en attente' pour un examen pas encore termine", async () => {
      examensMock.mockResolvedValue([examen({ statut: "en_cours", dateResultat: null })]);

      const page = await getChronologieDossier();

      expect(page.elements[0].soustitre).toBe("Examen en attente de resultat");
    });
  });

  describe("RG-CIT-22 : elements retires apparaissent marques", () => {
    it("consultation retiree", async () => {
      consultationsMock.mockResolvedValue([consultation({ saisieParErreur: true, motifRetrait: "Erreur de saisie" })]);

      const page = await getChronologieDossier();

      expect(page.elements[0].retire).toBe(true);
      expect(page.elements[0].mentionRetrait).toBe("Retiree : Erreur de saisie");
    });

    it("vaccination retiree", async () => {
      vaccinationsMock.mockResolvedValue([vaccination({ saisieParErreur: true, motifRetrait: "Mauvaise dose" })]);

      const page = await getChronologieDossier();

      expect(page.elements[0].retire).toBe(true);
      expect(page.elements[0].mentionRetrait).toBe("Retiree : Mauvaise dose");
    });

    it("document retire", async () => {
      documentsMock.mockResolvedValue([document({ retirePourErreur: true, motifRetrait: "Mauvais patient" })]);

      const page = await getChronologieDossier();

      expect(page.elements[0].retire).toBe(true);
      expect(page.elements[0].mentionRetrait).toBe("Retire : Mauvais patient");
    });

    it("ordonnance annulee ou arretee", async () => {
      prescriptionsMock.mockResolvedValue([prescription({ statut: "annulee" })]);
      const pageAnnulee = await getChronologieDossier();
      expect(pageAnnulee.elements[0].retire).toBe(true);
      expect(pageAnnulee.elements[0].mentionRetrait).toBe("Annulee");

      prescriptionsMock.mockResolvedValue([prescription({ statut: "arretee" })]);
      const pageArretee = await getChronologieDossier();
      expect(pageArretee.elements[0].retire).toBe(true);
      expect(pageArretee.elements[0].mentionRetrait).toBe("Arretee");

      prescriptionsMock.mockResolvedValue([prescription({ statut: "validee" })]);
      const pageValidee = await getChronologieDossier();
      expect(pageValidee.elements[0].retire).toBe(false);
    });

    it("examen annule", async () => {
      examensMock.mockResolvedValue([examen({ statut: "annule" })]);

      const page = await getChronologieDossier();

      expect(page.elements[0].retire).toBe(true);
      expect(page.elements[0].mentionRetrait).toBe("Examen annule");
    });
  });

  it("un element de consultation renvoie vers le detail, les autres vers leur ecran existant", async () => {
    consultationsMock.mockResolvedValue([consultation({ id: "cons-42" })]);
    prescriptionsMock.mockResolvedValue([prescription()]);
    examensMock.mockResolvedValue([examen()]);
    documentsMock.mockResolvedValue([document({ id: "doc-42" })]);

    const page = await getChronologieDossier();
    const parType = Object.fromEntries(page.elements.map((e) => [e.type, e.lien]));

    expect(parType.consultation).toBe("/app/patient/dossier/consultation/cons-42");
    expect(parType.ordonnance).toBe("/app/patient/prescriptions");
    expect(parType.resultat).toBe("/app/patient/examens");
    expect(parType.document).toBe("/api/documents/doc-42");
  });
});

describe("getMaConsultationDetail (F-CIT-03)", () => {
  it("renvoie null sans session, sans rien lire", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getMaConsultationDetail("cons-1")).toBeNull();
    expect(consultationsMock).not.toHaveBeenCalled();
  });

  it("renvoie null pour une consultation introuvable ou n'appartenant pas au patient", async () => {
    consultationsMock.mockResolvedValue([consultation({ id: "cons-1" })]);

    expect(await getMaConsultationDetail("cons-autre")).toBeNull();
  });

  it("renvoie la consultation avec les ordonnances et examens lies, les autres exclus", async () => {
    consultationsMock.mockResolvedValue([consultation({ id: "cons-1" })]);
    prescriptionsMock.mockResolvedValue([
      prescription({ id: "presc-lie", consultationId: "cons-1" }),
      prescription({ id: "presc-autre", consultationId: "cons-2" }),
    ]);
    examensMock.mockResolvedValue([
      examen({ id: "exam-lie", consultationId: "cons-1" }),
      examen({ id: "exam-autre", consultationId: "cons-2" }),
      examen({ id: "exam-sans-lien", consultationId: null }),
    ]);

    const detail = await getMaConsultationDetail("cons-1");

    expect(detail?.consultation.id).toBe("cons-1");
    expect(detail?.prescriptions.map((p) => p.id)).toEqual(["presc-lie"]);
    expect(detail?.examens.map((e) => e.id)).toEqual(["exam-lie"]);
  });

  it("ne renvoie aucune ordonnance ni examen quand aucun n'est lie", async () => {
    consultationsMock.mockResolvedValue([consultation({ id: "cons-1" })]);
    prescriptionsMock.mockResolvedValue([prescription({ id: "presc-autre", consultationId: "cons-2" })]);

    const detail = await getMaConsultationDetail("cons-1");

    expect(detail?.prescriptions).toEqual([]);
    expect(detail?.examens).toEqual([]);
  });
});
