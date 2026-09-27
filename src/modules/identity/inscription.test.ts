import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findFirst: vi.fn(), create: vi.fn() },
    inscriptionEnAttente: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ createSession: vi.fn() }));
vi.mock("@/lib/mail", () => ({ envoyerEmail: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "x-forwarded-for": "10.0.0.1" })) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => {
  const hash = vi.fn(async (valeur: string) => `hash:${valeur}`);
  const compare = vi.fn(async (valeur: string, empreinte: string) => empreinte === `hash:${valeur}`);
  return { default: { hash, compare }, hash, compare };
});

import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { envoyerEmail } from "@/lib/mail";
import { redirect } from "next/navigation";
import { viderCompteursDebit } from "@/lib/limite-debit";
import {
  demarrerInscriptionAction,
  renvoyerCodeInscriptionAction,
  verifierCodeInscriptionAction,
  type InscriptionActionState,
} from "@/modules/identity/inscription";
import { VERSION_CONDITIONS } from "@/modules/identity/conditions";

const p = prisma as unknown as {
  user: { findFirst: Mock; create: Mock };
  inscriptionEnAttente: { create: Mock; findUnique: Mock; update: Mock; delete: Mock; deleteMany: Mock };
  $transaction: Mock;
};
const createSessionMock = createSession as unknown as Mock;
const envoyerEmailMock = envoyerEmail as unknown as Mock;
const redirectMock = redirect as unknown as Mock;

const ETAT: InscriptionActionState = { error: null };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

const valides = {
  nom: "adjovi",
  prenom: "kofi marie",
  email: "Kofi.Adjovi@Exemple.bj",
  telephone: "+229 01 97 12 34 56",
  motDePasse: "girafe-bleue-42x",
  dateNaissance: "1990-04-23",
  sexe: "M",
  conditions: "on",
};

function codeEnvoye(): string {
  const html = envoyerEmailMock.mock.calls[0][0].html as string;
  return /(\d{6})/.exec(html)![1];
}

beforeEach(() => {
  vi.clearAllMocks();
  viderCompteursDebit();
  p.user.findFirst.mockResolvedValue(null);
  p.inscriptionEnAttente.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "ins-1", ...data }));
  p.inscriptionEnAttente.deleteMany.mockResolvedValue({ count: 0 });
});

