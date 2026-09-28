import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agregatQuotidien: { findMany: vi.fn(async () => []) },
    etablissementSanitaire: { findMany: vi.fn(async () => []) },
    zoneSanitaire: { findMany: vi.fn(async () => []) },
    healthAlertReview: { createMany: vi.fn(async () => ({ count: 0 })) },
  },
}));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));

import { prisma } from "@/lib/prisma";
import {
  calculerSeuil,
  debutSemaineUTC,
  executerDetectionAlertes,
  MINIMUM_CAS,
  semaineISO,
} from "@/modules/pilotage/detection-alertes";

const p = prisma as unknown as {
  agregatQuotidien: { findMany: Mock };
  etablissementSanitaire: { findMany: Mock };
  zoneSanitaire: { findMany: Mock };
  healthAlertReview: { createMany: Mock };
};

// Mercredi 30 septembre 2026, 10h UTC : semaine ISO 2026-W40 (lundi 28/09).
const MAINTENANT = new Date("2026-09-30T10:00:00.000Z");
const SEMAINE_COURANTE = "2026-W40";
const SEMAINE_ECOULEE = "2026-W39";

/** Minuit UTC du jour `decalage` jours apres le lundi de la semaine courante (negatif = avant). */
function jour(decalage: number): Date {
  return new Date(Date.UTC(2026, 8, 28 + decalage));
}

function ligne(date: Date, etablissementId: string, groupe: string, valeur: number) {
  return { date, etablissementId, dimensionLibre: groupe, valeur };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.agregatQuotidien.findMany.mockResolvedValue([]);
  p.etablissementSanitaire.findMany.mockResolvedValue([]);
  p.zoneSanitaire.findMany.mockResolvedValue([]);
  p.healthAlertReview.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
});

