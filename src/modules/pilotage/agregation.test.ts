import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Tests de recalculerJourEtablissement, prisma mocke (meme approche que
 * src/modules/patient/actions.test.ts) : verifie le calcul des indicateurs
 * IND-01 a IND-04 et, separement, RG-PIL-60 (suppression puis reinsertion
 * dans une transaction) et RG-PIL-61 (une consultation retiree, donc deja
 * exclue de la requete source, disparait des lignes reinserees).
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
    etablissementSanitaire: { findMany: vi.fn() },
    $transaction: vi.fn(async (operations: unknown[]) => operations),
  },
}));

import { prisma } from "@/lib/prisma";
import {
  recalculerJourEtablissement,
  recalculerIndicateursSystemeJour,
  CODES_INDICATEURS_JOUR_ETABLISSEMENT,
  CODES_INDICATEURS_SYSTEME_JOUR,
} from "@/modules/pilotage/agregation";

const prismaMock = prisma as unknown as {
  consultation: { findMany: Mock };
  rendezVous: { findMany: Mock };
  prescription: { findMany: Mock };
  ligneDelivrance: { findMany: Mock };
  vaccination: { findMany: Mock };
  user: { count: Mock };
  agregatQuotidien: { deleteMany: Mock; createMany: Mock };
  etablissementSanitaire: { findMany: Mock };
  $transaction: Mock;
};

const JOUR = new Date("2026-01-15T00:00:00.000Z");
const DEBUT_JOUR = new Date("2026-01-15T00:00:00.000Z");

const PATIENT_A = { sexe: "F", dateNaissance: new Date("1996-01-01T00:00:00.000Z") }; // 30 ans au 2026-01-15
const PATIENT_B = { sexe: "M", dateNaissance: new Date("2023-06-01T00:00:00.000Z") }; // 2 ans au 2026-01-15

