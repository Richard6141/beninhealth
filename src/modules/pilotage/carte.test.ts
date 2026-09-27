import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    departement: { findMany: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn() },
    agregatQuotidien: { findMany: vi.fn() },
    // Toute autre table serait un acces non prevu (aucune donnee individuelle sur la carte).
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getCarteSanitaire } from "./carte";

const p = prisma as unknown as {
  departement: { findMany: Mock };
  etablissementSanitaire: { findMany: Mock };
  agregatQuotidien: { findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const DEPARTEMENTS = [
  { id: "d-1", code: "AL", nom: "Alibori" },
  { id: "d-2", code: "AQ", nom: "Atlantique" },
  { id: "d-3", code: "BO", nom: "Borgou" },
];

function etablissement(id: string, departementId: string | null, statut = "actif") {
  return {
    id,
    nom: `Etablissement ${id}`,
    type: "centre_de_sante",
    statut,
    latitude: 9.5,
    longitude: 2.5,
    commune: departementId ? { departementId } : null,
    zoneSanitaire: null,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  p.departement.findMany.mockResolvedValue(DEPARTEMENTS);
  p.etablissementSanitaire.findMany.mockResolvedValue([etablissement("e-1", "d-1"), etablissement("e-2", "d-2"), etablissement("e-3", "d-2")]);
  p.agregatQuotidien.findMany.mockResolvedValue([]);
});

describe("getCarteSanitaire : acces (F-PIL-03)", () => {
  it.each(["patient", "medecin", "infirmier", "pharmacien", "laboratoire", "admin_etablissement"] as const)("le role %s n'a aucun acces", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    expect(await getCarteSanitaire("IND-01", "7j")).toBeNull();
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("sans session : null", async () => {
    getSessionMock.mockResolvedValue(null);

    expect(await getCarteSanitaire("IND-01", "7j")).toBeNull();
  });

  it("un indicateur non comparable (IND-03 exige un groupe, IND-99 n'existe pas) est refuse sans rien lire", async () => {
    expect(await getCarteSanitaire("IND-03", "7j")).toBeNull();
    expect(await getCarteSanitaire("IND-99", "7j")).toBeNull();
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
  });

  it("une periode inconnue est refusee (entree client jamais fiable)", async () => {
    expect(await getCarteSanitaire("IND-01", "1an")).toBeNull();
    expect(p.agregatQuotidien.findMany).not.toHaveBeenCalled();
  });
});

describe("getCarteSanitaire : agregats par departement", () => {
  it("additionne les agregats des etablissements de chaque departement et classe les valeurs", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      { etablissementId: "e-1", valeur: 10 },
      { etablissementId: "e-2", valeur: 60 },
      { etablissementId: "e-3", valeur: 40 },
    ]);

    const carte = await getCarteSanitaire("IND-01", "30j");

    expect(carte?.maximum).toBe(100);
    expect(carte?.departements).toEqual([
      { id: "d-1", code: "AL", nom: "Alibori", valeur: 10, classe: 0, nombreEtablissements: 1 },
      { id: "d-2", code: "AQ", nom: "Atlantique", valeur: 100, classe: 4, nombreEtablissements: 2 },
      { id: "d-3", code: "BO", nom: "Borgou", valeur: 0, classe: 0, nombreEtablissements: 0 },
    ]);
  });

  it("une valeur de 1 a 4 est masquee et reste dans la classe la plus faible (RG-PIL-02)", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      { etablissementId: "e-1", valeur: 3 },
      { etablissementId: "e-2", valeur: 200 },
    ]);

    const carte = await getCarteSanitaire("IND-01", "7j");

    const alibori = carte?.departements.find((departement) => departement.code === "AL");
    expect(alibori?.valeur).toBe("< 5");
    expect(alibori?.classe).toBe(0);
    // Le maximum de la legende vient d'un departement au-dessus du seuil : il ne revele pas une valeur masquee.
    expect(carte?.maximum).toBe(200);
  });

  it("si toutes les valeurs sont masquees, la legende ne laisse rien deviner : maximum 0, aucun intervalle promis", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([
      { etablissementId: "e-1", valeur: 3 },
      { etablissementId: "e-2", valeur: 4 },
    ]);

    const carte = await getCarteSanitaire("IND-01", "7j");

    expect(carte?.maximum).toBe(0);
    expect(carte?.departements.filter((departement) => departement.valeur === "< 5")).toHaveLength(2);
  });

  it("un etablissement sans territoire renseigne est exclu de la requete d'agregats", async () => {
    p.etablissementSanitaire.findMany.mockResolvedValue([etablissement("e-1", "d-1"), etablissement("e-orphelin", null)]);

    await getCarteSanitaire("IND-01", "7j");

    const filtre = p.agregatQuotidien.findMany.mock.calls[0][0].where;
    expect(filtre.etablissementId).toEqual({ in: ["e-1"] });
  });

  it("filtre la dimension libre quand l'indicateur en a une (IND-07 : pris) et pas sinon (IND-01)", async () => {
    await getCarteSanitaire("IND-07", "7j");
    expect(p.agregatQuotidien.findMany.mock.calls[0][0].where).toMatchObject({ indicateur: "IND-07", dimensionLibre: "pris" });

    p.agregatQuotidien.findMany.mockClear();
    await getCarteSanitaire("IND-01", "7j");
    expect(p.agregatQuotidien.findMany.mock.calls[0][0].where).not.toHaveProperty("dimensionLibre");
  });

  it("ne lit que les agregats : jamais de contenu clinique ni de nom de patient dans la reponse", async () => {
    p.agregatQuotidien.findMany.mockResolvedValue([{ etablissementId: "e-1", valeur: 30 }]);

    const carte = await getCarteSanitaire("IND-01", "7j", true);

    expect(Object.keys(carte!).sort()).toEqual(["departements", "etablissements", "indicateur", "maximum", "periode"]);
    expect(Object.keys(p.agregatQuotidien.findMany.mock.calls[0][0].select).sort()).toEqual(["etablissementId", "valeur"]);
  });
});

describe("getCarteSanitaire : couche des etablissements et journal", () => {
  it("sans la couche demandee : aucun etablissement n'est renvoye", async () => {
    const carte = await getCarteSanitaire("IND-01", "7j");

    expect(carte?.etablissements).toBeNull();
  });

  it("avec la couche : seuls les etablissements actifs sont places, sans donnee de sante", async () => {
    p.etablissementSanitaire.findMany.mockResolvedValue([etablissement("e-1", "d-1"), etablissement("e-2", "d-1", "ferme"), etablissement("e-3", "d-2", "suspendu")]);

    const carte = await getCarteSanitaire("IND-01", "7j", true);

    expect(carte?.etablissements?.map((e) => e.id)).toEqual(["e-1"]);
    expect(Object.keys(carte!.etablissements![0]).sort()).toEqual(["id", "nom", "type", "x", "y"]);
  });

  it("chaque consultation de la carte est journalisee en ANALYTICS_VIEW (RG-PIL-21)", async () => {
    await getCarteSanitaire("IND-04", "mois");

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ANALYTICS_VIEW",
        utilisateurId: "u-admin",
        donneeConcernee: expect.stringContaining("indicateur=IND-04"),
      })
    );
  });
});
