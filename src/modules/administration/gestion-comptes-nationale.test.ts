import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    user: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    sessionActive: { deleteMany: vi.fn() },
    journalAudit: { findMany: vi.fn() },
    actionAdministrateurEnAttente: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async (valeur: string) => `hash:${valeur}`) } }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import {
  approuverActionEnAttenteAction,
  getFicheCompteNational,
  inviterAdministrateurAction,
  reactiverCompteAction,
  refuserActionEnAttenteAction,
  reinitialiserSecondFacteurAction,
  rechercherComptesNationaux,
  suspendreCompteAction,
} from "@/modules/administration/gestion-comptes-nationale";

const p = prisma as unknown as {
  user: { findUnique: Mock; findMany: Mock; count: Mock; updateMany: Mock; create: Mock };
  sessionActive: { deleteMany: Mock };
  journalAudit: { findMany: Mock };
  actionAdministrateurEnAttente: { create: Mock; findUnique: Mock; findMany: Mock; count: Mock; updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };
const MOTIF = "Verification demandee par le ministere";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function compte(surcharges: Record<string, unknown> = {}) {
  return {
    id: "cible-1",
    statut: "actif",
    mfaActif: true,
    roles: [{ nom: "medecin" }],
    professionnel: { statutValidation: "valide" },
    ...surcharges,
  };
}

const ADMIN = { userId: "admin-1", roles: ["admin_national"] };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(ADMIN);
  p.user.findUnique.mockResolvedValue(compte());
  p.user.count.mockResolvedValue(3);
  p.user.updateMany.mockResolvedValue({ count: 1 });
  p.actionAdministrateurEnAttente.count.mockResolvedValue(0);
  p.actionAdministrateurEnAttente.create.mockResolvedValue({ id: "demande-1" });
  p.actionAdministrateurEnAttente.updateMany.mockResolvedValue({ count: 1 });
});

describe("permission dediee, verifiee AVANT toute lecture", () => {
  const sansDroit = [
    ["patient", { userId: "u", roles: ["patient"] }],
    ["medecin", { userId: "u", roles: ["medecin"] }],
    ["admin_etablissement", { userId: "u", roles: ["admin_etablissement"] }],
    ["session absente", null],
  ] as const;

  for (const [nom, session] of sansDroit) {
    it(`${nom} : aucune lecture ni ecriture, quelle que soit l'action`, async () => {
      getSessionMock.mockResolvedValue(session);
      const formData = formulaire({ userId: "cible-1", motif: MOTIF, identiteVerifiee: "on", actionId: "demande-1", nom: "A", prenom: "B", email: "a@b.bj", telephone: "+2290100000000" });

      expect(await rechercherComptesNationaux("dupont")).toBeNull();
      expect(await getFicheCompteNational("cible-1")).toBeNull();
      expect((await suspendreCompteAction(etatInitial, formData)).success).toBe(false);
      expect((await reactiverCompteAction(etatInitial, formData)).success).toBe(false);
      expect((await reinitialiserSecondFacteurAction(etatInitial, formData)).success).toBe(false);
      expect((await inviterAdministrateurAction(etatInitial, formData)).success).toBe(false);
      expect((await approuverActionEnAttenteAction(etatInitial, formData)).success).toBe(false);
      expect((await refuserActionEnAttenteAction(etatInitial, formData)).success).toBe(false);

      expect(p.user.findMany).not.toHaveBeenCalled();
      expect(p.user.findUnique).not.toHaveBeenCalled();
      expect(p.user.updateMany).not.toHaveBeenCalled();
      expect(p.user.create).not.toHaveBeenCalled();
      expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
    });
  }
});

