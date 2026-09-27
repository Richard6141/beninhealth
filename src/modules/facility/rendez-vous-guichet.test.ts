import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * F-RDV-06 (rendez-vous pris au guichet). Cible ici : la capacite de
 * creneau (F-ETA-05, ajoutee le 2026-09-27, capaciteDuCreneau +
 * creerAvecCapacite) reutilisee par creerRendezVousGuichetAction. Le reste
 * du fichier (recherche patient RG-ACC-40, delai minimum non applique) n'a
 * jamais eu de test dans ce depot ; non repris ici, hors de ma cible.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("./creneau-disponible", () => ({
  dateDansUnCreneauDisponible: vi.fn(async () => true),
  capaciteDuCreneau: vi.fn(async () => 1),
}));
vi.mock("./regles-reservation", () => ({ verifierReglesReservation: vi.fn(async () => null) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { count: vi.fn(async () => 0), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { capaciteDuCreneau, dateDansUnCreneauDisponible } from "./creneau-disponible";
import { verifierReglesReservation } from "./regles-reservation";
import { creerRendezVousGuichetAction } from "./rendez-vous-guichet";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  rendezVous: { count: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const disponibiliteMock = dateDansUnCreneauDisponible as unknown as Mock;
const capaciteMock = capaciteDuCreneau as unknown as Mock;
const reglesMock = verifierReglesReservation as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETAT = { error: null, success: false };
const CHAMPS = { patientId: "pat-1", professionnelId: "pro-1", date: "2026-10-05T09:00", motif: "Controle" };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
  prismaMock.professionnelSante.findUnique
    .mockResolvedValueOnce({ id: "admin-prof-1", etablissementId: "etab-1" }) // admin lui-meme
    .mockResolvedValue({ id: "pro-1", etablissementId: "etab-1", statutValidation: "valide" }); // professionnel cible (appels suivants)
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1" });
  disponibiliteMock.mockResolvedValue(true);
  capaciteMock.mockResolvedValue(1);
  reglesMock.mockResolvedValue(null);
  prismaMock.rendezVous.count.mockResolvedValue(0);
  prismaMock.rendezVous.create.mockResolvedValue({ id: "rdv-1" });
});

describe("creerRendezVousGuichetAction : capacite de creneau (F-ETA-05)", () => {
  it("cree le rendez-vous confirme quand le creneau (capacite 1 par defaut) est libre", async () => {
    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ professionnelId: "pro-1", statut: "confirme" }),
    });
  });

  it("refuse quand le nombre de rendez-vous actifs atteint deja la capacite configuree", async () => {
    capaciteMock.mockResolvedValue(2);
    prismaMock.rendezVous.count.mockResolvedValue(2);

    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: "Ce créneau est déjà pris. Merci de choisir un autre horaire.", success: false });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("autorise un deuxieme patient sur le meme creneau quand la capacite est de 2", async () => {
    capaciteMock.mockResolvedValue(2);
    prismaMock.rendezVous.count.mockResolvedValue(1);

    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledTimes(1);
  });

  it("retente a l'instant candidat suivant (capacite > 1) quand une reservation simultanee a pris le premier instant (P2002)", async () => {
    capaciteMock.mockResolvedValue(2);
    prismaMock.rendezVous.count.mockResolvedValue(0);
    prismaMock.rendezVous.create
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" }))
      .mockResolvedValueOnce({ id: "rdv-2" });

    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledTimes(2);
    const premiereDate = prismaMock.rendezVous.create.mock.calls[0][0].data.date as Date;
    const deuxiemeDate = prismaMock.rendezVous.create.mock.calls[1][0].data.date as Date;
    expect(deuxiemeDate.getTime() - premiereDate.getTime()).toBe(1000);
  });

  it("refuse proprement quand la capacite est reellement epuisee au moment de l'ecriture (P2002 sur la derniere tentative)", async () => {
    capaciteMock.mockResolvedValue(1);
    prismaMock.rendezVous.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" })
    );

    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: "Ce créneau est déjà pris. Merci de choisir un autre horaire.", success: false });
  });

  it("aucune verification de capacite quand aucun professionnel n'est choisi", async () => {
    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire({ ...CHAMPS, professionnelId: "" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(capaciteMock).not.toHaveBeenCalled();
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ professionnelId: null }),
    });
  });
});
