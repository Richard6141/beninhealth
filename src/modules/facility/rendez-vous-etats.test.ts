import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { Prisma } from "@prisma/client";
import {
  STATUTS_QUI_LIBERENT_LE_CRENEAU,
  STATUTS_RENDEZ_VOUS,
  TRANSITIONS,
  estConflitDeCreneau,
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

function clientSimule(count: number) {
  const updateMany: Mock = vi.fn().mockResolvedValue({ count });
  return { client: { rendezVous: { updateMany } } as unknown as Parameters<typeof transitionnerRendezVous>[0], updateMany };
}

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
    const { client } = clientSimule(0);
    expect(await transitionnerRendezVous(client, "rdv-1", "confirmer")).toBe(false);
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
