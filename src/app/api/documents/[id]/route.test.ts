import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    documentMedical: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
  };
  return { prisma };
});
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({ genererUrlSigneeCloudinary: vi.fn(() => "https://cloudinary.test/signee") }));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { GET } from "./route";

const p = prisma as unknown as {
  documentMedical: { findUnique: Mock };
  consentement: { findUnique: Mock };
  patient: { findUnique: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const fetchMock = vi.fn();

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const CONTENU = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);

function document(surcharge: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    patientId: "pat-1",
    auteurId: "user-auteur",
    titre: "Compte rendu",
    typeMime: "application/pdf",
    cheminFichier: "documents/uuid",
    nomFichierOriginal: "compte-rendu.pdf",
    tailleOctets: CONTENU.length,
    ...surcharge,
  };
}

function consentement(surcharge: Record<string, unknown> = {}) {
  return { statut: "actif", typeAcces: "documents", dateFin: null, ...surcharge };
}

async function appeler(id = "doc-1") {
  return GET(new Request("http://localhost/api/documents/" + id), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(new Response(CONTENU, { status: 200 }));

  getSessionMock.mockResolvedValue({ userId: "user-lecteur", roles: ["medecin"] });
  p.documentMedical.findUnique.mockResolvedValue(document());
  p.consentement.findUnique.mockResolvedValue(null);
  p.patient.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET /api/documents/[id]", () => {
  it("renvoie 401 sans session", async () => {
    getSessionMock.mockResolvedValue(null);

    const reponse = await appeler();

    expect(reponse.status).toBe(401);
    expect(p.documentMedical.findUnique).not.toHaveBeenCalled();
  });

  it("renvoie exactement la meme reponse 404 pour un document inexistant et pour un document interdit", async () => {
    p.documentMedical.findUnique.mockResolvedValue(null);
    const inexistant = await appeler("inconnu");

    p.documentMedical.findUnique.mockResolvedValue(document());
    const interdit = await appeler();

    expect(inexistant.status).toBe(404);
    expect(interdit.status).toBe(404);
    expect(await interdit.json()).toEqual(await inexistant.json());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("refuse un consentement revoque, expire, ou d'un autre type", async () => {
    const refuses = [
      consentement({ statut: "revoque" }),
      consentement({ dateFin: new Date(MAINTENANT.getTime() - 1000) }),
      consentement({ typeAcces: "consultations" }),
    ];

    for (const valeur of refuses) {
      p.consentement.findUnique.mockResolvedValue(valeur);
      expect((await appeler()).status).toBe(404);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuse un autre patient, meme connecte", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-autre-patient", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-autre", userId: "user-autre-patient" });

    expect((await appeler()).status).toBe(404);
  });

  it("sert le fichier a son auteur", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });

    const reponse = await appeler();

    expect(reponse.status).toBe(200);
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(CONTENU);
  });

  it("sert le fichier a un professionnel avec un consentement documents ou dossier_complet", async () => {
    for (const typeAcces of ["documents", "dossier_complet"]) {
      p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces }));
      fetchMock.mockResolvedValue(new Response(CONTENU, { status: 200 }));
      expect((await appeler()).status).toBe(200);
    }
  });

  it("refuse un document sensible a un consentement limite aux documents, meme valide", async () => {
    p.documentMedical.findUnique.mockResolvedValue(document({ niveauConfidentialite: "sensible" }));
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "documents" }));

    const reponse = await appeler();

    expect(reponse.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("sert un document sensible avec un consentement dossier_complet, a son auteur et au patient proprietaire", async () => {
    p.documentMedical.findUnique.mockResolvedValue(document({ niveauConfidentialite: "sensible" }));

    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "dossier_complet" }));
    expect((await appeler()).status).toBe(200);

    p.consentement.findUnique.mockResolvedValue(null);
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    fetchMock.mockResolvedValue(new Response(CONTENU, { status: 200 }));
    expect((await appeler()).status).toBe(200);

    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
    fetchMock.mockResolvedValue(new Response(CONTENU, { status: 200 }));
    expect((await appeler()).status).toBe(200);
  });

  it("sert le fichier au patient proprietaire, sans consentement", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });

    expect((await appeler()).status).toBe(200);
  });

  it("ne sert jamais depuis le cache et garde le type stocke, jamais celui de la requete", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });

    const reponse = await appeler();

    expect(reponse.headers.get("Cache-Control")).toBe("private, no-store");
    expect(reponse.headers.get("Content-Type")).toBe("application/pdf");
    expect(reponse.headers.get("Content-Length")).toBe(String(CONTENU.length));
    expect(reponse.headers.get("Content-Disposition")).toBe('attachment; filename="compte-rendu.pdf"');
  });

  it("annonce la longueur des octets reellement servis, meme si la taille enregistree differe (purge des metadonnees)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    p.documentMedical.findUnique.mockResolvedValue(document({ tailleOctets: CONTENU.length + 5000 }));

    const reponse = await appeler();

    expect(reponse.headers.get("Content-Length")).toBe(String(CONTENU.length));
    expect(new Uint8Array(await reponse.arrayBuffer())).toEqual(CONTENU);
  });

  it("assainit le nom de fichier dans Content-Disposition (guillemets et sauts de ligne)", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    p.documentMedical.findUnique.mockResolvedValue(document({ nomFichierOriginal: 'a"b\r\nSet-Cookie: x=1.pdf' }));

    const reponse = await appeler();
    const disposition = reponse.headers.get("Content-Disposition") ?? "";

    expect(disposition).not.toMatch(/[\r\n]/);
    expect(disposition.match(/"/g)).toHaveLength(2);
    expect(reponse.headers.get("Set-Cookie")).toBeNull();
  });

  it("utilise un nom par defaut quand le nom d'origine est vide apres nettoyage", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    p.documentMedical.findUnique.mockResolvedValue(document({ nomFichierOriginal: '""' }));

    expect((await appeler()).headers.get("Content-Disposition")).toBe('attachment; filename="document"');
  });

  it("journalise chaque telechargement effectif", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });

    await appeler();

    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-auteur",
      action: "consultation_document_medical",
      donneeConcernee: "document_medical:doc-1",
    });
  });

  it("repond 404 sans journaliser quand le stockage est indisponible, sans reveler l'erreur", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    fetchMock.mockResolvedValue(new Response("erreur interne", { status: 503 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const reponse = await appeler();

    expect(reponse.status).toBe(404);
    expect(JSON.stringify(await reponse.json())).not.toContain("503");
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("repond 404 pour un type MIME stocke inconnu", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-auteur", roles: ["medecin"] });
    p.documentMedical.findUnique.mockResolvedValue(document({ typeMime: "text/html" }));

    expect((await appeler()).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
