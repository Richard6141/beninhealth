import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/notification/actions", () => ({ getMesNotifications: vi.fn() }));
vi.mock("@/modules/transfert/demandes-patient", () => ({ getDemandesAccesRecues: vi.fn() }));
vi.mock("@/modules/prescription/actions", () => ({ getMesPrescriptions: vi.fn() }));
vi.mock("@/modules/laboratoire/actions", () => ({ getMesExamens: vi.fn() }));
vi.mock("@/modules/document/actions", () => ({ getMesDocuments: vi.fn() }));

import { getSession } from "@/lib/session";
import { getMesDocuments } from "@/modules/document/actions";
import { getMesExamens } from "@/modules/laboratoire/actions";
import { getMesNotifications } from "@/modules/notification/actions";
import { getMesPrescriptions } from "@/modules/prescription/actions";
import { getDemandesAccesRecues } from "@/modules/transfert/demandes-patient";
import { getAlertesImportantes, getDerniersDocuments } from "./tableau-de-bord";

const getSessionMock = getSession as unknown as Mock;
const notificationsMock = getMesNotifications as unknown as Mock;
const demandesMock = getDemandesAccesRecues as unknown as Mock;
const prescriptionsMock = getMesPrescriptions as unknown as Mock;
const examensMock = getMesExamens as unknown as Mock;
const documentsMock = getMesDocuments as unknown as Mock;

function notification(surcharge: Record<string, unknown> = {}) {
  return {
    id: "notif-1",
    type: "resultat_examen_disponible",
    message: "Un resultat est disponible.",
    lien: null,
    lu: false,
    date: "2026-09-27T08:00:00.000Z",
    ...surcharge,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  notificationsMock.mockResolvedValue({ notifications: [], curseurSuivant: null });
  demandesMock.mockResolvedValue([]);
  prescriptionsMock.mockResolvedValue([]);
  examensMock.mockResolvedValue([]);
  documentsMock.mockResolvedValue([]);
});

describe("getAlertesImportantes (F-CIT-02)", () => {
  it("renvoie une liste vide sans notification, sans demande et profil complet", async () => {
    expect(await getAlertesImportantes(false)).toEqual([]);
  });

  it("renvoie une liste vide sans session, sans rien lire d'autre", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getAlertesImportantes(true)).toEqual([]);
    expect(notificationsMock).not.toHaveBeenCalled();
    expect(demandesMock).not.toHaveBeenCalled();
  });

  it("reconnait les trois types de notification du pack, non lues seulement", async () => {
    notificationsMock.mockResolvedValue({
      notifications: [
        notification({ id: "n1", type: "resultat_examen_disponible", lu: false }),
        notification({ id: "n2", type: "rendez_vous_annule_par_etablissement", lu: false, date: "2026-09-26T08:00:00.000Z" }),
        notification({ id: "n3", type: "acces_urgence", lu: false, date: "2026-09-25T08:00:00.000Z" }),
        notification({ id: "n4", type: "resultat_examen_disponible", lu: true, date: "2026-09-24T08:00:00.000Z" }),
        notification({ id: "n5", type: "prescription", lu: false, date: "2026-09-23T08:00:00.000Z" }),
      ],
      curseurSuivant: null,
    });

    const alertes = await getAlertesImportantes(false);

    expect(alertes.map((a) => a.type)).toEqual(["resultat_disponible", "rendez_vous_annule", "acces_urgence"]);
  });

  it("utilise le lien de la notification s'il existe, sinon un lien par defaut selon le type", async () => {
    notificationsMock.mockResolvedValue({
      notifications: [
        notification({ type: "resultat_examen_disponible", lien: "/app/patient/examens/xyz" }),
        notification({ id: "n2", type: "acces_urgence", lien: null, date: "2026-09-26T08:00:00.000Z" }),
      ],
      curseurSuivant: null,
    });

    const alertes = await getAlertesImportantes(false);

    expect(alertes.find((a) => a.type === "resultat_disponible")?.lien).toBe("/app/patient/examens/xyz");
    expect(alertes.find((a) => a.type === "acces_urgence")?.lien).toBe("/app/patient/acces");
  });

  it("ajoute une alerte de demande de consentement quand une demande est en attente, avec le bon message au singulier et au pluriel", async () => {
    demandesMock.mockResolvedValue([
      { id: "d1", demandeurNomComplet: "Dr Awa Toure", etablissementNom: "Centre de Parakou", dateCreation: "2026-09-27T09:00:00.000Z" },
    ]);

    const uneSeule = await getAlertesImportantes(false);
    expect(uneSeule).toHaveLength(1);
    expect(uneSeule[0]).toMatchObject({
      type: "consentement_demande",
      message: "Dr Awa Toure (Centre de Parakou) demande l'accès à votre dossier.",
      lien: "/app/patient/demandes-acces",
    });

    demandesMock.mockResolvedValue([
      { id: "d1", demandeurNomComplet: "Dr Awa Toure", etablissementNom: "Centre de Parakou", dateCreation: "2026-09-27T09:00:00.000Z" },
      { id: "d2", demandeurNomComplet: "Inf. Koffi", etablissementNom: "CHU", dateCreation: "2026-09-27T08:00:00.000Z" },
    ]);
    const deux = await getAlertesImportantes(false);
    expect(deux[0].message).toBe("2 demandes d'accès à votre dossier sont en attente.");
  });

  it("ajoute une alerte de profil incomplet seulement quand demande, en dernier recours meme sans date reelle", async () => {
    const sansProfilIncomplet = await getAlertesImportantes(false);
    expect(sansProfilIncomplet.some((a) => a.type === "profil_incomplet")).toBe(false);

    const avecProfilIncomplet = await getAlertesImportantes(true);
    expect(avecProfilIncomplet).toHaveLength(1);
    expect(avecProfilIncomplet[0]).toMatchObject({ type: "profil_incomplet", lien: "/app/patient/dossier" });
  });

  it("trie toutes les alertes confondues de la plus recente a la plus ancienne", async () => {
    notificationsMock.mockResolvedValue({
      notifications: [
        notification({ type: "resultat_examen_disponible", date: "2026-09-20T08:00:00.000Z" }),
        notification({ id: "n2", type: "acces_urgence", date: "2026-09-27T10:00:00.000Z" }),
      ],
      curseurSuivant: null,
    });
    demandesMock.mockResolvedValue([
      { id: "d1", demandeurNomComplet: "Dr X", etablissementNom: "Y", dateCreation: "2026-09-25T08:00:00.000Z" },
    ]);

    const alertes = await getAlertesImportantes(true);

    expect(alertes.map((a) => a.type)).toEqual([
      "acces_urgence",
      "consentement_demande",
      "resultat_disponible",
      "profil_incomplet",
    ]);
  });

  it("plafonne a 5 alertes", async () => {
    notificationsMock.mockResolvedValue({
      notifications: Array.from({ length: 10 }, (_, index) =>
        notification({
          id: `n${index}`,
          type: "resultat_examen_disponible",
          date: new Date(2026, 8, 27 - index).toISOString(),
        })
      ),
      curseurSuivant: null,
    });

    expect(await getAlertesImportantes(false)).toHaveLength(5);
  });
});

