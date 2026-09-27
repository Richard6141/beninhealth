import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { createHash } from "node:crypto";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    jetonCarteSante: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : Promise.all(arg as unknown[])
  );
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ host: "sante.test", "x-forwarded-proto": "https" })),
}));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn(async (url: string) => `data:image/png;base64,${Buffer.from(url).toString("base64")}`) } }));
vi.mock("@/modules/patient/carte-sante-impression", () => ({ creerJetonImpressionCarteSante: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerJetonImpressionCarteSante } from "@/modules/patient/carte-sante-impression";
import {
  genererJetonCarteSanteAction,
  genererLienImpressionCarteAction,
  getCarteSanteProfilAction,
  verifierCarteSanteAction,
} from "@/modules/patient/carte-sante";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  jetonCarteSante: { deleteMany: Mock; create: Mock; updateMany: Mock; findUnique: Mock; findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerJetonImpressionMock = creerJetonImpressionCarteSante as unknown as Mock;

const MAINTENANT = new Date("2026-09-27T12:00:00.000Z");
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const sha256 = (valeur: string) => createHash("sha256").update(valeur).digest("hex");

function decoderUrlDuQr(dataUrl: string): string {
  return Buffer.from(dataUrl.split(",")[1], "base64").toString("utf-8");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("genererJetonCarteSanteAction (RG-CIT-40)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
    p.jetonCarteSante.deleteMany.mockResolvedValue({ count: 0 });
    p.jetonCarteSante.findMany.mockResolvedValue([]);
    p.jetonCarteSante.create.mockResolvedValue({ id: "jeton-1" });
  });

  it("refuse tout autre role que patient", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    expect(await genererJetonCarteSanteAction()).toBeNull();
    expect(p.jetonCarteSante.create).not.toHaveBeenCalled();
  });

  it("refuse sans session ou sans dossier patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await genererJetonCarteSanteAction()).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue(null);
    expect(await genererJetonCarteSanteAction()).toBeNull();
  });

  it("stocke uniquement l'empreinte du jeton, valable 5 minutes, et le met dans l'adresse du QR", async () => {
    const resultat = await genererJetonCarteSanteAction();

    expect(resultat?.expirationMs).toBe(MAINTENANT.getTime() + 5 * 60 * 1000);
    const url = decoderUrlDuQr(resultat?.dataUrlQr ?? "");
    const jeton = new URL(url).searchParams.get("jeton") ?? "";
    expect(url.startsWith("https://sante.test/app/carte-sante/verifier?jeton=")).toBe(true);
    expect(jeton.length).toBeGreaterThanOrEqual(30);

    const { data } = p.jetonCarteSante.create.mock.calls[0][0] as { data: { jetonHash: string; patientId: string; expireLe: Date } };
    expect(data.jetonHash).toBe(sha256(jeton));
    expect(data.patientId).toBe("pat-1");
    expect(data.expireLe.getTime()).toBe(MAINTENANT.getTime() + 5 * 60 * 1000);
    expect(JSON.stringify(p.jetonCarteSante.create.mock.calls)).not.toContain(jeton);
  });

  it("ne supprime jamais d'un coup tous les jetons actifs : garde les 4 plus recents, supprime les plus anciens", async () => {
    p.jetonCarteSante.findMany.mockResolvedValue([{ id: "vieux-1" }, { id: "vieux-2" }]);

    await genererJetonCarteSanteAction();

    const recherche = p.jetonCarteSante.findMany.mock.calls[0][0] as {
      where: { patientId: string; consommeLe: null; expireLe: { gt: Date } };
      orderBy: unknown;
      skip: number;
    };
    expect(recherche.where.patientId).toBe("pat-1");
    expect(recherche.where.consommeLe).toBeNull();
    expect(recherche.orderBy).toEqual({ dateCreation: "desc" });
    expect(recherche.skip).toBe(4);
    expect(p.jetonCarteSante.deleteMany.mock.calls[0][0]).toEqual({ where: { id: { in: ["vieux-1", "vieux-2"] } } });
  });

  it("purge les jetons expires depuis plus d'un jour", async () => {
    await genererJetonCarteSanteAction();

    const purge = p.jetonCarteSante.deleteMany.mock.calls[1][0] as { where: { expireLe: { lt: Date } } };
    expect(purge.where.expireLe.lt.toISOString()).toBe(new Date(MAINTENANT.getTime() - 24 * 60 * 60 * 1000).toISOString());
  });

  it("chaque generation produit un jeton different", async () => {
    const a = decoderUrlDuQr((await genererJetonCarteSanteAction())?.dataUrlQr ?? "");
    const b = decoderUrlDuQr((await genererJetonCarteSanteAction())?.dataUrlQr ?? "");

    expect(a).not.toBe(b);
  });
});

