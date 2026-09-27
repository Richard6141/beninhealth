import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journalAudit: { findMany: vi.fn(async () => []) },
    user: { findMany: vi.fn(async () => []) },
    patient: { findMany: vi.fn(async () => []) },
    signalementAnomalieAcces: { findFirst: vi.fn(async () => null), create: vi.fn() },
  },
}));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn() }));
vi.mock("@/modules/administration/executions-taches", () => ({ suivreExecution: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import { executerDetectionAnomalies } from "@/modules/audit/detection-anomalies";

const p = prisma as unknown as {
  journalAudit: { findMany: Mock };
  user: { findMany: Mock };
  patient: { findMany: Mock };
  signalementAnomalieAcces: { findFirst: Mock; create: Mock };
};
const lireParametreMock = lireParametre as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  lireParametreMock.mockImplementation(async (cle: string) => {
    if (cle === "audit.seuil_acces_urgence_7j") return 3;
    if (cle === "audit.seuil_ip_multiples_1h") return 3;
    if (cle === "audit.seuil_dossiers_distincts_jour") return 60;
    throw new Error("parametre inattendu : " + cle);
  });
  p.journalAudit.findMany.mockResolvedValue([]);
  p.user.findMany.mockResolvedValue([]);
  p.patient.findMany.mockResolvedValue([]);
  p.signalementAnomalieAcces.findFirst.mockResolvedValue(null);
  p.signalementAnomalieAcces.create.mockResolvedValue({});
});

describe("executerDetectionAnomalies : seuils administrables (RG-ADM-50)", () => {
  it("relit les 3 seuils a chaque execution, jamais mis en cache", async () => {
    await executerDetectionAnomalies(MAINTENANT);

    expect(lireParametreMock).toHaveBeenCalledWith("audit.seuil_acces_urgence_7j");
    expect(lireParametreMock).toHaveBeenCalledWith("audit.seuil_ip_multiples_1h");
    expect(lireParametreMock).toHaveBeenCalledWith("audit.seuil_dossiers_distincts_jour");
  });

  it("un seuil abaisse par l'administration declenche un signalement qui ne se serait pas produit avec le defaut", async () => {
    lireParametreMock.mockImplementation(async (cle: string) => (cle === "audit.seuil_acces_urgence_7j" ? 1 : 60));
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "acces_urgence" ? [{ utilisateurId: "u-1" }, { utilisateurId: "u-1" }] : []
    );

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith({
      data: { regle: "acces_urgence_frequents", utilisateurId: "u-1", detail: expect.stringContaining("seuil : 1") },
    });
  });
});

describe("regle acces_urgence_frequents", () => {
  it("signale un professionnel au-dela du seuil sur 7 jours, pas en dessous", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "acces_urgence"
        ? [{ utilisateurId: "u-frequent" }, { utilisateurId: "u-frequent" }, { utilisateurId: "u-frequent" }, { utilisateurId: "u-frequent" }, { utilisateurId: "u-rare" }]
        : []
    );

    const nombre = await executerDetectionAnomalies(MAINTENANT);

    expect(nombre).toBe(1);
    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledTimes(1);
    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith({
      data: { regle: "acces_urgence_frequents", utilisateurId: "u-frequent", detail: expect.stringContaining("4 accès") },
    });
  });

  it("ne signale pas deux fois un signalement deja ouvert (idempotence)", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "acces_urgence" ? Array.from({ length: 5 }, () => ({ utilisateurId: "u-1" })) : []
    );
    p.signalementAnomalieAcces.findFirst.mockResolvedValue({ id: "existant" });

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).not.toHaveBeenCalled();
  });
});

describe("regle connexions_ip_multiples", () => {
  it("signale un compte connecte depuis plus d'adresses que le seuil en 1 heure", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "connexion"
        ? [
            { utilisateurId: "u-1", adresseTechnique: "1.1.1.1" },
            { utilisateurId: "u-1", adresseTechnique: "2.2.2.2" },
            { utilisateurId: "u-1", adresseTechnique: "3.3.3.3" },
            { utilisateurId: "u-1", adresseTechnique: "4.4.4.4" },
          ]
        : []
    );

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith({
      data: { regle: "connexions_ip_multiples", utilisateurId: "u-1", detail: expect.stringContaining("4 adresses") },
    });
  });

  it("la meme adresse repetee ne compte qu'une fois", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "connexion" ? Array.from({ length: 10 }, () => ({ utilisateurId: "u-1", adresseTechnique: "1.1.1.1" })) : []
    );

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).not.toHaveBeenCalled();
  });
});

describe("regles dossiers_distincts_eleves et nom_famille_identique", () => {
  function ligneResume(utilisateurId: string, patientId: string) {
    return { utilisateurId, donneeConcernee: `patient:${patientId}` };
  }

  it("signale un professionnel qui ouvre plus de dossiers distincts que le seuil dans la journee", async () => {
    lireParametreMock.mockImplementation(async (cle: string) => (cle === "audit.seuil_dossiers_distincts_jour" ? 2 : 3));
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "consultation_resume_patient" ? [ligneResume("u-1", "p-1"), ligneResume("u-1", "p-2"), ligneResume("u-1", "p-3")] : []
    );

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith({
      data: { regle: "dossiers_distincts_eleves", utilisateurId: "u-1", detail: expect.stringContaining("3 dossiers") },
    });
  });

  it("signale une consultation d'un dossier partageant le nom de famille du professionnel, insensible a la casse", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "consultation_resume_patient" ? [ligneResume("u-1", "p-1")] : []
    );
    p.user.findMany.mockResolvedValue([{ id: "u-1", nom: "AGBOSSOU" }]);
    p.patient.findMany.mockResolvedValue([{ id: "p-1", user: { nom: "agbossou" } }]);

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith({
      data: { regle: "nom_famille_identique", utilisateurId: "u-1", detail: expect.stringContaining("agbossou") },
    });
  });

  it("ne signale rien quand les noms different", async () => {
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) =>
      where.action === "consultation_resume_patient" ? [ligneResume("u-1", "p-1")] : []
    );
    p.user.findMany.mockResolvedValue([{ id: "u-1", nom: "Kora" }]);
    p.patient.findMany.mockResolvedValue([{ id: "p-1", user: { nom: "Dossou" } }]);

    await executerDetectionAnomalies(MAINTENANT);

    expect(p.signalementAnomalieAcces.create).not.toHaveBeenCalled();
  });
});

describe("resilience", () => {
  it("une regle en echec n'empeche jamais les autres de s'executer", async () => {
    const erreurConsole = vi.spyOn(console, "error").mockImplementation(() => undefined);
    p.journalAudit.findMany.mockImplementation(async ({ where }: { where: { action: string } }) => {
      if (where.action === "acces_urgence") throw new Error("panne base");
      if (where.action === "connexion") return Array.from({ length: 5 }, (_, i) => ({ utilisateurId: "u-1", adresseTechnique: `${i}.${i}.${i}.${i}` }));
      return [];
    });

    const nombre = await executerDetectionAnomalies(MAINTENANT);

    expect(nombre).toBe(1);
    expect(p.signalementAnomalieAcces.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ regle: "connexions_ip_multiples" }) }));
    erreurConsole.mockRestore();
  });
});
