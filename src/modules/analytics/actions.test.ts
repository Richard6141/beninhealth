import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * exporterRepartitionCSV (F-PIL-05, RG-PIL-40, RG-PIL-41) : l'ancien export
 * Phase 6 de /app/ministere ne produit plus rien sans le jeton signé de
 * ré-authentification des exports de pilotage (portée nationale), masque les
 * petits effectifs et journalise l'export avec le motif du jeton.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-analytics-export" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.7" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    etablissementSanitaire: { findMany: vi.fn(), count: vi.fn() },
    consultation: { groupBy: vi.fn(), count: vi.fn(), findMany: vi.fn(async () => []) },
    rendezVous: { groupBy: vi.fn() },
    professionnelSante: { groupBy: vi.fn(), count: vi.fn() },
    patient: { count: vi.fn() },
    prescription: { count: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonExportAudit } from "@/modules/audit/jeton-export-audit";
import { creerJetonExport } from "@/modules/pilotage/jeton-export";
import { exporterRepartitionCSV, getStatistiquesNationales } from "./actions";

const prismaMock = prisma as unknown as {
  etablissementSanitaire: { findMany: Mock; count: Mock };
  consultation: { groupBy: Mock; count: Mock; findMany: Mock };
  rendezVous: { groupBy: Mock };
  professionnelSante: { groupBy: Mock; count: Mock };
  patient: { count: Mock };
  prescription: { count: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const SESSION_NATIONAL = { userId: "admin-1", roles: ["admin_national"], sessionId: "s-1" };

function jeton(surcharge: Partial<Parameters<typeof creerJetonExport>[0]> = {}, maintenantMs?: number): string {
  return creerJetonExport(
    { utilisateurId: "admin-1", sessionId: "s-1", portee: "national", motif: "rapport_mensuel", ...surcharge },
    maintenantMs
  );
}

describe("exporterRepartitionCSV", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "e-1", nom: "CHU de Cotonou", localisation: "Cotonou, Littoral", type: "chu" },
      { id: "e-2", nom: "Centre de santé de Kandi", localisation: "Kandi", type: "centre_sante" },
    ]);
    prismaMock.consultation.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 42 } },
      { etablissementId: "e-2", _count: { _all: 3 } },
    ]);
    prismaMock.rendezVous.groupBy.mockResolvedValue([{ etablissementId: "e-1", _count: { _all: 2 } }]);
    prismaMock.professionnelSante.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 12 } },
      { etablissementId: "e-2", _count: { _all: 1 } },
    ]);
  });

  it("refuse sans jeton : aucune lecture, aucune trace d'export", async () => {
    const resultat = await exporterRepartitionCSV(null);
    expect(resultat).toHaveProperty("error");
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton expiré, d'une autre session, d'un autre utilisateur ou de la portée établissement", async () => {
    const refuses = [
      jeton({}, Date.now() - 10 * 60 * 1000),
      jeton({ sessionId: "s-ancienne" }),
      jeton({ utilisateurId: "quelqu-un-d-autre" }),
      jeton({ portee: "etablissement" }),
      "faux.jeton",
    ];
    for (const valeur of refuses) {
      expect(await exporterRepartitionCSV(valeur)).toHaveProperty("error");
    }
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton valide d'un autre usage (export du journal d'audit)", async () => {
    const resultat = await exporterRepartitionCSV(creerJetonExportAudit("admin-1"));
    expect(resultat).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await exporterRepartitionCSV(jeton())).toHaveProperty("error");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("garde le contrôle de rôle : un jeton valide ne suffit pas sans admin_national", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION_NATIONAL, roles: ["admin_etablissement"] });
    expect(await exporterRepartitionCSV(jeton())).toEqual({ error: "Droits insuffisants." });
    expect(prismaMock.etablissementSanitaire.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("avec un jeton valide, exporte en masquant les petits effectifs (RG-PIL-02)", async () => {
    const resultat = await exporterRepartitionCSV(jeton());
    if (!("contenu" in resultat)) throw new Error(`Export refusé : ${resultat.error}`);

    const lignes = resultat.contenu.split("\n");
    expect(lignes[0]).toBe("Etablissement,Localisation,Type,Consultations,RendezVous,Professionnels");
    // Virgule dans la localisation : champ entre guillemets. 2 rendez-vous : "< 5".
    expect(lignes[1]).toBe('CHU de Cotonou,"Cotonou, Littoral",chu,42,< 5,12');
    // 3 consultations : "< 5" ; 0 rendez-vous reste 0.
    expect(lignes[2]).toBe("Centre de santé de Kandi,Kandi,centre_sante,< 5,0,1");
  });

  it("journalise l'export sous une action dédiée avec le motif du jeton en clair", async () => {
    await exporterRepartitionCSV(jeton({ motif: "autre", motifTexte: "Revue budgétaire du trimestre" }));

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    const entree = journaliserMock.mock.calls[0][0];
    expect(entree).toMatchObject({
      utilisateurId: "admin-1",
      action: "export_pilotage_repartition_csv",
      donneeConcernee: "pilotage_national:repartition_etablissements;format=csv",
      adresseTechnique: "10.0.0.7",
    });
    expect(entree.justification).toContain("Revue budgétaire du trimestre");
    expect(entree.justification).toContain("2 ligne(s)");
  });
});