describe("recalculerJourEtablissement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.rendezVous.findMany.mockResolvedValue([]);
    prismaMock.prescription.findMany.mockResolvedValue([]);
    prismaMock.ligneDelivrance.findMany.mockResolvedValue([]);
    prismaMock.vaccination.findMany.mockResolvedValue([]);
  });

  it("calcule IND-01 a IND-04 a partir des consultations validees du jour", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      {
        id: "c1",
        patientId: "pA",
        conclusion: "Suivi paludisme, TDR positif",
        date: new Date("2026-01-15T08:00:00.000Z"),
        patient: PATIENT_A,
      },
      {
        id: "c2",
        patientId: "pA",
        conclusion: "Diarrhee aigue chez l'adulte",
        date: new Date("2026-01-15T09:00:00.000Z"),
        patient: PATIENT_A,
      },
      {
        id: "c3",
        patientId: "pB",
        conclusion: "",
        date: new Date("2026-01-15T10:00:00.000Z"),
        patient: PATIENT_B,
      },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    expect(prismaMock.consultation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          etablissementId: "etab1",
          statut: "terminee",
          saisieParErreur: false,
        }),
      })
    );

    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledWith({
      where: {
        date: DEBUT_JOUR,
        etablissementId: "etab1",
        indicateur: { in: [...CODES_INDICATEURS_JOUR_ETABLISSEMENT] },
      },
    });

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1" };
    expect(prismaMock.agregatQuotidien.createMany).toHaveBeenCalledWith({
      data: [
        { ...ligneDeBase, indicateur: "IND-01", sexe: "F", trancheAge: "25-49 ans", dimensionLibre: null, valeur: 2 },
        { ...ligneDeBase, indicateur: "IND-01", sexe: "M", trancheAge: "1-4 ans", dimensionLibre: null, valeur: 1 },
        { ...ligneDeBase, indicateur: "IND-02", sexe: "F", trancheAge: "25-49 ans", dimensionLibre: null, valeur: 1 },
        { ...ligneDeBase, indicateur: "IND-02", sexe: "M", trancheAge: "1-4 ans", dimensionLibre: null, valeur: 1 },
        {
          ...ligneDeBase,
          indicateur: "IND-03",
          sexe: "F",
          trancheAge: "25-49 ans",
          dimensionLibre: "paludisme",
          valeur: 1,
        },
        {
          ...ligneDeBase,
          indicateur: "IND-03",
          sexe: "F",
          trancheAge: "25-49 ans",
          dimensionLibre: "diarrhee",
          valeur: 1,
        },
        { ...ligneDeBase, indicateur: "IND-04", sexe: null, trancheAge: ">= 5 ans", dimensionLibre: null, valeur: 1 },
        { ...ligneDeBase, indicateur: "IND-12", sexe: null, trancheAge: null, dimensionLibre: "validees_tardivement", valeur: 0 },
        { ...ligneDeBase, indicateur: "IND-12", sexe: null, trancheAge: null, dimensionLibre: "total_validees", valeur: 3 },
      ],
    });

    // RG-PIL-60 : suppression puis reinsertion dans la MEME transaction.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    const operations = prismaMock.$transaction.mock.calls[0][0];
    expect(operations).toHaveLength(2);
  });

  it("F-CLI-06 : le diagnostic principal codifie CIM-10 prime sur la classification par mots-cles de la conclusion", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([
      {
        id: "c1",
        patientId: "pA",
        // Conclusion trompeuse (mentionne "paludisme" en texte libre) : le
        // code CIM-10 (tuberculose, A15) doit l'emporter, pas le mot-cle.
        conclusion: "Suspicion de paludisme, a confirmer",
        diagnosticPrincipalCode: "A15",
        date: new Date("2026-01-15T08:00:00.000Z"),
        patient: PATIENT_A,
      },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1" };
    const lignesIND03 = prismaMock.agregatQuotidien.createMany.mock.calls[0][0].data.filter(
      (ligne: { indicateur: string }) => ligne.indicateur === "IND-03"
    );
    expect(lignesIND03).toEqual([
      { ...ligneDeBase, indicateur: "IND-03", sexe: "F", trancheAge: "25-49 ans", dimensionLibre: "tuberculose", valeur: 1 },
    ]);
    // Aucune ligne IND-04 (paludisme) : le code CIM-10 a correctement ecarte le mot-cle trompeur.
    expect(prismaMock.agregatQuotidien.createMany.mock.calls[0][0].data.some((l: { indicateur: string }) => l.indicateur === "IND-04")).toBe(false);
  });

  it("RG-PIL-61 : sans consultation valide restante (retrait), supprime les lignes existantes sans en reinserer", async () => {
    // Le retrait exclut deja la consultation de la requete source
    // (saisieParErreur: false dans le where), donc le mock la simule ici en
    // renvoyant simplement un jour sans aucune consultation restante.
    prismaMock.consultation.findMany.mockResolvedValue([]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledWith({
      where: {
        date: DEBUT_JOUR,
        etablissementId: "etab1",
        indicateur: { in: [...CODES_INDICATEURS_JOUR_ETABLISSEMENT] },
      },
    });
    expect(prismaMock.agregatQuotidien.createMany).not.toHaveBeenCalled();

    const operations = prismaMock.$transaction.mock.calls[0][0];
    expect(operations).toHaveLength(1);
  });

  it("calcule IND-07 (rendez-vous pris/honores/annules) du jour", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.rendezVous.findMany.mockResolvedValue([
      { statut: "termine" },
      { statut: "termine" },
      { statut: "annule" },
      { statut: "confirme" },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1", sexe: null, trancheAge: null };
    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, indicateur: "IND-07", dimensionLibre: "pris", valeur: 4 },
        { ...ligneDeBase, indicateur: "IND-07", dimensionLibre: "honores", valeur: 2 },
        { ...ligneDeBase, indicateur: "IND-07", dimensionLibre: "annules", valeur: 1 },
      ])
    );
  });

  it("calcule IND-08 (ordonnances signees / delivrees dans le delai de 30 jours)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.prescription.findMany.mockResolvedValue([
      {
        date: new Date("2026-01-15T08:00:00.000Z"),
        delivrances: [{ date: new Date("2026-01-20T00:00:00.000Z") }], // delivree dans le delai
      },
      {
        date: new Date("2026-01-15T08:00:00.000Z"),
        delivrances: [], // pas encore delivree
      },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1", sexe: null, trancheAge: null };
    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, indicateur: "IND-08", dimensionLibre: "signees", valeur: 2 },
        { ...ligneDeBase, indicateur: "IND-08", dimensionLibre: "delivrees_30j", valeur: 1 },
      ])
    );

    expect(prismaMock.prescription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          consultation: { etablissementId: "etab1" },
          statut: { not: "annulee" },
        }),
      })
    );
  });

  it("calcule IND-09 (ruptures de stock declarees par medicament)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.ligneDelivrance.findMany.mockResolvedValue([
      { lignePrescription: { medicament: { principeActif: "Amoxicilline" } } },
      { lignePrescription: { medicament: { principeActif: "Amoxicilline" } } },
      { lignePrescription: { medicament: { principeActif: "Paracetamol" } } },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1", sexe: null, trancheAge: null };
    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, indicateur: "IND-09", dimensionLibre: "Amoxicilline", valeur: 2 },
        { ...ligneDeBase, indicateur: "IND-09", dimensionLibre: "Paracetamol", valeur: 1 },
      ])
    );

    expect(prismaMock.ligneDelivrance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ motifNonDelivrance: "rupture_stock" }),
      })
    );
  });

  it("calcule IND-10 (doses de vaccination par vaccin, dose et tranche d'age)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.vaccination.findMany.mockResolvedValue([
      {
        vaccin: "BCG",
        numeroDose: 1,
        dateAdministration: new Date("2026-01-15T08:00:00.000Z"),
        patient: { dateNaissance: new Date("2026-01-01T00:00:00.000Z") }, // 0 mois -> "0-11 mois"
        personneCommunautaire: null,
      },
      {
        vaccin: "BCG",
        numeroDose: 1,
        dateAdministration: new Date("2026-01-15T09:00:00.000Z"),
        patient: { dateNaissance: new Date("2026-01-01T00:00:00.000Z") },
        personneCommunautaire: null,
      },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1", sexe: null };
    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, indicateur: "IND-10", trancheAge: "0-11 mois", dimensionLibre: "BCG:dose1", valeur: 2 },
      ])
    );
  });

  it("IND-10 compte aussi une vaccination communautaire (F-COM-04, personneCommunautaire sans patient)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.vaccination.findMany.mockResolvedValue([
      {
        vaccin: "Rougeole",
        numeroDose: 1,
        dateAdministration: new Date("2026-01-15T08:00:00.000Z"),
        patient: null,
        personneCommunautaire: { dateNaissance: new Date("2025-01-01T00:00:00.000Z") }, // 12 mois -> "1-4 ans"
      },
    ]);

    await recalculerJourEtablissement(prisma, JOUR, "etab1");

    const ligneDeBase = { date: DEBUT_JOUR, etablissementId: "etab1", sexe: null };
    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...ligneDeBase, indicateur: "IND-10", trancheAge: "1-4 ans", dimensionLibre: "Rougeole:dose1", valeur: 1 },
      ])
    );
  });

  it("IND-10 ignore une ligne sans aucune date de naissance connue plutot que d'echouer (garde defensive)", async () => {
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.vaccination.findMany.mockResolvedValue([
      {
        vaccin: "BCG",
        numeroDose: 1,
        dateAdministration: new Date("2026-01-15T08:00:00.000Z"),
        patient: null,
        personneCommunautaire: null,
      },
    ]);

    await expect(recalculerJourEtablissement(prisma, JOUR, "etab1")).resolves.not.toThrow();

    // Aucune autre donnee mockee dans ce test : la ligne ignoree est la seule
    // candidate, createMany n'est meme pas appele (voir "lignes.length > 0" plus haut).
    expect(prismaMock.agregatQuotidien.createMany).not.toHaveBeenCalled();
  });
});