describe("demarrerInscriptionAction : validation (RG-AUTH-01, 02, 05, 07)", () => {
  it.each([
    [{ telephone: "97123456" }, /10 chiffres et commencent par 01/],
    [{ telephone: "123" }, /invalide/],
    [{ dateNaissance: "2999-01-01" }, /Vérifiez la date de naissance/],
    [{ dateNaissance: "1800-01-01" }, /Vérifiez la date de naissance/],
    [{ dateNaissance: "1990-02-31" }, /Vérifiez la date de naissance/],
    [{ dateNaissance: "2018-01-01" }, /moins de 15 ans/],
    [{ motDePasse: "court1" }, /au moins 8/],
    [{ motDePasse: "password" }, /trop facile/],
    [{ motDePasse: "chat0197123456" }, /telephone/],
    [{ motDePasse: "zebre23041990" }, /date de naissance/],
    [{ conditions: "" }, /conditions d'utilisation/],
    [{ email: "pas-un-email" }, /e-mail invalide/],
    [{ nom: "Adjovi3" }, /lettres/],
  ] as Array<[Record<string, string>, RegExp]>)("refuse %j", async (surcharge, message) => {
    const etat = await demarrerInscriptionAction(ETAT, formulaire({ ...valides, ...surcharge }));

    expect(etat.error).toMatch(message);
    expect(etat.etape).toBe("formulaire");
    expect(p.inscriptionEnAttente.create).not.toHaveBeenCalled();
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("refuse un enfant de 14 ans mais accepte quelqu'un qui a exactement 15 ans aujourd'hui", async () => {
    const aujourdhui = new Date();
    const il15ans = new Date(Date.UTC(aujourdhui.getUTCFullYear() - 15, aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()));
    const il15ansMoinsUnJour = new Date(il15ans.getTime() + 24 * 3600 * 1000);

    const refuse = await demarrerInscriptionAction(ETAT, formulaire({ ...valides, dateNaissance: il15ansMoinsUnJour.toISOString().slice(0, 10) }));
    const accepte = await demarrerInscriptionAction(ETAT, formulaire({ ...valides, dateNaissance: il15ans.toISOString().slice(0, 10) }));

    expect(refuse.error).toMatch(/moins de 15 ans/);
    expect(accepte.error).toBeNull();
  });
});

describe("demarrerInscriptionAction : inscription en attente", () => {
  it("cree une inscription en attente (pas de compte), normalise les champs et envoie un code", async () => {
    const etat = await demarrerInscriptionAction(ETAT, formulaire(valides));

    expect(etat.error).toBeNull();
    expect(etat.etape).toBe("code");
    expect(etat.inscriptionToken).toBeTruthy();
    expect(etat.emailMasque).toBe("k•••••@exemple.bj");
    expect(p.user.create).not.toHaveBeenCalled();

    const donnees = p.inscriptionEnAttente.create.mock.calls[0][0].data;
    expect(donnees.email).toBe("kofi.adjovi@exemple.bj");
    expect(donnees.telephone).toBe("+2290197123456");
    expect(donnees.nom).toBe("ADJOVI");
    expect(donnees.prenom).toBe("Kofi Marie");
    expect(donnees.conditionsVersion).toBe(VERSION_CONDITIONS);
    expect(donnees.motDePasseHash).toBe("hash:girafe-bleue-42x");
    expect(donnees.codeHash).toMatch(/^hash:\d{6}$/);

    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    expect(codeEnvoye()).toBe(donnees.codeHash.replace("hash:", ""));
  });

  it("CA-3 : que le compte existe ou non, la reponse a la premiere etape a la meme forme et le meme message", async () => {
    const nouveau = await demarrerInscriptionAction(ETAT, formulaire(valides));

    viderCompteursDebit();
    vi.clearAllMocks();
    p.user.findFirst.mockResolvedValue({ id: "compte-existant" });
    const existant = await demarrerInscriptionAction(ETAT, formulaire(valides));

    expect(Object.keys(existant).sort()).toEqual(Object.keys({ ...nouveau, codeDemo: undefined }).sort());
    expect(existant.etape).toBe("code");
    expect(existant.message).toBe(nouveau.message);
    expect(existant.emailMasque).toBe(nouveau.emailMasque);
    expect(existant.inscriptionToken).toBeTruthy();
    // ... mais rien n'est cree ni envoye pour un compte deja pris.
    expect(p.inscriptionEnAttente.create).not.toHaveBeenCalled();
    expect(envoyerEmailMock).not.toHaveBeenCalled();
    expect(existant.codeDemo).toBeUndefined();
  });

  it("controle l'unicite sur l'e-mail ET sur le telephone d'un compte actif", async () => {
    await demarrerInscriptionAction(ETAT, formulaire(valides));

    expect(p.user.findFirst.mock.calls[0][0].where).toEqual({
      OR: [{ email: "kofi.adjovi@exemple.bj" }, { telephone: "+2290197123456", statut: "actif" }],
    });
  });

  it("remplace une inscription en attente precedente pour la meme adresse", async () => {
    await demarrerInscriptionAction(ETAT, formulaire(valides));

    expect(p.inscriptionEnAttente.deleteMany.mock.calls[0][0].where.OR[0]).toEqual({ email: "kofi.adjovi@exemple.bj" });
  });

  it("limite les envois : 5 par heure et par adresse e-mail, message dedie", async () => {
    for (let i = 0; i < 5; i++) {
      const etat = await demarrerInscriptionAction(ETAT, formulaire(valides));
      expect(etat.error).toBeNull();
    }
    const sixieme = await demarrerInscriptionAction(ETAT, formulaire(valides));

    expect(sixieme.error).toBe("Trop de demandes. Réessayez dans 1 heure.");
    expect(envoyerEmailMock).toHaveBeenCalledTimes(5);
  });

  it("limite les envois par adresse technique : 20 par heure, meme avec des e-mails differents", async () => {
    for (let i = 0; i < 20; i++) {
      const etat = await demarrerInscriptionAction(ETAT, formulaire({ ...valides, email: `personne${i}@exemple.bj` }));
      expect(etat.error).toBeNull();
    }
    const suivant = await demarrerInscriptionAction(ETAT, formulaire({ ...valides, email: "autre@exemple.bj" }));

    expect(suivant.error).toBe("Trop de demandes. Réessayez dans 1 heure.");
  });
});

async function inscriptionEnAttente(surcharges: Record<string, unknown> = {}) {
  const etat = await demarrerInscriptionAction(ETAT, formulaire(valides));
  const donnees = p.inscriptionEnAttente.create.mock.calls[0][0].data;
  const ligne = {
    id: "ins-1",
    ...donnees,
    essais: 0,
    envois: 1,
    dernierEnvoiLe: new Date(),
    expireLe: new Date(Date.now() + 30 * 60 * 1000),
    ...surcharges,
  };
  p.inscriptionEnAttente.findUnique.mockResolvedValue(ligne);
  return { jeton: etat.inscriptionToken!, code: codeEnvoye(), ligne };
}

describe("verifierCodeInscriptionAction (RG-AUTH-03, RG-AUTH-04)", () => {
  it("bon code : cree le compte, le dossier et l'identifiant sante dans une transaction, ouvre la session", async () => {
    const { jeton, code } = await inscriptionEnAttente();
    p.user.create.mockResolvedValue({ id: "user-1" });

    await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    const donnees = p.user.create.mock.calls[0][0].data;
    expect(donnees.email).toBe("kofi.adjovi@exemple.bj");
    expect(donnees.telephone).toBe("+2290197123456");
    expect(donnees.statut).toBe("actif");
    expect(donnees.conditionsVersion).toBe(VERSION_CONDITIONS);
    expect(donnees.conditionsAccepteesLe).toBeInstanceOf(Date);
    expect(donnees.roles.create).toEqual([{ nom: "patient" }]);
    expect(donnees.patient.create.identifiantSante).toMatch(/^BJ-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]$/);
    expect(donnees.patient.create.dateNaissance.toISOString().slice(0, 10)).toBe("1990-04-23");
    expect(p.inscriptionEnAttente.delete).toHaveBeenCalledWith({ where: { id: "ins-1" } });
    expect(createSessionMock).toHaveBeenCalledWith({ userId: "user-1", roles: ["patient"] });
    expect(redirectMock).toHaveBeenCalledWith("/app/patient/bienvenue");
  });

  it("aucun compte n'existe avant le bon code (CA-2 : 5 codes faux annulent l'inscription)", async () => {
    const { jeton, ligne } = await inscriptionEnAttente();

    for (let essais = 1; essais <= 4; essais++) {
      p.inscriptionEnAttente.findUnique.mockResolvedValue({ ...ligne, essais: essais - 1 });
      const etat = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code: "000000" }));

      expect(etat.error).toMatch(new RegExp(`Il vous reste ${5 - essais} essai`));
      expect(p.inscriptionEnAttente.update).toHaveBeenLastCalledWith({ where: { id: "ins-1" }, data: { essais } });
    }

    p.inscriptionEnAttente.findUnique.mockResolvedValue({ ...ligne, essais: 4 });
    const derniere = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code: "000000" }));

    expect(derniere.etape).toBe("formulaire");
    expect(derniere.error).toMatch(/annulée/);
    expect(p.inscriptionEnAttente.delete).toHaveBeenCalledWith({ where: { id: "ins-1" } });
    expect(p.user.create).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("refuse un code de plus de 10 minutes", async () => {
    const { jeton, code } = await inscriptionEnAttente({ dernierEnvoiLe: new Date(Date.now() - 11 * 60 * 1000) });

    const etat = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    expect(etat.error).toMatch(/expiré/);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("refuse une inscription expiree ou inexistante avec le meme message generique", async () => {
    const { jeton, code } = await inscriptionEnAttente();

    p.inscriptionEnAttente.findUnique.mockResolvedValue(null);
    const inexistante = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    p.inscriptionEnAttente.findUnique.mockResolvedValue({ id: "ins-1", expireLe: new Date(Date.now() - 1000) });
    const expiree = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    expect(inexistante.error).toBe(expiree.error);
    expect(inexistante.error).toMatch(/incorrect ou expiré/);
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("refuse un jeton falsifie, absent ou signe pour un autre usage", async () => {
    const { code } = await inscriptionEnAttente();

    for (const jeton of ["", "n-importe-quoi", "a.b.c"]) {
      const etat = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));
      expect(etat.error).toMatch(/incorrect ou expiré/);
    }
    expect(p.user.create).not.toHaveBeenCalled();
  });

  it("refuse une saisie qui n'a pas 6 chiffres sans toucher a la base", async () => {
    const { jeton } = await inscriptionEnAttente();
    p.inscriptionEnAttente.findUnique.mockClear();

    const etat = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code: "12a" }));

    expect(etat.error).toMatch(/6 chiffres/);
    expect(p.inscriptionEnAttente.findUnique).not.toHaveBeenCalled();
  });

  it("un compte apparu entre-temps avec la meme adresse : reponse generique, aucune session", async () => {
    const { jeton, code } = await inscriptionEnAttente();
    p.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("doublon", { code: "P2002", clientVersion: "x", meta: { target: ["email"] } }));

    const etat = await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    expect(etat.error).toMatch(/incorrect ou expiré/);
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(p.inscriptionEnAttente.deleteMany).toHaveBeenCalledWith({ where: { id: "ins-1" } });
  });

  it("une collision d'identifiant sante est retentee avec un autre tirage", async () => {
    const { jeton, code } = await inscriptionEnAttente();
    p.user.create
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("doublon", { code: "P2002", clientVersion: "x", meta: { target: ["identifiantSante"] } }))
      .mockResolvedValueOnce({ id: "user-1" });

    await verifierCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton, code }));

    expect(p.user.create).toHaveBeenCalledTimes(2);
    const [premier, second] = p.user.create.mock.calls.map((appel) => appel[0].data.patient.create.identifiantSante);
    expect(premier).not.toBe(second);
    expect(createSessionMock).toHaveBeenCalledWith({ userId: "user-1", roles: ["patient"] });
  });
});

