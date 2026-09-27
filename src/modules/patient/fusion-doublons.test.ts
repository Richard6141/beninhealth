import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const table = () => ({ findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) });
  const prisma = {
    patient: { findUnique: vi.fn(), findMany: vi.fn(async () => []) },
    paireDoublonIgnoree: { findMany: vi.fn(async () => []), upsert: vi.fn() },
    fusionDossier: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null), create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn() },
    user: { update: vi.fn(), findMany: vi.fn(async () => []) },
    consentement: { findMany: vi.fn(async () => []), findUnique: vi.fn(async () => null), update: vi.fn(), updateMany: vi.fn(async () => ({ count: 0 })) },
    rendezVous: table(),
    consultation: table(),
    prescription: table(),
    examenMedical: table(),
    suiviCommunautaire: table(),
    vaccination: table(),
    documentMedical: table(),
    priseEnChargeInfirmiere: table(),
    referencePatient: table(),
    codePartageDossier: table(),
    codeReclamationDossier: table(),
    demandeAccesDossier: table(),
    jetonCarteSante: table(),
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
  approuverFusionAction,
  defusionnerAction,
  detecterDoublonsPatients,
  fusionnerPatientsAction,
  getFusionsActives,
  getFusionsEnAttente,
  ignorerDoublonAction,
  refuserFusionAction,
} from "@/modules/patient/fusion-doublons";

interface TableMock {
  findMany: Mock;
  updateMany: Mock;
}

const p = prisma as unknown as {
  patient: { findUnique: Mock; findMany: Mock };
  paireDoublonIgnoree: { findMany: Mock; upsert: Mock };
  fusionDossier: { findMany: Mock; findFirst: Mock; create: Mock; findUnique: Mock; updateMany: Mock; update: Mock };
  user: { update: Mock; findMany: Mock };
  consentement: { findMany: Mock; findUnique: Mock; update: Mock; updateMany: Mock };
  rendezVous: TableMock;
  consultation: TableMock;
  prescription: TableMock;
  examenMedical: TableMock;
  jetonCarteSante: TableMock;
  codePartageDossier: TableMock;
  codeReclamationDossier: TableMock;
  demandeAccesDossier: TableMock;
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const ADMIN_1 = { userId: "admin-1", roles: ["admin_national"] };
const ADMIN_2 = { userId: "admin-2", roles: ["admin_national"] };
const etatInitial = { error: null, success: false };
const JUSTIFICATION = "Meme personne, deux creations separees a Cotonou.";

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function patient(surcharges: Record<string, unknown> = {}) {
  return {
    id: "p-conserve",
    userId: "u-conserve",
    identifiantSante: "BJ-2026-000001",
    sexe: "F",
    dateNaissance: new Date("1990-01-01"),
    user: { id: "u-conserve", nom: "Kora", prenom: "Awa", dateCreation: new Date("2025-01-01"), statut: "actif" },
    _count: { consultations: 0, prescriptions: 0, rendezVous: 0 },
    ...surcharges,
  };
}

function doublon(surcharges: Record<string, unknown> = {}) {
  return {
    id: "p-doublon",
    userId: "u-doublon",
    identifiantSante: "BJ-2026-000002",
    sexe: "F",
    dateNaissance: new Date("1990-01-01"),
    user: { id: "u-doublon", nom: "Kora", prenom: "Awa", dateCreation: new Date("2025-06-01"), statut: "actif" },
    _count: { consultations: 0, prescriptions: 0, rendezVous: 0 },
    ...surcharges,
  };
}

/** Tous les delegates "table simple" deplaces en bloc par une fusion : reinitialises a vide avant chaque test. */
const TABLES_SIMPLES: (keyof typeof p)[] = [
  "rendezVous",
  "consultation",
  "prescription",
  "examenMedical",
  "jetonCarteSante",
  "codePartageDossier",
  "codeReclamationDossier",
  "demandeAccesDossier",
];

beforeEach(() => {
  // clearAllMocks (jamais resetAllMocks, qui effacerait aussi le passe-plat de $transaction et le hash bcrypt poses
  // une seule fois par le mock du module) : chaque mockResolvedValue ci-dessous ecrase explicitement ce qu'un test
  // precedent aurait pu poser, sans jamais laisser un resultat fuir vers le test suivant.
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue(ADMIN_1);
  p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === "p-conserve" ? patient() : where.id === "p-doublon" ? doublon() : null
  );
  p.patient.findMany.mockResolvedValue([]);
  p.paireDoublonIgnoree.findMany.mockResolvedValue([]);
  p.fusionDossier.findMany.mockResolvedValue([]);
  p.fusionDossier.findFirst.mockResolvedValue(null);
  p.fusionDossier.updateMany.mockResolvedValue({ count: 1 });
  p.user.update.mockResolvedValue({});
  p.user.findMany.mockResolvedValue([]);
  p.consentement.findMany.mockResolvedValue([]);
  p.consentement.updateMany.mockResolvedValue({ count: 0 });
  for (const cle of TABLES_SIMPLES) {
    const table = p[cle] as unknown as TableMock;
    table.findMany.mockResolvedValue([]);
    table.updateMany.mockResolvedValue({ count: 0 });
  }
});

