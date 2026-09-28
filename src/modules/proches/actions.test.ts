import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Personnes a charge (F-CIT-07/08). Le point critique est la verification
 * Zero Trust (procheAutorise) : un citoyen ne voit ni ne modifie une
 * personne a charge que par un consentement actif a son nom, jamais par un id
 * transmis par le formulaire. Prisma est simule.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn(async () => "empreinte-bcrypt") } }));
vi.mock("@/modules/facility/creneau-disponible", () => ({
  dateDansUnCreneauDisponible: vi.fn(async () => true),
  capaciteDuCreneau: vi.fn(async () => 1),
}));
vi.mock("@/modules/facility/regles-reservation", () => ({ verifierReglesReservation: vi.fn(async () => null) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    consentement: { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    patient: { findUnique: vi.fn(), count: vi.fn(), findMany: vi.fn() },
    user: { create: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (argument: unknown) =>
    Array.isArray(argument) ? Promise.all(argument) : (argument as (tx: unknown) => unknown)(prisma)
  );
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { capaciteDuCreneau, dateDansUnCreneauDisponible } from "@/modules/facility/creneau-disponible";
import { verifierReglesReservation } from "@/modules/facility/regles-reservation";
import {
  creerPersonneAChargeAction,
  creerRendezVousPourProcheAction,
  getMesProches,
  getProcheParId,
  getRendezVousDuProche,
  retirerProcheAction,
} from "./actions";

const prismaMock = prisma as unknown as {
  consentement: { findUnique: Mock; findMany: Mock; count: Mock; create: Mock; update: Mock };
  patient: { findUnique: Mock; count: Mock; findMany: Mock };
  user: { create: Mock };
  etablissementSanitaire: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  rendezVous: { findFirst: Mock; findMany: Mock; count: Mock; create: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const disponibiliteMock = dateDansUnCreneauDisponible as unknown as Mock;
const capaciteMock = capaciteDuCreneau as unknown as Mock;
const reglesMock = verifierReglesReservation as unknown as Mock;

const ETAT = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const CHAMPS_ENFANT = { nom: "Adjovi", prenom: "Luc", sexe: "M", dateNaissance: "2020-05-10", lien: "pere" };

/** Consentement de tutelle valide : actif, sans date de fin. */
const TUTELLE_ACTIVE = { id: "cons-1", statut: "actif", dateFin: null };
const PROCHE = { id: "pat-enfant", identifiantSante: "BJ-SANTE-PAT-0007", dateNaissance: new Date("2020-05-10"), sexe: "M", user: { nom: "Adjovi", prenom: "Luc", statut: "sans_compte" } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-tuteur", roles: ["patient"] });
  prismaMock.consentement.findUnique.mockResolvedValue(TUTELLE_ACTIVE);
  prismaMock.patient.findUnique.mockResolvedValue(PROCHE);
  prismaMock.consentement.count.mockResolvedValue(0);
  prismaMock.patient.count.mockResolvedValue(3);
  prismaMock.patient.findMany.mockResolvedValue([]);
  prismaMock.user.create.mockResolvedValue({ patient: { id: "pat-nouveau" } });
  prismaMock.consentement.create.mockResolvedValue({});
  prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-1", statut: "actif" });
  reglesMock.mockResolvedValue(null);
  prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1", statutValidation: "valide" });
  prismaMock.rendezVous.findFirst.mockResolvedValue(null);
  prismaMock.rendezVous.count.mockResolvedValue(0);
  prismaMock.rendezVous.create.mockResolvedValue({ id: "rdv-1" });
  disponibiliteMock.mockResolvedValue(true);
  capaciteMock.mockResolvedValue(1);
});

describe("creerPersonneAChargeAction", () => {
  function cas(surcharges: Record<string, string> = {}) {
    return creerPersonneAChargeAction(ETAT, formulaire({ ...CHAMPS_ENFANT, ...surcharges }));
  }

  beforeEach(() => {
    // Le tuteur a son propre dossier patient ; la lecture par id renvoie ce dossier, pas celui de l'enfant.
    prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-tuteur", userId: "user-tuteur" });
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await cas()).success).toBe(false);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse les donnees incompletes ou hors liste (nom, prenom, sexe, lien)", async () => {
    const invalides: Record<string, string>[] = [{ nom: "" }, { prenom: "  " }, { sexe: "X" }, { lien: "voisin" }, { dateNaissance: "" }];
    for (const surcharge of invalides) {
      expect((await cas(surcharge)).success).toBe(false);
    }
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse une date de naissance invalide ou dans le futur", async () => {
    expect((await cas({ dateNaissance: "pas-une-date" })).error).toContain("invalide");
    expect((await cas({ dateNaissance: "2027-01-01" })).error).toContain("invalide");
  });

  it("n'accepte que les enfants de moins de 15 ans (F-CIT-07 du pack) : la veille des 15 ans oui, le jour des 15 ans non", async () => {
    // Aujourd'hui : 2026-09-26. Ne le 2011-09-27 = 14 ans et 364 jours.
    expect((await cas({ dateNaissance: "2011-09-27" })).success).toBe(true);
    expect((await cas({ dateNaissance: "2011-09-26" })).error).toContain("15 ans");
    expect((await cas({ dateNaissance: "1990-01-01" })).error).toContain("15 ans");
  });

  it("corrige le seuil perime de 18 ans : un enfant de 16 ans est desormais refuse ici (chemin majeur/accueil), plus accepte a tort", async () => {
    const resultat = await cas({ dateNaissance: "2010-01-01" }); // 16 ans au 2026-09-26
    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("15 ans");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuse un compte sans dossier patient", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    const resultat = await cas();
    expect(resultat.error).toContain("dossier patient");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("plafonne a 10 personnes a charge actives : les tutelles retirees ne comptent pas", async () => {
    prismaMock.consentement.count.mockResolvedValue(10);
    const refus = await cas();
    expect(refus.success).toBe(false);
    expect(refus.error).toContain("maximum de 10");

    prismaMock.consentement.count.mockResolvedValue(9);
    expect((await cas()).success).toBe(true);

    expect(prismaMock.consentement.count).toHaveBeenCalledWith({
      where: { acteurAutoriseId: "user-tuteur", statut: "actif", patient: { user: { statut: "sans_compte" } } },
    });
  });

  it("F-CIT-07 : refuse la creation quand un dossier existant a le meme nom, prenom et date de naissance (aucun rattachement automatique)", async () => {
    prismaMock.patient.findMany.mockResolvedValue([
      { id: "pat-existant", user: { nom: "Adjovi", prenom: "Luc" } },
    ]);

    const resultat = await cas();

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("existe deja");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
    expect(prismaMock.consentement.create).not.toHaveBeenCalled();
  });

  it("la detection de doublon ignore les accents et la casse", async () => {
    prismaMock.patient.findMany.mockResolvedValue([
      { id: "pat-existant", user: { nom: "ADJÓVÍ", prenom: "luc" } },
    ]);

    const resultat = await cas();

    expect(resultat.success).toBe(false);
  });

  it("aucun doublon detecte (nom different) : la creation reussit normalement", async () => {
    prismaMock.patient.findMany.mockResolvedValue([
      { id: "pat-autre", user: { nom: "Houngbo", prenom: "Marie" } },
    ]);

    const resultat = await cas();

    expect(resultat.success).toBe(true);
  });

  it("cherche le doublon uniquement sur la date de naissance exacte soumise", async () => {
    await cas();

    expect(prismaMock.patient.findMany).toHaveBeenCalledWith({
      where: { dateNaissance: new Date("2020-05-10") },
      include: { user: true },
    });
  });

  it("cree un compte 'sans_compte' inutilisable, son dossier, et donne au tuteur un consentement dossier_complet sans date de fin", async () => {
    const resultat = await cas();

    expect(resultat).toEqual({ error: null, success: true });
    const { data } = prismaMock.user.create.mock.calls[0][0];
    expect(data).toMatchObject({
      nom: "Adjovi",
      prenom: "Luc",
      statut: "sans_compte",
      telephone: "inconnu",
      motDePasseHash: "empreinte-bcrypt",
      roles: { create: [{ nom: "patient" }] },
    });
    expect(data.email).toMatch(/^sans-compte\..+@interne\.benin-health\.local$/);
    expect(data.patient.create).toMatchObject({ identifiantSante: "BJ-SANTE-PAT-0004", sexe: "M", groupeSanguin: "inconnu" });
    expect(prismaMock.consentement.create).toHaveBeenCalledWith({
      data: { patientId: "pat-nouveau", acteurAutoriseId: "user-tuteur", typeAcces: "dossier_complet", statut: "actif", dateFin: null },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-tuteur",
      action: "creation_personne_a_charge",
      donneeConcernee: "patient:pat-nouveau",
    });
  });

  it("le tuteur est toujours celui de la session, jamais un id du formulaire", async () => {
    await cas({ tuteurId: "quelquun-d-autre", userId: "quelquun-d-autre", acteurAutoriseId: "quelquun-d-autre" });
    expect(prismaMock.consentement.create.mock.calls[0][0].data.acteurAutoriseId).toBe("user-tuteur");
  });
});

describe("lecture Zero Trust d'une personne a charge (getProcheParId)", () => {
  it("renvoie la personne pour son tuteur", async () => {
    const proche = await getProcheParId("pat-enfant");
    expect(proche).toMatchObject({ id: "pat-enfant", nom: "Adjovi", identifiantSante: "BJ-SANTE-PAT-0007" });
    expect(prismaMock.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-enfant", acteurAutoriseId: "user-tuteur" } },
    });
  });

  it("renvoie null sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getProcheParId("pat-enfant")).toBeNull();
  });

  it("renvoie null quand aucun consentement n'existe a son nom (le dossier d'une autre famille reste introuvable)", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    expect(await getProcheParId("pat-autre-famille")).toBeNull();
    expect(prismaMock.patient.findUnique).not.toHaveBeenCalled();
  });

  it("renvoie null pour une tutelle retiree", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({ ...TUTELLE_ACTIVE, statut: "retire" });
    expect(await getProcheParId("pat-enfant")).toBeNull();
  });

  it("renvoie null pour une tutelle dont la date de fin est passee, et accepte une fin future", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({ ...TUTELLE_ACTIVE, dateFin: new Date(MAINTENANT.getTime() - 1000) });
    expect(await getProcheParId("pat-enfant")).toBeNull();

    prismaMock.consentement.findUnique.mockResolvedValue({ ...TUTELLE_ACTIVE, dateFin: new Date(MAINTENANT.getTime() + 1000) });
    expect(await getProcheParId("pat-enfant")).not.toBeNull();
  });

  it("perd l'acces des que la personne a un vrai compte (dossier reclame a sa majorite)", async () => {
    prismaMock.patient.findUnique.mockResolvedValue({ ...PROCHE, user: { ...PROCHE.user, statut: "actif" } });
    expect(await getProcheParId("pat-enfant")).toBeNull();
  });

  it("renvoie null quand le dossier n'existe plus", async () => {
    prismaMock.patient.findUnique.mockResolvedValue(null);
    expect(await getProcheParId("pat-enfant")).toBeNull();
  });
});

