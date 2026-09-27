import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/modules/patient/droits-donnees", () => ({ collecterMesDonneesPersonnelles: vi.fn() }));

import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { collecterMesDonneesPersonnelles } from "@/modules/patient/droits-donnees";
import { creerJetonExportDonnees } from "@/modules/patient/jeton-export-donnees";
import { GET as getJson } from "./json/route";
import { GET as getPdf } from "./pdf/route";

const getSessionMock = getSession as unknown as Mock;
const collecterMock = collecterMesDonneesPersonnelles as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;

const DONNEES = {
  genereLe: "2026-09-27T12:00:00.000Z",
  compte: { nomComplet: "Aminata Test", email: "a@test.bj" },
  dossier: null,
  consultations: [],
  rendezVous: [],
  prescriptions: [],
  examens: [],
  vaccinations: [],
  consentements: [],
};

function requete(chemin: string, jeton?: string): Request {
  const url = new URL(`http://localhost/api/patient/export/${chemin}`);
  if (jeton !== undefined) url.searchParams.set("jeton", jeton);
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ userId: "user-1", roles: ["patient"] });
  collecterMock.mockResolvedValue(DONNEES);
});

describe.each([
  ["json", getJson],
  ["pdf", getPdf],
] as const)("route d'export %s (F-CIT-13, re-authentification)", (nom, GET) => {
  it("repond 401 sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const reponse = await GET(requete(nom, creerJetonExportDonnees("user-1")));

    expect(reponse.status).toBe(401);
    expect(collecterMock).not.toHaveBeenCalled();
  });

  it("repond 401 pour un compte qui n'est pas patient", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-2", roles: ["medecin"] });

    const reponse = await GET(requete(nom, creerJetonExportDonnees("user-2")));

    expect(reponse.status).toBe(401);
    expect(collecterMock).not.toHaveBeenCalled();
  });

  it("repond 403 sans jeton : la session seule ne livre rien", async () => {
    const reponse = await GET(requete(nom));

    expect(reponse.status).toBe(403);
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(collecterMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("repond 403 avec un jeton vide, altere ou expire", async () => {
    const jeton = creerJetonExportDonnees("user-1", new Date(Date.now() - 6 * 60 * 1000));

    expect((await GET(requete(nom, ""))).status).toBe(403);
    expect((await GET(requete(nom, `${creerJetonExportDonnees("user-1")}x`))).status).toBe(403);
    expect((await GET(requete(nom, jeton))).status).toBe(403);
    expect(collecterMock).not.toHaveBeenCalled();
  });

  it("repond 403 avec le jeton d'un autre compte", async () => {
    const reponse = await GET(requete(nom, creerJetonExportDonnees("user-autre")));

    expect(reponse.status).toBe(403);
    expect(collecterMock).not.toHaveBeenCalled();
  });

  it("livre le fichier et journalise avec un jeton valide", async () => {
    const reponse = await GET(requete(nom, creerJetonExportDonnees("user-1")));

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(reponse.headers.get("Content-Disposition")).toContain(nom === "json" ? "mes-donnees.json" : ".pdf");
    expect(collecterMock).toHaveBeenCalledTimes(1);
    expect(journaliserMock).toHaveBeenCalledWith(expect.objectContaining({ action: "export_donnees_telecharge" }));
  });
});