describe("semaineISO / debutSemaineUTC (calcul en UTC, comme les agregats)", () => {
  it("donne la semaine ISO 8601 attendue, y compris aux bords d'annee", () => {
    expect(semaineISO(new Date("2026-09-28T00:00:00.000Z"))).toBe("2026-W40");
    expect(semaineISO(new Date("2026-09-27T23:59:59.000Z"))).toBe("2026-W39");
    expect(semaineISO(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-W01");
    expect(semaineISO(new Date("2027-01-01T00:00:00.000Z"))).toBe("2026-W53");
    expect(semaineISO(new Date("2024-12-30T00:00:00.000Z"))).toBe("2025-W01");
  });

  it("le lundi 00:00 UTC de la semaine, quel que soit le jour", () => {
    expect(debutSemaineUTC(MAINTENANT).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(debutSemaineUTC(new Date("2026-10-04T23:00:00.000Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
});

describe("calculerSeuil (regle du pack F-PIL-06)", () => {
  it("1 cas suffit pour une maladie a declaration immediate", () => {
    expect(calculerSeuil("rougeole", [50, 50])).toBe(1);
    expect(calculerSeuil("fievre_hemorragique", [])).toBe(1);
  });

  it("minimum de 10 cas meme sans historique", () => {
    expect(calculerSeuil("paludisme", [0, 0, 0, 0, 0, 0, 0, 0])).toBe(MINIMUM_CAS);
  });

  it("moyenne + 2 ecarts-types quand elle depasse le minimum", () => {
    // moyenne 20, ecart-type 0 -> 20
    expect(calculerSeuil("paludisme", [20, 20, 20, 20, 20, 20, 20, 20])).toBe(20);
    // 10 et 30 alternes : moyenne 20, ecart-type 10 -> 40
    expect(calculerSeuil("diarrhee", [10, 30, 10, 30, 10, 30, 10, 30])).toBe(40);
  });
});

describe("executerDetectionAlertes", () => {
  it("lit les lignes IND-03 par etablissement (granularite reellement ecrite par agregation.ts), jamais par zoneSanitaireId", async () => {
    await executerDetectionAlertes(MAINTENANT);

    const where = p.agregatQuotidien.findMany.mock.calls[0][0].where;
    expect(where.indicateur).toBe("IND-03");
    expect(where.etablissementId).toEqual({ not: null });
    expect(where).not.toHaveProperty("zoneSanitaireId");
    // Fenetre : 8 semaines avant la semaine ecoulee, jusqu'a la fin de la semaine courante.
    expect(where.date.gte.toISOString()).toBe(jour(-63).toISOString());
    expect(where.date.lt.toISOString()).toBe(jour(7).toISOString());
  });

  it("cree une alerte quand la semaine courante franchit le seuil, zone lue sur l'etablissement", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      ligne(jour(0), "etab-1", "paludisme", 7),
      ligne(jour(1), "etab-1", "paludisme", 5),
    ]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    const resultat = await executerDetectionAlertes(MAINTENANT);

    expect(resultat).toEqual({ alertesCreees: 1, etablissementsSansZone: 0 });
    expect(p.healthAlertReview.createMany).toHaveBeenCalledWith({
      data: [{ zoneSanitaireId: "zone-lit", groupeMaladies: "paludisme", semaine: SEMAINE_COURANTE, casObserves: 12, seuilCalcule: 10 }],
      skipDuplicates: true,
    });
  });

  it("ne cree rien sous le seuil (9 cas de paludisme sans historique)", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(0), "etab-1", "paludisme", 9)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    const resultat = await executerDetectionAlertes(MAINTENANT);

    expect(resultat.alertesCreees).toBe(0);
    expect(p.healthAlertReview.createMany).not.toHaveBeenCalled();
  });

  it("agrege les etablissements d'une meme zone avant de comparer au seuil", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      ligne(jour(0), "etab-1", "diarrhee", 6),
      ligne(jour(2), "etab-2", "diarrhee", 6),
    ]);
    p.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "etab-1", zoneSanitaireId: "zone-lit", commune: null },
      { id: "etab-2", zoneSanitaireId: "zone-lit", commune: null },
    ]);

    await executerDetectionAlertes(MAINTENANT);

    const { data } = p.healthAlertReview.createMany.mock.calls[0][0];
    expect(data).toEqual([expect.objectContaining({ zoneSanitaireId: "zone-lit", groupeMaladies: "diarrhee", casObserves: 12 })]);
  });

  it("1 cas de rougeole suffit (declaration immediate)", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(0), "etab-1", "rougeole", 1)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    await executerDetectionAlertes(MAINTENANT);

    expect(p.healthAlertReview.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ groupeMaladies: "rougeole", casObserves: 1, seuilCalcule: 1 }),
    ]);
  });

  it("les semaines sans ligne comptent pour 0 cas dans l'historique (plus de moyenne gonflee)", async () => {
    // Une seule semaine historique a 40 cas, les 7 autres sans ligne (0 cas).
    // Moyenne sur 8 semaines = 5, ecart-type ~13,2 -> seuil ~31,5 : 35 cas declenchent.
    // L'ancienne version moyennait la seule semaine non vide (seuil 40) et ne declenchait pas.
    p.agregatQuotidien.findMany.mockResolvedValue([
      ligne(jour(-21), "etab-1", "paludisme", 40),
      ligne(jour(0), "etab-1", "paludisme", 35),
    ]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    await executerDetectionAlertes(MAINTENANT);

    const { data } = p.healthAlertReview.createMany.mock.calls[0][0];
    expect(data).toHaveLength(1);
    expect(data[0].semaine).toBe(SEMAINE_COURANTE);
    expect(data[0].seuilCalcule).toBeCloseTo(5 + 2 * Math.sqrt((35 ** 2 + 7 * 5 ** 2) / 8), 5);
  });

  it("evalue aussi la semaine ecoulee (seuil franchi apres un recalcul tardif)", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(-3), "etab-1", "meningite", 2)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    await executerDetectionAlertes(MAINTENANT);

    expect(p.healthAlertReview.createMany.mock.calls[0][0].data).toEqual([
      expect.objectContaining({ groupeMaladies: "meningite", semaine: SEMAINE_ECOULEE, casObserves: 2 }),
    ]);
  });

  it("etablissement sans zone mais avec commune : rattache a la zone 'a affiner' de son departement (import CSV, provisionnement)", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(0), "etab-csv", "paludisme", 15)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "etab-csv", zoneSanitaireId: null, commune: { departementId: "dep-bor" } },
    ]);
    p.zoneSanitaire.findMany.mockResolvedValue([{ id: "zone-bor-a-affiner", departementId: "dep-bor" }]);

    const resultat = await executerDetectionAlertes(MAINTENANT);

    expect(p.zoneSanitaire.findMany.mock.calls[0][0].where).toEqual({
      departementId: { in: ["dep-bor"] },
      code: { endsWith: "-A-AFFINER" },
    });
    expect(resultat).toEqual({ alertesCreees: 1, etablissementsSansZone: 0 });
    expect(p.healthAlertReview.createMany.mock.calls[0][0].data[0].zoneSanitaireId).toBe("zone-bor-a-affiner");
  });

  it("etablissement sans zone resoluble : ignore et compte, jamais de zone creee", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      ligne(jour(0), "etab-sans-commune", "paludisme", 50),
      ligne(jour(0), "etab-dep-sans-zone", "paludisme", 50),
    ]);
    p.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "etab-sans-commune", zoneSanitaireId: null, commune: null },
      { id: "etab-dep-sans-zone", zoneSanitaireId: null, commune: { departementId: "dep-zou" } },
    ]);
    p.zoneSanitaire.findMany.mockResolvedValue([]);

    const resultat = await executerDetectionAlertes(MAINTENANT);

    expect(resultat).toEqual({ alertesCreees: 0, etablissementsSansZone: 2 });
    expect(p.healthAlertReview.createMany).not.toHaveBeenCalled();
  });

  it("reclamation idempotente : createMany avec skipDuplicates, les doublons ne comptent pas comme crees", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(0), "etab-1", "rougeole", 3)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);
    // L'alerte existe deja (passage horaire precedent ou autre instance) : la base l'ecarte.
    p.healthAlertReview.createMany.mockResolvedValue({ count: 0 });

    const resultat = await executerDetectionAlertes(MAINTENANT);

    expect(p.healthAlertReview.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(resultat.alertesCreees).toBe(0);
  });

  it("ignore les groupes non surveilles, dans la requete et meme si une ligne passait le filtre", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([ligne(jour(0), "etab-1", "hypertension", 500)]);
    p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "etab-1", zoneSanitaireId: "zone-lit", commune: null }]);

    await executerDetectionAlertes(MAINTENANT);

    expect(p.agregatQuotidien.findMany.mock.calls[0][0].where.dimensionLibre.in).not.toContain("hypertension");
    expect(p.healthAlertReview.createMany).not.toHaveBeenCalled();
  });
});
