import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Lecture des rendez-vous du patient connecte (getMesRendezVous) : forme du
 * resume, en particulier les coordonnees GPS de l'etablissement ajoutees pour
 * le lien "Itineraire" du tableau de bord citoyen (F-CIT-02). Memes mocks que
 * actions.rendez-vous.test.ts.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    rendezVous: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getMesRendezVous } from "./actions";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock };
  rendezVous: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function rendezVousCharge(etablissement: Record<string, unknown>) {
  return {
    id: "rdv-1",
    date: new Date("2026-10-01T09:00:00Z"),
    motif: "Consultation",
    statut: "confirme",
    patientId: "pat-1",
    motifRefus: null,
    nombreDeplacements: 0,
    heureArrivee: null,
    etablissement: { nom: "CS Akpakpa", telephoneEtablissement: null, ...etablissement },
    professionnel: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-1" });
});

describe("getMesRendezVous : coordonnees de l'etablissement (F-CIT-02, itineraire)", () => {
  it("expose latitude et longitude de l'etablissement deja charge, sans requete supplementaire", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([rendezVousCharge({ latitude: 6.37, longitude: 2.44 })]);

    const [rdv] = await getMesRendezVous();

    expect(rdv).toMatchObject({ etablissementNom: "CS Akpakpa", etablissementLatitude: 6.37, etablissementLongitude: 2.44 });
    expect(prismaMock.rendezVous.findMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.rendezVous.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { patientId: "pat-1" }, include: expect.objectContaining({ etablissement: true }) })
    );
  });

  it("renvoie des coordonnees nulles quand l'etablissement n'en porte pas", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([rendezVousCharge({})]);

    const [rdv] = await getMesRendezVous();

    expect(rdv).toMatchObject({ etablissementLatitude: null, etablissementLongitude: null });
  });

  it("ne lit aucun rendez-vous sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getMesRendezVous()).toEqual([]);
    expect(prismaMock.rendezVous.findMany).not.toHaveBeenCalled();
  });
});