describe("fusionnerPatientsAction : controles", () => {
  it("refuse tout role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["admin_etablissement"] });

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.success).toBe(false);
    expect(p.patient.findUnique).not.toHaveBeenCalled();
  });

  it("refuse une justification trop courte", async () => {
    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: "trop court" }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("20");
  });

  it("refuse les deux memes dossiers", async () => {
    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-conserve", justification: JUSTIFICATION }));

    expect(resultat.error).toContain("différents");
  });

  it("refuse un dossier deja fusionne ailleurs", async () => {
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "p-doublon" ? doublon({ user: { id: "u-doublon", statut: "fusionne" } }) : patient()));

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.error).toContain("déjà été fusionné");
    expect(p.fusionDossier.create).not.toHaveBeenCalled();
  });

  it("refuse un dossier deja absorbe par une fusion active ou en attente", async () => {
    p.fusionDossier.findFirst.mockResolvedValue({ id: "f-1" });

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.error).toContain("déjà été absorbé");
  });

  it("un dossier introuvable est refuse", async () => {
    p.patient.findUnique.mockResolvedValue(null);

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.error).toContain("introuvable");
  });
});

describe("fusionnerPatientsAction : execution immediate (identites identiques)", () => {
  it("deplace les ressources, neutralise le compte du doublon et journalise sans le mot de passe", async () => {
    p.rendezVous.findMany.mockResolvedValue([{ id: "rdv-1" }, { id: "rdv-2" }]);
    p.consultation.findMany.mockResolvedValue([{ id: "cons-1" }]);

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.rendezVous.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["rdv-1", "rdv-2"] } }, data: { patientId: "p-conserve" } });
    expect(p.consultation.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["cons-1"] } }, data: { patientId: "p-conserve" } });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u-doublon" }, data: { statut: "fusionne", motDePasseHash: expect.any(String) } });

    const creation = p.fusionDossier.create.mock.calls[0][0].data;
    expect(creation).toMatchObject({ patientPrincipalId: "p-conserve", patientSecondaireId: "p-doublon", statut: "active", ecartsIdentite: "" });
    expect(creation.deplacements).toEqual({ rendezVous: ["rdv-1", "rdv-2"], consultations: ["cons-1"] });

    const justificationJournal = journaliserMock.mock.calls[0][0].justification as string;
    expect(justificationJournal).toContain("rendezVous");
    expect(justificationJournal).not.toMatch(/hash:|motDePasse/i);
  });

  it("notifie les deux patients apres la transaction, sans donnee de sante", async () => {
    await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(creerNotificationMock).toHaveBeenCalledWith("u-conserve", "fusion_dossier", expect.any(String));
    expect(creerNotificationMock).toHaveBeenCalledWith("u-doublon", "fusion_dossier", expect.any(String));
  });

  it("un consentement du doublon vers un acteur deja consenti par le principal reste sur le doublon (conflit d'unicite), trace dans nonDeplaces", async () => {
    p.consentement.findMany.mockResolvedValue([
      { id: "cst-conflit", acteurAutoriseId: "acteur-commun" },
      { id: "cst-libre", acteurAutoriseId: "acteur-seul" },
    ]);
    p.consentement.findUnique.mockImplementation(async ({ where }: { where: { patientId_acteurAutoriseId: { acteurAutoriseId: string } } }) =>
      where.patientId_acteurAutoriseId.acteurAutoriseId === "acteur-commun" ? { id: "existant" } : null
    );

    await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(p.consentement.update).toHaveBeenCalledTimes(1);
    expect(p.consentement.update).toHaveBeenCalledWith({ where: { id: "cst-libre" }, data: { patientId: "p-conserve" } });
    const creation = p.fusionDossier.create.mock.calls[0][0].data;
    expect(creation.deplacements.consentements).toEqual(["cst-libre"]);
    expect(creation.nonDeplaces.consentements).toEqual(["cst-conflit"]);
  });

  it("sans aucune ressource a deplacer, deplacements est un objet vide (jamais d'erreur)", async () => {
    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.success).toBe(true);
    expect(p.fusionDossier.create.mock.calls[0][0].data.deplacements).toEqual({});
  });
});

