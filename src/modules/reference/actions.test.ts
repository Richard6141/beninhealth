import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn(), findMany: vi.fn() },
    consultation: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn(), findMany: vi.fn() },
    referencePatient: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/administration/parametres-lecture", () => ({ lireParametre: vi.fn(async () => 30) }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { lireParametre } from "@/modules/administration/parametres-lecture";
import {
  creerReferenceAction,
  enregistrerContreReferenceAction,
  getDetailReference,
  getReferencesEnvoyees,
  getReferencesRecues,
  listEtablissementsDestinationReference,
} from "@/modules/reference/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock; findMany: Mock };
  consultation: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock; findMany: Mock };
  referencePatient: { create: Mock; findMany: Mock; findUnique: Mock; update: Mock; updateMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const notifierMock = creerNotification as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const etatInitial = { error: null, success: false };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const RESUME = "Patient de 8 ans, fievre persistante depuis cinq jours malgre le traitement.";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function creation(surcharge: Record<string, string> = {}): FormData {
  return formulaire({
    consultationId: "cons-1",
    etablissementDestinationId: "etab-hopital",
    niveauUrgence: "urgente",
    motif: "Suspicion de paludisme grave",
    resumeClinique: RESUME,
    ...surcharge,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  (lireParametre as unknown as Mock).mockResolvedValue(30);
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-med", etablissementId: "etab-origine" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("creerReferenceAction (F-CLI-14)", () => {
  beforeEach(() => {
    p.consultation.findUnique.mockResolvedValue({ id: "cons-1", professionnelId: "pro-med", patientId: "pat-1" });
    p.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-hopital", nom: "CHU de Parakou", type: "hopital" });
    p.referencePatient.create.mockResolvedValue({ id: "ref-1" });
    p.professionnelSante.findMany.mockResolvedValue([{ userId: "user-dest-1" }, { userId: "user-dest-2" }]);
  });

  it("refuse un role qui ne peut pas creer de reference", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-inf", roles: ["infirmier"] });

    const resultat = await creerReferenceAction(etatInitial, creation());

    expect(resultat.success).toBe(false);
    expect(p.referencePatient.create).not.toHaveBeenCalled();
  });

  it("refuse un resume clinique trop court et un niveau d'urgence inconnu", async () => {
    expect((await creerReferenceAction(etatInitial, creation({ resumeClinique: "trop court" }))).success).toBe(false);
    expect((await creerReferenceAction(etatInitial, creation({ niveauUrgence: "critique" }))).success).toBe(false);
    expect(p.referencePatient.create).not.toHaveBeenCalled();
  });

  it("refuse une consultation qui n'est pas celle du medecin connecte", async () => {
    p.consultation.findUnique.mockResolvedValue({ id: "cons-1", professionnelId: "pro-autre", patientId: "pat-1" });

    const resultat = await creerReferenceAction(etatInitial, creation());

    expect(resultat).toEqual({ error: "Cette consultation est introuvable.", success: false });
    expect(p.referencePatient.create).not.toHaveBeenCalled();
  });

  it("refuse de se referer a son propre etablissement", async () => {
    const resultat = await creerReferenceAction(etatInitial, creation({ etablissementDestinationId: "etab-origine" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("different de votre etablissement");
  });

  it("refuse un etablissement inconnu", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue(null);

    const resultat = await creerReferenceAction(etatInitial, creation());

    expect(resultat.error).toContain("introuvable");
    expect(p.referencePatient.create).not.toHaveBeenCalled();
  });

  it("refuse une destination qui n'est pas un hopital, meme si l'ecran ne la propose pas", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue({ id: "etab-labo", nom: "Laboratoire", type: "laboratoire" });

    const resultat = await creerReferenceAction(etatInitial, creation({ etablissementDestinationId: "etab-labo" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("hopital");
    expect(p.referencePatient.create).not.toHaveBeenCalled();
  });

  it("la duree d'acces vient du parametre reference.duree_acces_jours, relu a chaque reference (F-ADM-07)", async () => {
    (lireParametre as unknown as Mock).mockResolvedValue(7);

    const resultat = await creerReferenceAction(etatInitial, creation());

    expect(resultat.success).toBe(true);
    expect(lireParametre).toHaveBeenCalledWith("reference.duree_acces_jours");
    const { data } = p.referencePatient.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect((data.dateFinAcces as Date).toISOString()).toBe(new Date(MAINTENANT.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString());
  });

  it("cree la reference avec 30 jours d'acces, la journalise et notifie chaque medecin de la destination", async () => {
    const resultat = await creerReferenceAction(etatInitial, creation());

    expect(resultat).toEqual({ error: null, success: true, referenceId: "ref-1" });

    const { data } = p.referencePatient.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      patientId: "pat-1",
      consultationId: "cons-1",
      medecinReferentId: "pro-med",
      etablissementOrigineId: "etab-origine",
      etablissementDestinationId: "etab-hopital",
      niveauUrgence: "urgente",
    });
    expect((data.dateFinAcces as Date).toISOString()).toBe(new Date(MAINTENANT.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString());
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ utilisateurId: "user-med", action: "creation_reference_patient" });

    expect(notifierMock).toHaveBeenCalledTimes(2);
    expect(notifierMock.mock.calls.map((appel) => appel[0]).sort()).toEqual(["user-dest-1", "user-dest-2"]);
    expect(notifierMock.mock.calls[0][2]).toContain("urgente");
    const rechercheDestinataires = p.professionnelSante.findMany.mock.calls[0][0] as {
      where: { etablissementId: string; user: { roles: { some: { nom: string } } } };
    };
    expect(rechercheDestinataires.where.etablissementId).toBe("etab-hopital");
    expect(rechercheDestinataires.where.user.roles.some.nom).toBe("medecin");
  });
});

describe("listEtablissementsDestinationReference", () => {
  it("ne propose que des hopitaux, hors etablissement d'origine", async () => {
    p.etablissementSanitaire.findMany.mockResolvedValue([]);

    await listEtablissementsDestinationReference();

    const requete = p.etablissementSanitaire.findMany.mock.calls[0][0] as { where: { type: string; id: { not: string } } };
    expect(requete.where.type).toBe("hopital");
    expect(requete.where.id).toEqual({ not: "etab-origine" });
  });
});

describe("lecture des references (RBAC et perimetre)", () => {
  function referenceEnBase(surcharge: Record<string, unknown> = {}) {
    return {
      id: "ref-1",
      patient: {
        identifiantSante: "BJ-SANTE-PAT-0001",
        dateNaissance: new Date("2018-03-10"),
        sexe: "M",
        allergies: JSON.stringify(["Penicilline"]),
        user: { nom: "Agossou", prenom: "Kofi" },
      },
      medecinReferent: { user: { nom: "Ahouansou", prenom: "Julien" } },
      etablissementOrigine: { nom: "CS Akpakpa" },
      etablissementDestination: { nom: "CHU de Parakou" },
      motif: "Suspicion de paludisme grave",
      niveauUrgence: "urgente",
      statut: "ouverte",
      dateCreation: MAINTENANT,
      dateFinAcces: new Date(MAINTENANT.getTime() + 30 * 24 * 60 * 60 * 1000),
      resumeClinique: RESUME,
      medecinReferentId: "pro-autre",
      etablissementDestinationId: "etab-dest",
      consultation: {
        motif: "Fievre",
        observations: "OBSERVATION CONFIDENTIELLE",
        conclusion: "CONCLUSION CONFIDENTIELLE",
        temperatureCelsius: 39.5,
      },
      contreReferenceTexte: null,
      contreReferenceAuteur: null,
      dateContreReference: null,
      ...surcharge,
    };
  }

  it("un infirmier, un pharmacien ou un laboratoire du meme etablissement ne lisent ni liste ni detail", async () => {
    p.referencePatient.findMany.mockResolvedValue([referenceEnBase()]);
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-x", etablissementId: "etab-dest" });

    for (const role of ["infirmier", "pharmacien", "laboratoire", "agent_communautaire", "admin_etablissement"]) {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });

      expect(await getReferencesRecues()).toEqual([]);
      expect(await getReferencesEnvoyees()).toEqual([]);
      expect(await getDetailReference("ref-1")).toBeNull();
    }
    expect(p.referencePatient.findMany).not.toHaveBeenCalled();
  });

  it("les references recues sont celles adressees a l'etablissement du medecin, les envoyees celles dont il est l'auteur", async () => {
    p.referencePatient.findMany.mockResolvedValue([]);
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-med", etablissementId: "etab-dest" });

    await getReferencesRecues();
    await getReferencesEnvoyees();

    expect((p.referencePatient.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ etablissementDestinationId: "etab-dest" });
    expect((p.referencePatient.findMany.mock.calls[1][0] as { where: unknown }).where).toEqual({ medecinReferentId: "pro-med" });
  });

  it("le detail est refuse a un medecin qui n'est ni le referent ni de l'etablissement destinataire", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-tiers", etablissementId: "etab-tiers" });
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());

    expect(await getDetailReference("ref-1")).toBeNull();
  });

  it("le detail est ouvert au referent, sans droit de repondre", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-autre", etablissementId: "etab-origine" });
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());

    const detail = await getDetailReference("ref-1");

    expect(detail).not.toBeNull();
    expect(detail?.peutRepondre).toBe(false);
  });

  it("le detail est ouvert a un medecin de la destination, qui peut repondre tant que la reference est ouverte", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-dest", etablissementId: "etab-dest" });
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());

    const ouverte = await getDetailReference("ref-1");
    expect(ouverte?.peutRepondre).toBe(true);

    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase({ statut: "cloturee" }));
    const cloturee = await getDetailReference("ref-1");
    expect(cloturee?.peutRepondre).toBe(false);
  });

  it("F-CLI-14 (corrige le 2026-09-29) : la lecture du detail est journalisee, jamais pour un acces refuse", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-autre", userId: "user-referent", etablissementId: "etab-origine" });
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());

    await getDetailReference("ref-1");

    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: "user-referent",
        action: "detail_reference_patient",
        donneeConcernee: "reference_patient:ref-1",
      })
    );

    journaliserMock.mockClear();
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-tiers", userId: "user-tiers", etablissementId: "etab-tiers" });
    await getDetailReference("ref-1");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("le detail ne reprend jamais les observations, la conclusion ni les constantes de la consultation", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-dest", etablissementId: "etab-dest" });
    p.referencePatient.findUnique.mockResolvedValue(referenceEnBase());

    const detail = await getDetailReference("ref-1");
    const serialise = JSON.stringify(detail);

    expect(detail?.consultationMotif).toBe("Fievre");
    expect(detail?.patientAllergies).toEqual(["Penicilline"]);
    expect(serialise).not.toContain("OBSERVATION CONFIDENTIELLE");
    expect(serialise).not.toContain("CONCLUSION CONFIDENTIELLE");
    expect(serialise).not.toContain("39.5");
  });
});

