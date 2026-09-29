import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    codePartageDossier: {
      deleteMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    consentement: { upsert: vi.fn() },
    journalAudit: { count: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (argument: unknown) =>
    typeof argument === "function" ? (argument as (tx: unknown) => unknown)(prisma) : Promise.all(argument as unknown[])
  );
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async (code: string) => `hash:${code}`);
  const compare = vi.fn(async (code: string, empreinte: string) => empreinte === `hash:${code}`);
  return { default: { hash, compare }, hash, compare };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn(async () => 10) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import {
  consommerCodePartageAction,
  genererCodePartageAction,
  getStatutCodePartage,
} from "@/modules/partage/actions";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  codePartageDossier: {
    deleteMany: Mock;
    create: Mock;
    findUnique: Mock;
    findMany: Mock;
    update: Mock;
    updateMany: Mock;
  };
  consentement: { upsert: Mock };
  journalAudit: { count: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const etatInitialGeneration = { error: null, success: false };
const etatInitialConsommation = { error: null, success: false };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  (lireParametre as unknown as Mock).mockResolvedValue(10);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("genererCodePartageAction (F-CIT-11, RG-CIT-90)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({
      id: "pat-1",
      userId: "user-pat",
      user: { niveauVerification: "N1" },
    });
    p.codePartageDossier.deleteMany.mockResolvedValue({ count: 0 });
    p.codePartageDossier.create.mockResolvedValue({ id: "code-1" });
  });

  function formulaireGeneration(niveauAcces = "FULL", duree = "24h"): FormData {
    return formulaire({ niveauAcces, duree });
  }

  it("refuse un compte qui n'est pas patient", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration());

    expect(resultat.success).toBe(false);
    expect(p.codePartageDossier.create).not.toHaveBeenCalled();
  });

  it("refuse un niveau d'acces absent ou inconnu", async () => {
    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaire({ niveauAcces: "AUTRE", duree: "24h" }));

    expect(resultat.success).toBe(false);
    expect(p.codePartageDossier.create).not.toHaveBeenCalled();
  });

  it("refuse une duree hors bornes autorisees (24h/7j/30j/6mois/12mois)", async () => {
    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaire({ niveauAcces: "FULL", duree: "36mois" }));

    expect(resultat.success).toBe(false);
    expect(p.codePartageDossier.create).not.toHaveBeenCalled();
  });

  it("refuse FULL_SENSITIVE si le compte patient n'est pas verifie N2 (RG-ACC-13)", async () => {
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat", user: { niveauVerification: "N1" } });

    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration("FULL_SENSITIVE", "24h"));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("vérifié");
    expect(p.codePartageDossier.create).not.toHaveBeenCalled();
  });

  it("accepte FULL_SENSITIVE pour un compte patient verifie N2", async () => {
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat", user: { niveauVerification: "N2" } });

    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration("FULL_SENSITIVE", "24h"));

    expect(resultat.success).toBe(true);
    const { data } = p.codePartageDossier.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.niveauAcces).toBe("FULL_SENSITIVE");
  });

  it("renvoie un code de 8 caracteres sans caractere ambigu, affiche XXXX-XXXX, valable 10 minutes", async () => {
    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration());

    expect(resultat.success).toBe(true);
    expect(resultat.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(resultat.expireLe).toBe(new Date(MAINTENANT.getTime() + 10 * 60_000).toISOString());
  });

  it("la duree de validite vient du parametre partage.code_duree_minutes, relu a chaque generation (F-ADM-07)", async () => {
    (lireParametre as unknown as Mock).mockResolvedValue(30);

    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration());

    expect(lireParametre).toHaveBeenCalledWith("partage.code_duree_minutes");
    expect(resultat.expireLe).toBe(new Date(MAINTENANT.getTime() + 30 * 60_000).toISOString());
    const { data } = p.codePartageDossier.create.mock.calls[0][0] as { data: { expireLe: Date } };
    expect(data.expireLe.toISOString()).toBe(new Date(MAINTENANT.getTime() + 30 * 60_000).toISOString());
  });

  it("stocke le niveau d'acces et la duree choisis par le patient (comme F-CIT-10)", async () => {
    await genererCodePartageAction(etatInitialGeneration, formulaireGeneration("SUMMARY", "7j"));

    const { data } = p.codePartageDossier.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.niveauAcces).toBe("SUMMARY");
    expect(data.duree).toBe("7j");
  });

  it("ne stocke que l'empreinte du code et invalide les codes non consommes precedents", async () => {
    const resultat = await genererCodePartageAction(etatInitialGeneration, formulaireGeneration());
    const codeBrut = (resultat.code ?? "").replace("-", "");

    expect(p.codePartageDossier.deleteMany).toHaveBeenCalledWith({ where: { patientId: "pat-1", consommeLe: null } });
    const { data } = p.codePartageDossier.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.codeHash).toBe(`hash:${codeBrut}`);
    expect(JSON.stringify(data)).not.toContain(`"${codeBrut}"`);
    expect(journaliserMock).not.toHaveBeenCalled();
  });
});

