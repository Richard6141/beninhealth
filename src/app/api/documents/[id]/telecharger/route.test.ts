import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { documentMedical: { findUnique: vi.fn() } },
}));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ genererUrlSigneeCloudinary: vi.fn(() => "https://cloudinary.test/signee") }));
vi.mock("@/modules/document/jetons-telechargement", () => ({
  consommerJetonTelechargementDocument: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { consommerJetonTelechargementDocument } from "@/modules/document/jetons-telechargement";
import { GET } from "./route";

const p = prisma as unknown as { documentMedical: { findUnique: Mock } };
const journaliserMock = journaliser as unknown as Mock;
const consommerJetonMock = consommerJetonTelechargementDocument as unknown as Mock;
const fetchMock = vi.fn();

const CONTENU = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function document(surcharge: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    patientId: "pat-1",
    patient: { id: "pat-1", userId: "user-patient" },
    titre: "Compte rendu",
    typeMime: "application/pdf",
    cheminFichier: "documents/uuid",
    nomFichierOriginal: "compte-rendu.pdf",
    tailleOctets: CONTENU.length,
    ...surcharge,
  };
}

async function appeler(id = "doc-1", jeton: string | null = "jeton-valide") {
  const url = jeton ? `http://localhost/api/documents/${id}/telecharger?jeton=${jeton}` : `http://localhost/api/documents/${id}/telecharger`;
  return GET(new Request(url), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(CONTENU, { status: 200 }));

  consommerJetonMock.mockReturnValue(true);
  p.documentMedical.findUnique.mockResolvedValue(document());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/documents/[id]/telecharger (F-CIT-06, RG-CIT-50)", () => {
  it("renvoie 410 sans jeton dans l'URL", async () => {
    const reponse = await appeler("doc-1", null);

    expect(reponse.status).toBe(410);
    expect(p.documentMedical.findUnique).not.toHaveBeenCalled();
  });

  it("CA-1 : renvoie 410 pour un jeton invalide, deja consomme ou expire, sans reveler lequel", async () => {
    consommerJetonMock.mockReturnValue(false);

    const reponse = await appeler();

    expect(reponse.status).toBe(410);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("verifie le jeton pour le bon documentId, pris depuis l'URL, jamais depuis le corps", async () => {
    await appeler("doc-42", "jeton-x");

    expect(consommerJetonMock).toHaveBeenCalledWith("doc-42", "jeton-x");
  });

  it("renvoie 404 si le document a disparu apres consommation du jeton", async () => {
    p.documentMedical.findUnique.mockResolvedValue(null);

    const reponse = await appeler();

    expect(reponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sert les octets du document avec un jeton valide", async () => {
    const reponse = await appeler();

    expect(reponse.status).toBe(200);
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(CONTENU);
    expect(reponse.headers.get("Content-Type")).toBe("application/pdf");
    expect(reponse.headers.get("Content-Disposition")).toBe('attachment; filename="compte-rendu.pdf"');
    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("annonce la longueur des octets reellement servis, meme si la taille enregistree differe", async () => {
    p.documentMedical.findUnique.mockResolvedValue(document({ tailleOctets: CONTENU.length + 5000 }));

    const reponse = await appeler();

    expect(reponse.headers.get("Content-Length")).toBe(String(CONTENU.length));
  });

  it("journalise le telechargement avec l'utilisateur proprietaire du document, jamais patientId brut", async () => {
    await appeler();

    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-patient",
      action: "telechargement_document_medical",
      donneeConcernee: "document_medical:doc-1",
    });
  });

  it("repond 404 sans journaliser quand le stockage est indisponible", async () => {
    fetchMock.mockResolvedValue(new Response("erreur", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const reponse = await appeler();

    expect(reponse.status).toBe(404);
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("repond 404 pour un type MIME stocke inconnu, sans appeler Cloudinary", async () => {
    p.documentMedical.findUnique.mockResolvedValue(document({ typeMime: "text/html" }));

    const reponse = await appeler();

    expect(reponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
