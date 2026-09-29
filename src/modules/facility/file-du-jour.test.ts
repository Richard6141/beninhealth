import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * F-RDV-04 (file du jour et arrivee), RG-RDV-33 : fenetre d'arrivee de 2h
 * avant a 1h apres l'heure du rendez-vous, verifiee dans
 * enregistrerArriveeAction. Prisma est simule, meme patron que
 * actions.rendez-vous.test.ts / rendez-vous-guichet.test.ts.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { enregistrerArriveeAction } from "./file-du-jour";
import { TRANSITIONS } from "./rendez-vous-etats";
import { MESSAGE_ARRIVEE_HORS_FENETRE } from "./regles-rendez-vous";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  rendezVous: { findUnique: Mock; updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const ETAT = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const HEURE = 3600_000;
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);

function formulaire(rendezVousId: string): FormData {
  const formData = new FormData();
  formData.set("rendezVousId", rendezVousId);
  return formData;
}

function rendezVous(surcharges: Record<string, unknown> = {}) {
  return {
    id: "rdv-1",
    etablissementId: "etab-1",
    statut: "confirme",
    date: MAINTENANT,
    heureArrivee: null,
    ...surcharges,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "admin-prof-1", etablissementId: "etab-1" });
  prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.rendezVous.findUnique.mockImplementation(async (args: { select?: unknown }) =>
    args.select ? { date: MAINTENANT, etablissementId: "etab-1" } : rendezVous()
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("RG-RDV-33 : fenetre d'arrivee (2h avant a 1h apres)", () => {
  it("accepte une arrivee bien avant l'heure du rendez-vous (dans la fenetre)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(30 * 60_000) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("accepte une arrivee bien apres l'heure du rendez-vous (dans la fenetre)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(-30 * 60_000) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("accepte pile a la borne des 2 heures avant", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(2 * HEURE) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("refuse juste au-dela des 2 heures avant", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(2 * HEURE + 1) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: MESSAGE_ARRIVEE_HORS_FENETRE, success: false });
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("accepte pile a la borne de l'heure apres", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(-HEURE) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("refuse juste au-dela de l'heure apres", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(-HEURE - 1) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: MESSAGE_ARRIVEE_HORS_FENETRE, success: false });
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });

  it("refuse la correction d'un rendez-vous deja marque absent hors fenetre (pas de derogation accueil)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(
      rendezVous({ statut: "absent", date: dans(-3 * HEURE) })
    );

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: MESSAGE_ARRIVEE_HORS_FENETRE, success: false });
  });

  it("accepte encore la correction d'un rendez-vous marque absent dans la fenetre", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(
      rendezVous({ statut: "absent", date: dans(-30 * 60_000) })
    );

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("un rendez-vous deja termine garde son message de cloture, pas celui de la fenetre horaire", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ statut: "termine", date: dans(-3 * HEURE) }));
    prismaMock.rendezVous.updateMany.mockResolvedValueOnce({ count: 0 });

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: TRANSITIONS.enregistrer_arrivee.refus, success: false });
  });

  it("refuse aussi un rendez-vous du jour meme sans marge : l'heure precise du rendez-vous fait toujours foi", async () => {
    // Rendez-vous pris au guichet (F-RDV-06) le jour meme, heure precise proche :
    // la fenetre s'applique de la meme facon, aucun traitement special.
    prismaMock.rendezVous.findUnique.mockResolvedValueOnce(rendezVous({ date: dans(3 * HEURE) }));

    const resultat = await enregistrerArriveeAction(ETAT, formulaire("rdv-1"));

    expect(resultat).toEqual({ error: MESSAGE_ARRIVEE_HORS_FENETRE, success: false });
  });
});