describe("fusionnerPatientsAction : seconde approbation (RG-ADM-41)", () => {
  it("un ecart de sexe met la fusion en attente sans rien deplacer", async () => {
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "p-doublon" ? doublon({ sexe: "M" }) : patient()));

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat).toEqual({ error: null, success: true, enAttente: true });
    expect(p.fusionDossier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ statut: "en_attente", ecartsIdentite: "sexe" }) });
    expect(p.rendezVous.updateMany).not.toHaveBeenCalled();
    expect(p.user.update).not.toHaveBeenCalled();
    expect(creerNotificationMock).not.toHaveBeenCalled();
  });

  it("un ecart de date de naissance met aussi la fusion en attente", async () => {
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === "p-doublon" ? doublon({ dateNaissance: new Date("1991-01-01") }) : patient()));

    const resultat = await fusionnerPatientsAction(etatInitial, formulaire({ patientConserveId: "p-conserve", patientDoublonId: "p-doublon", justification: JUSTIFICATION }));

    expect(resultat.enAttente).toBe(true);
    expect(p.fusionDossier.create).toHaveBeenCalledWith({ data: expect.objectContaining({ ecartsIdentite: "date_naissance" }) });
  });
});

describe("approuverFusionAction (quatre yeux)", () => {
  function demandeEnAttente(surcharges: Record<string, unknown> = {}) {
    return {
      id: "f-1",
      statut: "en_attente",
      patientPrincipalId: "p-conserve",
      patientSecondaireId: "p-doublon",
      fusionneParId: "admin-1",
      justification: JUSTIFICATION,
      ecartsIdentite: "sexe",
      ...surcharges,
    };
  }

  it("refuse le demandeur lui-meme", async () => {
    getSessionMock.mockResolvedValue(ADMIN_1);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());

    const resultat = await approuverFusionAction(etatInitial, formulaire({ fusionId: "f-1" }));

    expect(resultat.error).toContain("autre administrateur");
    expect(p.fusionDossier.updateMany).not.toHaveBeenCalled();
  });

  it("un autre administrateur approuve : deplace les ressources et marque la ligne active", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());
    p.rendezVous.findMany.mockResolvedValue([{ id: "rdv-1" }]);

    const resultat = await approuverFusionAction(etatInitial, formulaire({ fusionId: "f-1" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fusionDossier.updateMany).toHaveBeenCalledWith({ where: { id: "f-1", statut: "en_attente" }, data: { statut: "active" } });
    expect(p.fusionDossier.update).toHaveBeenCalledWith({
      where: { id: "f-1" },
      data: expect.objectContaining({ approuveParId: "admin-2", deplacements: { rendezVous: ["rdv-1"] } }),
    });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u-doublon" }, data: { statut: "fusionne", motDePasseHash: expect.any(String) } });
  });

  it("une reclamation perdue (deja traitee entre-temps) renvoie un message clair, sans deplacer quoi que ce soit", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());
    p.fusionDossier.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await approuverFusionAction(etatInitial, formulaire({ fusionId: "f-1" }));

    expect(resultat.error).toContain("déjà été traitée");
    expect(p.rendezVous.updateMany).not.toHaveBeenCalled();
    expect(p.fusionDossier.update).not.toHaveBeenCalled();
  });

  it("refuse une demande dont le statut n'est plus en_attente", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente({ statut: "refusee" }));

    const resultat = await approuverFusionAction(etatInitial, formulaire({ fusionId: "f-1" }));

    expect(resultat.success).toBe(false);
  });

  it("refuse si le dossier doublon a ete fusionne ailleurs entre la demande et l'approbation", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "p-doublon" ? doublon({ user: { id: "u-doublon", statut: "fusionne" } }) : patient()
    );

    const resultat = await approuverFusionAction(etatInitial, formulaire({ fusionId: "f-1" }));

    expect(resultat.error).toContain("déjà été fusionné");
    expect(p.fusionDossier.updateMany).not.toHaveBeenCalled();
  });
});

