import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

/**
 * Routes de téléchargement des exports de pilotage (F-PIL-05, RG-PIL-40) :
 * la propriété testée est qu'un GET direct avec le seul cookie de session,
 * ou avec un motif falsifié dans l'URL, ne produit aucun export.
 */

vi.mock("@/lib/env", () => ({ getEnv: vi.fn(() => ({ NEXTAUTH_SECRET: "secret-de-test-route-export" })) }));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/pilotage/lecture", () => ({
  getVueNationalePilotage: vi.fn(),
  getTableauBordEtablissement: vi.fn(),
}));

import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { getVueNationalePilotage } from "@/modules/pilotage/lecture";
import { creerJetonExport } from "@/modules/pilotage/jeton-export";
import { GET as getCsv } from "./csv/route";
import { GET as getPdf } from "./pdf/route";

const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const vueNationaleMock = getVueNationalePilotage as unknown as Mock;

const SESSION_NATIONAL = { userId: "admin-1", roles: ["admin_national"], sessionId: "s-1" };

const VUE = {
  periode: "7j",
  consultations: { valeur: 12, variationPourcent: null },
  patientsVus: { valeur: 9, variationPourcent: null },
  etablissementsActifs: { actifs: 2, total: 3 },
  casPaludisme: { valeur: 5, variationPourcent: null },
  tauxDelivranceOrdonnances: "effectif insuffisant",
  vaccinations: { valeur: 7, variationPourcent: null },
  topDiagnostics: [],
  evolutionHebdomadaire: [],
  dateCalculPlusRecente: null,
};

function requete(parametres: Record<string, string>): Request {
  const url = new URL("http://localhost/api/pilotage/export/csv");
  for (const [cle, valeur] of Object.entries(parametres)) url.searchParams.set(cle, valeur);
  return new Request(url);
}

function jetonValide(surcharge: Partial<Parameters<typeof creerJetonExport>[0]> = {}, maintenantMs?: number) {
  return creerJetonExport(
    { utilisateurId: "admin-1", sessionId: "s-1", portee: "national", motif: "rapport_mensuel", ...surcharge },
    maintenantMs
  );
}

describe("GET /api/pilotage/export/csv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    vueNationaleMock.mockResolvedValue(VUE);
  });

  it("refuse sans jeton, même avec un motif valide dans l'URL (contournement du mot de passe)", async () => {
    const reponse = await getCsv(requete({ portee: "national", periode: "7j", motif: "reunion" }));
    expect(reponse.status).toBe(403);
    expect(vueNationaleMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton émis pour un autre utilisateur ou une autre session", async () => {
    const autreUtilisateur = jetonValide({ utilisateurId: "quelqu-un-d-autre" });
    const autreSession = jetonValide({ sessionId: "s-ancienne" });
    expect((await getCsv(requete({ portee: "national", jeton: autreUtilisateur }))).status).toBe(403);
    expect((await getCsv(requete({ portee: "national", jeton: autreSession }))).status).toBe(403);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un jeton émis pour l'autre portée", async () => {
    const jetonEtablissement = jetonValide({ portee: "etablissement" });
    const reponse = await getCsv(requete({ portee: "national", jeton: jetonEtablissement }));
    expect(reponse.status).toBe(403);
  });

  it("refuse un jeton expiré", async () => {
    const jetonExpire = jetonValide({}, Date.now() - 10 * 60 * 1000);
    const reponse = await getCsv(requete({ portee: "national", jeton: jetonExpire }));
    expect(reponse.status).toBe(403);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("avec un jeton valide, exporte et journalise le motif du JETON, pas celui de l'URL", async () => {
    const reponse = await getCsv(
      requete({ portee: "national", periode: "30j", jeton: jetonValide(), motif: "planification", motifTexte: "falsifie" })
    );

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toContain("text/csv");
    expect(vueNationaleMock).toHaveBeenCalledWith("30j");
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    const justification = journaliserMock.mock.calls[0][0].justification as string;
    expect(journaliserMock.mock.calls[0][0].action).toBe("EXPORT");
    expect(justification).toContain("Rapport mensuel");
    expect(justification).not.toContain("Planification");
    expect(justification).not.toContain("falsifie");
  });

  it("garde le contrôle de rôle : un jeton valide ne suffit pas à un compte sans droit", async () => {
    getSessionMock.mockResolvedValue({ userId: "admin-1", roles: ["admin_etablissement"], sessionId: "s-1" });
    const reponse = await getCsv(requete({ portee: "national", jeton: jetonValide() }));
    expect(reponse.status).toBe(403);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("répond 401 sans session et 400 pour une portée inconnue", async () => {
    getSessionMock.mockResolvedValue(null);
    expect((await getCsv(requete({ portee: "national" }))).status).toBe(401);
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    expect((await getCsv(requete({ portee: "autre-chose", jeton: jetonValide() }))).status).toBe(400);
  });
});

describe("GET /api/pilotage/export/pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue(SESSION_NATIONAL);
    vueNationaleMock.mockResolvedValue(VUE);
  });

  it("refuse sans jeton valide, comme la route CSV", async () => {
    const sansJeton = await getPdf(requete({ portee: "national", motif: "reunion" }));
    const jetonInvalide = await getPdf(requete({ portee: "national", jeton: "faux.jeton" }));
    expect(sansJeton.status).toBe(403);
    expect(jetonInvalide.status).toBe(403);
    expect(vueNationaleMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("avec un jeton valide, produit un PDF et journalise l'export", async () => {
    const reponse = await getPdf(requete({ portee: "national", jeton: jetonValide({ motif: "autre", motifTexte: "Réunion ministérielle" }) }));
    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("content-type")).toBe("application/pdf");
    expect(journaliserMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock.mock.calls[0][0].justification).toContain("Réunion ministérielle");
  });
});