describe("getMesProches", () => {
  it("renvoie [] sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getMesProches()).toEqual([]);
    expect(prismaMock.consentement.findMany).not.toHaveBeenCalled();
  });

  it("ne liste que les tutelles actives du citoyen connecte sur des dossiers 'sans_compte'", async () => {
    prismaMock.consentement.findMany.mockResolvedValue([
      { patient: { id: "pat-1", dateNaissance: new Date("2020-05-10"), sexe: "M", user: { nom: "Adjovi", prenom: "Luc" } } },
    ]);

    const proches = await getMesProches();

    expect(proches).toEqual([{ id: "pat-1", nom: "Adjovi", prenom: "Luc", dateNaissance: "2020-05-10T00:00:00.000Z", sexe: "M" }]);
    expect(prismaMock.consentement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { acteurAutoriseId: "user-tuteur", statut: "actif", patient: { user: { statut: "sans_compte" } } } })
    );
  });
});

describe("getRendezVousDuProche", () => {
  it("renvoie [] et ne lit aucun rendez-vous quand la tutelle n'est pas verifiee", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    expect(await getRendezVousDuProche("pat-autre-famille")).toEqual([]);
    expect(prismaMock.rendezVous.findMany).not.toHaveBeenCalled();
  });

  it("liste les rendez-vous de la personne a charge", async () => {
    prismaMock.rendezVous.findMany.mockResolvedValue([
      {
        id: "rdv-1",
        date: new Date("2026-10-01T09:00:00Z"),
        motif: "Vaccin",
        statut: "demande",
        etablissement: { nom: "CS Akpakpa" },
        professionnel: { user: { prenom: "Koffi", nom: "Ahouansou" } },
      },
    ]);

    const liste = await getRendezVousDuProche("pat-enfant");

    expect(liste).toEqual([
      { id: "rdv-1", date: "2026-10-01T09:00:00.000Z", motif: "Vaccin", statut: "demande", etablissementNom: "CS Akpakpa", professionnelNomComplet: "Dr. Koffi Ahouansou" },
    ]);
    expect(prismaMock.rendezVous.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: "pat-enfant" } }));
  });
});

