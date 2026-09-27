import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Actions de rendez-vous du module facility : garde de statut (RG-RDV-00),
 * double reservation (RG-RDV-03), regles de prise (RG-RDV-01/02 via
 * regles-reservation, teste a part), annulation a 2 h (RG-RDV-10), deplacement
 * (RG-RDV-11), refus et traitement par l'accueil (F-RDV-03). Prisma est
 * simule ; l'atomicite reelle (index unique partiel) est prouvee sur la vraie
 * base, voir docs/coordination-agents.md.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn(async () => undefined) }));
vi.mock("./creneau-disponible", () => ({ dateDansUnCreneauDisponible: vi.fn(async () => true) }));
vi.mock("./regles-reservation", () => ({ verifierReglesReservation: vi.fn(async () => null) }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    patient: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn() },
    professionnelSante: { findUnique: vi.fn() },
    rendezVous: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
    consentement: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (rappel: (tx: unknown) => unknown) => rappel(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { dateDansUnCreneauDisponible } from "./creneau-disponible";
import { verifierReglesReservation } from "./regles-reservation";
import {
  annulerRendezVousAction,
  annulerRendezVousProfessionnelAction,
  confirmerRendezVousAction,
  creerRendezVousAction,
  deplacerRendezVousAction,
  refuserRendezVousAction,
} from "./actions";
import { MESSAGE_CRENEAU_PRIS, TRANSITIONS } from "./rendez-vous-etats";
import { MESSAGE_DEPLACEMENTS_EPUISES, MESSAGE_ETABLISSEMENT_INACTIF } from "./regles-rendez-vous";

const prismaMock = prisma as unknown as {
  patient: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock };
  professionnelSante: { findUnique: Mock };
  rendezVous: { findUnique: Mock; findFirst: Mock; create: Mock; updateMany: Mock };
  consentement: { findFirst: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;
const disponibiliteMock = dateDansUnCreneauDisponible as unknown as Mock;
const reglesMock = verifierReglesReservation as unknown as Mock;

const ETAT = { error: null, success: false };
const MAINTENANT = new Date("2026-09-26T10:00:00.000Z");
const HEURE = 3600_000;
const JOUR = 24 * HEURE;
const dans = (ms: number) => new Date(MAINTENANT.getTime() + ms);

function formulaire(champs: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) formData.set(cle, valeur);
  return formData;
}

const ETABLISSEMENT = { id: "etab-1", statut: "actif", nom: "CS Akpakpa", telephoneEtablissement: "+229 21 30 00 00" };

function rendezVousDuPatient(surcharges: Record<string, unknown> = {}) {
  return {
    id: "rdv-1",
    patientId: "pat-1",
    etablissementId: "etab-1",
    professionnelId: "pro-1",
    date: dans(3 * JOUR),
    motif: "Consultation",
    statut: "confirme",
    nombreDeplacements: 0,
    etablissement: ETABLISSEMENT,
    patient: { userId: "user-pat", user: { statut: "actif" } },
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  prismaMock.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-1", user: { statut: "actif" } });
  prismaMock.etablissementSanitaire.findUnique.mockResolvedValue(ETABLISSEMENT);
  prismaMock.professionnelSante.findUnique.mockResolvedValue({
    id: "pro-1",
    userId: "user-pro",
    etablissementId: "etab-1",
    statutValidation: "valide",
  });
  prismaMock.rendezVous.findFirst.mockResolvedValue(null);
  prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.rendezVous.create.mockResolvedValue({ id: "rdv-nouveau" });
  reglesMock.mockResolvedValue(null);
  disponibiliteMock.mockResolvedValue(true);
});

describe("annulerRendezVousAction (patient)", () => {
  it("annule un rendez-vous encore actif et le journalise dans la meme transaction", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());

    const resultat = await annulerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme"] } },
      data: { statut: "annule" },
    });
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });

  it("RG-RDV-10 : refuse a moins de 2 heures et donne le telephone de l'etablissement, accepte a 2 heures pile", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ date: dans(2 * HEURE - 1) }));
    const tardif = await annulerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));
    expect(tardif.success).toBe(false);
    expect(tardif.error).toContain("+229 21 30 00 00");
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();

    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ date: dans(2 * HEURE) }));
    expect((await annulerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).success).toBe(true);
  });

  it("refuse d'annuler un rendez-vous deja termine, annule ou absent, sans rien journaliser", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await annulerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.annuler.refus, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse le rendez-vous d'un autre patient (Zero Trust)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ patientId: "pat-autre" }));

    const resultat = await annulerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.success).toBe(false);
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });
});