describe("getDerniersDocuments (F-CIT-02)", () => {
  it("renvoie une liste vide sans aucune donnee", async () => {
    expect(await getDerniersDocuments()).toEqual([]);
  });

  it("renvoie une liste vide sans session, sans rien lire d'autre", async () => {
    getSessionMock.mockResolvedValue(null);
    prescriptionsMock.mockResolvedValue([{ numero: "RX-2026-0001", date: "2026-09-27T08:00:00.000Z", consultationMotif: "Motif" }]);

    expect(await getDerniersDocuments()).toEqual([]);
    expect(prescriptionsMock).not.toHaveBeenCalled();
  });

  it("fusionne ordonnances, resultats et comptes rendus, tries par date decroissante, limite a 3", async () => {
    prescriptionsMock.mockResolvedValue([
      { numero: "RX-2026-0001", date: "2026-09-20T08:00:00.000Z", consultationMotif: "Fievre" },
    ]);
    examensMock.mockResolvedValue([
      {
        typeExamen: "Glycemie",
        dateResultat: "2026-09-27T08:00:00.000Z",
        laboratoireNom: "Labo Central",
      },
      {
        typeExamen: "Serologie",
        dateResultat: null, // non encore communicable : exclu
        laboratoireNom: "Labo Central",
      },
    ]);
    documentsMock.mockResolvedValue([
      {
        titre: "Compte rendu chirurgie",
        dateDocument: "2026-09-25T08:00:00.000Z",
        auteurNomComplet: "Dr Diallo",
        retirePourErreur: false,
      },
      {
        titre: "Ancien document retire",
        dateDocument: "2026-09-26T08:00:00.000Z",
        auteurNomComplet: "Dr X",
        retirePourErreur: true, // exclu
      },
    ]);

    const documents = await getDerniersDocuments();

    expect(documents).toHaveLength(3);
    expect(documents.map((d) => d.type)).toEqual(["resultat", "compte_rendu", "ordonnance"]);
    expect(documents[0]).toMatchObject({ titre: "Glycemie", lien: "/app/patient/examens" });
  });

  it("exclut un examen sans resultat communicable meme s'il existe", async () => {
    examensMock.mockResolvedValue([{ typeExamen: "VIH", dateResultat: null, laboratoireNom: "Labo" }]);

    expect(await getDerniersDocuments()).toEqual([]);
  });

  it("exclut un document retire pour erreur", async () => {
    documentsMock.mockResolvedValue([
      { titre: "Erreur", dateDocument: "2026-09-27T08:00:00.000Z", auteurNomComplet: "Dr X", retirePourErreur: true },
    ]);

    expect(await getDerniersDocuments()).toEqual([]);
  });

  it("limite a 3 meme avec beaucoup plus de documents disponibles", async () => {
    prescriptionsMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({
        numero: `RX-2026-000${index}`,
        date: new Date(2026, 8, 27 - index).toISOString(),
        consultationMotif: "Motif",
      }))
    );

    expect(await getDerniersDocuments()).toHaveLength(3);
  });
});