describe("creerRendezVousPourProcheAction", () => {
  const CHAMPS = { procheId: "pat-enfant", etablissementId: "etab-1", professionnelId: "pro-1", date: "2026-10-05T09:00", motif: "Vaccination" };
  const cas = (surcharges: Record<string, string> = {}) => creerRendezVousPourProcheAction(ETAT, formulaire({ ...CHAMPS, ...surcharges }));

  it("refuse sans tutelle verifiee, sans rien ecrire", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);
    const resultat = await cas({ procheId: "pat-autre-famille" });
    expect(resultat.success).toBe(false);
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse une date passee ou invalide", async () => {
    expect((await cas({ date: "2026-09-01T09:00" })).error).toContain("futur");
    expect((await cas({ date: "n'importe quoi" })).error).toContain("invalide");
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse un professionnel d'un autre etablissement ou non valide", async () => {
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-2", statutValidation: "valide" });
    expect((await cas()).success).toBe(false);

    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1", statutValidation: "rejete" });
    expect((await cas()).success).toBe(false);

    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse un etablissement qui ne prend pas de rendez-vous, et applique les regles de prise (fenetre, plafond, meme jour) par personne a charge", async () => {
    prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-1", statut: "ferme" });
    expect((await cas()).error).toContain("ne prend pas de rendez-vous");

    prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-1", statut: "actif" });
    reglesMock.mockResolvedValue("Vous avez déjà 3 rendez-vous prévus. Annulez-en un pour en prendre un nouveau.");
    expect((await cas()).error).toContain("3 rendez-vous");
    expect(reglesMock).toHaveBeenCalledWith({ patientId: "pat-enfant", etablissementId: "etab-1", date: new Date("2026-10-05T08:00:00.000Z") });

    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse un creneau hors des disponibilites du professionnel", async () => {
    disponibiliteMock.mockResolvedValue(false);
    const resultat = await cas();
    expect(resultat.error).toContain("pas disponible");
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse un creneau deja pris, et un conflit d'index unique (demande simultanee) avec le meme message", async () => {
    prismaMock.rendezVous.count.mockResolvedValue(1); // capacite par defaut 1, deja atteinte
    const pris = await cas();
    expect(pris.error).toContain("réservé par un autre patient");

    prismaMock.rendezVous.count.mockResolvedValue(0);
    prismaMock.rendezVous.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "6" }));
    const conflit = await cas();
    expect(conflit.error).toBe(pris.error);
  });

  it("autorise un deuxieme patient sur le meme creneau nominal quand la capacite configuree est de 2 (F-ETA-05)", async () => {
    capaciteMock.mockResolvedValue(2);
    prismaMock.rendezVous.count.mockResolvedValue(1);

    const resultat = await cas();

    expect(resultat).toEqual({ error: null, success: true });
  });

  it("cree la demande au nom de la personne a charge (heure locale de Porto-Novo) et la journalise", async () => {
    const resultat = await cas();

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: {
        patientId: "pat-enfant",
        etablissementId: "etab-1",
        professionnelId: "pro-1",
        // 09:00 a Porto-Novo (UTC+1) = 08:00 UTC.
        date: new Date("2026-10-05T08:00:00.000Z"),
        motif: "Vaccination",
        statut: "demande",
      },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ utilisateurId: "user-tuteur", action: "creation_rendez_vous_proche" });
  });

  it("accepte un rendez-vous sans professionnel choisi", async () => {
    const resultat = await cas({ professionnelId: "" });
    expect(resultat.success).toBe(true);
    expect(prismaMock.rendezVous.create.mock.calls[0][0].data.professionnelId).toBeNull();
    expect(prismaMock.professionnelSante.findUnique).not.toHaveBeenCalled();
  });
});