describe("getStatistiquesNationales (corrige le 2026-09-29, RG-PIL-02)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    prismaMock.etablissementSanitaire.count.mockResolvedValue(30);
    prismaMock.professionnelSante.count.mockResolvedValue(120);
    prismaMock.patient.count.mockResolvedValue(5000);
    prismaMock.consultation.count.mockResolvedValue(3);
    prismaMock.prescription.count.mockResolvedValue(400);
    prismaMock.etablissementSanitaire.findMany.mockResolvedValue([
      { id: "e-1", nom: "CHU de Cotonou", localisation: "Cotonou, Littoral", type: "chu" },
      { id: "e-2", nom: "Centre de santé de Kandi", localisation: "Kandi", type: "centre_sante" },
    ]);
    prismaMock.consultation.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 42 } },
      { etablissementId: "e-2", _count: { _all: 3 } },
    ]);
    prismaMock.rendezVous.groupBy.mockResolvedValue([{ etablissementId: "e-1", _count: { _all: 2 } }]);
    prismaMock.professionnelSante.groupBy.mockResolvedValue([
      { etablissementId: "e-1", _count: { _all: 12 } },
      { etablissementId: "e-2", _count: { _all: 1 } },
    ]);
  });

  it("refuse sans le role admin_national : structure a zero, aucune lecture", async () => {
    getSessionMock.mockResolvedValue({ ...SESSION_NATIONAL, roles: ["admin_etablissement"] });

    const resultat = await getStatistiquesNationales();

    expect(resultat.totalEtablissements).toBe(0);
    expect(prismaMock.etablissementSanitaire.count).not.toHaveBeenCalled();
  });

  it("masque les comptes d'activite nationaux sous 5, jamais les effectifs (etablissements/professionnels/patients)", async () => {
    const resultat = await getStatistiquesNationales();

    expect(resultat.totalConsultations).toBe("< 5"); // 3, active masquee
    expect(resultat.totalPrescriptions).toBe(400); // au-dessus du seuil, inchange
    expect(resultat.totalEtablissements).toBe(30); // effectif, jamais masque
    expect(resultat.totalProfessionnels).toBe(120);
    expect(resultat.totalPatients).toBe(5000);
  });

  it("masque la repartition par etablissement (consultations/rendez-vous), jamais le nombre de professionnels", async () => {
    const resultat = await getStatistiquesNationales();

    expect(resultat.repartitionParEtablissement).toEqual([
      { etablissementNom: "CHU de Cotonou", localisation: "Cotonou, Littoral", type: "chu", totalConsultations: 42, totalRendezVous: "< 5", nombreProfessionnels: 12 },
      { etablissementNom: "Centre de santé de Kandi", localisation: "Kandi", type: "centre_sante", totalConsultations: "< 5", totalRendezVous: 0, nombreProfessionnels: 1 },
    ]);
  });

  it("RG-PIL-03 : masque un deuxieme statut de rendez-vous quand un seul est masque par RG-PIL-02, pour empecher de le retrouver par soustraction", async () => {
    // rendezVousParStatutPour et calculerRepartitionParEtablissement partagent
    // prisma.rendezVous.groupBy avec un `by` different : on les distingue ici.
    const { rendezVous } = prisma as unknown as { rendezVous: { groupBy: Mock } };
    rendezVous.groupBy.mockImplementation(async (arg: { by: string[] }) =>
      arg.by[0] === "statut"
        ? [
            { statut: "demande", _count: { _all: 2 } },
            { statut: "confirme", _count: { _all: 50 } },
            { statut: "termine", _count: { _all: 30 } },
            { statut: "annule", _count: { _all: 10 } },
          ]
        : [{ etablissementId: "e-1", _count: { _all: 2 } }]
    );

    const resultat = await getStatistiquesNationales();
    const parStatut = Object.fromEntries(resultat.rendezVousParStatut.map((ligne) => [ligne.statut, ligne.total]));

    expect(parStatut.demande).toBe("< 5");
    // "annule" (10) est le plus petit des restants : masque en second pour RG-PIL-03.
    expect(parStatut.annule).toBe("< 5");
    expect(parStatut.confirme).toBe(50);
    expect(parStatut.termine).toBe(30);
  });
});
