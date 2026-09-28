import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

process.env.NEXTAUTH_SECRET = "secret-de-test-32-caracteres-minimum-xxxx";

vi.mock("@/lib/prisma", () => {
  const prisma = {
    professionnelSante: { findUnique: vi.fn() },
    patient: { findUnique: vi.fn() },
    consentement: { findUnique: vi.fn() },
    consultation: { findUnique: vi.fn() },
    documentMedical: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

vi.mock("@/lib/session", () => ({ getSession: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/modules/audit/journaliser", () => ({ journaliser: vi.fn() }));
vi.mock("@/lib/cloudinary", () => ({
  televerserFichierPriveCloudinary: vi.fn(),
  supprimerFichierPriveCloudinary: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { journaliser } from "@/modules/audit/journaliser";
import { supprimerFichierPriveCloudinary, televerserFichierPriveCloudinary } from "@/lib/cloudinary";
import {
  ajouterDocumentAction,
  getDocumentsDuPatient,
  getMesDocuments,
  retirerDocumentAction,
} from "@/modules/document/actions";
import { TAILLE_MAX_DOCUMENT_OCTETS } from "@/modules/document/stockage-fichiers";

const p = prisma as unknown as {
  professionnelSante: { findUnique: Mock };
  patient: { findUnique: Mock };
  consentement: { findUnique: Mock };
  consultation: { findUnique: Mock };
  documentMedical: { create: Mock; findUnique: Mock; findMany: Mock; update: Mock; delete: Mock };
};
const getSessionMock = getSession as unknown as Mock;
const journaliserMock = journaliser as unknown as Mock;
const televerserMock = televerserFichierPriveCloudinary as unknown as Mock;
const supprimerMock = supprimerFichierPriveCloudinary as unknown as Mock;

const MAINTENANT = new Date("2026-09-26T12:00:00.000Z");
const etatInitial = { error: null, success: false };
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const EXECUTABLE = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];

/** Segment JPEG (marqueur + longueur sur 2 octets + donnees). */
function segment(marqueur: number, donnees: number[]): number[] {
  const longueur = donnees.length + 2;
  return [0xff, marqueur, longueur >> 8, longueur & 0xff, ...donnees];
}

/** JPEG minimal portant un bloc EXIF avec une "localisation" reperable. */
const JPEG_AVEC_EXIF = [
  0xff, 0xd8,
  ...segment(0xe0, [...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...segment(0xe1, [...Buffer.from("Exif\0\0"), ...Buffer.from("GPS-Cotonou-6.36N-2.43E")]),
  ...segment(0xdb, [0x00, ...new Array(64).fill(1)]),
  ...segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]),
  ...segment(0xda, [1, 1, 0, 0, 63, 0]),
  0x12, 0x34, 0xff, 0x00, 0x56,
  0xff, 0xd9,
];

function fichier(octets: number[], nom = "compte-rendu.pdf", type = "application/pdf"): File {
  return new File([new Uint8Array(octets)], nom, { type });
}

function ajout(fichierEnvoye: File | null = fichier(PDF), surcharge: Record<string, string> = {}): FormData {
  const donnees = new FormData();
  const champs: Record<string, string> = {
    patientId: "pat-1",
    type: "compte_rendu",
    titre: "Compte rendu de consultation",
    dateDocument: "2026-09-20",
    niveauConfidentialite: "normal",
    ...surcharge,
  };
  for (const [cle, valeur] of Object.entries(champs)) donnees.set(cle, valeur);
  if (fichierEnvoye) donnees.set("fichier", fichierEnvoye);
  return donnees;
}

function consentement(surcharge: Record<string, unknown> = {}) {
  return { statut: "actif", typeAcces: "documents", dateFin: null, ...surcharge };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(MAINTENANT);
  getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
  p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-med", etablissementId: "etab-1" });
  p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
  p.consentement.findUnique.mockResolvedValue(consentement());
  televerserMock.mockResolvedValue({ publicId: "documents/uuid-genere" });
  supprimerMock.mockResolvedValue(undefined);
  p.documentMedical.create.mockResolvedValue({ id: "doc-1" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ajouterDocumentAction (F-CLI-13)", () => {
  it("refuse un role qui ne peut pas creer de document (laboratoire, pharmacien)", async () => {
    for (const role of ["laboratoire", "pharmacien"]) {
      getSessionMock.mockResolvedValue({ userId: "user-autre", roles: [role] });

      const resultat = await ajouterDocumentAction(etatInitial, ajout());

      expect(resultat.success).toBe(false);
      expect(resultat.error).toBe("Action reservee aux medecins et aux infirmiers.");
    }
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("accepte un infirmier sous consentement actif, avec le meme controle que le medecin", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-inf", roles: ["infirmier"] });
    p.professionnelSante.findUnique.mockResolvedValue({ id: "pro-inf", etablissementId: "etab-1" });

    expect((await ajouterDocumentAction(etatInitial, ajout())).success).toBe(true);
    const { data } = p.documentMedical.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data.auteurId).toBe("user-inf");
    expect(p.consentement.findUnique).toHaveBeenCalledWith({
      where: { patientId_acteurAutoriseId: { patientId: "pat-1", acteurAutoriseId: "user-inf" } },
    });

    p.consentement.findUnique.mockResolvedValue(null);
    expect((await ajouterDocumentAction(etatInitial, ajout())).error).toContain("Aucun consentement actif");
  });

  it("purge les metadonnees EXIF d'un JPEG avant l'envoi au stockage et enregistre la taille reellement stockee", async () => {
    const recu = fichier(JPEG_AVEC_EXIF, "photo.jpg", "image/jpeg");

    expect((await ajouterDocumentAction(etatInitial, ajout(recu))).success).toBe(true);

    const envoye = televerserMock.mock.calls[0][0] as Buffer;
    expect(envoye.includes(Buffer.from("Exif"))).toBe(false);
    expect(envoye.includes(Buffer.from("GPS-Cotonou"))).toBe(false);
    expect(envoye.length).toBeLessThan(JPEG_AVEC_EXIF.length);
    const { data } = p.documentMedical.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({ typeMime: "image/jpeg", tailleOctets: envoye.length });
  });

  it("refuse une image a la structure incoherente plutot que de la stocker avec ses metadonnees", async () => {
    const tronque = fichier(JPEG_AVEC_EXIF.slice(0, 12), "photo.jpg", "image/jpeg");

    const resultat = await ajouterDocumentAction(etatInitial, ajout(tronque));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("illisible");
    expect(televerserMock).not.toHaveBeenCalled();
    expect(p.documentMedical.create).not.toHaveBeenCalled();
  });

  it("refuse l'absence de fichier et un fichier vide", async () => {
    expect((await ajouterDocumentAction(etatInitial, ajout(null))).error).toContain("selectionner un fichier");
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier([])))).error).toContain("selectionner un fichier");
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("refuse un fichier de plus de 4 Mo (limite reellement acceptee par la plateforme)", async () => {
    const gros = fichier(PDF);
    Object.defineProperty(gros, "size", { value: TAILLE_MAX_DOCUMENT_OCTETS + 1 });

    const resultat = await ajouterDocumentAction(etatInitial, ajout(gros));

    expect(resultat.error).toContain("4 Mo");
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("refuse un executable deguise en PDF (verifie par le contenu, pas par le nom ni le type declare)", async () => {
    const resultat = await ajouterDocumentAction(etatInitial, ajout(fichier(EXECUTABLE, "ordonnance.pdf", "application/pdf")));

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Format de fichier non pris en charge");
    expect(televerserMock).not.toHaveBeenCalled();
    expect(p.documentMedical.create).not.toHaveBeenCalled();
  });

  it("refuse une date invalide et un type ou un niveau inconnus", async () => {
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier(PDF), { dateDocument: "pas-une-date" }))).success).toBe(false);
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier(PDF), { type: "virus" }))).success).toBe(false);
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier(PDF), { niveauConfidentialite: "secret" }))).success).toBe(false);
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("refuse sans consentement, avec un consentement revoque, expire ou d'un autre type", async () => {
    const cas = [
      null,
      consentement({ statut: "revoque" }),
      consentement({ dateFin: new Date(MAINTENANT.getTime() - 1000) }),
      consentement({ typeAcces: "consultations" }),
    ];

    for (const valeur of cas) {
      p.consentement.findUnique.mockResolvedValue(valeur);
      const resultat = await ajouterDocumentAction(etatInitial, ajout());
      expect(resultat.success).toBe(false);
      expect(resultat.error).toContain("Aucun consentement actif");
    }
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("accepte un consentement dossier_complet ou un consentement documents sans date de fin", async () => {
    for (const typeAcces of ["documents", "dossier_complet"]) {
      p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces }));
      expect((await ajouterDocumentAction(etatInitial, ajout())).success).toBe(true);
    }
  });

  it("refuse une consultation d'un autre medecin ou d'un autre patient", async () => {
    p.consultation.findUnique.mockResolvedValue({ id: "cons-1", patientId: "pat-1", professionnelId: "pro-autre" });
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier(PDF), { consultationId: "cons-1" }))).error).toContain("introuvable");

    p.consultation.findUnique.mockResolvedValue({ id: "cons-1", patientId: "pat-autre", professionnelId: "pro-med" });
    expect((await ajouterDocumentAction(etatInitial, ajout(fichier(PDF), { consultationId: "cons-1" }))).error).toContain("introuvable");
    expect(televerserMock).not.toHaveBeenCalled();
  });

  it("stocke le fichier en prive sous un identifiant aleatoire et le type reel, journalise l'ajout", async () => {
    const resultat = await ajouterDocumentAction(etatInitial, ajout(fichier(PDF, "../../etc/passwd.png", "image/png")));

    expect(resultat).toEqual({ error: null, success: true });

    const options = televerserMock.mock.calls[0][1] as { dossierComplement: string; identifiantPublic: string };
    expect(options.dossierComplement).toBe("documents");
    expect(options.identifiantPublic).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.identifiantPublic).not.toContain("passwd");

    const { data } = p.documentMedical.create.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(data).toMatchObject({
      patientId: "pat-1",
      auteurId: "user-med",
      cheminFichier: "documents/uuid-genere",
      typeMime: "application/pdf",
      niveauConfidentialite: "normal",
    });
    expect(data.nomFichierOriginal).toBe("../../etc/passwd.png");
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ utilisateurId: "user-med", action: "ajout_document_medical" });
  });

  it("supprime le fichier deja televerse si l'ecriture en base echoue (aucun fichier orphelin)", async () => {
    p.documentMedical.create.mockRejectedValue(new Error("base indisponible"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const resultat = await ajouterDocumentAction(etatInitial, ajout());

    expect(resultat.success).toBe(false);
    expect(resultat.error).toContain("Une erreur est survenue");
    expect(supprimerMock).toHaveBeenCalledWith("documents/uuid-genere");
  });
});

