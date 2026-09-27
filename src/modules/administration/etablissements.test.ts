import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    etablissementSanitaire: { findUnique: vi.fn(), update: vi.fn() },
    examenMedical: { count: vi.fn() },
    delivrance: { count: vi.fn() },
    affiliationProfessionnelle: { findMany: vi.fn(), updateMany: vi.fn() },
    rendezVous: { findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/notification/creer", () => ({ creerNotification: vi.fn() }));
vi.mock("@/modules/facility/rendez-vous-etats", () => ({
  TRANSITIONS: { annuler: { depuis: ["demande", "confirme"] } },
  transitionnerRendezVous: vi.fn(async () => true),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { creerNotification } from "@/modules/notification/creer";
import { changerStatutEtablissementAction, modifierEtablissementAction } from "@/modules/administration/etablissements";

const p = prisma as unknown as {
  etablissementSanitaire: { findUnique: Mock; update: Mock };
  examenMedical: { count: Mock };
  delivrance: { count: Mock };
  affiliationProfessionnelle: { findMany: Mock; updateMany: Mock };
  rendezVous: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const creerNotificationMock = creerNotification as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(champs: Record<string, string>): FormData {
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function etablissement(surcharges: Record<string, unknown> = {}) {
  return {
    id: "etab-1",
    nom: "Centre de Sante Akpakpa",
    type: "centre_sante",
    capacite: 30,
    latitude: 6.36,
    longitude: 2.43,
    servicesDisponibles: JSON.stringify(["Urgences"]),
    sigle: null,
    niveauPyramide: null,
    secteur: null,
    communeId: null,
    arrondissement: null,
    quartierVillage: null,
    adresse: null,
    telephoneEtablissement: null,
    emailEtablissement: null,
    identifiantExterneDhis2: null,
    etablissementParentId: null,
    statut: "actif",
    ...surcharges,
  };
}

function champsModification(surcharges: Record<string, string> = {}) {
  return formulaire({
    etablissementId: "etab-1",
    nom: "Centre de Sante Akpakpa",
    type: "centre_sante",
    capacite: "30",
    latitude: "6.36",
    longitude: "2.43",
    services: "Urgences",
    ...surcharges,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_national"] });
  p.etablissementSanitaire.findUnique.mockResolvedValue(etablissement());
  p.etablissementSanitaire.update.mockResolvedValue({});
  p.examenMedical.count.mockResolvedValue(0);
  p.delivrance.count.mockResolvedValue(0);
  p.affiliationProfessionnelle.findMany.mockResolvedValue([]);
  p.affiliationProfessionnelle.updateMany.mockResolvedValue({ count: 0 });
  p.rendezVous.findMany.mockResolvedValue([]);
});

describe("modifierEtablissementAction (F-ADM-02)", () => {
  it("refuse tout role autre que le ministere, sans lire la base", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["admin_etablissement"] });

    const resultat = await modifierEtablissementAction(etatInitial, champsModification());

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.findUnique).not.toHaveBeenCalled();
  });

  it("modifie nom, type, capacite, services et GPS apres la creation, et journalise les NOMS des champs changes sans leurs valeurs", async () => {
    const resultat = await modifierEtablissementAction(
      etatInitial,
      champsModification({ nom: "Centre de Sante d'Akpakpa", type: "hopital", capacite: "80", latitude: "6.37", longitude: "2.44", services: "Urgences\nMaternité" })
    );

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.etablissementSanitaire.update).toHaveBeenCalledWith({
      where: { id: "etab-1" },
      data: expect.objectContaining({
        nom: "Centre de Sante d'Akpakpa",
        type: "hopital",
        capacite: 80,
        latitude: 6.37,
        longitude: 2.44,
        servicesDisponibles: JSON.stringify(["Urgences", "Maternité"]),
      }),
    });
    const justification = journaliserMock.mock.calls[0][0].justification as string;
    expect(justification).toContain("nom, type, capacite, latitude, longitude, services");
    expect(justification).not.toContain("6.37");
    expect(justification).not.toContain("Maternité");
  });

  it("aucun champ modifie : le journal le dit", async () => {
    await modifierEtablissementAction(etatInitial, champsModification());

    expect(journaliserMock.mock.calls[0][0].justification).toContain("aucun champ modifie");
  });

  it.each([
    ["un nom trop court", { nom: "ab" }, "nom"],
    ["un type inconnu", { type: "clinique_privee" }, "Type"],
    ["une capacite negative", { capacite: "-1" }, "negative"],
    ["une capacite decimale", { capacite: "2.5" }, "entier"],
    ["des coordonnees hors du Benin", { latitude: "48.85", longitude: "2.35" }, "hors du Bénin"],
    ["une latitude illisible", { latitude: "abc" }, "latitude"],
    ["un service trop long", { services: "x".repeat(90) }, "80"],
  ])("refuse %s", async (_libelle, surcharge, fragment) => {
    const resultat = await modifierEtablissementAction(etatInitial, champsModification(surcharge));

    expect(resultat.success).toBe(false);
    expect(resultat.error?.toLowerCase()).toContain(fragment.toLowerCase());
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("un laboratoire qui a recu des examens ne change plus de type", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue(etablissement({ type: "laboratoire" }));
    p.examenMedical.count.mockResolvedValue(12);

    const resultat = await modifierEtablissementAction(etatInitial, champsModification({ type: "hopital" }));

    expect(resultat.error).toContain("examens");
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("une pharmacie qui a delivre ne change plus de type", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue(etablissement({ type: "pharmacie" }));
    p.delivrance.count.mockResolvedValue(3);

    const resultat = await modifierEtablissementAction(etatInitial, champsModification({ type: "centre_sante" }));

    expect(resultat.error).toContain("ordonnances");
  });

  it("un etablissement ne peut pas etre son propre parent", async () => {
    const resultat = await modifierEtablissementAction(etatInitial, champsModification({ etablissementParentId: "etab-1" }));

    expect(resultat.error).toContain("propre parent");
  });
});

describe("changerStatutEtablissementAction : fermeture (RG-ADM-01)", () => {
  it("la fermeture termine TOUTES les affiliations, notifie chaque membre du personnel une seule fois, conserve les donnees cliniques", async () => {
    p.affiliationProfessionnelle.findMany.mockResolvedValue([
      { id: "aff-1", professionnel: { userId: "u-med" } },
      { id: "aff-2", professionnel: { userId: "u-inf" } },
      { id: "aff-3", professionnel: { userId: "u-med" } },
    ]);

    const resultat = await changerStatutEtablissementAction(etatInitial, formulaire({ etablissementId: "etab-1", nouveauStatut: "ferme" }));

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.affiliationProfessionnelle.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { etablissementId: "etab-1", statut: { in: ["invitee", "active", "suspendue"] } } })
    );
    expect(p.affiliationProfessionnelle.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["aff-1", "aff-2", "aff-3"] } },
      data: { statut: "terminee", dateFin: expect.any(Date) },
    });
    const notifies = creerNotificationMock.mock.calls.filter((appel) => appel[1] === "affiliation_terminee").map((appel) => appel[0]);
    expect(notifies.sort()).toEqual(["u-inf", "u-med"]);
    expect(journaliserMock.mock.calls[0][0].justification).toContain("3 affiliation(s) terminee(s)");
    expect(p.etablissementSanitaire.update).toHaveBeenCalledWith({ where: { id: "etab-1" }, data: { statut: "ferme" } });
  });

  it("une suspension ne touche pas aux affiliations", async () => {
    await changerStatutEtablissementAction(etatInitial, formulaire({ etablissementId: "etab-1", nouveauStatut: "suspendu" }));

    expect(p.affiliationProfessionnelle.findMany).not.toHaveBeenCalled();
    expect(p.affiliationProfessionnelle.updateMany).not.toHaveBeenCalled();
  });

  it("un etablissement ferme ne se rouvre jamais (RG-ADM-02) et aucune affiliation n'est alors touchee", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue(etablissement({ statut: "ferme" }));

    const resultat = await changerStatutEtablissementAction(etatInitial, formulaire({ etablissementId: "etab-1", nouveauStatut: "actif" }));

    expect(resultat.error).toContain("Transition refusee");
    expect(p.affiliationProfessionnelle.updateMany).not.toHaveBeenCalled();
  });

  it("refuse tout role autre que le ministere", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-2", roles: ["medecin"] });

    const resultat = await changerStatutEtablissementAction(etatInitial, formulaire({ etablissementId: "etab-1", nouveauStatut: "ferme" }));

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });
});

