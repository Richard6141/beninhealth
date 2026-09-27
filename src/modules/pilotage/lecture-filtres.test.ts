import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * getVueNationalePilotage sous filtres (F-PIL-02, territoire / type / sexe /
 * tranche d'age). Le reste de la lecture (variations, evolution, top des
 * diagnostics sans filtre) est deja couvert par l'usage en production depuis
 * F-PIL-02 initial ; ce fichier cible uniquement ce que les filtres
 * changent : verification serveur, applicabilite par indicateur,
 * RG-PIL-05, RG-PIL-21.
 */

vi.mock("@/lib/prisma", () => ({
  prisma: {
    departement: { findUnique: vi.fn(), findMany: vi.fn() },
    etablissementSanitaire: { findFirst: vi.fn(), findMany: vi.fn() },
    agregatQuotidien: { aggregate: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getVueNationalePilotage } from "./lecture";
import { FILTRES_VIDES } from "./filtres-pilotage";

const p = prisma as unknown as {
  departement: { findUnique: Mock; findMany: Mock };
  etablissementSanitaire: { findFirst: Mock; findMany: Mock };
  agregatQuotidien: { aggregate: Mock; groupBy: Mock; findFirst: Mock; findMany: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

beforeEach(() => {
  vi.resetAllMocks();
  getSessionMock.mockResolvedValue({ userId: "u-admin", roles: ["admin_national"] });
  p.departement.findUnique.mockResolvedValue({ id: "d-1" });
  p.etablissementSanitaire.findFirst.mockResolvedValue({ type: "hopital" });
  p.etablissementSanitaire.findMany.mockResolvedValue([{ id: "e-1" }, { id: "e-2" }]);
  // Chaque somme d'indicateur (actuelle et precedente) : un effectif au-dessus du seuil de masquage, jamais masque ni nul.
  p.agregatQuotidien.aggregate.mockResolvedValue({ _sum: { valeur: 100 } });
  p.agregatQuotidien.groupBy.mockResolvedValue([]);
  p.agregatQuotidien.findFirst.mockResolvedValue(null);
  p.agregatQuotidien.findMany.mockResolvedValue([]);
});

describe("getVueNationalePilotage : acces", () => {
  it.each(["patient", "medecin", "admin_etablissement", "pharmacien"] as const)("le role %s n'a aucun acces", async (role) => {
    getSessionMock.mockResolvedValue({ userId: "u-x", roles: [role] });

    expect(await getVueNationalePilotage("7j")).toBeNull();
    expect(p.agregatQuotidien.aggregate).not.toHaveBeenCalled();
  });

  it("sans session : null", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getVueNationalePilotage("7j")).toBeNull();
  });
});

describe("getVueNationalePilotage : verification serveur des filtres (Zero Trust)", () => {
  it("un departement inexistant retombe a aucun filtre de territoire, pas d'erreur ni de filtre fictif", async () => {
    p.departement.findUnique.mockResolvedValue(null);

    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, departementId: "d-inconnu" });

    expect(vue?.filtres.departementId).toBeNull();
  });

  it("un type sans aucun etablissement retombe a aucun filtre de type", async () => {
    p.etablissementSanitaire.findFirst.mockResolvedValue(null);

    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, typeEtablissement: "type-inconnu" });

    expect(vue?.filtres.typeEtablissement).toBeNull();
  });

  it("un sexe ou une tranche d'age hors forme valide sont ecartes meme passes directement a la fonction", async () => {
    const vue = await getVueNationalePilotage("7j", {
      ...FILTRES_VIDES,
      sexe: "autre" as never,
      trancheAge: "0-200 ans",
    });

    expect(vue?.filtres.sexe).toBeNull();
    expect(vue?.filtres.trancheAge).toBeNull();
  });

  it("les filtres de territoire et de type verifies se traduisent en une liste d'etablissements passee aux agregats", async () => {
    await getVueNationalePilotage("7j", { ...FILTRES_VIDES, departementId: "d-1", typeEtablissement: "hopital" });

    const appelIndicateurUn = p.agregatQuotidien.aggregate.mock.calls.find((appel) => appel[0].where.indicateur === "IND-01");
    expect(appelIndicateurUn?.[0].where.etablissementId).toEqual({ in: ["e-1", "e-2"] });
  });
});

