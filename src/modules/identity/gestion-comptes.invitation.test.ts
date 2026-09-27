import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    invitationCompte: { updateMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ host: "sante.exemple.bj" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn(async () => {}) }));
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async (valeur: string) => `hash:${valeur}`);
  return { default: { hash, compare: vi.fn() }, hash };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { envoyerEmail } from "@/lib/mail";
import { journaliser } from "@/modules/audit/journaliser";
import { creerEtablissementAction, creerProfessionnelAction, renvoyerInvitationAction } from "@/modules/identity/gestion-comptes";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findFirst: Mock; count: Mock; create: Mock };
  etablissementSanitaire: { findUnique: Mock; count: Mock; create: Mock };
  user: { findUnique: Mock; create: Mock };
  invitationCompte: { updateMany: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const envoyerEmailMock = envoyerEmail as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const ETAT = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"], sessionId: "s" });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-admin", etablissementId: "etab-1" });
  p.professionnelSante.findFirst.mockResolvedValue(null);
  p.professionnelSante.count.mockResolvedValue(0);
  p.professionnelSante.create.mockResolvedValue({ id: "prof-neuf" });
  p.etablissementSanitaire.findUnique.mockResolvedValue({ nom: "CHU de Cotonou" });
  p.etablissementSanitaire.count.mockResolvedValue(0);
  p.etablissementSanitaire.create.mockResolvedValue({ id: "etab-neuf" });
  p.user.findUnique.mockResolvedValue(null);
  p.user.create.mockResolvedValue({ id: "user-neuf" });
  p.invitationCompte.updateMany.mockResolvedValue({ count: 0 });
  p.invitationCompte.create.mockResolvedValue({});
});

describe("creerProfessionnelAction : invitation au lieu d'un mot de passe temporaire (F-AUTH-05)", () => {
  const champs = { nom: "Sossou", prenom: "Awa", email: "awa@exemple.bj", telephone: "+22997000000", role: "medecin", specialite: "Cardiologie", numeroOrdre: "" };

  it("cree le compte 'invite' avec un mot de passe inutilisable et envoie l'invitation", async () => {
    const etat = await creerProfessionnelAction(ETAT, formulaire(champs));

    expect(etat.success).toBe(true);
    expect(etat.invitationEnvoyeeA).toBe("awa@exemple.bj");
    expect(etat.motDePasseTemporaire).toBeUndefined();

    const donneesUtilisateur = p.user.create.mock.calls[0][0].data;
    expect(donneesUtilisateur.statut).toBe("invite");
    expect(donneesUtilisateur.motDePasseHash).toMatch(/^hash:[0-9a-f]{64}$/);

    expect(p.invitationCompte.create).toHaveBeenCalledTimes(1);
    expect(p.invitationCompte.create.mock.calls[0][0].data).toMatchObject({ userId: "user-neuf", creeParId: "admin-1" });
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock.mock.calls[0][0].to).toBe("awa@exemple.bj");
    expect(envoyerEmailMock.mock.calls[0][0].html).toContain("/activer?jeton=");
  });

  it("hors production, le lien est renvoye a la personne qui invite ; le jeton en clair n'est ni stocke ni journalise", async () => {
    const etat = await creerProfessionnelAction(ETAT, formulaire(champs));

    expect(etat.lienInvitation).toMatch(/^https:\/\/sante\.exemple\.bj\/activer\?jeton=[A-Za-z0-9_-]{43}$/);
    const jeton = decodeURIComponent(etat.lienInvitation!.split("jeton=")[1]);
    expect(JSON.stringify(p.invitationCompte.create.mock.calls)).not.toContain(jeton);
    expect(JSON.stringify(journaliserMock.mock.calls)).not.toContain(jeton);
  });

  it("si l'envoi de l'invitation echoue en production, le compte existe et l'erreur invite a renvoyer", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXTAUTH_SECRET", "secret-de-test-32-caracteres-minimum-xxxx");
    vi.stubEnv("DATABASE_URL", "postgresql://x");
    vi.stubEnv("SMTP_HOST", "h");
    vi.stubEnv("SMTP_PORT", "1");
    vi.stubEnv("SMTP_USER", "u");
    vi.stubEnv("SMTP_PASSWORD", "p");
    vi.stubEnv("SMTP_FROM", "f");
    envoyerEmailMock.mockRejectedValueOnce(new Error("SMTP indisponible"));

    const etat = await creerProfessionnelAction(ETAT, formulaire(champs));

    vi.unstubAllEnvs();
    expect(etat.success).toBe(false);
    expect(etat.error).toMatch(/Renvoyez-la/);
    expect(p.user.create).toHaveBeenCalledTimes(1);
  });
});