describe("renvoyerCodeInscriptionAction", () => {
  it("moins de 60 s apres le dernier envoi : refuse et indique l'attente", async () => {
    const { jeton } = await inscriptionEnAttente();
    envoyerEmailMock.mockClear();

    const etat = await renvoyerCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton }));

    expect(etat.error).toMatch(/Patientez encore \d+ secondes/);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("apres 60 s : nouveau code, essais remis a zero, l'ancien code cesse de valoir", async () => {
    const { jeton, code: ancien } = await inscriptionEnAttente({ dernierEnvoiLe: new Date(Date.now() - 61 * 1000), essais: 3 });
    envoyerEmailMock.mockClear();

    const etat = await renvoyerCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton }));

    expect(etat.error).toBeNull();
    expect(envoyerEmailMock).toHaveBeenCalledTimes(1);
    const nouveau = codeEnvoye();
    const misAJour = p.inscriptionEnAttente.update.mock.calls[0][0].data;
    expect(misAJour.codeHash).toBe(`hash:${nouveau}`);
    expect(misAJour.essais).toBe(0);
    expect(misAJour.envois).toEqual({ increment: 1 });
    expect(misAJour.codeHash).not.toBe(`hash:${ancien}`);
  });

  it("inscription inexistante (compte deja pris) : meme reponse rassurante, rien n'est envoye", async () => {
    const { jeton } = await inscriptionEnAttente();
    p.inscriptionEnAttente.findUnique.mockResolvedValue(null);
    envoyerEmailMock.mockClear();

    const etat = await renvoyerCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: jeton }));

    expect(etat.error).toBeNull();
    expect(etat.message).toMatch(/Si l'adresse est valide/);
    expect(envoyerEmailMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton invalide", async () => {
    const etat = await renvoyerCodeInscriptionAction(ETAT, formulaire({ inscriptionToken: "faux" }));

    expect(etat.error).toMatch(/incorrect ou expiré/);
  });
});
