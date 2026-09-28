import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";
// Frontiere du module (F-PIL-07) : la publication elle-meme n'est pas
// l'objet de ce fichier, qui teste la machine a etats de RendezVous.
vi.mock("@/modules/pilotage/file-taches", () => ({ publierEvenementPilotage: vi.fn(async () => undefined) }));
import { publierEvenementPilotage } from "@/modules/pilotage/file-taches";
import {
  STATUTS_QUI_LIBERENT_LE_CRENEAU,
  STATUTS_RENDEZ_VOUS,
  TRANSITIONS,
  creerAvecCapacite,
  estConflitDeCreneau,
  fenetreCandidats,
  transitionAutorisee,
  transitionnerRendezVous,
  transitionnerRendezVousEnMasse,
} from "./rendez-vous-etats";
import type { EvenementRendezVous } from "./rendez-vous-etats";

/**
 * Machine a etats de RendezVous (RG-RDV-00) : la table de transitions est
 * verifiee dans son integralite, et l'ecriture est toujours conditionnee au
 * statut de depart dans la meme requete.
 */

const RENDEZ_VOUS_FIXTURE = { date: new Date("2026-10-05T08:00:00.000Z"), etablissementId: "etab-1" };

function clientSimule(count: number) {
  const updateMany: Mock = vi.fn().mockResolvedValue({ count });
  const findUnique: Mock = vi.fn().mockResolvedValue(RENDEZ_VOUS_FIXTURE);
  return {
    client: { rendezVous: { updateMany, findUnique } } as unknown as Parameters<typeof transitionnerRendezVous>[0],
    updateMany,
    findUnique,
  };
}

const publierEvenementPilotageMock = publierEvenementPilotage as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("table de transitions", () => {
  // Matrice attendue, ecrite en dur (et non deduite de TRANSITIONS) pour que toute modification soit revue.
  const ATTENDU: Record<EvenementRendezVous, string[]> = {
    confirmer: ["demande"],
    refuser: ["demande"],
    expirer: ["demande"],
    annuler: ["demande", "confirme"],
    enregistrer_arrivee: ["demande", "confirme", "absent"],
    marquer_absent: ["confirme"],
    demarrer_consultation: ["demande", "confirme", "absent"],
    terminer: ["demande", "confirme", "absent", "en_consultation"],
  };

  for (const evenement of Object.keys(ATTENDU) as EvenementRendezVous[]) {
    for (const statut of STATUTS_RENDEZ_VOUS) {
      const autorise = ATTENDU[evenement].includes(statut);
      it(`${evenement} depuis "${statut}" : ${autorise ? "autorise" : "refuse"}`, () => {
        expect(transitionAutorisee(statut, evenement)).toBe(autorise);
      });
    }
  }

  it("un rendez-vous termine, annule, refuse ou expire ne peut plus changer de statut", () => {
    for (const evenement of Object.keys(TRANSITIONS) as EvenementRendezVous[]) {
      for (const statutFinal of ["termine", "annule", "refuse", "expire"]) {
        expect(transitionAutorisee(statutFinal, evenement)).toBe(false);
      }
    }
  });

  it("un rendez-vous en consultation ne peut ni etre annule, ni refuse, ni marque absent", () => {
    for (const evenement of ["annuler", "refuser", "expirer", "marquer_absent", "confirmer"] as EvenementRendezVous[]) {
      expect(transitionAutorisee("en_consultation", evenement)).toBe(false);
    }
  });

  it("annule, refuse et expire liberent le creneau, pas les autres statuts", () => {
    expect([...STATUTS_QUI_LIBERENT_LE_CRENEAU].sort()).toEqual(["annule", "expire", "refuse"]);
    for (const statut of ["demande", "confirme", "en_consultation", "termine", "absent"]) {
      expect(STATUTS_QUI_LIBERENT_LE_CRENEAU).not.toContain(statut);
    }
  });

  it("un statut inconnu n'est autorise pour aucun evenement", () => {
    for (const evenement of Object.keys(TRANSITIONS) as EvenementRendezVous[]) {
      expect(transitionAutorisee("brouillon", evenement)).toBe(false);
    }
  });
});