describe("creerEtablissementAction : invitation de l'administrateur", () => {
  it("cree l'administrateur au statut 'invite' et lui envoie une invitation", async () => {
    getSessionMock.mockResolvedValue({ userId: "min-1", roles: ["admin_national"], sessionId: "s" });

    const etat = await creerEtablissementAction(
      ETAT,
      formulaire({
        nom: "Centre de sante de Zogbo",
        type: "centre_sante",
        localisation: "Cotonou",
        latitude: "6.36",
        longitude: "2.4",
        capacite: "30",
        servicesDisponibles: "",
        adminNom: "Adjovi",
        adminPrenom: "Koffi",
        adminEmail: "koffi@exemple.bj",
        adminTelephone: "+22997111111",
      })
    );

    expect(etat.error).toBeNull();
    expect(etat.success).toBe(true);
    expect(etat.invitationEnvoyeeA).toBe("koffi@exemple.bj");
    expect(etat.motDePasseTemporaire).toBeUndefined();
    expect(p.user.create.mock.calls[0][0].data.statut).toBe("invite");
    expect(p.invitationCompte.create.mock.calls[0][0].data.creeParId).toBe("min-1");
    expect(envoyerEmailMock.mock.calls[0][0].html).toContain("Centre de sante de Zogbo");
  });
});

describe("renvoyerInvitationAction (RG-AUTH-40)", () => {
  const cible = {
    id: "u-2",
    prenom: "Awa",
    email: "awa@exemple.bj",
    statut: "invite",
    roles: [{ nom: "medecin" }],
    professionnel: { etablissementId: "etab-1", etablissement: { nom: "CHU de Cotonou" } },
  };

  beforeEach(() => {
    p.user.findUnique.mockResolvedValue(cible);
  });

  it("annule l'ancienne invitation, en cree une nouvelle, l'envoie et journalise", async () => {
    const etat = await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }));

    expect(etat.success).toBe(true);
    expect(p.invitationCompte.updateMany).toHaveBeenCalledWith({
      where: { userId: "u-2", utiliseLe: null, annuleeLe: null },
      data: { annuleeLe: expect.any(Date) },
    });
    expect(p.invitationCompte.create).toHaveBeenCalledTimes(1);
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0].action).toBe("renvoi_invitation");
  });

  it("un administrateur d'un AUTRE etablissement ne peut pas renvoyer l'invitation (CA-3)", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-autre", etablissementId: "etab-2" });

    const etat = await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }));

    expect(etat.success).toBe(false);
    expect(p.invitationCompte.create).not.toHaveBeenCalled();
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("refuse un compte deja actif, un compte inconnu et un role non administrateur", async () => {
    p.user.findUnique.mockResolvedValue({ ...cible, statut: "actif" });
    expect((await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }))).success).toBe(false);

    p.user.findUnique.mockResolvedValue(null);
    expect((await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }))).success).toBe(false);

    getSessionMock.mockResolvedValue({ userId: "m-1", roles: ["medecin"], sessionId: "s" });
    p.user.findUnique.mockResolvedValue(cible);
    expect((await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }))).error).toMatch(/reservee/);

    getSessionMock.mockResolvedValue(null);
    expect((await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }))).success).toBe(false);
    expect(p.invitationCompte.create).not.toHaveBeenCalled();
  });

  it("le ministere peut renvoyer l'invitation de n'importe quel compte invite", async () => {
    getSessionMock.mockResolvedValue({ userId: "min-1", roles: ["admin_national"], sessionId: "s" });
    p.professionnelSante.findUnique.mockClear();

    const etat = await renvoyerInvitationAction(ETAT, formulaire({ userId: "u-2" }));

    expect(etat.success).toBe(true);
    expect(p.professionnelSante.findUnique).not.toHaveBeenCalled();
  });
});
