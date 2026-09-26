import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findMany: vi.fn(), findUnique: vi.fn() },
    consentement: { findFirst: vi.fn() },
    codeReclamationDossier: { findMany: vi.fn(), updateMany: vi.fn(), update: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
    userRole: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn(), createSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.1" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/sms/envoyer", () => ({ envoyerSms: vi.fn() }));
vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn(async (valeur: string) => `hash:${valeur}`),
    compare: vi.fn(async (saisi: string, hash: string) => hash === `hash:${saisi}`),
  },
}));

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createSession, getSession } from "@/lib/session";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { journaliser } from "@/modules/audit/journaliser";
import { genererCodeReclamationAction, reclamerDossierAction } from "@/modules/identity/reclamation";

const p = prisma as unknown as {
  patient: { findMany: Mock; findUnique: Mock };
  consentement: { findFirst: Mock };
  codeReclamationDossier: { findMany: Mock; updateMany: Mock; update: Mock; create: Mock };
  user: { findUnique: Mock; update: Mock };
  userRole: { findMany: Mock };
};
const compareMock = bcrypt.compare as unknown as Mock;
const createSessionMock = createSession as unknown as Mock;
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };
const MESSAGE_GENERIQUE = "Code, date de naissance ou téléphone incorrect.";

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    code: "ABCD2345",
    dateNaissance: "1990-05-05",
    telephone: "+2290100000000",
    nouvelEmail: "nouveau@exemple.bj",
    nouveauMotDePasse: "MotDePasse123",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const utilisateurSansCompte = { id: "user-pat", statut: "sans_compte", telephone: "+2290100000000" };
const patientVise = { id: "pat-1", userId: "user-pat", dateNaissance: new Date("1990-05-05T12:00:00Z"), user: utilisateurSansCompte };

function codeActif(surcharges: Record<string, unknown> = {}) {
  return { id: "code-1", patientId: "pat-1", codeHash: "hash:ABCD2345", tentatives: 0, patient: patientVise, ...surcharges };
}

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  p.patient.findMany.mockResolvedValue([patientVise]);
  p.codeReclamationDossier.findMany.mockResolvedValue([codeActif()]);
  p.user.findUnique.mockResolvedValue(null);
  p.userRole.findMany.mockResolvedValue([{ nom: "patient" }]);
});

describe("reclamerDossierAction : code juste (F-AUTH-03)", () => {
  it("active le compte, consomme le code et ouvre une session", async () => {
    const resultat = await reclamerDossierAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.user.update.mock.calls[0][0].data).toMatchObject({ email: "nouveau@exemple.bj", statut: "actif" });
    expect(p.codeReclamationDossier.update.mock.calls[0][0].data.consommeLe).toBeInstanceOf(Date);
    expect(createSessionMock).toHaveBeenCalledWith({ userId: "user-pat", roles: ["patient"] });
  });

  it("ne compare que les codes du dossier identifie par le telephone et la date de naissance, jamais tous les codes", async () => {
    await reclamerDossierAction(etatInitial, formulaire());

    expect(p.patient.findMany.mock.calls[0][0].where).toEqual({ user: { telephone: "+2290100000000", statut: "sans_compte" } });
    const critere = p.codeReclamationDossier.findMany.mock.calls[0][0].where;
    expect(critere.patientId).toEqual({ in: ["pat-1"] });
    expect(critere.consommeLe).toBeNull();
    expect(critere.tentatives).toEqual({ lt: 5 });
  });

  it("refuse une adresse e-mail deja utilisee par un autre compte", async () => {
    p.user.findUnique.mockResolvedValue({ id: "autre-user" });

    const resultat = await reclamerDossierAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("e-mail");
    expect(p.user.update).not.toHaveBeenCalled();
  });
});