describe("getStatutCodePartage (Zero Trust)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
  });

  it("ne repond pas pour le code d'un autre patient", async () => {
    p.codePartageDossier.findUnique.mockResolvedValue({
      id: "code-x",
      patientId: "pat-autre",
      consommeLe: null,
      consommePar: null,
      expireLe: MAINTENANT,
    });

    expect(await getStatutCodePartage("code-x")).toBeNull();
  });

  it("renvoie le statut de son propre code, avec le nom du professionnel qui l'a utilise", async () => {
    p.codePartageDossier.findUnique.mockResolvedValue({
      id: "code-1",
      patientId: "pat-1",
      consommeLe: MAINTENANT,
      consommePar: { user: { prenom: "Julien", nom: "Ahouansou" } },
      expireLe: MAINTENANT,
    });

    expect(await getStatutCodePartage("code-1")).toEqual({
      consomme: true,
      consommeParNomComplet: "Dr. Julien Ahouansou",
      expireLe: MAINTENANT.toISOString(),
    });
  });

  it("renvoie null sans session patient", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getStatutCodePartage("code-1")).toBeNull();
  });
});

describe("consommerCodePartageAction (RG-CIT-90, RG-CIT-91)", () => {
  const CODE = "K7M4QX9P";

  function codeActif(surcharge: Record<string, unknown> = {}) {
    return {
      id: "code-1",
      patientId: "pat-1",
      codeHash: `hash:${CODE}`,
      consommeLe: null as Date | null,
      consommeParId: null as string | null,
      expireLe: new Date(MAINTENANT.getTime() + 5 * 60_000),
      niveauAcces: "FULL",
      duree: "24h",
      ...surcharge,
    };
  }

  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", statutValidation: "valide" });
    p.journalAudit.count.mockResolvedValue(0);
    p.codePartageDossier.findMany.mockResolvedValue([codeActif()]);
    p.codePartageDossier.update.mockResolvedValue({});
    p.codePartageDossier.updateMany.mockResolvedValue({ count: 1 });
    p.consentement.upsert.mockResolvedValue({});
  });

  it("refuse un patient", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(false);
    expect(p.codePartageDossier.findMany).not.toHaveBeenCalled();
  });

  it("refuse un professionnel dont le profil n'est pas valide", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", statutValidation: "en_attente" });

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(false);
    expect(p.codePartageDossier.findMany).not.toHaveBeenCalled();
  });

  it("bloque apres 5 echecs dans l'heure, sans meme regarder les codes", async () => {
    p.journalAudit.count.mockResolvedValue(5);

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Trop de tentatives");
    expect(p.codePartageDossier.findMany).not.toHaveBeenCalled();
    const comptage = p.journalAudit.count.mock.calls[0][0] as { where: { utilisateurId: string; action: string; date: { gte: Date } } };
    expect(comptage.where.utilisateurId).toBe("user-med");
    expect(comptage.where.action).toBe("partage_code_echec");
    expect(comptage.where.date.gte.toISOString()).toBe(new Date(MAINTENANT.getTime() - 60 * 60_000).toISOString());
  });

  it("refuse un format invalide et le journalise comme un echec, sans interroger les codes", async () => {
    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: "ABC" }));

    expect(resultat).toEqual({ error: "Code invalide.", success: false });
    expect(p.codePartageDossier.findMany).not.toHaveBeenCalled();
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ utilisateurId: "user-med", action: "partage_code_echec" });
  });

  it("refuse les caracteres ambigus 0, O, 1, I, L", async () => {
    for (const saisie of ["K7M4QX90", "K7M4QXO9", "K7M4QX19", "K7M4QXI9", "K7M4QXL9"]) {
      const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: saisie }));
      expect(resultat.success).toBe(false);
    }
    expect(p.codePartageDossier.findMany).not.toHaveBeenCalled();
  });

  it("ne cherche que parmi les codes non consommes et non expires", async () => {
    await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    const requete = p.codePartageDossier.findMany.mock.calls[0][0] as { where: { consommeLe: null; expireLe: { gt: Date } } };
    expect(requete.where.consommeLe).toBeNull();
    expect(requete.where.expireLe.gt.toISOString()).toBe(MAINTENANT.toISOString());
  });

  it("repond de facon generique et journalise un code inconnu, expire ou deja utilise", async () => {
    p.codePartageDossier.findMany.mockResolvedValue([]);

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("invalide, expire ou déjà utilisé");
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "partage_code_echec", donneeConcernee: "code_partage:introuvable" });
    expect(p.consentement.upsert).not.toHaveBeenCalled();
  });

  it("accepte la saisie avec tiret, espaces et minuscules", async () => {
    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: " k7m4-qx9p " }));

    expect(resultat).toEqual({ error: null, success: true, patientId: "pat-1" });
  });

  it("donne au professionnel un consentement 'consultations' de 24 h au niveau choisi par le patient, marque le code consomme et journalise", async () => {
    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat).toEqual({ error: null, success: true, patientId: "pat-1" });

    const fin = new Date(MAINTENANT.getTime() + 24 * 60 * 60 * 1000);
    expect(p.consentement.upsert).toHaveBeenCalledTimes(1);
    const appel = p.consentement.upsert.mock.calls[0][0] as {
      where: { patientId_acteurAutoriseId: { patientId: string; acteurAutoriseId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    expect(appel.where.patientId_acteurAutoriseId).toEqual({ patientId: "pat-1", acteurAutoriseId: "user-med" });
    expect(appel.create).toMatchObject({ typeAcces: "consultations", niveauAcces: "FULL", statut: "actif", dateFin: fin });
    expect(appel.update).toMatchObject({ typeAcces: "consultations", niveauAcces: "FULL", statut: "actif", dateFin: fin });

    const marquage = p.codePartageDossier.updateMany.mock.calls[0][0] as {
      where: { id: string; consommeLe: null };
      data: { consommeParId: string };
    };
    expect(marquage.where).toEqual({ id: "code-1", consommeLe: null });
    expect(marquage.data.consommeParId).toBe("pro-1");
    expect(journaliserMock.mock.calls.some((appelJournal) => appelJournal[0].action === "partage_code_reussi")).toBe(true);
  });

  it("respecte le niveau SUMMARY et la duree 7 jours choisis a la generation du code", async () => {
    p.codePartageDossier.findMany.mockResolvedValue([codeActif({ niveauAcces: "SUMMARY", duree: "7j" })]);

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(true);
    const fin = new Date(MAINTENANT.getTime() + 7 * 24 * 60 * 60 * 1000);
    const appel = p.consentement.upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(appel.create).toMatchObject({ niveauAcces: "SUMMARY", dateFin: fin });
  });

  it("respecte le niveau FULL_SENSITIVE choisi a la generation (le controle N2 a deja ete fait a cet instant)", async () => {
    p.codePartageDossier.findMany.mockResolvedValue([codeActif({ niveauAcces: "FULL_SENSITIVE", duree: "12mois" })]);

    const resultat = await consommerCodePartageAction(etatInitialConsommation, formulaire({ code: CODE }));

    expect(resultat.success).toBe(true);
    const fin = new Date(MAINTENANT);
    fin.setMonth(fin.getMonth() + 12);
    const appel = p.consentement.upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(appel.create).toMatchObject({ niveauAcces: "FULL_SENSITIVE", dateFin: fin });
  });
});

