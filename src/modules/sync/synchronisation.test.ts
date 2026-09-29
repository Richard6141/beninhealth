import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { genererUuidV7 } from "@/modules/offline/uuid-v7";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    personneCommunautaire: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  };
  return { prisma };
});
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { LotTropVolumineuxError, TAILLE_MAX_LOT, traiterLotSynchronisation } from "./synchronisation";
import type { SaisieHorsLigne } from "./synchronisation";

const p = prisma as unknown as {
  personneCommunautaire: { findUnique: Mock; findMany: Mock; create: Mock };
};
const journaliserMock = journaliser as unknown as Mock;

const CONTEXTE = { utilisateurId: "user-agent", agentId: "agent-1", etablissementId: "etab-1" };

function saisiePersonne(champs: Partial<SaisieHorsLigne["payload"]> = {}, options: Partial<SaisieHorsLigne> = {}): SaisieHorsLigne {
  return {
    uuidAppareil: options.uuidAppareil ?? genererUuidV7(),
    type: "personne_communautaire",
    horodatageLocal: options.horodatageLocal ?? new Date().toISOString(),
    payload: {
      nom: "Dossou",
      prenom: "Akpédjé",
      sexe: "F",
      dateNaissance: "1990-03-15",
      dateNaissanceApproximative: false,
      villageQuartier: "Zogbo",
      ...champs,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.personneCommunautaire.findUnique.mockResolvedValue(null);
  p.personneCommunautaire.findMany.mockResolvedValue([]);
  p.personneCommunautaire.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "pers-nouvelle",
    ...data,
  }));
});

describe("traiterLotSynchronisation (F-COM-08)", () => {
  it("accepte une nouvelle personne sans doublon probable (ACCEPTED)", async () => {
    const saisie = saisiePersonne();
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats).toHaveLength(1);
    expect(resultats[0]).toMatchObject({ statut: "ACCEPTED", uuidAppareil: saisie.uuidAppareil });
    expect(p.personneCommunautaire.create).toHaveBeenCalledTimes(1);
  });

  it("met en revue une personne dont le score de doublon est >= 80 (REVIEW)", async () => {
    p.personneCommunautaire.findMany.mockResolvedValue([
      { nom: "Dossou", prenom: "Akpédjé", dateNaissance: new Date("1990-03-15T00:00:00.000Z"), sexe: "F" },
    ]);
    const saisie = saisiePersonne();
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0].statut).toBe("REVIEW");
    expect(p.personneCommunautaire.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statutRevue: "REVIEW" }) })
    );
  });

  it("renvoie DUPLICATE sans recreer quand l'UUID d'appareil a deja ete recu (idempotence RG-OFF-02)", async () => {
    p.personneCommunautaire.findUnique.mockResolvedValue({ id: "pers-existante" });
    const saisie = saisiePersonne();
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0]).toMatchObject({ statut: "DUPLICATE", personneId: "pers-existante" });
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("renvoyer deux fois le meme lot ne cree aucun doublon (CA-2 du pack)", async () => {
    const saisie = saisiePersonne();

    p.personneCommunautaire.findUnique.mockResolvedValueOnce(null);
    const premierEnvoi = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");
    expect(premierEnvoi[0].statut).toBe("ACCEPTED");

    // Deuxieme envoi du meme lot : le serveur "sait" desormais que cet UUID existe deja.
    p.personneCommunautaire.findUnique.mockResolvedValueOnce({ id: "pers-nouvelle" });
    const secondEnvoi = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(secondEnvoi[0].statut).toBe("DUPLICATE");
    expect(p.personneCommunautaire.create).toHaveBeenCalledTimes(1);
  });

  it("rejette une saisie dont l'identifiant n'est pas un UUID v7 valide (REJECTED)", async () => {
    const saisie = saisiePersonne({}, { uuidAppareil: "identifiant-invalide" });
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0].statut).toBe("REJECTED");
    expect(p.personneCommunautaire.create).not.toHaveBeenCalled();
  });

  it("rejette une saisie dont l'horodatage local depasse 72h dans le futur (RG-COM-21, horloge dereglee)", async () => {
    const dansLongtemps = new Date(Date.now() + 100 * 60 * 60 * 1000).toISOString();
    const saisie = saisiePersonne({}, { horodatageLocal: dansLongtemps });
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0].statut).toBe("REJECTED");
    expect(resultats[0].message).toContain("dereglee");
  });

  it("accepte un horodatage local jusqu'a 72h dans le futur (limite exacte non depassee)", async () => {
    const presqueALaLimite = new Date(Date.now() + 71 * 60 * 60 * 1000).toISOString();
    const saisie = saisiePersonne({}, { horodatageLocal: presqueALaLimite });
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0].statut).toBe("ACCEPTED");
  });

  it("rejette une saisie dont les donnees sont invalides (nom manquant)", async () => {
    const saisie = saisiePersonne({ nom: "" });
    const resultats = await traiterLotSynchronisation(CONTEXTE, [saisie], "127.0.0.1");

    expect(resultats[0].statut).toBe("REJECTED");
  });

  it("refuse un lot de plus de 50 saisies (RG-OFF-02, taille de lot)", async () => {
    const saisies = Array.from({ length: TAILLE_MAX_LOT + 1 }, () => saisiePersonne());

    await expect(traiterLotSynchronisation(CONTEXTE, saisies, "127.0.0.1")).rejects.toBeInstanceOf(LotTropVolumineuxError);
  });

  it("journalise le lot dans l'audit avec le nombre de saisies par statut (RG-COM-22)", async () => {
    p.personneCommunautaire.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pers-existante" });

    const saisies = [saisiePersonne(), saisiePersonne({ prenom: "Autre" })];
    await traiterLotSynchronisation(CONTEXTE, saisies, "192.168.1.1");

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    const appel = journaliserMock.mock.calls[0][0];
    expect(appel.action).toBe("synchronisation_lot");
    expect(appel.adresseTechnique).toBe("192.168.1.1");
    expect(appel.justification).toContain("SYNC_BATCH");
    expect(appel.justification).toContain("ACCEPTED");
    expect(appel.justification).toContain("DUPLICATE");
  });

  it("un lot vide ne cree rien mais journalise quand meme (0 saisie)", async () => {
    const resultats = await traiterLotSynchronisation(CONTEXTE, [], "127.0.0.1");
    expect(resultats).toEqual([]);
    expect(journaliserMock).toHaveBeenCalledTimes(1);
  });
});