describe("traitement par le professionnel assigne ou par l'accueil", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
  });

  beforeEach(() => {
    // rendezVousDuPatient() : le patient est "user-pat" (distinct de "user-1", utilise cote creerRendezVousAction plus haut).
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-pat", user: { statut: "actif" } });
  });

  it("le professionnel assigne confirme une demande et le patient est prevenu", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "demande" }));

    const resultat = await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande"] } },
      data: { statut: "confirme" },
    });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pat", "rendez_vous_confirme", expect.stringContaining("confirmé"), "/app/patient/rendez-vous");
  });

  it("pour une personne a charge (sans_compte), previent son tuteur plutot que le compte placeholder (defaut corrige)", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(
      rendezVousDuPatient({ statut: "demande", patient: { userId: "user-placeholder", user: { statut: "sans_compte" } } })
    );
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-placeholder", user: { statut: "sans_compte" } });
    prismaMock.consentement.findFirst.mockResolvedValue({ acteurAutoriseId: "user-tuteur" });

    const resultat = await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-tuteur", "rendez_vous_confirme", expect.stringContaining("confirmé"), "/app/patient/rendez-vous");
  });

  it("ne reconfirme pas un rendez-vous annule et ne previent personne", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.confirmer.refus, success: false });
    expect(creerNotificationMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("un autre professionnel ne traite pas ce rendez-vous", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ professionnelId: "pro-autre" }));

    const resultat = await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.error).toContain("introuvable");
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });

  it("l'accueil (administrateur d'etablissement) traite un rendez-vous SANS praticien de son etablissement", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-accueil", roles: ["admin_etablissement"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-accueil", userId: "user-accueil", etablissementId: "etab-1" });
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "demande", professionnelId: null }));

    const resultat = await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat.success).toBe(true);
  });

  it("l'accueil d'un AUTRE etablissement n'y a pas acces, ni un role non accueil sans etre l'assigne", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-accueil", roles: ["admin_etablissement"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-accueil", userId: "user-accueil", etablissementId: "etab-2" });
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "demande", professionnelId: null }));
    expect((await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).error).toContain("introuvable");

    getSessionMock.mockResolvedValue({ userId: "user-inf", roles: ["infirmier"] });
    prismaMock.professionnelSante.findUnique.mockResolvedValue({ id: "pro-inf", userId: "user-inf", etablissementId: "etab-1" });
    expect((await confirmerRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1" }))).error).toContain("introuvable");

    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });

  it("l'annulation par l'etablissement previent le patient", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());

    const resultat = await annulerRendezVousProfessionnelAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pat", "rendez_vous_annule_par_etablissement", expect.stringContaining("annulé par l'établissement"), "/app/patient/rendez-vous");
  });

  it("l'annulation d'un rendez-vous deja clos est refusee sans prevenir le patient", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await annulerRendezVousProfessionnelAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: TRANSITIONS.annuler.refus, success: false });
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("une notification en echec n'annule pas la decision deja actee", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient());
    creerNotificationMock.mockRejectedValueOnce(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultat = await annulerRendezVousProfessionnelAction(ETAT, formulaire({ rendezVousId: "rdv-1" }));

    expect(resultat).toEqual({ error: null, success: true });
  });
});

describe("refuserRendezVousAction (F-RDV-03)", () => {
  beforeEach(() => {
    getSessionMock.mockResolvedValue({ userId: "user-pro", roles: ["medecin"] });
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "demande" }));
  });

  beforeEach(() => {
    prismaMock.patient.findUnique.mockResolvedValue({ userId: "user-pat", user: { statut: "actif" } });
  });

  it("exige un motif de la liste, et une precision pour 'Autre motif'", async () => {
    expect((await refuserRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1", motif: "capricieux", precision: "" }))).success).toBe(false);
    expect((await refuserRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1", motif: "autre", precision: "non" }))).error).toContain("5 caractères");
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une demande en attente : statut refuse, motif enregistre et transmis au patient", async () => {
    const resultat = await refuserRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1", motif: "service_ferme", precision: "Fermeture exceptionnelle" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande"] } },
      data: { motifRefus: "Service fermé : Fermeture exceptionnelle", statut: "refuse" },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "refus_rendez_vous", donneeConcernee: "rendez_vous:rdv-1" });
    expect(creerNotificationMock).toHaveBeenCalledWith("user-pat", "rendez_vous_refuse", expect.stringContaining("Service fermé"), "/app/patient/rendez-vous");
  });

  it("ne refuse pas un rendez-vous deja confirme, ne journalise ni ne previent", async () => {
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await refuserRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1", motif: "creneau_indisponible", precision: "" }));

    expect(resultat).toEqual({ error: TRANSITIONS.refuser.refus, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("un professionnel etranger au rendez-vous ne peut pas le refuser", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "demande", professionnelId: "pro-autre" }));

    const resultat = await refuserRendezVousAction(ETAT, formulaire({ rendezVousId: "rdv-1", motif: "creneau_indisponible", precision: "" }));

    expect(resultat.error).toContain("introuvable");
  });
});

