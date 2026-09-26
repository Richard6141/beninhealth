import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * RG-ETA-42 : un jour ferie actif ne genere aucun creneau. Faux stockage des
 * jours feries qui applique le filtre de la requete (date ET actif), comme
 * SQL : un jour desactive ou une annee non generee ne bloque rien.
 */

const joursFeries: { date: Date; actif: boolean }[] = [];

vi.mock("@/lib/prisma", () => {
  const prisma = {
    creneauDisponibilite: { findMany: vi.fn() },
    jourFerie: {
      findFirst: vi.fn(async ({ where }: { where: { date: Date; actif: boolean } }) => {
        const trouve = joursFeries.find(
          (jour) => jour.date.getTime() === where.date.getTime() && jour.actif === where.actif
        );
        return trouve ? { id: "jour-ferie" } : null;
      }),
    },
  };
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { dateDansUnCreneauDisponible } from "./creneau-disponible";

const p = prisma as unknown as { creneauDisponibilite: { findMany: Mock }; jourFerie: { findFirst: Mock } };

// Vendredi 25 decembre 2026 (Noel), creneau du vendredi de 08h a 12h heure locale (jourSemaine 5).
const CRENEAU_VENDREDI = { jourSemaine: 5, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 };
const NOEL_10H_LOCAL = new Date("2026-12-25T09:00:00.000Z");

function ajouterJourFerie(jour: string, actif = true): void {
  joursFeries.push({ date: new Date(`${jour}T00:00:00.000Z`), actif });
}

beforeEach(() => {
  joursFeries.length = 0;
  p.creneauDisponibilite.findMany.mockReset();
  p.jourFerie.findFirst.mockClear();
});

describe("dateDansUnCreneauDisponible et jours feries (RG-ETA-42)", () => {
  it("refuse un jour ferie actif meme quand le creneau du professionnel couvre l'heure", async () => {
    ajouterJourFerie("2026-12-25");
    p.creneauDisponibilite.findMany.mockResolvedValue([CRENEAU_VENDREDI]);

    expect(await dateDansUnCreneauDisponible("prof-1", NOEL_10H_LOCAL)).toBe(false);
  });

  it("refuse aussi un jour ferie actif pour un professionnel sans agenda configure", async () => {
    ajouterJourFerie("2026-12-25");
    p.creneauDisponibilite.findMany.mockResolvedValue([]);

    expect(await dateDansUnCreneauDisponible("prof-1", NOEL_10H_LOCAL)).toBe(false);
  });

  it("accepte un jour ferie desactive", async () => {
    ajouterJourFerie("2026-12-25", false);
    p.creneauDisponibilite.findMany.mockResolvedValue([CRENEAU_VENDREDI]);

    expect(await dateDansUnCreneauDisponible("prof-1", NOEL_10H_LOCAL)).toBe(true);
  });

  it("accepte une date dont l'annee n'a pas ete generee (aucun jour ferie connu)", async () => {
    p.creneauDisponibilite.findMany.mockResolvedValue([CRENEAU_VENDREDI]);

    expect(await dateDansUnCreneauDisponible("prof-1", NOEL_10H_LOCAL)).toBe(true);
  });

  it("interroge le referentiel avec le jour civil du Benin et uniquement les jours actifs", async () => {
    p.creneauDisponibilite.findMany.mockResolvedValue([]);

    await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-24T23:30:00.000Z"));

    const requete = p.jourFerie.findFirst.mock.calls[0][0] as { where: { date: Date; actif: boolean } };
    expect(requete.where.date.toISOString()).toBe("2026-12-25T00:00:00.000Z");
    expect(requete.where.actif).toBe(true);
  });

  it("utilise le jour civil local : 23h30 UTC la veille est deja Noel, 23h00 UTC le jour meme ne l'est plus", async () => {
    ajouterJourFerie("2026-12-25");
    p.creneauDisponibilite.findMany.mockResolvedValue([]);

    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-24T23:30:00.000Z"))).toBe(false);
    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-25T22:59:00.000Z"))).toBe(false);
    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-25T23:00:00.000Z"))).toBe(true);
  });

  it("ne change rien aux jours ordinaires : creneau respecte, sans agenda tout est permis", async () => {
    ajouterJourFerie("2026-12-25");

    p.creneauDisponibilite.findMany.mockResolvedValue([{ jourSemaine: 1, heureDebutMinutes: 8 * 60, heureFinMinutes: 12 * 60 }]);
    // Lundi 28 decembre 2026 a 10h locale : dans le creneau du lundi.
    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-28T09:00:00.000Z"))).toBe(true);
    // Lundi 28 decembre 2026 a 14h locale : hors creneau.
    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-28T13:00:00.000Z"))).toBe(false);

    p.creneauDisponibilite.findMany.mockResolvedValue([]);
    expect(await dateDansUnCreneauDisponible("prof-1", new Date("2026-12-28T13:00:00.000Z"))).toBe(true);
  });
});