describe("retirerDocumentAction (RG-CLI-113)", () => {
  function retrait(motif = "Ajoute par erreur au mauvais dossier"): FormData {
    const donnees = new FormData();
    donnees.set("documentId", "doc-1");
    donnees.set("motif", motif);
    return donnees;
  }

  it("refuse un motif trop court", async () => {
    const resultat = await retirerDocumentAction(etatInitial, retrait("erreur"));

    expect(resultat.success).toBe(false);
    expect(p.documentMedical.update).not.toHaveBeenCalled();
  });

  it("refuse a quelqu'un qui n'est pas l'auteur, comme pour un document inconnu", async () => {
    p.documentMedical.findUnique.mockResolvedValue({ id: "doc-1", auteurId: "user-autre", retirePourErreur: false });

    const resultat = await retirerDocumentAction(etatInitial, retrait());

    expect(resultat).toEqual({ error: "Ce document est introuvable.", success: false });
    expect(p.documentMedical.update).not.toHaveBeenCalled();
  });

  it("refuse un document deja retire", async () => {
    p.documentMedical.findUnique.mockResolvedValue({ id: "doc-1", auteurId: "user-med", retirePourErreur: true });

    const resultat = await retirerDocumentAction(etatInitial, retrait());

    expect(resultat.error).toContain("deja ete retire");
  });

  it("marque le document retire avec son motif sans jamais le supprimer, et journalise", async () => {
    p.documentMedical.findUnique.mockResolvedValue({ id: "doc-1", auteurId: "user-med", retirePourErreur: false });
    p.documentMedical.update.mockResolvedValue({});

    const resultat = await retirerDocumentAction(etatInitial, retrait());

    expect(resultat).toEqual({ error: null, success: true });
    expect(p.documentMedical.update).toHaveBeenCalledWith({
      where: { id: "doc-1" },
      data: { retirePourErreur: true, motifRetrait: "Ajoute par erreur au mauvais dossier" },
    });
    expect(p.documentMedical.delete).not.toHaveBeenCalled();
    expect(supprimerMock).not.toHaveBeenCalled();
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({ action: "retrait_document_medical" });
  });
});

