import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import bcrypt from "bcryptjs";

/**
 * La politique de mot de passe (RG-AUTH-02, RG-AUTH-43) s'applique a TOUS les
 * parcours qui definissent un mot de passe : reinitialisation, changement.
 * (La reclamation d'un dossier est couverte dans reclamation.test.ts.)
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NODE_ENV: "test", NEXTAUTH_SECRET: "secret-de-test-32-caracteres-minimum-xxxx" })) }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn(async () => {}) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    patient: { findUnique: vi.fn() },
    codeReinitialisationMotDePasse: { findFirst: vi.fn(), update: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { viderCompteursDebit } from "@/lib/limite-debit";
import { reinitialiserMotDePasseAction } from "@/modules/identity/reinitialisation-mot-de-passe";
import { changerMotDePasseAction } from "@/modules/identity/gestion-comptes";

const p = prisma as unknown as {
  user: { findUnique: Mock; update: Mock };
  patient: { findUnique: Mock };
  codeReinitialisationMotDePasse: { findFirst: Mock; update: Mock };
  sessionActive: { deleteMany: Mock };
  $transaction: Mock;
};
const getSessionMock = getSession as unknown as Mock;

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const ETAT = { error: null, success: false };
let hashAncien = "";

beforeEach(async () => {
  vi.clearAllMocks();
  viderCompteursDebit();
  hashAncien = await bcrypt.hash("AncienMotDePasse1", 4);
  p.sessionActive.deleteMany.mockResolvedValue({ count: 0 });
  p.$transaction.mockResolvedValue([]);
  p.patient.findUnique.mockResolvedValue({ dateNaissance: new Date("1990-04-23T00:00:00Z") });
});

describe("reinitialiserMotDePasseAction : politique", () => {
  async function reinitialiser(roles: string[], nouveauMotDePasse: string) {
    p.user.findUnique.mockResolvedValue({
      id: "u1",
      statut: "actif",
      roles: roles.map((nom) => ({ nom })),
      patient: { dateNaissance: new Date("1990-04-23T00:00:00Z") },
      telephone: "+2290197123456",
      motDePasseHash: hashAncien,
      email: "u1@example.test",
    });
    p.codeReinitialisationMotDePasse.findFirst.mockResolvedValue({ id: "code1", codeHash: await bcrypt.hash("123456", 4) });

    return reinitialiserMotDePasseAction(
      ETAT,
      formulaire({ email: "u1@example.test", code: "123456", nouveauMotDePasse, confirmationMotDePasse: nouveauMotDePasse })
    );
  }

  it("refuse un mot de passe courant apres un code valide, sans rien modifier", async () => {
    const resultat = await reinitialiser(["patient"], "motdepasse123");

    expect(resultat.success).toBe(false);
    expect(resultat.error).toMatch(/trop facile/);
    expect(p.user.update).not.toHaveBeenCalled();
    expect(p.sessionActive.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse la date de naissance et le telephone du compte", async () => {
    expect((await reinitialiser(["patient"], "zebre23041990")).error).toMatch(/date de naissance/);
    expect((await reinitialiser(["patient"], "chat0197123456")).error).toMatch(/telephone/);
  });

  it("un patient : 8 caracteres suffisent ; un professionnel : 12 exiges", async () => {
    expect((await reinitialiser(["patient"], "Tr0mpette")).success).toBe(true);
    expect((await reinitialiser(["medecin"], "Tr0mpette")).error).toMatch(/au moins 12/);
    expect((await reinitialiser(["medecin"], "Tr0mpette-du-jour")).success).toBe(true);
  });

  it("un compte patient et medecin est traite comme un professionnel", async () => {
    expect((await reinitialiser(["patient", "medecin"], "Tr0mpette")).error).toMatch(/au moins 12/);
  });

  it("un code faux ne revele rien de la politique : meme message generique", async () => {
    p.user.findUnique.mockResolvedValue({
      id: "u1",
      statut: "actif",
      roles: [{ nom: "patient" }],
      patient: null,
      telephone: "x",
      motDePasseHash: hashAncien,
      email: "u1@example.test",
    });
    p.codeReinitialisationMotDePasse.findFirst.mockResolvedValue({ id: "code1", codeHash: await bcrypt.hash("123456", 4) });

    const resultat = await reinitialiserMotDePasseAction(
      ETAT,
      formulaire({ email: "u1@example.test", code: "000000", nouveauMotDePasse: "motdepasse123", confirmationMotDePasse: "motdepasse123" })
    );

    expect(resultat.error).not.toMatch(/trop facile/);
  });
});

describe("changerMotDePasseAction : politique", () => {
  async function changer(roles: string[], nouveauMotDePasse: string) {
    getSessionMock.mockResolvedValue({ userId: "u1", roles, sessionId: "s1" });
    p.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@example.test",
      telephone: "+2290197123456",
      motDePasseHash: await bcrypt.hash("ActuelMotDePasse9", 4),
    });

    return changerMotDePasseAction(
      ETAT,
      formulaire({ motDePasseActuel: "ActuelMotDePasse9", nouveauMotDePasse, confirmationMotDePasse: nouveauMotDePasse })
    );
  }

  it("refuse un mot de passe courant", async () => {
    const resultat = await changer(["patient"], "azertyuiop");

    expect(resultat.error).toMatch(/trop facile/);
    expect(p.$transaction).not.toHaveBeenCalled();
  });

  it("refuse le numero de telephone et la date de naissance du compte", async () => {
    expect((await changer(["patient"], "chat0197123456")).error).toMatch(/telephone/);
    expect((await changer(["patient"], "zebre23041990")).error).toMatch(/date de naissance/);
  });

  it("un professionnel doit choisir 12 caracteres au moins", async () => {
    expect((await changer(["infirmier"], "Tr0mpette")).error).toMatch(/au moins 12/);
    expect((await changer(["infirmier"], "Tr0mpette-du-jour")).success).toBe(true);
  });

  it("un patient peut garder 8 caracteres", async () => {
    expect((await changer(["patient"], "Tr0mpette")).success).toBe(true);
  });

  it("le mot de passe actuel reste verifie en premier : un mauvais mot de passe actuel ne renseigne pas sur la politique", async () => {
    getSessionMock.mockResolvedValue({ userId: "u1", roles: ["patient"], sessionId: "s1" });
    p.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@example.test",
      telephone: "x",
      motDePasseHash: await bcrypt.hash("ActuelMotDePasse9", 4),
    });

    const resultat = await changerMotDePasseAction(
      ETAT,
      formulaire({ motDePasseActuel: "mauvais", nouveauMotDePasse: "azertyuiop", confirmationMotDePasse: "azertyuiop" })
    );

    expect(resultat.error).toMatch(/actuel est incorrect/);
  });
});
