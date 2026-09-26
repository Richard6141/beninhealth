import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * F-ADM-03 : validation des professionnels par le ministere. Prisma est
 * simule ; le comportement reel (suspension, sessions, affiliations) est
 * verifie sur la vraie base par le script decrit dans docs/coordination-agents.md.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    user: { findMany: vi.fn(), updateMany: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
    affiliationProfessionnelle: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import {
  approuverProfessionnelAction,
  demanderComplementProfessionnelAction,
  getFileValidationProfessionnels,
  refuserProfessionnelAction,
} from "./validation-professionnels";

const prismaMock = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock; updateMany: Mock };
  user: { findMany: Mock; updateMany: Mock };
  sessionActive: { deleteMany: Mock };
  affiliationProfessionnelle: { updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETAT = { error: null, success: false };

const PROFESSIONNEL = {
  id: "pro-1",
  userId: "user-pro",
  etablissementId: "etab-1",
  statutValidation: "valide",
  validationDecideLe: null,
  ordreVerifieLe: null,
  profession: "medecin",
  numeroOrdre: "ONMB123",
  user: { id: "user-pro", nom: "Ahouansou", prenom: "Koffi", roles: [{ nom: "medecin" }] },
};

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-validateur", roles: ["admin_national"] });
  prismaMock.professionnelSante.findUnique.mockResolvedValue(PROFESSIONNEL);
  prismaMock.professionnelSante.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findMany.mockResolvedValue([{ id: "admin-etab" }]);
  prismaMock.user.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.sessionActive.deleteMany.mockResolvedValue({ count: 1 });
  prismaMock.affiliationProfessionnelle.updateMany.mockResolvedValue({ count: 1 });
});

describe("controle d'acces (permission dediee validation_professionnel)", () => {
  for (const roles of [["admin_etablissement"], ["medecin"], ["patient"]]) {
    it(`refuse les trois actions et la lecture au role ${roles[0]}`, async () => {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles });

      expect(await getFileValidationProfessionnels()).toBeNull();
      expect((await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }))).success).toBe(false);
      expect((await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "numero_introuvable" }))).success).toBe(false);
      expect((await demanderComplementProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", message: "Merci de préciser le numéro." }))).success).toBe(false);

      expect(prismaMock.professionnelSante.findUnique).not.toHaveBeenCalled();
      expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
    });
  }

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getFileValidationProfessionnels()).toBeNull();
    expect((await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }))).success).toBe(false);
  });

  it("ne traite jamais un compte qui n'a pas de role clinique (administrateur, patient)", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ ...PROFESSIONNEL, user: { ...PROFESSIONNEL.user, roles: [{ nom: "admin_etablissement" }] } });

    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));

    expect(resultat).toEqual({ error: "Professionnel introuvable.", success: false });
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("RG-ADM-11 : on ne valide, refuse ni ne questionne son propre profil", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["admin_national"] });

    const approuve = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));
    const refuse = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "numero_introuvable" }));
    const complement = await demanderComplementProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", message: "Merci de préciser le numéro." }));

    for (const resultat of [approuve, refuse, complement]) {
      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("RG-ADM-11");
    }
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });
});

describe("approuverProfessionnelAction", () => {
  it("exige la confirmation de la verification aupres de l'Ordre", async () => {
    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1" }));
    expect(resultat.success).toBe(false);
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("refuse d'approuver un profil sans numero d'inscription a l'Ordre", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ ...PROFESSIONNEL, numeroOrdre: null, profession: null });

    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("complément");
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("enregistre la verification avec un verrou optimiste, journalise dans la transaction et notifie le professionnel", async () => {
    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.professionnelSante.updateMany).toHaveBeenCalledWith({
      where: { id: "pro-1", statutValidation: "valide", validationDecideLe: null, ordreVerifieLe: null },
      data: expect.objectContaining({
        statutValidation: "valide",
        ordreVerifiePar: "user-validateur",
        validationDecision: "approuve",
        validationMessage: null,
      }),
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "validation_professionnel_approuvee", donneeConcernee: "professionnel:pro-1" });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pro", "profil_professionnel_valide", expect.any(String), undefined);
    // Un profil qui n'etait pas refuse ne reactive ni compte ni affiliation suspendue.
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
  });

  it("retablit le compte et les affiliations d'un professionnel precedemment refuse", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ ...PROFESSIONNEL, statutValidation: "rejete", validationDecideLe: new Date("2026-09-01T00:00:00Z") });

    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));

    expect(resultat.success).toBe(true);
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-pro", statut: "suspendu" }, data: { statut: "actif" } });
    expect(prismaMock.affiliationProfessionnelle.updateMany).toHaveBeenCalledWith({
      where: { professionnelId: "pro-1", statut: "suspendue" },
      data: { statut: "active" },
    });
  });

  it("refuse proprement quand un autre validateur a decide entre-temps (aucune ecriture, aucun journal, aucune notification)", async () => {
    prismaMock.professionnelSante.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await approuverProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", confirmation: "on" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("traitée entre-temps");
    expect(journaliserMock).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });
});

