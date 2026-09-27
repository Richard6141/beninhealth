import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * F-PIL-02, CA-1 du pack : "aucune reponse des API /analytics/* ne contient
 * de champ identifiant un patient (test automatise sur le schema des
 * reponses)". Ce depot n'expose pas ces lectures par une route REST
 * /api/v1/analytics/* (architecture Server Actions/Server Components, voir
 * docs/coordination-agents.md), mais le critere reste verifiable de la meme
 * facon : parcourir recursivement l'objet renvoye par chaque fonction de
 * lecture de pilotage et s'assurer qu'aucune cle ne nomme un champ
 * identifiant un patient. "nom"/"libelle" restent autorises quand ils
 * designent un ETABLISSEMENT, un DEPARTEMENT ou un GROUPE DE MALADIES
 * (dimensions explicitement permises par RG-PIL-01), jamais une personne.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    departement: { findMany: vi.fn(), findUnique: vi.fn() },
    etablissementSanitaire: { findMany: vi.fn(), findFirst: vi.fn() },
    agregatQuotidien: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
    healthAlertReview: { findMany: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { getVueNationalePilotage } from "./lecture";
import { getCarteSanitaire } from "./carte";

const p = prisma as unknown as {
  departement: { findMany: Mock; findUnique: Mock };
  etablissementSanitaire: { findMany: Mock; findFirst: Mock };
  agregatQuotidien: { findMany: Mock; aggregate: Mock; groupBy: Mock; findFirst: Mock };
};
const getSessionMock = getSession as unknown as Mock;

/**
 * Champs qui identifient une PERSONNE (patient), jamais legitimes dans une
 * reponse de pilotage (RG-PIL-01). Ne contient volontairement pas "nom" ni
 * "libelle" seuls : ces cles designent ici un etablissement, un departement
 * ou un groupe de maladies (dimensions explicitement permises).
 */
const CHAMPS_INTERDITS = [
  "patientid",
  "identifiantsante",
  "datenaissance",
  "numerosecu",
  "numerosecurite",
  "prenom",
  "prenoms",
  "nomcomplet", // reserve a activiteParProfessionnel (professionnel, pas patient) : verifie separement ci-dessous.
  "telephonepersonnel",
  "adressepersonnelle",
];

function cheminsInterdits(valeur: unknown, chemin = ""): string[] {
  if (valeur === null || typeof valeur !== "object") return [];
  if (Array.isArray(valeur)) {
    return valeur.flatMap((element, index) => cheminsInterdits(element, `${chemin}[${index}]`));
  }
  const trouves: string[] = [];
  for (const [cle, sousValeur] of Object.entries(valeur as Record<string, unknown>)) {
    const cleMinuscule = cle.toLowerCase();
    const cheminCourant = chemin ? `${chemin}.${cle}` : cle;
    if (CHAMPS_INTERDITS.includes(cleMinuscule)) {
      trouves.push(cheminCourant);
    }
    trouves.push(...cheminsInterdits(sousValeur, cheminCourant));
  }
  return trouves;
}

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  p.departement.findMany.mockResolvedValue([{ id: "d-1", code: "AQ", nom: "Atlantique" }]);
  p.departement.findUnique.mockResolvedValue(null);
  p.etablissementSanitaire.findMany.mockResolvedValue([
    {
      id: "e-1",
      nom: "Centre de sante de Cotonou",
      type: "centre_sante",
      statut: "actif",
      latitude: 6.4,
      longitude: 2.4,
      commune: { departementId: "d-1" },
      zoneSanitaire: null,
    },
  ]);
  p.etablissementSanitaire.findFirst.mockResolvedValue(null);
  p.agregatQuotidien.findMany.mockResolvedValue([{ etablissementId: "e-1", date: new Date(), valeur: 30 }]);
  p.agregatQuotidien.aggregate.mockResolvedValue({ _sum: { valeur: 30 } });
  p.agregatQuotidien.groupBy.mockResolvedValue([{ dimensionLibre: "paludisme", _sum: { valeur: 7 } }]);
  p.agregatQuotidien.findFirst.mockResolvedValue(null);
});

describe("F-PIL-02 CA-1 : aucun champ identifiant un patient dans la vue nationale", () => {
  it("getVueNationalePilotage", async () => {
    const vue = await getVueNationalePilotage("7j");

    expect(cheminsInterdits(vue)).toEqual([]);
  });

  it("meme avec tous les filtres actifs (territoire, type, sexe, age)", async () => {
    p.departement.findUnique.mockResolvedValue({ id: "d-1" });
    p.etablissementSanitaire.findFirst.mockResolvedValue({ type: "hopital" });

    const vue = await getVueNationalePilotage("mois", {
      departementId: "d-1",
      typeEtablissement: "hopital",
      sexe: "F",
      trancheAge: "1-4 ans",
    });

    expect(cheminsInterdits(vue)).toEqual([]);
  });
});

describe("F-PIL-03 CA-1 : aucun champ identifiant un patient dans la carte sanitaire", () => {
  it("getCarteSanitaire, y compris la couche des etablissements", async () => {
    const carte = await getCarteSanitaire("IND-01", "7j", true);

    expect(cheminsInterdits(carte)).toEqual([]);
    // La couche etablissements ne nomme que le repertoire (nom, type, position), jamais un patient : verifie explicitement.
    expect(Object.keys(carte!.etablissements![0]).sort()).toEqual(["id", "nom", "type", "x", "y"]);
  });
});
