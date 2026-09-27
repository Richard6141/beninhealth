import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    personneCommunautaire: { findUnique: vi.fn() },
    vaccination: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/administration/parametres", () => ({ estFonctionnaliteActive: vi.fn(async () => true) }));
vi.mock("@/modules/administration/modules-actifs", () => ({ MESSAGE_MODULE_INACTIF: "Ce module est desactive." }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { estFonctionnaliteActive } from "@/modules/administration/parametres";
import {
  enregistrerVaccinationCommunautaireAction,
  getVaccinationsDeLaPersonneCommunautaire,
  retirerVaccinationAction,
} from "@/modules/vaccination/actions";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  personneCommunautaire: { findUnique: Mock };
  vaccination: { findFirst: Mock; findUnique: Mock; create: Mock; update: Mock; findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const estFonctionnaliteActiveMock = estFonctionnaliteActive as unknown as Mock;

const etatInitial = { error: null, success: false };

function formulaire(surcharges: Record<string, string> = {}): FormData {
  const champs: Record<string, string> = {
    personneId: "personne-1",
    vaccin: "BCG",
    numeroDose: "1",
    dateAdministration: "2026-01-05",
    numeroLot: "LOT-42",
    siteInjection: "Bras gauche",
    voie: "intradermique",
    // lieu par defaut du parcours communautaire = "campagne" (voir le schema), qui exige un nom.
    nomCampagne: "Riposte rougeole",
    ...surcharges,
  };
  const donnees = new FormData();
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  return donnees;
}

function personne(surcharges: Record<string, unknown> = {}) {
  return {
    id: "personne-1",
    etablissementId: "etab-1",
    nom: "Doe",
    prenom: "Jane",
    dateNaissance: new Date("2026-01-01T12:00:00Z"),
    ...surcharges,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });
  estFonctionnaliteActiveMock.mockResolvedValue(true);
  p.professionnelSante.findUnique.mockResolvedValue({ id: "agent-1", etablissementId: "etab-1" });
  p.personneCommunautaire.findUnique.mockResolvedValue(personne());
  p.vaccination.findFirst.mockResolvedValue(null);
  p.vaccination.create.mockResolvedValue({ id: "vac-1" });
});

describe("enregistrerVaccinationCommunautaireAction (F-COM-04)", () => {
  it("enregistre une vaccination sur la personne communautaire, lieu campagne par defaut", async () => {
    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.vaccination.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          personneCommunautaireId: "personne-1",
          professionnelId: "agent-1",
          etablissementId: "etab-1",
          lieu: "campagne",
          nomCampagne: "Riposte rougeole",
        }),
      })
    );
    expect(p.vaccination.create.mock.calls[0][0].data).not.toHaveProperty("patientId");
  });

  it("refuse sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse un role autre qu'agent_communautaire, meme medecin ou infirmier (create:vaccination partage)", async () => {
    for (const role of ["medecin", "infirmier", "patient", "pharmacien"]) {
      getSessionMock.mockResolvedValue({ userId: "u", roles: [role] });

      const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

      expect(resultat.success, role).toBe(false);
      expect(resultat.error, role).toContain("agents communautaires");
    }
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse quand le module communautaire est desactive", async () => {
    estFonctionnaliteActiveMock.mockResolvedValue(false);

    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse une personne d'un autre etablissement (Zero Trust, jamais suppose)", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue(personne({ etablissementId: "etab-autre" }));

    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("introuvable");
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse une personne introuvable", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue(null);

    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat.success).toBe(false);
    expect(p.vaccination.create).not.toHaveBeenCalled();
  });

  it("refuse une date d'administration dans le futur", async () => {
    const demain = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire({ dateAdministration: demain }));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("futur");
  });

  it("lieu campagne exige un nom de campagne d'au moins 3 caracteres", async () => {
    const sansNom = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire({ lieu: "campagne", nomCampagne: "" }));
    expect(sansNom.success).toBe(false);
    expect(sansNom.error).toContain("campagne");

    const avecNom = await enregistrerVaccinationCommunautaireAction(
      etatInitial,
      formulaire({ lieu: "campagne", nomCampagne: "Riposte rougeole Cotonou" })
    );
    expect(avecNom.success).toBe(true);
    expect(p.vaccination.create.mock.calls[0][0].data.nomCampagne).toBe("Riposte rougeole Cotonou");
  });

  it("lieu etablissement ne conserve jamais un nom de campagne saisi puis change d'avis", async () => {
    const resultat = await enregistrerVaccinationCommunautaireAction(
      etatInitial,
      formulaire({ lieu: "etablissement", nomCampagne: "Une campagne oubliee" })
    );

    expect(resultat.success).toBe(true);
    expect(p.vaccination.create.mock.calls[0][0].data.nomCampagne).toBeNull();
  });

  it("avertit sur un doublon de dose sans bloquer une confirmation explicite", async () => {
    p.vaccination.findFirst.mockResolvedValueOnce({ id: "vac-existante" });

    const refuse = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());
    expect(refuse.success).toBe(false);
    expect(refuse.avertissementDoublon).toBe(true);
    expect(p.vaccination.create).not.toHaveBeenCalled();

    p.vaccination.findFirst.mockResolvedValueOnce({ id: "vac-existante" });
    const confirme = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire({ confirmerDoublon: "true" }));
    expect(confirme.success).toBe(true);
  });

  it("avertit sur un age hors calendrier (BCG apres 12 mois) sans bloquer une confirmation explicite", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue(personne({ dateNaissance: new Date("2020-01-01T12:00:00Z") }));

    const refuse = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());
    expect(refuse.success).toBe(false);
    expect(refuse.avertissementAge).toBe(true);
    expect(p.vaccination.create).not.toHaveBeenCalled();

    const confirme = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire({ confirmerAge: "true" }));
    expect(confirme.success).toBe(true);
  });

  it("ne verifie jamais de consentement (une fiche communautaire n'en a pas)", async () => {
    const resultat = await enregistrerVaccinationCommunautaireAction(etatInitial, formulaire());

    expect(resultat.success).toBe(true);
  });
});

