import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async () => "hash");
  return { default: { hash }, hash };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerProfessionnelAction } from "@/modules/identity/gestion-comptes";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findFirst: Mock; count: Mock; create: Mock };
  user: { findUnique: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    nom: "Sossou",
    prenom: "Awa",
    email: "awa.sossou@example.test",
    telephone: "+22997000000",
    role: "medecin",
    specialite: "Cardiologie",
    numeroOrdre: "",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const etatInitial = { error: null, success: false };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "prof-admin", etablissementId: "etab-1" });
  p.professionnelSante.findFirst.mockResolvedValue(null);
  p.professionnelSante.count.mockResolvedValue(0);
  p.professionnelSante.create.mockResolvedValue({ id: "prof-neuf" });
  p.user.findUnique.mockResolvedValue(null);
  p.user.create.mockResolvedValue({ id: "user-neuf" });
});

describe("creerProfessionnelAction : identite professionnelle et affiliation", () => {
  it("cree le profil avec sa profession, son numero d'ordre canonique et une affiliation active", async () => {
    const resultat = await creerProfessionnelAction(etatInitial, formulaire({ numeroOrdre: " onmb 1234 " }));

    expect(resultat.success).toBe(true);
    const donnees = p.professionnelSante.create.mock.calls[0][0].data;
    expect(donnees).toMatchObject({
      profession: "medecin",
      numeroOrdre: "ONMB1234",
      etablissementId: "etab-1",
      affiliations: {
        create: { etablissementId: "etab-1", roleNom: "medecin", statut: "active", inviteParUserId: "admin-1" },
      },
    });
  });

  it("sans numero d'ordre, le profil est cree quand meme (numero facultatif) avec une affiliation", async () => {
    const resultat = await creerProfessionnelAction(etatInitial, formulaire());

    expect(resultat.success).toBe(true);
    const donnees = p.professionnelSante.create.mock.calls[0][0].data;
    expect(donnees.numeroOrdre).toBeNull();
    expect(donnees.affiliations.create.roleNom).toBe("medecin");
    expect(p.professionnelSante.findFirst).not.toHaveBeenCalled();
  });

  it("refuse un numero d'ordre deja enregistre pour la meme profession, sans creer de compte", async () => {
    p.professionnelSante.findFirst.mockResolvedValue({ id: "prof-existant" });

    const resultat = await creerProfessionnelAction(etatInitial, formulaire({ numeroOrdre: "ONMB1234" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("deja enregistre");
    expect(p.professionnelSante.findFirst.mock.calls[0][0].where).toEqual({ profession: "medecin", numeroOrdre: "ONMB1234" });
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("ne revele ni le nom ni l'etablissement de la personne deja enregistree", async () => {
    p.professionnelSante.findFirst.mockResolvedValue({ id: "prof-existant", etablissement: { nom: "CNHU" }, user: { nom: "Secret" } });
    const resultat = await creerProfessionnelAction(etatInitial, formulaire({ numeroOrdre: "ONMB1234" }));
    expect(resultat.error).not.toContain("CNHU");
    expect(resultat.error).not.toContain("Secret");
  });

  it("le meme numero pour une autre profession n'est pas un doublon", async () => {
    await creerProfessionnelAction(etatInitial, formulaire({ role: "pharmacien", numeroOrdre: "0042" }));
    expect(p.professionnelSante.findFirst.mock.calls[0][0].where).toEqual({ profession: "pharmacien", numeroOrdre: "0042" });
  });

  it("refuse un numero d'ordre aux caracteres inattendus", async () => {
    const resultat = await creerProfessionnelAction(etatInitial, formulaire({ numeroOrdre: "12'; DROP TABLE" }));
    expect(resultat.success).toBe(false);
    expect(p.professionnelSante.findFirst).not.toHaveBeenCalled();
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("traduit une course entre deux creations (contrainte unique) par le meme message", async () => {
    p.professionnelSante.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["profession", "numeroOrdre"] },
      })
    );
    const resultat = await creerProfessionnelAction(etatInitial, formulaire({ numeroOrdre: "ONMB1234" }));
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("deja enregistre");
  });

  it("une contrainte unique sur l'e-mail garde son message habituel", async () => {
    p.professionnelSante.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test", meta: { target: ["email"] } })
    );
    const resultat = await creerProfessionnelAction(etatInitial, formulaire());
    expect(resultat.error).toContain("email");
  });
});
