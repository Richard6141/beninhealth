import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Gestion de la fiche de son propre etablissement (F-ETA-03) : aucun test
 * n'existait pour ce fichier avant ce jour.
 */

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    etablissementSanitaire: { findUnique: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getFicheEtablissement, mettreAJourFicheAction } from "./gestion-fiche";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  etablissementSanitaire: { findUnique: Mock; update: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const etatInitial = { error: null, success: false };

function etablissement(surcharges: Record<string, unknown> = {}) {
  return {
    id: "etab-1",
    nom: "CS Akpakpa",
    sigle: "CSA",
    adresse: "Rue 123, Cotonou",
    telephoneEtablissement: "+22901000000",
    emailEtablissement: "contact@csa.bj",
    capacite: 20,
    servicesDisponibles: JSON.stringify(["Médecine générale", "Pédiatrie"]),
    ...surcharges,
  };
}

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    sigle: "CSA",
    adresse: "Rue 123, Cotonou",
    telephoneEtablissement: "+22901000000",
    emailEtablissement: "contact@csa.bj",
    capacite: "25",
    servicesDisponibles: "Médecine générale\nPédiatrie",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-admin", roles: ["admin_etablissement"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1" });
  p.etablissementSanitaire.findUnique.mockResolvedValue(etablissement());
  p.etablissementSanitaire.update.mockResolvedValue(etablissement());
});

describe("getFicheEtablissement", () => {
  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getFicheEtablissement()).toBeNull();
  });

  for (const role of ["medecin", "infirmier", "pharmacien", "laboratoire", "agent_communautaire", "patient", "admin_national"]) {
    it(`refuse le role ${role}`, async () => {
      getSessionMock.mockResolvedValue({ userId: "user-x", roles: [role] });
      expect(await getFicheEtablissement()).toBeNull();
    });
  }

  it("refuse un admin_etablissement sans profil professionnel associe", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);
    expect(await getFicheEtablissement()).toBeNull();
  });

  it("corrige le 2026-09-29 : refuse un admin_national meme s'il cumule un profil ProfessionnelSante (rien dans le schema ne l'empeche) - la permission partagee update:etablissement_sanitaire ne suffit plus, le role est verifie explicitement", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-admin-national", roles: ["admin_national"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1" });

    expect(await getFicheEtablissement()).toBeNull();
    expect(p.etablissementSanitaire.findUnique).not.toHaveBeenCalled();
  });

  it("renvoie la fiche derivee de l'etablissement de la session, jamais un id transmis", async () => {
    const fiche = await getFicheEtablissement();

    expect(fiche).toEqual({
      nom: "CS Akpakpa",
      sigle: "CSA",
      adresse: "Rue 123, Cotonou",
      telephoneEtablissement: "+22901000000",
      emailEtablissement: "contact@csa.bj",
      capacite: 20,
      servicesDisponiblesTexte: "Médecine générale\nPédiatrie",
    });
    expect(p.etablissementSanitaire.findUnique).toHaveBeenCalledWith({ where: { id: "etab-1" } });
  });

  it("ne renvoie jamais le nom, le type, le niveau, le territoire, les coordonnees GPS ni le statut (reserves a F-ADM-02)", async () => {
    const fiche = await getFicheEtablissement();
    const champs = Object.keys(fiche ?? {});

    expect(champs).not.toContain("type");
    expect(champs).not.toContain("niveau");
    expect(champs).not.toContain("latitude");
    expect(champs).not.toContain("longitude");
    expect(champs).not.toContain("statut");
  });

  it("champs facultatifs absents en base : chaines vides, jamais null ni crash", async () => {
    p.etablissementSanitaire.findUnique.mockResolvedValue(
      etablissement({ sigle: null, adresse: null, telephoneEtablissement: null, emailEtablissement: null, servicesDisponibles: "[]" })
    );

    const fiche = await getFicheEtablissement();

    expect(fiche).toMatchObject({ sigle: "", adresse: "", telephoneEtablissement: "", emailEtablissement: "", servicesDisponiblesTexte: "" });
  });
});

describe("mettreAJourFicheAction", () => {
  it("refuse sans session, sans rien ecrire", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("refuse un role autre que admin_etablissement, sans rien ecrire", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });

    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("corrige le 2026-09-29 : refuse un admin_national meme s'il cumule un profil ProfessionnelSante, sans rien ecrire", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-admin-national", roles: ["admin_national"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-1", etablissementId: "etab-1" });

    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("refuse une capacite negative ou non numerique", async () => {
    expect((await mettreAJourFicheAction(etatInitial, formulaire({ capacite: "-1" }))).success).toBe(false);
    expect((await mettreAJourFicheAction(etatInitial, formulaire({ capacite: "abc" }))).success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("refuse une adresse e-mail invalide", async () => {
    const resultat = await mettreAJourFicheAction(etatInitial, formulaire({ emailEtablissement: "pas-un-email" }));

    expect(resultat.success).toBe(false);
    expect(p.etablissementSanitaire.update).not.toHaveBeenCalled();
  });

  it("accepte une adresse e-mail vide (facultative)", async () => {
    const resultat = await mettreAJourFicheAction(etatInitial, formulaire({ emailEtablissement: "" }));
    expect(resultat.success).toBe(true);
  });

  it("refuse si aucun etablissement n'est associe au compte", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);

    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Aucun etablissement");
  });

  it("met a jour l'etablissement derive de la session (jamais un id transmis par le formulaire) et journalise (RG-ETA-21)", async () => {
    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.etablissementSanitaire.update).toHaveBeenCalledWith({
      where: { id: "etab-1" },
      data: {
        sigle: "CSA",
        adresse: "Rue 123, Cotonou",
        telephoneEtablissement: "+22901000000",
        emailEtablissement: "contact@csa.bj",
        capacite: 25,
        servicesDisponibles: JSON.stringify(["Médecine générale", "Pédiatrie"]),
      },
    });
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        utilisateurId: "user-admin",
        action: "mise_a_jour_fiche_etablissement",
        donneeConcernee: "etablissement_sanitaire:etab-1",
      }),
      expect.anything()
    );
  });

  it("champs facultatifs vides enregistres comme null, jamais une chaine vide en base", async () => {
    await mettreAJourFicheAction(etatInitial, formulaire({ sigle: "", adresse: "", telephoneEtablissement: "", emailEtablissement: "" }));

    expect(p.etablissementSanitaire.update.mock.calls[0][0].data).toMatchObject({
      sigle: null,
      adresse: null,
      telephoneEtablissement: null,
      emailEtablissement: null,
    });
  });

  it("une erreur inattendue en base renvoie un message generique, sans jamais la propager telle quelle", async () => {
    p.etablissementSanitaire.update.mockRejectedValue(new Error("panne base de donnees"));

    const resultat = await mettreAJourFicheAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).not.toContain("panne base de donnees");
  });
});