describe("getVaccinationsDeLaPersonneCommunautaire (F-COM-04)", () => {
  beforeEach(() => {
    p.vaccination.findMany.mockResolvedValue([
      {
        id: "vac-1",
        vaccin: "BCG",
        numeroDose: 1,
        dateAdministration: new Date("2026-01-05T00:00:00Z"),
        numeroLot: "LOT-42",
        siteInjection: "Bras gauche",
        voie: "intradermique",
        lieu: "campagne",
        nomCampagne: "Riposte X",
        saisieParErreur: false,
        motifRetrait: null,
        professionnel: { user: { nom: "Doe", prenom: "Jean" } },
      },
    ]);
  });

  it("renvoie l'historique pour l'agent du meme etablissement", async () => {
    const resultat = await getVaccinationsDeLaPersonneCommunautaire("personne-1");

    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatchObject({
      beneficiaireNomComplet: "Jane Doe",
      lieu: "campagne",
      nomCampagne: "Riposte X",
      agentNomComplet: "Dr. Jean Doe",
    });
  });

  it("renvoie une liste vide sans session ou pour un role different", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getVaccinationsDeLaPersonneCommunautaire("personne-1")).toEqual([]);

    getSessionMock.mockResolvedValue({ userId: "u", roles: ["medecin"] });
    expect(await getVaccinationsDeLaPersonneCommunautaire("personne-1")).toEqual([]);
  });

  it("renvoie une liste vide pour une personne d'un autre etablissement", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue(personne({ etablissementId: "etab-autre" }));

    expect(await getVaccinationsDeLaPersonneCommunautaire("personne-1")).toEqual([]);
    expect(p.vaccination.findMany).not.toHaveBeenCalled();
  });
});

describe("retirerVaccinationAction : parcours communautaire (F-COM-04)", () => {
  it("retire une vaccination communautaire sans exiger de consentement (aucun pour cette population)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-agent", roles: ["agent_communautaire"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "agent-1", etablissementId: "etab-1" });
    p.vaccination.findUnique.mockResolvedValue({
      id: "vac-1",
      patientId: null,
      personneCommunautaireId: "personne-1",
      professionnelId: "agent-1",
      saisieParErreur: false,
    });
    p.vaccination.update.mockResolvedValue({});

    const donnees = new FormData();
    donnees.set("vaccinationId", "vac-1");
    donnees.set("motif", "Erreur de saisie du numero de dose");

    const resultat = await retirerVaccinationAction(etatInitial, donnees);

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.vaccination.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { saisieParErreur: true, motifRetrait: "Erreur de saisie du numero de dose" } })
    );
  });
});
