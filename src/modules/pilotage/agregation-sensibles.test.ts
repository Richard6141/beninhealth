import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * RG-PIL-05 (chapitre 14 du pack) : les donnees SENSITIVE ne sont comptees
 * qu'au niveau departement ou national, jamais par etablissement. Prisma
 * mocke, meme approche que src/modules/pilotage/agregation.test.ts.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    consultation: { findMany: vi.fn() },
    rendezVous: { findMany: vi.fn() },
    prescription: { findMany: vi.fn() },
    ligneDelivrance: { findMany: vi.fn() },
    vaccination: { findMany: vi.fn() },
    user: { count: vi.fn() },
    agregatQuotidien: { deleteMany: vi.fn(), createMany: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  },
}));

vi.mock("@/modules/pilotage/file-taches", () => ({
  listerJoursEtablissementsATraiter: vi.fn(),
  marquerTachesTraitees: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { listerJoursEtablissementsATraiter } from "@/modules/pilotage/file-taches";
import {
  executerTacheHoraire,
  executerTacheNocturne,
  recalculerJourEtablissement,
  recalculerSensiblesDepartementJour,
} from "@/modules/pilotage/agregation";

const prismaMock = prisma as unknown as {
  consultation: { findMany: Mock };
  rendezVous: { findMany: Mock };
  prescription: { findMany: Mock };
  ligneDelivrance: { findMany: Mock };
  vaccination: { findMany: Mock };
  user: { count: Mock };
  agregatQuotidien: { deleteMany: Mock; createMany: Mock };
  etablissementSanitaire: { findMany: Mock; findUnique: Mock };
  $transaction: Mock;
};
const listerJoursMock = listerJoursEtablissementsATraiter as unknown as Mock;

const JOUR = new Date("2026-01-15T00:00:00.000Z");
const PATIENT_A = { sexe: "F", dateNaissance: new Date("1996-01-01T00:00:00.000Z") };
const PATIENT_B = { sexe: "M", dateNaissance: new Date("1980-01-01T00:00:00.000Z") };

function initialiserMocksVides() {
  vi.clearAllMocks();
  prismaMock.consultation.findMany.mockResolvedValue([]);
  prismaMock.rendezVous.findMany.mockResolvedValue([]);
  prismaMock.prescription.findMany.mockResolvedValue([]);
  prismaMock.ligneDelivrance.findMany.mockResolvedValue([]);
  prismaMock.vaccination.findMany.mockResolvedValue([]);
  prismaMock.user.count.mockResolvedValue(0);
  prismaMock.etablissementSanitaire.findMany.mockResolvedValue([]);
}

describe("recalculerJourEtablissement : groupes sensibles (RG-PIL-05)", () => {
  beforeEach(initialiserMocksVides);

  it("n'ecrit jamais un groupe sensible par etablissement, mais le garde dans IND-01 et IND-02", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      { id: "c1", patientId: "pA", conclusion: "Sérologie VIH positive", date: new Date("2026-01-15T08:00:00.000Z"), patient: PATIENT_A },
      { id: "c2", patientId: "pB", conclusion: "Suivi paludisme", date: new Date("2026-01-15T09:00:00.000Z"), patient: PATIENT_B },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const lignes = prismaMock.agregatQuotidien.createMany.mock.calls[0][0].data as {
      indicateur: string;
      dimensionLibre: string | null;
      valeur: number;
    }[];

    expect(lignes.some((ligne) => ligne.indicateur === "IND-03" && ligne.dimensionLibre === "vih")).toBe(false);
    expect(lignes.some((ligne) => ligne.indicateur === "IND-03" && ligne.dimensionLibre === "paludisme")).toBe(true);
    // Le total de consultations reste exact : seule la ventilation par diagnostic sensible disparait.
    const totalInd01 = lignes.filter((ligne) => ligne.indicateur === "IND-01").reduce((somme, ligne) => somme + ligne.valeur, 0);
    expect(totalInd01).toBe(2);
  });

  it("n'ecrit aucune ligne IND-03 quand toutes les conclusions sont sensibles", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      { id: "c1", patientId: "pA", conclusion: "Dépression", date: new Date("2026-01-15T08:00:00.000Z"), patient: PATIENT_A },
      { id: "c2", patientId: "pB", conclusion: "Violence conjugale", date: new Date("2026-01-15T09:00:00.000Z"), patient: PATIENT_B },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const lignes = prismaMock.agregatQuotidien.createMany.mock.calls[0][0].data as { indicateur: string }[];
    expect(lignes.filter((ligne) => ligne.indicateur === "IND-03")).toHaveLength(0);
  });
});

describe("recalculerSensiblesDepartementJour", () => {
  beforeEach(initialiserMocksVides);

  it("compte les groupes sensibles du departement, sans etablissement, sans sexe ni tranche d'age", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([{ id: "e1" }, { id: "e2" }]);
    prismaMock.consultation.findMany.mockResolvedValue([
      { conclusion: "VIH" },
      { conclusion: "Sérologie VIH positive" },
      { conclusion: "Dépression" },
      { conclusion: "Paludisme simple" }, // non sensible : jamais compte ici
      { conclusion: null },
      { conclusion: "Certificat médical" },
    ]);

    await recalculerSensiblesDepartementJour(prisma, JOUR, "D1");

    // Meme priorite que resoudreDepartementId : commune d'abord, zone seulement sans commune.
    expect(prismaMock.etablissementSanitaire.findMany).toHaveBeenCalledWith({
      where: { OR: [{ commune: { departementId: "D1" } }, { communeId: null, zoneSanitaire: { departementId: "D1" } }] },
      select: { id: true },
    });
    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith({
      where: {
        etablissementId: { in: ["e1", "e2"] },
        statut: "terminee",
        saisieParErreur: false,
        date: { gte: JOUR, lt: new Date("2026-01-16T00:00:00.000Z") },
      },
      select: { conclusion: true, diagnosticPrincipalCode: true },
    });

    // RG-PIL-60 : suppression puis reinsertion, dans la meme transaction.
    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledWith({
      where: { date: JOUR, etablissementId: null, departementId: "D1", indicateur: "IND-03" },
    });
    const ligneDeBase = { date: JOUR, etablissementId: null, departementId: "D1", indicateur: "IND-03", sexe: null, trancheAge: null };
    expect(prismaMock.agregatQuotidien.createMany).toHaveBeenCalledTimes(1);
    const donnees = prismaMock.agregatQuotidien.createMany.mock.calls[0][0].data;
    expect(donnees).toHaveLength(2);
    expect(donnees).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, dimensionLibre: "vih", valeur: 2 },
        { ...ligneDeBase, dimensionLibre: "trouble_mental", valeur: 1 },
      ])
    );
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it("sans consultation sensible, supprime les anciennes lignes sans rien reinserer (RG-PIL-61)", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([{ id: "e1" }]);
    prismaMock.consultation.findMany.mockResolvedValue([{ conclusion: "Paludisme simple" }]);

    await recalculerSensiblesDepartementJour(prisma, JOUR, "D1");

    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.agregatQuotidien.createMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction.mock.calls[0][0]).toHaveLength(1);
  });

  it("un departement sans etablissement ne lit aucune consultation mais nettoie ses lignes", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([]);

    await recalculerSensiblesDepartementJour(prisma, JOUR, "D-VIDE");

    expect(prismaMock.consultation.findMany).not.toHaveBeenCalled();
    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.agregatQuotidien.createMany).not.toHaveBeenCalled();
  });
});

