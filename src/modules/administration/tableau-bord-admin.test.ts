import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    professionnelSante: { findMany: vi.fn() },
    tachePilotage: { findFirst: vi.fn(), count: vi.fn() },
    actionAdministrateurEnAttente: { count: vi.fn() },
    envoiSms: { count: vi.fn() },
    invitationCompte: { count: vi.fn() },
    executionTache: { findFirst: vi.fn(), count: vi.fn() },
    userRole: { groupBy: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/patient/fusion-doublons", () => ({ detecterDoublonsPatients: vi.fn(async () => [{}, {}]) }));
vi.mock("@/modules/administration/etablissements", () => ({
  getEtablissementsAdmin: vi.fn(async () => [{ statut: "brouillon" }, { statut: "actif" }]),
}));
vi.mock("@/modules/audit/demandes", () => ({ getDemandesPersonnes: vi.fn(async () => [{ traite: false }, { traite: true }]) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getFilesAttenteAdmin } from "@/modules/administration/tableau-bord-admin";

const p = prisma as unknown as {
  professionnelSante: { findMany: Mock };
  invitationCompte: { count: Mock };
  tachePilotage: { findFirst: Mock; count: Mock };
  actionAdministrateurEnAttente: { count: Mock };
  envoiSms: { count: Mock };
  executionTache: { findFirst: Mock; count: Mock };
  userRole: { groupBy: Mock };
};
const getSessionMock = getSession as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.professionnelSante.findMany.mockResolvedValue([]);
  p.invitationCompte.count.mockResolvedValue(0);
  p.tachePilotage.findFirst.mockResolvedValue(null);
  p.tachePilotage.count.mockResolvedValue(0);
  p.actionAdministrateurEnAttente.count.mockResolvedValue(0);
  p.envoiSms.count.mockResolvedValue(0);
  p.executionTache.findFirst.mockResolvedValue(null);
  p.executionTache.count.mockResolvedValue(0);
  p.userRole.groupBy.mockResolvedValue([]);
});

describe("getFilesAttenteAdmin : acces", () => {
  it("un role sans droit ne lit rien du tout", async () => {
    for (const session of [null, { userId: "u", roles: ["medecin"] }, { userId: "u", roles: ["admin_etablissement"] }]) {
      getSessionMock.mockResolvedValue(session);

      const files = await getFilesAttenteAdmin();

      expect(files.acces).toBe(false);
      expect(files.executionsTaches).toEqual([]);
      expect(files.comptesParRole).toEqual([]);
    }
    expect(p.executionTache.count).not.toHaveBeenCalled();
    expect(p.userRole.groupBy).not.toHaveBeenCalled();
    expect(p.actionAdministrateurEnAttente.count).not.toHaveBeenCalled();
  });
});

describe("getFilesAttenteAdmin : files et etat technique (F-ADM-01)", () => {
  it("compte les demandes de comptes en attente, dont les reinitialisations 2FA", async () => {
    p.actionAdministrateurEnAttente.count.mockImplementation(async ({ where }: { where: { type?: string } }) =>
      where.type === "reinitialisation_2fa" ? 2 : 5
    );

    const files = await getFilesAttenteAdmin();

    expect(files.demandesComptesEnAttente).toBe(5);
    expect(files.reinitialisations2faEnAttente).toBe(2);
    for (const appel of p.actionAdministrateurEnAttente.count.mock.calls) {
      expect(appel[0].where).toMatchObject({ statut: "en_attente" });
      expect(appel[0].where.expireLe.gt).toBeInstanceOf(Date);
    }
  });

  it("compte la file SMS : differes en attente, et SMS deposes sur 24 h", async () => {
    p.envoiSms.count.mockImplementation(async ({ where }: { where: { statut: string } }) => (where.statut === "differe" ? 4 : 9));

    const files = await getFilesAttenteAdmin();

    expect(files.smsDifferesEnAttente).toBe(4);
    expect(files.smsDeposes24h).toBe(9);
  });

  it("ne compte pas comme 'professionnel a valider' un compte encore invite (F-AUTH-05)", async () => {
    await getFilesAttenteAdmin();

    expect(p.professionnelSante.findMany.mock.calls[0][0].where.user.statut).toEqual({ not: "invite" });
  });

  it("etablissementsParStatut retrouve la volumetrie sans requete supplementaire (F-ADM-01)", async () => {
    const files = await getFilesAttenteAdmin();

    expect(files.etablissementsParStatut).toEqual(
      expect.arrayContaining([{ statut: "brouillon", nombre: 1 }, { statut: "actif", nombre: 1 }])
    );
    expect(files.etablissementsParStatut.reduce((total, ligne) => total + ligne.nombre, 0)).toBe(2);
  });

  it("compte les invitations d'activation encore valables", async () => {
    p.invitationCompte.count.mockResolvedValue(5);

    const files = await getFilesAttenteAdmin();

    expect(files.invitationsEnAttente).toBe(5);
    expect(p.invitationCompte.count.mock.calls[0][0].where).toMatchObject({ utiliseLe: null, annuleeLe: null });
    expect(p.invitationCompte.count.mock.calls[0][0].where.expireLe.gt).toBeInstanceOf(Date);
  });

  it("compte les SMS en reprise et en echec sur 24 h (RG-NOT-03)", async () => {
    p.envoiSms.count.mockImplementation(async ({ where }: { where: { statut: string } }) => (where.statut === "en_attente" ? 2 : where.statut === "echec" ? 1 : 0));

    const files = await getFilesAttenteAdmin();

    expect(files.smsEnAttenteDeReprise).toBe(2);
    expect(files.smsEnEchec24h).toBe(1);
    const echecs = p.envoiSms.count.mock.calls.map((appel) => appel[0].where).find((where) => where.statut === "echec");
    expect(echecs.dateEnvoi.gte).toBeInstanceOf(Date);
  });

  it("compte les erreurs de taches des 24 dernieres heures seulement", async () => {
    p.executionTache.count.mockResolvedValue(3);

    const files = await getFilesAttenteAdmin();

    expect(files.erreursTaches24h).toBe(3);
    const critere = p.executionTache.count.mock.calls[0][0].where;
    expect(critere.statut).toBe("erreur");
    const ecart = Date.now() - critere.date.gte.getTime();
    expect(ecart).toBeGreaterThan(23.9 * 3600 * 1000);
    expect(ecart).toBeLessThan(24.1 * 3600 * 1000);
  });

  it("donne, pour chacune des 5 taches, sa derniere execution (jamais executee = null)", async () => {
    const date = new Date("2026-09-27T06:00:00.000Z");
    p.executionTache.findFirst.mockImplementation(async ({ where }: { where: { tache: string } }) =>
      where.tache === "remise_sms_differes"
        ? { date, statut: "erreur", nombreTraite: null, message: "TypeError: valeur invalide" }
        : where.tache === "purge_notifications"
          ? { date, statut: "ok", nombreTraite: 12, message: null }
          : null
    );

    const files = await getFilesAttenteAdmin();

    expect(files.executionsTaches.length).toBeGreaterThanOrEqual(5);
    const parTache = new Map(files.executionsTaches.map((execution) => [execution.tache, execution]));
    expect(parTache.get("purge_notifications")).toMatchObject({ dernierStatut: "ok", nombreTraite: 12, dernierMessage: null, derniereExecution: date.toISOString() });
    expect(parTache.get("remise_sms_differes")).toMatchObject({ dernierStatut: "erreur", dernierMessage: "TypeError: valeur invalide" });
    expect(parTache.get("relances_laboratoire")).toMatchObject({ derniereExecution: null, dernierStatut: null, dernierMessage: null });
  });

  it("donne les comptes ACTIFS par role, du plus nombreux au moins nombreux", async () => {
    p.userRole.groupBy.mockResolvedValue([
      { nom: "medecin", _count: { _all: 4 } },
      { nom: "patient", _count: { _all: 40 } },
    ]);

    const files = await getFilesAttenteAdmin();

    expect(files.comptesParRole).toEqual([
      { role: "patient", nombre: 40 },
      { role: "medecin", nombre: 4 },
    ]);
    expect(p.userRole.groupBy.mock.calls[0][0].where).toEqual({ user: { statut: "actif" } });
  });

  it("conserve les files existantes (doublons, brouillons, demandes des personnes)", async () => {
    const files = await getFilesAttenteAdmin();

    expect(files).toMatchObject({ acces: true, doublonsPatientsEnAttente: 2, etablissementsEnBrouillon: 1, demandesPersonnesEnAttente: 1 });
  });
});