describe("reclamerDossierAction : essais faux (RG-AUTH-20, RG-AUTH-21)", () => {
  it("un code faux sur un dossier dont telephone et naissance correspondent compte comme essai et est journalise", async () => {
    const resultat = await reclamerDossierAction(etatInitial, formulaire({ code: "ZZZZ9999" }));

    expect(resultat).toEqual({ error: MESSAGE_GENERIQUE, success: false });
    expect(p.codeReclamationDossier.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["code-1"] } },
      data: { tentatives: { increment: 1 } },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "tentative_reclamation_echouee", utilisateurId: "user-pat" });
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("un telephone ou une date de naissance qui ne correspondent a aucun dossier donnent la meme reponse, sans lire de code", async () => {
    p.patient.findMany.mockResolvedValue([]);
    const telephoneFaux = await reclamerDossierAction(etatInitial, formulaire({ telephone: "+2290199999999" }));

    p.patient.findMany.mockResolvedValue([patientVise]);
    const naissanceFausse = await reclamerDossierAction(etatInitial, formulaire({ dateNaissance: "1991-01-01" }));

    expect(telephoneFaux).toEqual({ error: MESSAGE_GENERIQUE, success: false });
    expect(naissanceFausse).toEqual({ error: MESSAGE_GENERIQUE, success: false });
    expect(p.codeReclamationDossier.findMany).not.toHaveBeenCalled();
    expect(p.codeReclamationDossier.updateMany).not.toHaveBeenCalled();
  });

  it("sans dossier correspondant, un bcrypt factice est quand meme paye (temps de reponse non revelateur)", async () => {
    p.patient.findMany.mockResolvedValue([]);

    await reclamerDossierAction(etatInitial, formulaire());

    expect(compareMock).toHaveBeenCalledTimes(1);
  });

  it("apres 10 echecs depuis la meme adresse, plus aucun essai n'atteint la base", async () => {
    p.patient.findMany.mockResolvedValue([]);
    for (let i = 0; i < 10; i += 1) {
      await reclamerDossierAction(etatInitial, formulaire({ code: `FAUX000${i}` }));
    }
    p.patient.findMany.mockClear();

    const resultat = await reclamerDossierAction(etatInitial, formulaire());

    expect(resultat.error).toContain("Trop de tentatives");
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });

  it("un succes n'est jamais compte comme un echec de la limite", async () => {
    for (let i = 0; i < 12; i += 1) {
      p.user.update.mockClear();
      const resultat = await reclamerDossierAction(etatInitial, formulaire());
      expect(resultat.success).toBe(true);
    }
  });

  it("valide les champs avant tout acces a la base", async () => {
    expect((await reclamerDossierAction(etatInitial, formulaire({ code: "" }))).success).toBe(false);
    expect((await reclamerDossierAction(etatInitial, formulaire({ dateNaissance: "pas-une-date" }))).error).toContain("naissance");
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });
});

describe("genererCodeReclamationAction : un seul code valide a la fois", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-medecin", roles: ["medecin"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", user: { statut: "sans_compte", telephone: "+2290100000000" } });
    p.consentement.findFirst.mockResolvedValue({ id: "consentement-1" });
  });

  it("invalide les codes precedents encore valides avant de creer le nouveau", async () => {
    const ordre: string[] = [];
    p.codeReclamationDossier.updateMany.mockImplementation(async () => {
      ordre.push("invalidation");
      return { count: 1 };
    });
    p.codeReclamationDossier.create.mockImplementation(async () => {
      ordre.push("creation");
      return { id: "code-2" };
    });
    const formData = new FormData();
    formData.set("patientId", "pat-1");

    const resultat = await genererCodeReclamationAction({ error: null, success: false }, formData);

    expect(resultat.success).toBe(true);
    expect(ordre).toEqual(["invalidation", "creation"]);
    const critere = p.codeReclamationDossier.updateMany.mock.calls[0][0];
    expect(critere.where).toMatchObject({ patientId: "pat-1", consommeLe: null });
    expect(critere.data.expireLe).toBeInstanceOf(Date);
  });

  it("refuse un professionnel sans consentement actif sur ce patient", async () => {
    p.consentement.findFirst.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("patientId", "pat-1");

    const resultat = await genererCodeReclamationAction({ error: null, success: false }, formData);

    expect(resultat.success).toBe(false);
    expect(p.codeReclamationDossier.create).not.toHaveBeenCalled();
  });
});