describe("refuserFusionAction", () => {
  function demandeEnAttente() {
    return { id: "f-1", statut: "en_attente", fusionneParId: "admin-1", patientPrincipalId: "p-conserve", patientSecondaireId: "p-doublon" };
  }

  it("exige un motif d'au moins 5 caracteres", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);

    const resultat = await refuserFusionAction(etatInitial, formulaire({ fusionId: "f-1", motif: "no" }));

    expect(resultat.success).toBe(false);
    expect(p.fusionDossier.findUnique).not.toHaveBeenCalled();
  });

  it("refuse le demandeur lui-meme", async () => {
    getSessionMock.mockResolvedValue(ADMIN_1);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());

    const resultat = await refuserFusionAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Motif de refus" }));

    expect(resultat.error).toContain("autre administrateur");
  });

  it("un autre administrateur refuse : rien n'est deplace, la ligne passe a refusee", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findUnique.mockResolvedValue(demandeEnAttente());

    const resultat = await refuserFusionAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Aucun rapport entre les deux personnes" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.fusionDossier.updateMany).toHaveBeenCalledWith({
      where: { id: "f-1", statut: "en_attente" },
      data: { statut: "refusee", refuseParId: "admin-2", motifRefus: "Aucun rapport entre les deux personnes" },
    });
    expect(p.user.update).not.toHaveBeenCalled();
    expect(p.rendezVous.updateMany).not.toHaveBeenCalled();
  });
});