describe("recalculerIndicateursSystemeJour", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.user.count.mockResolvedValue(0);
  });

  it("calcule IND-05 (etablissements actifs/total par type et territoire) et IND-06 (professionnels actifs par profession et territoire)", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "etabActif", type: "centre_de_sante", commune: { departementId: "dep1" }, zoneSanitaire: null },
      { id: "etabInactif", type: "centre_de_sante", commune: { departementId: "dep1" }, zoneSanitaire: null },
      { id: "etabAutreType", type: "hopital", commune: null, zoneSanitaire: { departementId: "dep2" } },
    ]);

    // Premier appel (IND-05) : consultations distinctes par etablissement sur 7 jours.
    // Deuxieme appel (IND-06) : consultations distinctes par professionnel sur 30 jours.
    prismaMock.consultation.findMany
      .mockResolvedValueOnce([{ etablissementId: "etabActif" }])
      .mockResolvedValueOnce([
        {
          professionnelId: "profMedecin",
          professionnel: {
            etablissement: { commune: { departementId: "dep1" }, zoneSanitaire: null },
            user: { roles: [{ nom: "medecin" }] },
          },
        },
        {
          professionnelId: "profPharmacien",
          professionnel: {
            etablissement: { commune: { departementId: "dep1" }, zoneSanitaire: null },
            user: { roles: [{ nom: "pharmacien" }] },
          },
        },
      ]);

    await recalculerIndicateursSystemeJour(prisma, JOUR);

    expect(prismaMock.agregatQuotidien.deleteMany).toHaveBeenCalledWith({
      where: {
        date: DEBUT_JOUR,
        etablissementId: null,
        indicateur: { in: [...CODES_INDICATEURS_SYSTEME_JOUR] },
      },
    });

    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    const lignesBase = { date: DEBUT_JOUR, etablissementId: null, sexe: null, trancheAge: null };

    // IND-05, national : 1 actif / 2 total pour centre_de_sante, 0/1 pour hopital.
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        { ...lignesBase, departementId: null, typeEtablissement: "centre_de_sante", indicateur: "IND-05", dimensionLibre: "actifs", valeur: 1 },
        { ...lignesBase, departementId: null, typeEtablissement: "centre_de_sante", indicateur: "IND-05", dimensionLibre: "total", valeur: 2 },
        { ...lignesBase, departementId: null, typeEtablissement: "hopital", indicateur: "IND-05", dimensionLibre: "actifs", valeur: 0 },
        { ...lignesBase, departementId: null, typeEtablissement: "hopital", indicateur: "IND-05", dimensionLibre: "total", valeur: 1 },
        // IND-05, departement dep1 : meme repartition que le national pour centre_de_sante (tous les etablissements de ce type y sont).
        { ...lignesBase, departementId: "dep1", typeEtablissement: "centre_de_sante", indicateur: "IND-05", dimensionLibre: "actifs", valeur: 1 },
        { ...lignesBase, departementId: "dep1", typeEtablissement: "centre_de_sante", indicateur: "IND-05", dimensionLibre: "total", valeur: 2 },
        // IND-06 : seul le medecin est compte (le pharmacien est hors perimetre assume de cette iteration).
        { ...lignesBase, departementId: null, typeEtablissement: null, indicateur: "IND-06", dimensionLibre: "medecin", valeur: 1 },
        { ...lignesBase, departementId: "dep1", typeEtablissement: null, indicateur: "IND-06", dimensionLibre: "medecin", valeur: 1 },
      ])
    );
    expect(
      appelCreateMany.data.some((ligne: { dimensionLibre: string | null }) => ligne.dimensionLibre === "pharmacien")
    ).toBe(false);
  });

  it("calcule IND-13 (comptes citoyens crees / actifs sur 30 jours), niveau national uniquement", async () => {
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([]);
    prismaMock.consultation.findMany.mockResolvedValue([]);
    prismaMock.user.count.mockResolvedValueOnce(3).mockResolvedValueOnce(11);

    await recalculerIndicateursSystemeJour(prisma, JOUR);

    const appelCreateMany = prismaMock.agregatQuotidien.createMany.mock.calls[0][0];
    expect(appelCreateMany.data).toEqual(
      expect.arrayContaining([
        {
          date: DEBUT_JOUR,
          etablissementId: null,
          departementId: null,
          typeEtablissement: null,
          sexe: null,
          trancheAge: null,
          indicateur: "IND-13",
          dimensionLibre: "comptes_crees",
          valeur: 3,
        },
        {
          date: DEBUT_JOUR,
          etablissementId: null,
          departementId: null,
          typeEtablissement: null,
          sexe: null,
          trancheAge: null,
          indicateur: "IND-13",
          dimensionLibre: "comptes_actifs_30j",
          valeur: 11,
        },
      ])
    );

    expect(prismaMock.user.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ patient: { isNot: null } }) })
    );
  });
});
