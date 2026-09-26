import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createHash } from "node:crypto";

/**
 * Tests de verifierIntegriteJournal (RG-AUD-02), prisma mocke (meme approche
 * que src/modules/patient/actions.test.ts). La formule d'empreinte elle-meme
 * a ete verifiee separement contre le trigger Postgres reel (voir le point
 * de coordination correspondant) : ces tests couvrent la logique de
 * detection de rupture, pas la formule de hachage en elle-meme.
 */

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/security/permissions", () => ({ can: vi.fn(() => true) }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    journalAudit: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifierIntegriteJournal } from "@/modules/audit/actions";

const prismaMock = prisma as unknown as {
  journalAudit: { findFirst: Mock; findMany: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function hash(empreintePrecedente: string | null, ligne: { id: string; utilisateurId: string; action: string; donneeConcernee: string; justification: string }): string {
  return createHash("sha256")
    .update((empreintePrecedente ?? "") + ligne.id + ligne.utilisateurId + ligne.action + ligne.donneeConcernee + ligne.justification, "utf8")
    .digest("hex");
}

const DEBUT = "2026-09-01";
const FIN = "2026-09-02";

describe("verifierIntegriteJournal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ userId: "admin1", roles: ["admin_national"] });
    prismaMock.journalAudit.create.mockResolvedValue({});
  });

  it("renvoie null si l'appelant n'est pas admin_national", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["admin_etablissement"] });
    const resultat = await verifierIntegriteJournal(DEBUT, FIN);
    expect(resultat).toBeNull();
  });

  it("renvoie null si la periode depasse 31 jours", async () => {
    const resultat = await verifierIntegriteJournal("2026-01-01", "2026-03-01");
    expect(resultat).toBeNull();
  });

  it("ne signale aucune rupture pour une chaine valide", async () => {
    prismaMock.journalAudit.findFirst.mockResolvedValue(null); // pas de ligne avant la periode

    const ligne1 = { id: "j1", utilisateurId: "u1", action: "connexion", donneeConcernee: "", justification: "ok" };
    const empreinte1 = hash(null, ligne1);
    const ligne2 = { id: "j2", utilisateurId: "u1", action: "deconnexion", donneeConcernee: "", justification: "ok" };
    const empreinte2 = hash(empreinte1, ligne2);

    prismaMock.journalAudit.findMany.mockResolvedValue([
      { ...ligne1, date: new Date("2026-09-01T10:00:00Z"), numeroSequence: BigInt(1), empreinte: empreinte1, empreintePrecedente: null },
      { ...ligne2, date: new Date("2026-09-01T11:00:00Z"), numeroSequence: BigInt(2), empreinte: empreinte2, empreintePrecedente: empreinte1 },
    ]);

    const resultat = await verifierIntegriteJournal(DEBUT, FIN);
    expect(resultat).not.toBeNull();
    expect(resultat!.lignesVerifiees).toBe(2);
    expect(resultat!.ruptures).toEqual([]);
  });

  it("detecte une empreinte incoherente (contenu modifie apres coup)", async () => {
    prismaMock.journalAudit.findFirst.mockResolvedValue(null);

    const ligne1 = { id: "j1", utilisateurId: "u1", action: "connexion", donneeConcernee: "", justification: "ok" };
    const empreinte1 = hash(null, ligne1);

    prismaMock.journalAudit.findMany.mockResolvedValue([
      {
        ...ligne1,
        justification: "contenu modifie apres coup", // le contenu ne correspond plus a l'empreinte stockee
        date: new Date("2026-09-01T10:00:00Z"),
        numeroSequence: BigInt(1),
        empreinte: empreinte1,
        empreintePrecedente: null,
      },
    ]);

    const resultat = await verifierIntegriteJournal(DEBUT, FIN);
    expect(resultat!.ruptures).toHaveLength(1);
    expect(resultat!.ruptures[0].type).toBe("empreinte_incoherente");
    expect(resultat!.ruptures[0].journalAuditId).toBe("j1");
  });

  it("detecte un chainon manquant (ligne supprimee de la chaine)", async () => {
    prismaMock.journalAudit.findFirst.mockResolvedValue({ empreinte: "empreinte-dune-ligne-precedente-reelle" });

    const ligne1 = { id: "j1", utilisateurId: "u1", action: "connexion", donneeConcernee: "", justification: "ok" };
    // empreintePrecedente pointe vers une empreinte qui n'est PAS celle renvoyee par findFirst
    // (ex. une ligne intermediaire a ete supprimee entre les deux).
    const empreinte1 = hash("empreinte-dune-ligne-disparue", ligne1);

    prismaMock.journalAudit.findMany.mockResolvedValue([
      {
        ...ligne1,
        date: new Date("2026-09-01T10:00:00Z"),
        numeroSequence: BigInt(5),
        empreinte: empreinte1,
        empreintePrecedente: "empreinte-dune-ligne-disparue",
      },
    ]);

    const resultat = await verifierIntegriteJournal(DEBUT, FIN);
    expect(resultat!.ruptures.some((r) => r.type === "chainon_manquant")).toBe(true);
  });
});