describe("ignorerDoublonAction", () => {
  it("enregistre la paire sous sa forme canonique (le plus petit id en premier), quel que soit l'ordre saisi", async () => {
    const resultat = await ignorerDoublonAction(etatInitial, formulaire({ patientAId: "p-doublon", patientBId: "p-conserve" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.paireDoublonIgnoree.upsert).toHaveBeenCalledWith({
      where: { patientAId_patientBId: { patientAId: "p-conserve", patientBId: "p-doublon" } },
      update: {},
      create: { patientAId: "p-conserve", patientBId: "p-doublon", ignoreParId: "admin-1", motif: null },
    });
  });

  it("refuse les deux memes dossiers", async () => {
    const resultat = await ignorerDoublonAction(etatInitial, formulaire({ patientAId: "p-conserve", patientBId: "p-conserve" }));

    expect(resultat.success).toBe(false);
    expect(p.paireDoublonIgnoree.upsert).not.toHaveBeenCalled();
  });

  it("refuse un motif fourni mais trop court", async () => {
    const resultat = await ignorerDoublonAction(etatInitial, formulaire({ patientAId: "p-conserve", patientBId: "p-doublon", motif: "non" }));

    expect(resultat.success).toBe(false);
  });
});

describe("detecterDoublonsPatients : exclusions", () => {
  function ligne(id: string, surcharges: Record<string, unknown> = {}) {
    return {
      id,
      identifiantSante: `BJ-${id}`,
      dateNaissance: new Date("1990-01-01"),
      sexe: "F",
      user: { nom: "Agbo", prenom: "Awa", dateCreation: new Date("2026-01-01"), statut: "actif" },
      _count: { consultations: 0, prescriptions: 0, rendezVous: 0 },
      ...surcharges,
    };
  }

  it("detecte une paire par nom, prenom et date de naissance normalises (accents et casse ignores)", async () => {
    p.patient.findMany.mockResolvedValue([ligne("p-1"), ligne("p-2", { user: { nom: "AGBO", prenom: "awa", dateCreation: new Date("2026-01-02"), statut: "actif" } })]);

    const candidats = await detecterDoublonsPatients();

    expect(candidats).toHaveLength(1);
    expect([candidats[0].a.patientId, candidats[0].b.patientId].sort()).toEqual(["p-1", "p-2"]);
  });

  it("exclut une paire deja marquee 'pas les memes personnes'", async () => {
    p.patient.findMany.mockResolvedValue([ligne("p-1"), ligne("p-2")]);
    p.paireDoublonIgnoree.findMany.mockResolvedValue([{ patientAId: "p-1", patientBId: "p-2" }]);

    expect(await detecterDoublonsPatients()).toEqual([]);
  });

  it("exclut un dossier deja absorbe par une fusion active ou en attente", async () => {
    p.patient.findMany.mockResolvedValue([ligne("p-1"), ligne("p-2")]);
    p.fusionDossier.findMany.mockResolvedValue([{ patientSecondaireId: "p-2" }]);

    expect(await detecterDoublonsPatients()).toEqual([]);
  });

  it("aucun acces pour un role autre que l'administration nationale", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"] });

    expect(await detecterDoublonsPatients()).toEqual([]);
    expect(p.patient.findMany).not.toHaveBeenCalled();
  });
});

describe("getFusionsEnAttente", () => {
  it("indique si la demande vient de l'appelant lui-meme", async () => {
    getSessionMock.mockResolvedValue(ADMIN_2);
    p.fusionDossier.findMany.mockResolvedValue([{ id: "f-1", patientPrincipalId: "p-conserve", patientSecondaireId: "p-doublon", fusionneParId: "admin-1", justification: JUSTIFICATION, ecartsIdentite: "sexe", dateDemande: new Date("2026-09-20") }]);
    p.user.findMany.mockResolvedValue([{ id: "admin-1", nom: "Traore", prenom: "Fatou" }]);
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "p-conserve" ? { ...patient(), _count: { consultations: 0, prescriptions: 0, rendezVous: 0 } } : { ...doublon(), _count: { consultations: 0, prescriptions: 0, rendezVous: 0 } }
    );

    const [demande] = (await getFusionsEnAttente()) ?? [];

    expect(demande.estDemandeParMoi).toBe(false);
    expect(demande.demandePar).toBe("Fatou Traore");
    expect(demande.ecarts).toEqual(["sexe"]);
  });

  it("null pour un role sans acces", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"] });

    expect(await getFusionsEnAttente()).toBeNull();
  });
});