describe("verifierCarteSanteAction (RG-CIT-40/41, CA-1)", () => {
  const JETON = "jeton-de-test-0123456789";

  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-acc", roles: ["admin_etablissement"] });
    p.jetonCarteSante.updateMany.mockResolvedValue({ count: 1 });
    p.jetonCarteSante.findUnique.mockResolvedValue({ patientId: "pat-1" });
    p.patient.findUnique.mockResolvedValue({
      id: "pat-1",
      identifiantSante: "BJ-SANTE-PAT-0001",
      dateNaissance: new Date("1994-03-12"),
      sexe: "F",
      user: { prenom: "Beatrice", nom: "Agossou" },
    });
  });

  it("refuse sans session, et refuse un patient (la carte se verifie a l'accueil, pas entre patients)", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await verifierCarteSanteAction(JETON)).toEqual({ statut: "refuse" });

    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    expect(await verifierCarteSanteAction(JETON)).toEqual({ statut: "refuse" });
    expect(p.jetonCarteSante.updateMany).not.toHaveBeenCalled();
  });

  it("accepte le personnel de sante et l'administration", async () => {
    for (const role of ["medecin", "infirmier", "agent_communautaire", "pharmacien", "laboratoire", "admin_etablissement", "admin_national"]) {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      expect((await verifierCarteSanteAction(JETON)).statut).toBe("valide");
    }
  });

  it("refuse un jeton vide ou trop long sans interroger la base", async () => {
    expect((await verifierCarteSanteAction("")).statut).toBe("expire_ou_utilise");
    expect((await verifierCarteSanteAction("x".repeat(101))).statut).toBe("expire_ou_utilise");
    expect(p.jetonCarteSante.updateMany).not.toHaveBeenCalled();
  });

  it("consomme par mise a jour conditionnelle sur l'empreinte, un jeton non expire et non consomme", async () => {
    await verifierCarteSanteAction(JETON);

    const appel = p.jetonCarteSante.updateMany.mock.calls[0][0] as {
      where: { jetonHash: string; consommeLe: null; expireLe: { gt: Date } };
      data: { consommeLe: Date };
    };
    expect(appel.where.jetonHash).toBe(sha256(JETON));
    expect(appel.where.consommeLe).toBeNull();
    expect(appel.where.expireLe.gt.toISOString()).toBe(MAINTENANT.toISOString());
    expect(appel.data.consommeLe.toISOString()).toBe(MAINTENANT.toISOString());
  });

  it("renvoie l'identite minimale et journalise la verification", async () => {
    const resultat = await verifierCarteSanteAction(JETON);

    expect(resultat).toEqual({
      statut: "valide",
      nomComplet: "Beatrice Agossou",
      identifiantSante: "BJ-SANTE-PAT-0001",
      dateNaissance: new Date("1994-03-12").toISOString(),
      sexe: "F",
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-acc",
      action: "verification_carte_sante",
      donneeConcernee: "patient:pat-1",
    });
  });

  it("un jeton expire, deja utilise ou inconnu ne donne rien (aucune mise a jour reussie)", async () => {
    p.jetonCarteSante.updateMany.mockResolvedValue({ count: 0 });

    expect(await verifierCarteSanteAction(JETON)).toEqual({ statut: "expire_ou_utilise" });
    expect(p.patient.findUnique).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("deux verifications simultanees du meme jeton : une seule aboutit", async () => {
    const etat = { consomme: false };
    p.jetonCarteSante.updateMany.mockImplementation(async ({ where }: { where: { consommeLe: null } }) => {
      await tick();
      if (etat.consomme === (where.consommeLe !== null)) {
        etat.consomme = true;
        return { count: 1 };
      }
      return { count: 0 };
    });

    const [premiere, seconde] = await Promise.all([verifierCarteSanteAction(JETON), verifierCarteSanteAction(JETON)]);

    expect([premiere.statut, seconde.statut].sort()).toEqual(["expire_ou_utilise", "valide"]);
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });
});

describe("getCarteSanteProfilAction (RG-CIT-41, QR de secours hors ligne)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({
      identifiantSante: "BJ-SANTE-PAT-0001",
      dateNaissance: new Date("1994-03-12"),
      user: { prenom: "Beatrice", nom: "Agossou" },
    });
  });

  it("refuse sans session ou pour tout autre role que patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getCarteSanteProfilAction()).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect(await getCarteSanteProfilAction()).toBeNull();
  });

  it("renvoie null si le patient est introuvable", async () => {
    p.patient.findUnique.mockResolvedValue(null);
    expect(await getCarteSanteProfilAction()).toBeNull();
  });

  it("renvoie l'identite minimale et un QR encodant uniquement l'identifiant sante, jamais un jeton ni une URL", async () => {
    const resultat = await getCarteSanteProfilAction();

    expect(resultat).toMatchObject({
      nomComplet: "Beatrice Agossou",
      dateNaissance: new Date("1994-03-12").toISOString(),
      identifiantSante: "BJ-SANTE-PAT-0001",
    });
    expect(decoderUrlDuQr(resultat?.dataUrlQrHorsLigne ?? "")).toBe("BJ-SANTE-PAT-0001");
  });
});

describe("genererLienImpressionCarteAction (F-CIT-05, etape 4, P1)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
    creerJetonImpressionMock.mockReturnValue("jeton-impression-test");
  });

  it("refuse sans session ou pour tout autre role que patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await genererLienImpressionCarteAction()).url).toBeNull();

    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    expect((await genererLienImpressionCarteAction()).url).toBeNull();
    expect(creerJetonImpressionMock).not.toHaveBeenCalled();
  });

  it("refuse si le patient est introuvable", async () => {
    p.patient.findUnique.mockResolvedValue(null);
    const resultat = await genererLienImpressionCarteAction();

    expect(resultat.url).toBeNull();
    expect(resultat.error).not.toBeNull();
  });

  it("cree un jeton pour le patient connecte et renvoie l'URL de telechargement", async () => {
    const resultat = await genererLienImpressionCarteAction();

    expect(creerJetonImpressionMock).toHaveBeenCalledWith("pat-1");
    expect(resultat).toEqual({
      error: null,
      url: "/api/patient/carte-sante/telecharger?jeton=jeton-impression-test",
    });
  });
});