describe("getDocumentsDuPatient", () => {
  function documentEnBase(surcharge: Record<string, unknown> = {}) {
    return {
      id: "doc-1",
      type: "resultat",
      titre: "Analyse",
      dateDocument: MAINTENANT,
      niveauConfidentialite: "normal",
      consultationId: null,
      nomFichierOriginal: "analyse.pdf",
      typeMime: "application/pdf",
      tailleOctets: 1234,
      auteur: { nom: "Ahouansou", prenom: "Julien" },
      auteurId: "user-autre",
      dateCreation: MAINTENANT,
      retirePourErreur: false,
      motifRetrait: null,
      cheminFichier: "documents/secret-interne",
      ...surcharge,
    };
  }

  it("renvoie null sans consentement valable, sans lire ni journaliser quoi que ce soit", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "consultations" }));

    expect(await getDocumentsDuPatient("pat-1")).toBeNull();
    expect(p.documentMedical.findMany).not.toHaveBeenCalled();
    expect(journaliserMock).not.toHaveBeenCalled();
  });

  it("renvoie null pour un compte sans fiche professionnelle", async () => {
    p.professionnelSante.findUnique.mockResolvedValue(null);

    expect(await getDocumentsDuPatient("pat-1")).toBeNull();
  });

  it("liste les documents, jamais le chemin interne du fichier, indique l'auteur et journalise la consultation", async () => {
    p.documentMedical.findMany.mockResolvedValue([documentEnBase(), documentEnBase({ id: "doc-2", auteurId: "user-med" })]);

    const liste = await getDocumentsDuPatient("pat-1");

    expect(liste).toHaveLength(2);
    expect(JSON.stringify(liste)).not.toContain("secret-interne");
    expect(liste?.[0]).not.toHaveProperty("cheminFichier");
    expect(liste?.map((document) => document.estAuteur)).toEqual([false, true]);
    expect(journaliserMock.mock.calls[0][0]).toMatchObject({
      utilisateurId: "user-med",
      action: "consultation_liste_documents_medicaux",
      donneeConcernee: "patient:pat-1",
    });
  });

  it("n'attribue le titre Dr. qu'a un auteur medecin, jamais a un infirmier", async () => {
    p.documentMedical.findMany.mockResolvedValue([
      documentEnBase({ id: "d-med", auteurId: "user-med", auteur: { nom: "Ahouansou", prenom: "Julien", roles: [{ nom: "medecin" }] } }),
      documentEnBase({ id: "d-inf", auteurId: "user-inf", auteur: { nom: "Dossou", prenom: "Afi", roles: [{ nom: "infirmier" }] } }),
    ]);

    const liste = await getDocumentsDuPatient("pat-1");

    expect(liste?.map((document) => document.auteurNomComplet)).toEqual(["Dr. Julien Ahouansou", "Afi Dossou"]);
    expect(p.documentMedical.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ include: { auteur: { include: { roles: true } } } })
    );
  });
});