describe("transitionnerRendezVous", () => {
  it("conditionne la mise a jour au statut de depart dans la meme requete", async () => {
    const { client, updateMany } = clientSimule(1);

    const resultat = await transitionnerRendezVous(client, "rdv-1", "annuler");

    expect(resultat).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme"] } },
      data: { statut: "annule" },
    });
  });

  it("renvoie false quand aucune ligne n'a ete modifiee (statut deja change ou rendez-vous absent)", async () => {
    const { client, findUnique } = clientSimule(0);
    expect(await transitionnerRendezVous(client, "rdv-1", "confirmer")).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
    expect(publierEvenementPilotageMock).not.toHaveBeenCalled();
  });

  it("F-PIL-07 : publie rendez_vous_change apres une transition reussie, jamais apres un echec", async () => {
    const { client } = clientSimule(1);

    await transitionnerRendezVous(client, "rdv-1", "annuler");

    expect(publierEvenementPilotageMock).toHaveBeenCalledWith(client, {
      type: "rendez_vous_change",
      date: RENDEZ_VOUS_FIXTURE.date,
      etablissementId: RENDEZ_VOUS_FIXTURE.etablissementId,
    });
  });

  it("ajoute les champs et conditions demandes sans jamais pouvoir remplacer l'id ni le statut de depart", async () => {
    const { client, updateMany } = clientSimule(1);
    const maintenant = new Date("2026-09-28T09:00:00.000Z");

    await transitionnerRendezVous(client, "rdv-1", "enregistrer_arrivee", {
      donnees: { heureArrivee: maintenant },
      conditions: { id: "autre-id", statut: "termine" },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "rdv-1", statut: { in: ["demande", "confirme", "absent"] } },
      data: { heureArrivee: maintenant, statut: "confirme" },
    });
  });
});

describe("transitionnerRendezVousEnMasse", () => {
  it("renvoie le nombre de rendez-vous modifies et respecte les conditions", async () => {
    const { client, updateMany } = clientSimule(3);

    const nombre = await transitionnerRendezVousEnMasse(client, "marquer_absent", { conditions: { heureArrivee: null } });

    expect(nombre).toBe(3);
    expect(updateMany).toHaveBeenCalledWith({
      where: { heureArrivee: null, statut: { in: ["confirme"] } },
      data: { statut: "absent" },
    });
  });
});

describe("estConflitDeCreneau (RG-RDV-03)", () => {
  it("reconnait la violation de l'index unique (P2002)", () => {
    const erreur = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" });
    expect(estConflitDeCreneau(erreur)).toBe(true);
  });

  it("ne confond pas avec une autre erreur Prisma ni avec une erreur quelconque", () => {
    const autre = new Prisma.PrismaClientKnownRequestError("Foreign key", { code: "P2003", clientVersion: "6" });
    expect(estConflitDeCreneau(autre)).toBe(false);
    expect(estConflitDeCreneau(new Error("P2002"))).toBe(false);
    expect(estConflitDeCreneau(null)).toBe(false);
  });
});

describe("fenetreCandidats (F-ETA-05, capacite de creneau)", () => {
  it("couvre exactement les instants de date a date + capacite secondes, borne haute exclue", () => {
    const date = new Date("2026-10-05T08:00:00.000Z");
    expect(fenetreCandidats(date, 3)).toEqual({ gte: date, lt: new Date("2026-10-05T08:00:03.000Z") });
  });
});

describe("creerAvecCapacite (F-ETA-05, capacite de creneau)", () => {
  const conflit = () => new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "6" });

  it("reussit du premier coup a l'instant demande quand il n'y a pas de conflit", async () => {
    const creer = vi.fn(async (date: Date) => `ok:${date.toISOString()}`);

    const resultat = await creerAvecCapacite(new Date("2026-10-05T08:00:00.000Z"), 1, creer);

    expect(resultat).toBe("ok:2026-10-05T08:00:00.000Z");
    expect(creer).toHaveBeenCalledTimes(1);
    expect(creer).toHaveBeenCalledWith(new Date("2026-10-05T08:00:00.000Z"));
  });

  it("retente au prochain instant candidat (decalage d'une seconde) apres un conflit, dans la limite de la capacite", async () => {
    const creer = vi
      .fn()
      .mockRejectedValueOnce(conflit())
      .mockResolvedValueOnce("ok-a-la-deuxieme-tentative");

    const resultat = await creerAvecCapacite(new Date("2026-10-05T08:00:00.000Z"), 3, creer);

    expect(resultat).toBe("ok-a-la-deuxieme-tentative");
    expect(creer).toHaveBeenNthCalledWith(1, new Date("2026-10-05T08:00:00.000Z"));
    expect(creer).toHaveBeenNthCalledWith(2, new Date("2026-10-05T08:00:01.000Z"));
  });

  it("relance le conflit une fois la capacite reellement epuisee (toutes les tentatives en conflit)", async () => {
    const creer = vi.fn().mockRejectedValue(conflit());

    await expect(creerAvecCapacite(new Date("2026-10-05T08:00:00.000Z"), 2, creer)).rejects.toThrow();
    expect(creer).toHaveBeenCalledTimes(2);
  });

  it("relance immediatement une erreur qui n'est pas un conflit de creneau, sans retenter", async () => {
    const creer = vi.fn().mockRejectedValue(new Error("DEPLACEMENT_ANCIEN_NON_ANNULABLE"));

    await expect(creerAvecCapacite(new Date("2026-10-05T08:00:00.000Z"), 5, creer)).rejects.toThrow(
      "DEPLACEMENT_ANCIEN_NON_ANNULABLE"
    );
    expect(creer).toHaveBeenCalledTimes(1);
  });
});
