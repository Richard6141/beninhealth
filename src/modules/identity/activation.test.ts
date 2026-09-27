import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.9" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async (valeur: string) => `hash:${valeur}`);
  return { default: { hash }, hash };
});
vi.mock("@/modules/identity/invitations", () => ({
  lireInvitation: vi.fn(),
  consommerInvitation: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { consommerInvitation, lireInvitation } from "@/modules/identity/invitations";
import { activerCompteAction } from "@/modules/identity/activation";
import { VERSION_CONDITIONS } from "@/modules/identity/conditions";

const p = prisma as unknown as { user: { findUnique: Mock; updateMany: Mock } };
const lireInvitationMock = lireInvitation as unknown as Mock;
const consommerMock = consommerInvitation as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const ETAT = { error: null, success: false };
const JETON = "j".repeat(43);

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    jeton: JETON,
    motDePasse: "girafe-bleue-42-xyz",
    confirmation: "girafe-bleue-42-xyz",
    conditions: "on",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  lireInvitationMock.mockResolvedValue({ etat: "valide", invitationId: "inv-1", userId: "u-1", prenom: "Awa", role: "medecin" });
  consommerMock.mockResolvedValue(true);
  p.user.findUnique.mockResolvedValue({ email: "awa.sossou@exemple.bj", telephone: "+2290197123456" });
  p.user.updateMany.mockResolvedValue({ count: 1 });
});

describe("activerCompteAction (F-AUTH-05)", () => {
  it("consomme l'invitation, choisit le mot de passe, active le compte et trace l'acceptation des conditions", async () => {
    const etat = await activerCompteAction(ETAT, formulaire());

    expect(etat).toEqual({ error: null, success: true });
    expect(consommerMock).toHaveBeenCalledWith(expect.anything(), "inv-1");
    expect(p.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u-1", statut: "invite" },
      data: {
        motDePasseHash: "hash:girafe-bleue-42-xyz",
        statut: "actif",
        conditionsVersion: VERSION_CONDITIONS,
        conditionsAccepteesLe: expect.any(Date),
      },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(journaliserMock.mock.calls[0][0])).not.toContain("girafe");
  });

  it("n'active que les comptes au statut invite (un compte suspendu ne se reactive pas par ce lien)", async () => {
    p.user.updateMany.mockResolvedValue({ count: 0 });

    const etat = await activerCompteAction(ETAT, formulaire());

    expect(etat.success).toBe(false);
  });

  it.each([
    ["inconnue", /n'est pas valide/],
    ["utilisee", /déjà utilisée/],
    ["expiree", /expiré/],
    ["annulee", /remplacée/],
  ])("invitation %s : refusee avec son message, aucun compte modifie", async (etatInvitation, message) => {
    lireInvitationMock.mockResolvedValue({ etat: etatInvitation });

    const etat = await activerCompteAction(ETAT, formulaire());

    expect(etat.success).toBe(false);
    expect(etat.error).toMatch(message);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("CA-1 : deux activations simultanees, la seconde echoue avec 'deja utilisee'", async () => {
    consommerMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const premiere = await activerCompteAction(ETAT, formulaire());
    const seconde = await activerCompteAction(ETAT, formulaire());

    expect(premiere.success).toBe(true);
    expect(seconde.success).toBe(false);
    expect(seconde.error).toMatch(/déjà utilisée/);
    expect(p.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it("RG-AUTH-43 : 12 caracteres au moins, sans mot courant, sans telephone ni adresse e-mail", async () => {
    for (const [motDePasse, message] of [
      ["Tr0mpette", /au moins 12/],
      ["motdepasse123456", /trop facile/],
      ["chat0197123456ab", /telephone/],
      ["mon-awa.sossou-xyz", /e-mail/],
    ] as Array<[string, RegExp]>) {
      const etat = await activerCompteAction(ETAT, formulaire({ motDePasse, confirmation: motDePasse }));

      expect(etat.error).toMatch(message);
    }
    expect(p.user.updateMany).not.toHaveBeenCalled();
    expect(consommerMock).not.toHaveBeenCalled();
  });

  it("refuse deux mots de passe differents et l'absence d'acceptation des conditions", async () => {
    expect((await activerCompteAction(ETAT, formulaire({ confirmation: "autre-chose-42-xyz" }))).error).toMatch(/ne correspondent pas/);
    expect((await activerCompteAction(ETAT, formulaire({ conditions: "" }))).error).toMatch(/conditions d'utilisation/);
    expect(lireInvitationMock).not.toHaveBeenCalled();
  });

  it("limite les tentatives par adresse : 20 par heure", async () => {
    lireInvitationMock.mockResolvedValue({ etat: "inconnue" });

    for (let i = 0; i < 20; i++) {
      await activerCompteAction(ETAT, formulaire());
    }
    const suivante = await activerCompteAction(ETAT, formulaire());

    expect(suivante.error).toBe("Trop de tentatives. Réessayez dans 1 heure.");
    expect(lireInvitationMock).toHaveBeenCalledTimes(20);
  });

  it("n'ouvre aucune session : la personne se connecte ensuite normalement", async () => {
    const etat = await activerCompteAction(ETAT, formulaire());

    expect(etat.success).toBe(true);
    // Aucune dependance a createSession dans le module : rien a verifier de plus que la reponse sans redirection.
    expect(Object.keys(etat).sort()).toEqual(["error", "success"]);
  });
});