function appelsDepartementIND03() {
  return prismaMock.agregatQuotidien.deleteMany.mock.calls.filter(
    ([argument]) => argument.where.etablissementId === null && argument.where.indicateur === "IND-03"
  );
}

describe("planificateurs : un recalcul des groupes sensibles par jour et par departement", () => {
  beforeEach(initialiserMocksVides);

  it("tache horaire : deux etablissements du meme departement, un seul recalcul", async () => {
    listerJoursMock.mockResolvedValue([
      { date: JOUR, etablissementId: "e1" },
      { date: JOUR, etablissementId: "e2" },
      { date: JOUR, etablissementId: null }, // evenement sans etablissement : ignore
    ]);
    prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ commune: { departementId: "D1" }, zoneSanitaire: null });

    await executerTacheHoraire(prisma);

    expect(appelsDepartementIND03()).toHaveLength(1);
    expect(appelsDepartementIND03()[0][0]).toEqual({
      where: { date: JOUR, etablissementId: null, departementId: "D1", indicateur: "IND-03" },
    });
  });

  it("tache horaire : un etablissement sans territoire ne declenche aucun recalcul de departement", async () => {
    listerJoursMock.mockResolvedValue([{ date: JOUR, etablissementId: "e1" }]);
    prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ commune: null, zoneSanitaire: null });

    await executerTacheHoraire(prisma);

    expect(appelsDepartementIND03()).toHaveLength(0);
  });

  it("tache nocturne : un recalcul par jour et par departement distinct, jamais par etablissement", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "e1", commune: { departementId: "D1" }, zoneSanitaire: null },
      { id: "e2", commune: { departementId: "D1" }, zoneSanitaire: null },
      { id: "e3", commune: null, zoneSanitaire: { departementId: "D2" } },
      { id: "e4", commune: null, zoneSanitaire: null }, // sans territoire
    ]);

    const { joursTraites } = await executerTacheNocturne(prisma);

    expect(joursTraites).toBe(90 * 4);
    const appels = appelsDepartementIND03();
    expect(appels).toHaveLength(90 * 2); // 90 jours x 2 departements (D1, D2)
    const departements = new Set(appels.map(([argument]) => argument.where.departementId));
    expect(departements).toEqual(new Set(["D1", "D2"]));
  });
});
