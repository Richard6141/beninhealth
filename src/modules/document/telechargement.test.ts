import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    patient: { findUnique: vi.fn() },
    documentMedical: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("@/modules/document/jetons-telechargement", () => ({
  creerJetonTelechargementDocument: vi.fn(() => "jeton-genere"),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { creerJetonTelechargementDocument } from "@/modules/document/jetons-telechargement";
import {
  genererLienTelechargementDocumentAction,
  type LienTelechargementDocumentActionState,
} from "@/modules/document/telechargement";

const p = prisma as unknown as {
  patient: { findUnique: Mock };
  documentMedical: { findUnique: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const creerJetonMock = creerJetonTelechargementDocument as unknown as Mock;

const etatInitial: LienTelechargementDocumentActionState = { error: null, url: null };

function formulaire(documentId: string): FormData {
  const donnees = new FormData();
  donnees.set("documentId", documentId);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  creerJetonMock.mockReturnValue("jeton-genere");
  getSessionMock.mockResolvedValue({ userId: "user-patient", roles: ["patient"] });
  p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-patient" });
  p.documentMedical.findUnique.mockResolvedValue({ id: "doc-1", patientId: "pat-1" });
});

describe("genererLienTelechargementDocumentAction (F-CIT-06, RG-CIT-50 : jeton genere APRES controle d'acces)", () => {
  it("refuse sans session, sans generer de jeton", async () => {
    getSessionMock.mockResolvedValue(null);

    const resultat = await genererLienTelechargementDocumentAction(etatInitial, formulaire("doc-1"));

    expect(resultat.url).toBeNull();
    expect(resultat.error).toBeTruthy();
    expect(creerJetonMock).not.toHaveBeenCalled();
  });

  it("refuse un documentId absent du formulaire", async () => {
    const resultat = await genererLienTelechargementDocumentAction(etatInitial, new FormData());

    expect(resultat.url).toBeNull();
    expect(creerJetonMock).not.toHaveBeenCalled();
  });

  it("refuse une session sans profil patient", async () => {
    p.patient.findUnique.mockResolvedValue(null);

    const resultat = await genererLienTelechargementDocumentAction(etatInitial, formulaire("doc-1"));

    expect(resultat.url).toBeNull();
    expect(creerJetonMock).not.toHaveBeenCalled();
  });

  it("refuse un document inexistant", async () => {
    p.documentMedical.findUnique.mockResolvedValue(null);

    const resultat = await genererLienTelechargementDocumentAction(etatInitial, formulaire("doc-inconnu"));

    expect(resultat.url).toBeNull();
    expect(creerJetonMock).not.toHaveBeenCalled();
  });

  it("refuse le document d'un autre patient (Zero Trust), meme connecte", async () => {
    p.documentMedical.findUnique.mockResolvedValue({ id: "doc-1", patientId: "pat-autre" });

    const resultat = await genererLienTelechargementDocumentAction(etatInitial, formulaire("doc-1"));

    expect(resultat.url).toBeNull();
    expect(resultat.error).toBe("Document introuvable.");
    expect(creerJetonMock).not.toHaveBeenCalled();
  });

  it("genere un jeton et l'URL de telechargement pour le proprietaire du document", async () => {
    const resultat = await genererLienTelechargementDocumentAction(etatInitial, formulaire("doc-1"));

    expect(resultat.error).toBeNull();
    expect(resultat.url).toBe("/api/documents/doc-1/telecharger?jeton=jeton-genere");
    expect(creerJetonMock).toHaveBeenCalledWith("doc-1");
  });
});