describe("defusionnerAction (RG-ADM-40)", () => {
  function fusionActive(surcharges: Record<string, unknown> = {}) {
    return {
      id: "f-1",
      statut: "active",
      patientPrincipalId: "p-conserve",
      patientSecondaireId: "p-doublon",
      userSecondaireId: "u-doublon",
      statutCompteAvant: "actif",
      defusionLimiteLe: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      deplacements: { rendezVous: ["rdv-1", "rdv-2"], consentements: ["cst-1"] },
      ...surcharges,
    };
  }

  it("exige un motif d'au moins 20 caracteres", async () => {
    const resultat = await defusionnerAction(etatInitial, formulaire({ fusionId: "f-1", motif: "trop court" }));

    expect(resultat.success).toBe(false);
    expect(p.fusionDossier.findUnique).not.toHaveBeenCalled();
  });

  it("ramene chaque id deplace (y compris les consentements) et restaure le statut du compte", async () => {
    p.fusionDossier.findUnique.mockResolvedValue(fusionActive());

    const resultat = await defusionnerAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Ce sont bien deux personnes differentes, verifie sur piece" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.rendezVous.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["rdv-1", "rdv-2"] } }, data: { patientId: "p-doublon" } });
    expect(p.consentement.update).not.toHaveBeenCalled();
    // Les consentements ramenes passent par updateMany (comme les autres tables), jamais par un update un a un a la defusion.
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u-doublon" }, data: { statut: "actif" } });
    expect(p.fusionDossier.updateMany).toHaveBeenCalledWith({
      where: { id: "f-1", statut: "active" },
      data: expect.objectContaining({ statut: "annulee", defusionneParId: "admin-1" }),
    });
  });

  it("refuse une fusion qui n'est plus active", async () => {
    p.fusionDossier.findUnique.mockResolvedValue(fusionActive({ statut: "annulee" }));

    const resultat = await defusionnerAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Ce sont bien deux personnes differentes, verifie sur piece" }));

    expect(resultat.error).toContain("n'est plus active");
    expect(p.user.update).not.toHaveBeenCalled();
  });

  it("refuse au-dela des 30 jours", async () => {
    p.fusionDossier.findUnique.mockResolvedValue(fusionActive({ defusionLimiteLe: new Date(Date.now() - 1000) }));

    const resultat = await defusionnerAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Ce sont bien deux personnes differentes, verifie sur piece" }));

    expect(resultat.error).toContain("délai");
  });

  it("une reclamation perdue (deja defusionnee entre-temps) est signalee sans rien ramener", async () => {
    p.fusionDossier.findUnique.mockResolvedValue(fusionActive());
    p.fusionDossier.updateMany.mockResolvedValue({ count: 0 });

    const resultat = await defusionnerAction(etatInitial, formulaire({ fusionId: "f-1", motif: "Ce sont bien deux personnes differentes, verifie sur piece" }));

    expect(resultat.error).toContain("déjà été défusionnée");
    expect(p.rendezVous.updateMany).not.toHaveBeenCalled();
  });
});

describe("getFusionsActives", () => {
  it("ne liste que les fusions actives dans la fenetre, avec l'identite des deux cotes", async () => {
    p.fusionDossier.findMany.mockResolvedValue([
      { id: "f-1", patientPrincipalId: "p-conserve", patientSecondaireId: "p-doublon", dateExecution: new Date("2026-09-20"), defusionLimiteLe: new Date(Date.now() + 1000), justification: JUSTIFICATION },
    ]);
    p.patient.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
      where.id === "p-conserve" ? { ...patient(), _count: { consultations: 0, prescriptions: 0, rendezVous: 0 } } : { ...doublon(), _count: { consultations: 0, prescriptions: 0, rendezVous: 0 } }
    );

    const fusions = await getFusionsActives();

    expect(fusions).toHaveLength(1);
    expect(fusions?.[0].principal.patientId).toBe("p-conserve");
    expect(fusions?.[0].secondaire.patientId).toBe("p-doublon");
  });

  it("null pour un role sans acces", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["laboratoire"] });

    expect(await getFusionsActives()).toBeNull();
  });
});
