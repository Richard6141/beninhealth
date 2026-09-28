import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * F-RDV-06 (rendez-vous pris au guichet). Couvre la capacite de creneau
 * (F-ETA-05, capaciteDuCreneau + creerAvecCapacite) ainsi que, ajoute le
 * 2026-09-28, l'anti-balayage et le hachage du critere sur la recherche
 * (rechercherPatientGuichetAction) et la notification au patient a la prise
 * de rendez-vous, qui n'avaient jamais ete testes dans ce depot.
 */

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
// Frontiere du module : la logique interne (routage vers le tuteur d'une
// personne a charge) est testee dans son propre fichier
// (facility/destinataire-notification-patient.test.ts), pas ici.
vi.mock("./destinataire-notification-patient", () => ({
  destinataireNotificationPatient: vi.fn(async (patientId: string) => `destinataire-de-${patientId}`),
}));
vi.mock("./creneau-disponible", () => ({
  dateDansUnCreneauDisponible: vi.fn(async () => true),
  capaciteDuCreneau: vi.fn(async () => 1),
}));
vi.mock("./regles-reservation", () => ({ verifierReglesReservation: vi.fn(async () => null) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn(), findFirst: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { count: vi.fn(async () => 0), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { destinataireNotificationPatient } from "./destinataire-notification-patient";
import { capaciteDuCreneau, dateDansUnCreneauDisponible } from "./creneau-disponible";
import { verifierReglesReservation } from "./regles-reservation";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { creerRendezVousGuichetAction, rechercherPatientGuichetAction } from "./rendez-vous-guichet";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock; findFirst: Mock };
  professionnelSante: { findUnique: Mock };
  rendezVous: { count: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const destinataireNotificationPatientMock = destinataireNotificationPatient as unknown as Mock;
const disponibiliteMock = dateDansUnCreneauDisponible as unknown as Mock;
const capaciteMock = capaciteDuCreneau as unknown as Mock;
const reglesMock = verifierReglesReservation as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETAT = { error: null, success: false };
const ETAT_RECHERCHE = { error: null, success: false };
const CHAMPS = { patientId: "pat-1", professionnelId: "pro-1", date: "2026-10-05T09:00", motif: "Controle" };
const RENDEZ_VOUS_CREE = { id: "rdv-1", date: new Date("2026-10-05T08:00:00.000Z") };

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
  prismaMock.professionnelSante.findUnique
    .mockResolvedValueOnce({ id: "admin-prof-1", etablissementId: "etab-1" }) // admin lui-meme
    .mockResolvedValue({ id: "pro-1", etablissementId: "etab-1", statutValidation: "valide" }); // professionnel cible (appels suivants)
  prismaMock.patient.findUnique.mockResolvedValue({
    id: "pat-1",
    dateNaissance: new Date("1990-01-01"),
    user: { prenom: "Awa", nom: "Kponou" },
  });
  disponibiliteMock.mockResolvedValue(true);
  capaciteMock.mockResolvedValue(1);
  reglesMock.mockResolvedValue(null);
  prismaMock.rendezVous.count.mockResolvedValue(0);
  prismaMock.rendezVous.create.mockResolvedValue(RENDEZ_VOUS_CREE);
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

describe("creerRendezVousGuichetAction : notification au patient (F-RDV-06)", () => {
  it("previent le patient de la prise de rendez-vous, routee via destinataireNotificationPatient", async () => {
    await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(destinataireNotificationPatientMock).toHaveBeenCalledWith("pat-1");
    expect(creerNotificationMock).toHaveBeenCalledWith(
      "destinataire-de-pat-1",
      "rendez_vous_confirme",
      expect.stringContaining("rendez-vous"),
      "/app/patient/rendez-vous"
    );
  });

  it("une notification en echec n'empeche jamais la reservation deja actee", async () => {
    creerNotificationMock.mockRejectedValue(new Error("SMS indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await creerRendezVousGuichetAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("rechercherPatientGuichetAction : recherche exacte (RG-ACC-40)", () => {
  it("journalise sans jamais reveler l'identifiant sante en clair dans la justification", async () => {
    await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: "BJ-2026-000042" }));

    const appel = journaliserMock.mock.calls[0][0];
    expect(appel.justification).not.toContain("BJ-2026-000042");
    expect(appel.justification).toMatch(/critere [0-9a-f]{16}/);
  });

  it("journalise sans jamais reveler le telephone ni la date de naissance en clair", async () => {
    prismaMock.patient.findFirst.mockResolvedValue(null);

    await rechercherPatientGuichetAction(
      ETAT_RECHERCHE,
      formulaire({ telephone: "+22997000000", dateNaissance: "1990-01-01" })
    );

    const appel = journaliserMock.mock.calls[0][0];
    expect(appel.justification).not.toContain("+22997000000");
    expect(appel.justification).not.toContain("1990-01-01");
    expect(appel.justification).toMatch(/critere [0-9a-f]{16}/);
  });

  it("la meme empreinte est produite pour le meme identifiant sante (deterministe, pas un salage aleatoire)", async () => {
    await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: "BJ-2026-000042" }));
    const premiere = journaliserMock.mock.calls[0][0].justification as string;

    await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: "BJ-2026-000042" }));
    const seconde = journaliserMock.mock.calls[1][0].justification as string;

    expect(premiere).toBe(seconde);
  });

  it("F-RDV-06 : anti-balayage, refuse au-dela de 30 recherches par heure pour le meme compte d'accueil", async () => {
    for (let i = 0; i < 30; i++) {
      await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: `BJ-${i}` }));
    }
    journaliserMock.mockClear();

    const resultat = await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: "BJ-31" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Trop de recherches");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("la limite de recherches est propre a chaque compte d'accueil", async () => {
    for (let i = 0; i < 30; i++) {
      await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: `BJ-${i}` }));
    }

    getSessionMock.mockResolvedValue({ userId: "admin-2", roles: ["admin_etablissement"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValueOnce({ id: "admin-prof-2", etablissementId: "etab-1" });

    const resultat = await rechercherPatientGuichetAction(ETAT_RECHERCHE, formulaire({ identifiantSante: "BJ-31" }));

    expect(resultat.success).toBe(true);
  });
});