describe("consommerCodePartageAction, usage unique meme sous concurrence", () => {
  it("deux professionnels qui saisissent en meme temps le meme code : un seul obtient l'acces", async () => {
    const code = {
      id: "code-1",
      patientId: "pat-1",
      codeHash: "hash:K7M4QX9P",
      consommeLe: null as Date | null,
      consommeParId: null as string | null,
      expireLe: new Date(MAINTENANT.getTime() + 5 * 60_000),
    };

    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", statutValidation: "valide" });
    p.journalAudit.count.mockResolvedValue(0);
    p.codePartageDossier.findMany.mockImplementation(async () => {
      await tick();
      return code.consommeLe === null ? [{ ...code }] : [];
    });
    // Faux stockage : la mise a jour n'ecrit que si la condition de la requete est vraie (comme SQL).
    p.codePartageDossier.updateMany.mockImplementation(
      async ({ where, data }: { where: { id: string; consommeLe: null }; data: { consommeLe: Date; consommeParId: string } }) => {
        await tick();
        if (where.id === code.id && code.consommeLe === where.consommeLe) {
          Object.assign(code, data);
          return { count: 1 };
        }
        return { count: 0 };
      }
    );
    // Une mise a jour inconditionnelle (l'ancien code) ecrase sans condition.
    p.codePartageDossier.update.mockImplementation(async ({ data }: { data: { consommeLe: Date; consommeParId: string } }) => {
      await tick();
      Object.assign(code, data);
      return {};
    });
    p.consentement.upsert.mockResolvedValue({});

    const [premier, second] = await Promise.all([
      consommerCodePartageAction(etatInitialConsommation, formulaire({ code: "K7M4QX9P" })),
      consommerCodePartageAction(etatInitialConsommation, formulaire({ code: "K7M4QX9P" })),
    ]);

    expect([premier.success, second.success].filter(Boolean)).toHaveLength(1);
    expect(p.consentement.upsert).toHaveBeenCalledTimes(1);
  });
});