describe("getVueNationalePilotage : applicabilite par indicateur (nonFiltrables)", () => {
  it("sans filtre : aucune carte n'est declaree indisponible", async () => {
    const vue = await getVueNationalePilotage("7j");

    expect(vue?.nonFiltrables).toEqual([]);
    expect(vue?.groupesSensiblesExclus).toBe(false);
  });

  it("un filtre de territoire seul : toutes les cartes restent disponibles (le territoire s'applique a tout etablissement)", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, departementId: "d-1" });

    expect(vue?.nonFiltrables).toEqual([]);
  });

  it("un filtre sexe seul : le paludisme, les etablissements actifs, le taux de delivrance et les vaccinations sont indisponibles (leur agregat n'a pas de sexe)", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, sexe: "F" });

    expect(vue?.nonFiltrables.sort()).toEqual(
      ["casPaludisme", "etablissementsActifs", "evolutionPaludisme", "tauxDelivrance", "vaccinations"].sort()
    );
    // Consultations et patients vus portent un sexe : ils restent disponibles.
    expect(vue?.nonFiltrables).not.toContain("consultations");
    expect(vue?.nonFiltrables).not.toContain("patientsVus");
  });

  it("un filtre de tranche d'age seul : les vaccinations restent disponibles (elles ont une tranche d'age), pas le paludisme", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, trancheAge: "1-4 ans" });

    expect(vue?.nonFiltrables).not.toContain("vaccinations");
    expect(vue?.nonFiltrables).toContain("casPaludisme");
  });

  it("le taux de delivrance masque tout le calcul (numerateur et denominateur) quand le filtre ne s'applique pas, jamais un taux non filtre presente comme filtre", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, sexe: "F" });

    expect(vue?.tauxDelivranceOrdonnances).toBe("effectif insuffisant");
    const appelsIND08 = p.agregatQuotidien.aggregate.mock.calls.filter((appel) => appel[0].where.indicateur === "IND-08");
    expect(appelsIND08).toHaveLength(0);
  });
});

describe("getVueNationalePilotage : groupes sensibles du top des diagnostics (RG-PIL-05)", () => {
  it("un seul departement filtre, sans autre filtre : les groupes sensibles restent inclus", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, departementId: "d-1" });

    expect(vue?.groupesSensiblesExclus).toBe(false);
    const appelGroupBy = p.agregatQuotidien.groupBy.mock.calls[0][0];
    expect(appelGroupBy.where.OR).toBeDefined();
  });

  it("un departement et un type a la fois : les groupes sensibles sont exclus", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, departementId: "d-1", typeEtablissement: "hopital" });

    expect(vue?.groupesSensiblesExclus).toBe(true);
  });

  it("un filtre sexe seul (sans territoire) : les groupes sensibles sont exclus", async () => {
    const vue = await getVueNationalePilotage("7j", { ...FILTRES_VIDES, sexe: "F" });

    expect(vue?.groupesSensiblesExclus).toBe(true);
  });
});

describe("getVueNationalePilotage : journal (RG-PIL-21)", () => {
  it("chaque ouverture est journalisee avec les filtres reellement appliques, pas ceux demandes", async () => {
    p.departement.findUnique.mockResolvedValue(null);

    await getVueNationalePilotage("mois", { ...FILTRES_VIDES, departementId: "d-inconnu", sexe: "F" });

    expect(journaliserMock).toHaveBeenCalledTimes(1);
    const donnee = journaliserMock.mock.calls[0][0].donneeConcernee as string;
    expect(donnee).toContain("periode=mois");
    expect(donnee).toContain("sexe=F");
    expect(donnee).not.toContain("territoire=");
  });
});