describe("getDocumentsDuPatient, confidentialite sensible (F-CLI-13)", () => {
  function documentSensible(id: string, auteurId: string) {
    return {
      id,
      type: "resultat",
      titre: "Resultat sensible",
      dateDocument: MAINTENANT,
      niveauConfidentialite: "sensible",
      consultationId: null,
      nomFichierOriginal: "r.pdf",
      typeMime: "application/pdf",
      tailleOctets: 10,
      auteur: { nom: "Ahouansou", prenom: "Julien" },
      auteurId,
      dateCreation: MAINTENANT,
      retirePourErreur: false,
      motifRetrait: null,
      cheminFichier: "documents/interne",
    };
  }

  it("un consentement limite aux documents ne liste pas les documents sensibles des autres auteurs", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "documents" }));
    p.documentMedical.findMany.mockResolvedValue([documentSensible("doc-sensible", "user-autre")]);

    expect(await getDocumentsDuPatient("pat-1")).toEqual([]);
  });

  it("un consentement dossier_complet liste aussi les documents sensibles", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "dossier_complet" }));
    p.documentMedical.findMany.mockResolvedValue([documentSensible("doc-sensible", "user-autre")]);

    expect((await getDocumentsDuPatient("pat-1"))?.map((document) => document.id)).toEqual(["doc-sensible"]);
  });

  it("l'auteur retrouve son propre document sensible meme avec un consentement limite aux documents", async () => {
    p.consentement.findUnique.mockResolvedValue(consentement({ typeAcces: "documents" }));
    p.documentMedical.findMany.mockResolvedValue([
      documentSensible("mien", "user-med"),
      documentSensible("autre", "user-autre"),
    ]);

    expect((await getDocumentsDuPatient("pat-1"))?.map((document) => document.id)).toEqual(["mien"]);
  });
});