describe("retirerProcheAction", () => {
  it("passe le consentement a 'retire' sans jamais le supprimer, et journalise", async () => {
    const resultat = await retirerProcheAction(ETAT, formulaire({ procheId: "pat-enfant" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.consentement.update).toHaveBeenCalledWith({ where: { id: "cons-1" }, data: { statut: "retire" } });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "retrait_personne_a_charge", donneeConcernee: "patient:pat-enfant" });
  });

  it("cherche le consentement au nom du citoyen connecte : une autre famille est introuvable", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue(null);

    const resultat = await retirerProcheAction(ETAT, formulaire({ procheId: "pat-autre-famille" }));

    expect(resultat).toEqual({ error: "Cette personne a charge est introuvable.", success: false });
    expect(prismaMock.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-autre-famille", acteurAutoriseId: "user-tuteur" } },
    });
    expect(prismaMock.consentement.update).not.toHaveBeenCalled();
  });

  it("refuse une tutelle deja retiree et un appel sans session", async () => {
    prismaMock.consentement.findUnique.mockResolvedValue({ ...TUTELLE_ACTIVE, statut: "retire" });
    expect((await retirerProcheAction(ETAT, formulaire({ procheId: "pat-enfant" }))).success).toBe(false);

    getSessionMock.mockResolvedValue(null);
    expect((await retirerProcheAction(ETAT, formulaire({ procheId: "pat-enfant" }))).success).toBe(false);

    expect(prismaMock.consentement.update).not.toHaveBeenCalled();
  });
});