describe("recherche", () => {
  it("exige 3 caracteres, ne renvoie ni hash ni secret, et ne journalise que le nombre de resultats", async () => {
    expect(await rechercherComptesNationaux("ab")).toEqual([]);
    expect(p.user.findMany).not.toHaveBeenCalled();

    p.user.findMany.mockResolvedValue([
      { id: "u1", nom: "Dupont", prenom: "Anne", email: "a@b.bj", telephone: "+2290100000000", statut: "actif", mfaActif: true, roles: [{ nom: "medecin" }], professionnel: null },
    ]);
    const resultats = await rechercherComptesNationaux("dupont");

    expect(resultats).toHaveLength(1);
    expect(JSON.stringify(resultats)).not.toMatch(/motDePasse|mfaSecret|hash/i);
    expect(p.user.findMany.mock.calls[0][0].take).toBe(25);
    expect(p.user.findMany.mock.calls[0][0].select).not.toHaveProperty("motDePasseHash");
    expect(p.user.findMany.mock.calls[0][0].select).not.toHaveProperty("mfaSecret");
    expect(journaliserMock.mock.calls[0][0].justification).not.toContain("dupont");
  });
});

describe("suspension : effet immediat et gardes", () => {
  it("suspend un compte non administrateur, ferme ses sessions et journalise", async () => {
    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.user.updateMany).toHaveBeenCalledWith({ where: { id: "cible-1", statut: "actif" }, data: { statut: "suspendu" } });
    expect(p.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "cible-1" } });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "suspension_compte_plateforme", donneeConcernee: "utilisateur:cible-1" });
    expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
  });

  it("garde : jamais sur son propre compte", async () => {
    p.user.findUnique.mockResolvedValue(compte({ id: "admin-1", roles: [{ nom: "admin_national" }] }));

    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "admin-1", motif: MOTIF }));

    expect(resultat.error).toContain("propre compte");
    expect(p.user.updateMany).not.toHaveBeenCalled();
    expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
  });

  it("garde : jamais le dernier administrateur national actif", async () => {
    p.user.findUnique.mockResolvedValue(compte({ roles: [{ nom: "admin_national" }] }));
    p.user.count.mockResolvedValue(0);

    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat.error).toContain("dernier administrateur");
    expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
  });

  it("garde : un motif d'au moins 10 caracteres est obligatoire", async () => {
    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: "court" }));

    expect(resultat.success).toBe(false);
    expect(p.user.findUnique).not.toHaveBeenCalled();
  });

  it("garde : seul un compte actif se suspend", async () => {
    p.user.findUnique.mockResolvedValue(compte({ statut: "termine" }));

    expect((await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }))).success).toBe(false);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("l'ecriture est conditionnelle : un compte devenu inactif entre-temps n'est pas suspendu", async () => {
    p.user.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat.success).toBe(false);
    expect(p.sessionActive.deleteMany).not.toHaveBeenCalled();
  });
});

describe("quatre yeux (RG-ADM-30) : un compte administrateur n'est jamais modifie directement", () => {
  it("la suspension d'un administrateur cree une demande en attente et ne change rien", async () => {
    p.user.findUnique.mockResolvedValue(compte({ roles: [{ nom: "admin_national" }] }));

    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat).toEqual({ error: null, success: true, enAttente: true });
    expect(p.actionAdministrateurEnAttente.create.mock.calls[0][0].data).toMatchObject({ type: "suspension", cibleUserId: "cible-1", demandeParId: "admin-1" });
    expect(p.user.updateMany).not.toHaveBeenCalled();
    expect(p.sessionActive.deleteMany).not.toHaveBeenCalled();
  });

  it("refuse une demande identique deja en attente", async () => {
    p.user.findUnique.mockResolvedValue(compte({ roles: [{ nom: "admin_national" }] }));
    p.actionAdministrateurEnAttente.count.mockResolvedValue(1);

    const resultat = await suspendreCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat.error).toContain("deja en attente");
    expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
  });

  it("l'invitation d'un administrateur est TOUJOURS en attente, sans creer de compte", async () => {
    p.user.findUnique.mockResolvedValue(null);

    const resultat = await inviterAdministrateurAction(
      etatInitial,
      formulaire({ nom: "Dupont", prenom: "Anne", email: "Anne@Exemple.BJ", telephone: "+2290100000000", motif: MOTIF })
    );

    expect(resultat).toEqual({ error: null, success: true, enAttente: true });
    expect(p.user.create).not.toHaveBeenCalled();
    expect(p.actionAdministrateurEnAttente.create.mock.calls[0][0].data).toMatchObject({ type: "invitation_admin", cibleUserId: null });
    expect(p.actionAdministrateurEnAttente.create.mock.calls[0][0].data.parametres.email).toBe("anne@exemple.bj");
  });

  it("refuse une invitation pour une adresse deja utilisee", async () => {
    p.user.findUnique.mockResolvedValue({ id: "existant" });

    const resultat = await inviterAdministrateurAction(
      etatInitial,
      formulaire({ nom: "Dupont", prenom: "Anne", email: "a@b.bj", telephone: "+2290100000000", motif: MOTIF })
    );

    expect(resultat.error).toContain("deja utilisee");
    expect(p.actionAdministrateurEnAttente.create).not.toHaveBeenCalled();
  });
});