describe("getMesDocuments", () => {
  it("ne lit que les documents du patient connecte et ne le designe jamais comme auteur", async () => {
    getSessionMock.mockResolvedValue({ userId: "user-pat", roles: ["patient"] });
    p.patient.findUnique.mockResolvedValue({ id: "pat-1", userId: "user-pat" });
    p.documentMedical.findMany.mockResolvedValue([
      {
        id: "doc-1",
        type: "resultat",
        titre: "Analyse",
        dateDocument: MAINTENANT,
        niveauConfidentialite: "normal",
        consultationId: null,
        nomFichierOriginal: "analyse.pdf",
        typeMime: "application/pdf",
        tailleOctets: 10,
        auteur: { nom: "Ahouansou", prenom: "Julien" },
        auteurId: "user-pat",
        dateCreation: MAINTENANT,
        retirePourErreur: false,
        motifRetrait: null,
        cheminFichier: "documents/secret-interne",
      },
    ]);

    const liste = await getMesDocuments();

    expect((p.documentMedical.findMany.mock.calls[0][0] as { where: unknown }).where).toEqual({ patientId: "pat-1" });
    expect(liste[0].estAuteur).toBe(false);
    expect(JSON.stringify(liste)).not.toContain("secret-interne");
  });

  it("renvoie une liste vide sans session ou sans dossier patient", async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getMesDocuments()).toEqual([]);

    getSessionMock.mockResolvedValue({ userId: "user-med", roles: ["medecin"] });
    p.patient.findUnique.mockResolvedValue(null);
    expect(await getMesDocuments()).toEqual([]);
    expect(p.documentMedical.findMany).not.toHaveBeenCalled();
  });
});