describe("permission dediee du referentiel national (Zero Trust)", () => {
  it("un administrateur d'etablissement peut modifier SA fiche mais jamais le referentiel national ni fermer un autre etablissement", async () => {
    const { can } = await import("@/security/permissions");

    expect(can("admin_etablissement", "update", "etablissement_sanitaire")).toBe(true);
    for (const action of ["read", "update"] as const) {
      expect(can("admin_etablissement", action, "referentiel_etablissement")).toBe(false);
      expect(can("admin_national", action, "referentiel_etablissement")).toBe(true);
    }
    for (const role of ["patient", "medecin", "infirmier", "agent_communautaire", "pharmacien", "laboratoire"] as const) {
      expect(can(role, "update", "referentiel_etablissement")).toBe(false);
    }
  });

  it("un administrateur d'etablissement qui appelle directement l'action n'obtient rien, meme pour fermer un autre etablissement", async () => {
    getSessionMock.mockResolvedValue({ userId: "u-adm-etab", roles: ["admin_etablissement"] });

    const modification = await modifierEtablissementAction(etatInitial, champsModification({ nom: "Etablissement pris en otage" }));
    const fermeture = await changerStatutEtablissementAction(etatInitial, formulaire({ etablissementId: "etab-1", nouveauStatut: "ferme" }));

    expect(modification.success).toBe(false);
    expect(fermeture.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
    expect(p.affiliationProfessionnelle.updateMany).not.toHaveBeenCalled();
  });
});