describe("enregistrerContreReferenceAction", () => {
  const TEXTE = "Paludisme grave confirme, traitement par artesunate IV, patient stable et en voie de guerison.";

  function reponse(surcharge: Record<string, string> = {}): FormData {
    return formulaire({ referenceId: "ref-1", contreReferenceTexte: TEXTE, ...surcharge });
  }

  beforeEach(() => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-dest", etablissementId: "etab-dest" });
    p.referencePatient.findUnique.mockResolvedValue({
      id: "ref-1",
      etablissementDestinationId: "etab-dest",
      statut: "ouverte",
      medecinReferent: { userId: "user-referent" },
    });
    p.referencePatient.updateMany.mockResolvedValue({ count: 1 });
    p.referencePatient.update.mockResolvedValue({});
  });

  it("refuse un role qui ne peut pas repondre", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-inf", roles: ["infirmier"] });

    const resultat = await enregistrerContreReferenceAction(etatInitial, reponse());

    expect(resultat.success).toBe(false);
    expect(p.referencePatient.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une reference adressee a un autre etablissement (meme message qu'une reference inconnue)", async () => {
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-tiers", etablissementId: "etab-tiers" });

    const resultat = await enregistrerContreReferenceAction(etatInitial, reponse());

    expect(resultat).toEqual({ error: "Cette reference est introuvable.", success: false });
    expect(p.referencePatient.updateMany).not.toHaveBeenCalled();
  });

  it("refuse un texte trop court", async () => {
    const resultat = await enregistrerContreReferenceAction(etatInitial, reponse({ contreReferenceTexte: "ok" }));

    expect(resultat.success).toBe(false);
    expect(p.referencePatient.updateMany).not.toHaveBeenCalled();
  });

  it("refuse une reference deja cloturee", async () => {
    p.referencePatient.findUnique.mockResolvedValue({
      id: "ref-1",
      etablissementDestinationId: "etab-dest",
      statut: "cloturee",
      medecinReferent: { userId: "user-referent" },
    });

    const resultat = await enregistrerContreReferenceAction(etatInitial, reponse());

    expect(resultat.error).toContain("deja ete cloturee");
    expect(p.referencePatient.updateMany).not.toHaveBeenCalled();
  });

  it("enregistre la contre-reference, cloture, journalise et notifie le medecin referent", async () => {
    const resultat = await enregistrerContreReferenceAction(etatInitial, reponse());

    expect(resultat).toEqual({ error: null, success: true, referenceId: "ref-1" });
    const appel = p.referencePatient.updateMany.mock.calls[0][0] as { where: unknown; data: Record<string, unknown> };
    expect(appel.where).toEqual({ id: "ref-1", statut: "ouverte" });
    expect(appel.data).toMatchObject({ statut: "cloturee", contreReferenceAuteurId: "pro-dest", contreReferenceTexte: TEXTE });
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "contre_reference_patient" });
    expect(notifierMock).toHaveBeenCalledTimes(1);
    expect(notifierMock.mock.calls[0][0]).toBe("user-referent");
  });

  it("deux medecins qui repondent en meme temps : une seule contre-reference est enregistree", async () => {
    const etat = { statut: "ouverte" };
    p.referencePatient.findUnique.mockImplementation(async () => {
      await tick();
      return {
        id: "ref-1",
        etablissementDestinationId: "etab-dest",
        statut: etat.statut,
        medecinReferent: { userId: "user-referent" },
      };
    });
    p.referencePatient.updateMany.mockImplementation(async ({ where }: { where: { statut: string } }) => {
      await tick();
      if (etat.statut === where.statut) {
        etat.statut = "cloturee";
        return { count: 1 };
      }
      return { count: 0 };
    });
    // Une mise a jour inconditionnelle (l'ancien code) reussirait deux fois.
    p.referencePatient.update.mockImplementation(async () => {
      await tick();
      etat.statut = "cloturee";
      return {};
    });

    const [premiere, seconde] = await Promise.all([
      enregistrerContreReferenceAction(etatInitial, reponse()),
      enregistrerContreReferenceAction(etatInitial, reponse()),
    ]);

    expect([premiere.success, seconde.success].filter(Boolean)).toHaveLength(1);
    expect(notifierMock).toHaveBeenCalledTimes(1);
  });
});