describe("refuserProfessionnelAction", () => {
  it("exige un motif de la liste", async () => {
    const resultat = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "parce-que" }));
    expect(resultat.success).toBe(false);
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });

  it("exige une precision d'au moins 10 caracteres pour 'Autre motif'", async () => {
    const resultat = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "autre", precision: "court" }));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("10 caractères");
  });

  it("suspend le compte, ferme les sessions, suspend les affiliations, annule la verification et previent le professionnel et les administrateurs de son etablissement", async () => {
    const resultat = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "numero_introuvable", precision: "Aucun inscrit à ce numéro." }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.professionnelSante.updateMany).toHaveBeenCalledWith({
      where: { id: "pro-1", statutValidation: "valide", validationDecideLe: null, ordreVerifieLe: null },
      data: expect.objectContaining({
        statutValidation: "rejete",
        ordreVerifieLe: null,
        ordreVerifiePar: null,
        validationDecision: "refuse",
        validationMessage: "Numéro introuvable auprès de l'Ordre : Aucun inscrit à ce numéro.",
      }),
    });
    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({ where: { id: "user-pro", statut: "actif" }, data: { statut: "suspendu" } });
    expect(prismaMock.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-pro" } });
    expect(prismaMock.affiliationProfessionnelle.updateMany).toHaveBeenCalledWith({
      where: { professionnelId: "pro-1", statut: { in: ["active", "invitee"] } },
      data: { statut: "suspendue" },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "validation_professionnel_refusee", donneeConcernee: "professionnel:pro-1" });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pro", "profil_professionnel_refuse", expect.stringContaining("Numéro introuvable"), undefined);
    expect(creerNotificationMock).toHaveBeenCalledWith("admin-etab", "personnel_validation_refusee", expect.stringContaining("Koffi Ahouansou"), "/app/etablissement");
  });

  it("n'ecrit rien quand la demande a deja ete traitee", async () => {
    prismaMock.professionnelSante.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "incoherence_identite" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sessionActive.deleteMany).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("une notification en echec n'annule pas le refus deja acte", async () => {
    creerNotificationMock.mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultat = await refuserProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", motif: "document_illisible" }));

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("demanderComplementProfessionnelAction", () => {
  it("exige un message d'au moins 10 caracteres", async () => {
    const resultat = await demanderComplementProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", message: "court" }));
    expect(resultat.success).toBe(false);
  });

  it("enregistre la demande sans jamais toucher au statut ni au compte", async () => {
    const resultat = await demanderComplementProfessionnelAction(
      ETAT,
      formulaire({ professionnelId: "pro-1", message: "Merci de communiquer le numéro d'inscription à l'Ordre." })
    );

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = prismaMock.professionnelSante.updateMany.mock.calls[0][0];
    expect(data).toEqual({
      validationDecision: "complement",
      validationMessage: "Merci de communiquer le numéro d'inscription à l'Ordre.",
      validationDecideLe: expect.any(Date),
    });
    expect(prismaMock.user.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.sessionActive.deleteMany).not.toHaveBeenCalled();
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pro", "profil_professionnel_complement", expect.any(String), undefined);
    expect(creerNotificationMock).toHaveBeenCalledWith("admin-etab", "personnel_validation_complement", expect.any(String), "/app/etablissement");
  });

  it("refuse de demander un complement pour un profil deja refuse", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ ...PROFESSIONNEL, statutValidation: "rejete" });

    const resultat = await demanderComplementProfessionnelAction(ETAT, formulaire({ professionnelId: "pro-1", message: "Merci de préciser le numéro." }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.professionnelSante.updateMany).not.toHaveBeenCalled();
  });
});

describe("getFileValidationProfessionnels", () => {
  function ligne(id: string, dateCreation: string, champs: Record<string, unknown> = {}) {
    return {
      id,
      specialite: "Médecine générale",
      profession: null,
      numeroOrdre: null,
      statutValidation: "valide",
      validationDecision: null,
      validationMessage: null,
      validationDecideLe: null,
      ordreVerifieLe: null,
      ordreVerifiePar: null,
      etablissement: { nom: "CS Akpakpa" },
      user: { nom: id, prenom: "P", email: `${id}@test`, dateCreation: new Date(dateCreation), roles: [{ nom: "medecin" }, { nom: "patient" }] },
      ...champs,
    };
  }

  it("trie la file par etat puis par anciennete, et ne renvoie aucune donnee clinique", async () => {
    prismaMock.professionnelSante.findMany.mockResolvedValue([
      ligne("refuse", "2026-01-01T00:00:00Z", { statutValidation: "rejete" }),
      ligne("recent", "2026-09-20T00:00:00Z"),
      ligne("ancien", "2026-01-05T00:00:00Z"),
      ligne("verifie", "2026-01-02T00:00:00Z", { validationDecision: "approuve", ordreVerifieLe: new Date() }),
    ]);

    const file = await getFileValidationProfessionnels();

    expect(file?.map((p) => p.id)).toEqual(["ancien", "recent", "verifie", "refuse"]);
    expect(file?.[0].delaiDepasse).toBe(true);
    expect(file?.[2].delaiDepasse).toBe(false);
    expect(file?.[0].role).toBe("medecin");
    expect(Object.keys(file![0]).sort()).toEqual(
      [
        "dateDecision", "dateDemande", "decision", "delaiDepasse", "email", "etablissementNom", "etat", "heuresOuvreesEcoulees",
        "id", "message", "nomComplet", "numeroOrdre", "ordreVerifieLe", "profession", "role", "specialite",
      ].sort()
    );
  });
});