describe("creerRendezVousAction : regles et double reservation", () => {
  const CHAMPS = { etablissementId: "etab-1", professionnelId: "pro-1", date: "2026-10-05T09:00", motif: "Controle" };

  it("refuse un etablissement qui ne prend pas de rendez-vous (non actif)", async () => {
    prismaMock.etablissementSanitaire.findUnique.mockResolvedValue({ ...ETABLISSEMENT, statut: "ferme" });

    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_ETABLISSEMENT_INACTIF, success: false });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("renvoie le refus des regles de prise (fenetre, plafond, meme jour) avant toute ecriture", async () => {
    reglesMock.mockResolvedValue("Vous avez déjà 3 rendez-vous prévus. Annulez-en un pour en prendre un nouveau.");

    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat.error).toContain("3 rendez-vous");
    expect(reglesMock).toHaveBeenCalledWith({ patientId: "pat-1", etablissementId: "etab-1", date: new Date("2026-10-05T08:00:00.000Z") });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse un creneau deja pris detecte a la lecture, en ignorant les rendez-vous qui liberent le creneau", async () => {
    prismaMock.rendezVous.findFirst.mockResolvedValue({ id: "rdv-existant" });

    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_CRENEAU_PRIS, success: false });
    expect(prismaMock.rendezVous.findFirst.mock.calls[0][0].where.statut).toEqual({ notIn: ["annule", "refuse", "expire"] });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse proprement quand une demande simultanee a pris le creneau entre la lecture et l'ecriture (P2002)", async () => {
    prismaMock.rendezVous.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" })
    );

    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_CRENEAU_PRIS, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("une autre erreur d'ecriture reste une erreur generique (pas de faux message de creneau pris)", async () => {
    prismaMock.rendezVous.create.mockRejectedValue(new Error("connexion perdue"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat.success).toBe(false);
    expect(resultat.error).not.toBe(MESSAGE_CRENEAU_PRIS);
  });

  it("cree la demande quand le creneau est libre", async () => {
    const resultat = await creerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ patientId: "pat-1", professionnelId: "pro-1", statut: "demande" }),
    });
  });
});

describe("deplacerRendezVousAction (F-RDV-02, RG-RDV-11)", () => {
  const CHAMPS = { rendezVousId: "rdv-1", date: "2026-10-08T10:00" };

  beforeEach(() => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ nombreDeplacements: 1 }));
  });

  it("cree le nouveau rendez-vous (compteur + 1) et annule l'ancien dans la meme transaction, puis journalise", async () => {
    const resultat = await deplacerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: null, success: true });
    expect(prismaMock.rendezVous.create).toHaveBeenCalledWith({
      data: {
        patientId: "pat-1",
        etablissementId: "etab-1",
        professionnelId: "pro-1",
        date: new Date("2026-10-08T09:00:00.000Z"),
        motif: "Consultation",
        statut: "demande",
        nombreDeplacements: 2,
      },
    });
    expect(prismaMock.rendezVous.updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme"] } },
      data: { statut: "annule" },
    });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "deplacement_rendez_vous", donneeConcernee: "rendez_vous:rdv-nouveau" });
    expect(reglesMock).toHaveBeenCalledWith(expect.objectContaining({ rendezVousRemplaceId: "rdv-1" }));
  });

  it("RG-RDV-11 : refuse le troisieme deplacement", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ nombreDeplacements: 2 }));

    const resultat = await deplacerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_DEPLACEMENTS_EPUISES, success: false });
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse a moins de 2 heures du rendez-vous a deplacer, et pour un rendez-vous deja clos", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ date: dans(HEURE) }));
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toContain("2 heures");

    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ statut: "termine" }));
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toContain("ne peut plus");

    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("refuse le rendez-vous d'un autre patient", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ patientId: "pat-autre" }));
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toContain("introuvable");
    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("applique les regles de prise a la nouvelle date, l'agenda du professionnel et le creneau libre", async () => {
    reglesMock.mockResolvedValue("Un rendez-vous se prend au plus 30 jours à l'avance.");
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toContain("30 jours");

    reglesMock.mockResolvedValue(null);
    disponibiliteMock.mockResolvedValue(false);
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toContain("pas disponible");

    disponibiliteMock.mockResolvedValue(true);
    prismaMock.rendezVous.findFirst.mockResolvedValue({ id: "autre" });
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toBe(MESSAGE_CRENEAU_PRIS);

    expect(prismaMock.rendezVous.create).not.toHaveBeenCalled();
  });

  it("conflit d'index unique : creneau pris, l'ancien rendez-vous est conserve (transaction annulee)", async () => {
    prismaMock.rendezVous.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Unique", { code: "P2002", clientVersion: "6" }));

    const resultat = await deplacerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: MESSAGE_CRENEAU_PRIS, success: false });
    expect(prismaMock.rendezVous.updateMany).not.toHaveBeenCalled();
  });

  it("si l'ancien rendez-vous n'est plus annulable au moment de l'ecriture, tout est refuse", async () => {
    prismaMock.rendezVous.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await deplacerRendezVousAction(ETAT, formulaire(CHAMPS));

    expect(resultat).toEqual({ error: TRANSITIONS.annuler.refus, success: false });
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un etablissement devenu inactif", async () => {
    prismaMock.rendezVous.findUnique.mockResolvedValue(rendezVousDuPatient({ etablissement: { ...ETABLISSEMENT, statut: "ferme" } }));
    expect((await deplacerRendezVousAction(ETAT, formulaire(CHAMPS))).error).toBe(MESSAGE_ETABLISSEMENT_INACTIF);
  });
});