describe("approbation par un second administrateur", () => {
  function demande(surcharges: Record<string, unknown> = {}) {
    return {
      id: "demande-1",
      type: "suspension",
      cibleUserId: "cible-1",
      parametres: { motif: MOTIF },
      demandeParId: "admin-2",
      statut: "en_attente",
      expireLe: new Date(Date.now() + 3600 * 1000),
      ...surcharges,
    };
  }

  beforeEach(() => {
    p.actionAdministrateurEnAttente.findUnique.mockResolvedValue(demande());
    p.user.findUnique.mockResolvedValue(compte({ roles: [{ nom: "admin_national" }] }));
  });

  it("un autre administrateur approuve : l'action est executee et tracee comme confirmee", async () => {
    const resultat = await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }));

    expect(resultat.success).toBe(true);
    expect(p.actionAdministrateurEnAttente.updateMany).toHaveBeenCalledWith({
      where: { id: "demande-1", statut: "en_attente" },
      data: expect.objectContaining({ statut: "approuvee", decideParId: "admin-1" }),
    });
    expect(p.user.updateMany).toHaveBeenCalledWith({ where: { id: "cible-1", statut: "actif" }, data: { statut: "suspendu" } });
    expect(p.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "cible-1" } });
    const justifications = journaliserMock.mock.calls.map((appel) => appel[0].justification as string);
    expect(justifications.some((texte) => texte.includes("second administrateur"))).toBe(true);
  });

  it("le demandeur ne peut pas approuver sa propre demande", async () => {
    p.actionAdministrateurEnAttente.findUnique.mockResolvedValue(demande({ demandeParId: "admin-1" }));

    const resultat = await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }));

    expect(resultat.error).toContain("autre administrateur");
    expect(p.user.updateMany).not.toHaveBeenCalled();
    expect(p.actionAdministrateurEnAttente.updateMany).not.toHaveBeenCalled();
  });

  it("une demande expiree ou deja traitee ne s'execute pas", async () => {
    p.actionAdministrateurEnAttente.findUnique.mockResolvedValueOnce(demande({ expireLe: new Date(Date.now() - 1000) }));
    expect((await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }))).error).toContain("expir");

    p.actionAdministrateurEnAttente.findUnique.mockResolvedValueOnce(demande({ statut: "approuvee" }));
    expect((await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }))).error).toContain("traitée");
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("les gardes sont rejoues a l'approbation : le dernier administrateur actif ne peut plus etre suspendu", async () => {
    p.user.count.mockResolvedValue(0);

    const resultat = await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }));

    expect(resultat.error).toContain("dernier administrateur");
    expect(p.user.updateMany).not.toHaveBeenCalled();
    expect(p.actionAdministrateurEnAttente.updateMany).not.toHaveBeenCalled();
  });

  it("deux approbations simultanees : la reclamation conditionnelle empeche la seconde execution", async () => {
    p.actionAdministrateurEnAttente.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }));

    expect(resultat.success).toBe(false);
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("l'approbation d'une invitation cree le compte administrateur et montre le mot de passe temporaire une fois", async () => {
    p.actionAdministrateurEnAttente.findUnique.mockResolvedValue(
      demande({ type: "invitation_admin", cibleUserId: null, parametres: { motif: MOTIF, nom: "Dupont", prenom: "Anne", email: "anne@exemple.bj", telephone: "+2290100000000" } })
    );
    p.user.findUnique.mockResolvedValue(null);
    p.user.create.mockResolvedValue({ id: "nouveau-1" });

    const resultat = await approuverActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1" }));

    expect(resultat.success).toBe(true);
    expect(resultat.motDePasseTemporaire).toMatch(/^.{16,}$/);
    const donnees = p.user.create.mock.calls[0][0].data;
    expect(donnees.roles).toEqual({ create: { nom: "admin_national" } });
    expect(donnees.motDePasseHash).toBe(`hash:${resultat.motDePasseTemporaire}`);
    expect(JSON.stringify(journaliserMock.mock.calls)).not.toContain(resultat.motDePasseTemporaire as string);
  });

  it("le refus exige un autre administrateur et un motif, et n'execute rien", async () => {
    expect((await refuserActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1", motif: "no" }))).success).toBe(false);

    p.actionAdministrateurEnAttente.findUnique.mockResolvedValueOnce(demande({ demandeParId: "admin-1" }));
    expect((await refuserActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1", motif: "Motif de refus" }))).error).toContain("autre administrateur");

    const ok = await refuserActionEnAttenteAction(etatInitial, formulaire({ actionId: "demande-1", motif: "Motif de refus" }));
    expect(ok.success).toBe(true);
    expect(p.actionAdministrateurEnAttente.updateMany.mock.calls[0][0].data).toMatchObject({ statut: "refusee", decideParId: "admin-1" });
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("second facteur et reactivation", () => {
  it("reinitialise le second facteur d'un compte non administrateur : secret efface, sessions fermees, personne notifiee", async () => {
    const resultat = await reinitialiserSecondFacteurAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF, identiteVerifiee: "on" }));

    expect(resultat.success).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({ where: { id: "cible-1", mfaActif: true }, data: { mfaSecret: null, mfaActif: false } });
    expect(p.sessionActive.deleteMany).toHaveBeenCalledWith({ where: { userId: "cible-1" } });
    expect(creerNotificationMock).toHaveBeenCalledWith("cible-1", "second_facteur_reinitialise", expect.any(String), "/app/securite", { codeCatalogue: "N-2FA-RESET" });
  });

  it("exige la confirmation de verification d'identite", async () => {
    const resultat = await reinitialiserSecondFacteurAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));

    expect(resultat.error).toContain("identite");
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("refuse la reinitialisation d'un compte sans second facteur", async () => {
    p.user.findUnique.mockResolvedValue(compte({ mfaActif: false }));

    const resultat = await reinitialiserSecondFacteurAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF, identiteVerifiee: "on" }));

    expect(resultat.error).toContain("second facteur");
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });

  it("reactive un compte suspendu, sauf un professionnel refuse a la validation", async () => {
    p.user.findUnique.mockResolvedValueOnce(compte({ statut: "suspendu" }));
    expect((await reactiverCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }))).success).toBe(true);
    expect(p.user.updateMany).toHaveBeenCalledWith({ where: { id: "cible-1", statut: "suspendu" }, data: { statut: "actif" } });

    p.user.updateMany.mockClear();
    p.user.findUnique.mockResolvedValueOnce(compte({ statut: "suspendu", professionnel: { statutValidation: "rejete" } }));
    const refuse = await reactiverCompteAction(etatInitial, formulaire({ userId: "cible-1", motif: MOTIF }));
    expect(refuse.error).toContain("validation");
    expect(p.user.updateMany).not.toHaveBeenCalled();
  });
});
