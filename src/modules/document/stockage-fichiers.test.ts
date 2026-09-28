import { describe, expect, it } from "vitest";
import {
  LIBELLE_TAILLE_MAX_DOCUMENT,
  TAILLE_MAX_DOCUMENT_OCTETS,
  detecterTypeReelFichier,
  extensionDepuisTypeMime,
} from "./stockage-fichiers";

function fichier(octets: number[], nom: string, typeDeclare: string): File {
  return new File([new Uint8Array(octets)], nom, { type: typeDeclare });
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EXECUTABLE_WINDOWS = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];
const TEXTE = [...Buffer.from("bonjour, ceci est du texte")];

describe("detecterTypeReelFichier (RG-CLI-110)", () => {
  it("reconnait un PDF, un JPEG et un PNG par leur contenu", async () => {
    expect(await detecterTypeReelFichier(fichier(PDF, "a.pdf", "application/pdf"))).toEqual({
      typeMime: "application/pdf",
      extension: "pdf",
    });
    expect(await detecterTypeReelFichier(fichier(JPEG, "a.jpg", "image/jpeg"))).toEqual({
      typeMime: "image/jpeg",
      extension: "jpg",
    });
    expect(await detecterTypeReelFichier(fichier(PNG, "a.png", "image/png"))).toEqual({
      typeMime: "image/png",
      extension: "png",
    });
  });

  it("ignore le nom et le type declare : un PDF renomme en image reste un PDF", async () => {
    const resultat = await detecterTypeReelFichier(fichier(PDF, "photo.png", "image/png"));

    expect(resultat?.typeMime).toBe("application/pdf");
  });

  it("refuse un executable deguise en PDF, quel que soit son nom ou son type declare", async () => {
    expect(await detecterTypeReelFichier(fichier(EXECUTABLE_WINDOWS, "ordonnance.pdf", "application/pdf"))).toBeNull();
  });

  it("refuse du texte, un fichier vide et un fichier trop court", async () => {
    expect(await detecterTypeReelFichier(fichier(TEXTE, "note.pdf", "application/pdf"))).toBeNull();
    expect(await detecterTypeReelFichier(fichier([], "vide.pdf", "application/pdf"))).toBeNull();
    expect(await detecterTypeReelFichier(fichier([0x25, 0x50], "court.pdf", "application/pdf"))).toBeNull();
  });

  it("refuse un PNG dont la signature est tronquee", async () => {
    expect(await detecterTypeReelFichier(fichier(PNG.slice(0, 5), "a.png", "image/png"))).toBeNull();
  });
});

describe("extensionDepuisTypeMime", () => {
  it("renvoie l'extension des trois formats acceptes et rien d'autre", () => {
    expect(extensionDepuisTypeMime("application/pdf")).toBe("pdf");
    expect(extensionDepuisTypeMime("image/jpeg")).toBe("jpg");
    expect(extensionDepuisTypeMime("image/png")).toBe("png");
    expect(extensionDepuisTypeMime("text/html")).toBeNull();
    expect(extensionDepuisTypeMime("")).toBeNull();
  });
});

describe("taille maximale", () => {
  it("est de 4 Mo, sous le plafond de 10 Mo du pack (RG-CLI-110)", () => {
    expect(TAILLE_MAX_DOCUMENT_OCTETS).toBe(4_000_000);
    expect(TAILLE_MAX_DOCUMENT_OCTETS).toBeLessThanOrEqual(10 * 1024 * 1024);
    expect(LIBELLE_TAILLE_MAX_DOCUMENT).toBe("4 Mo");
  });

  it("tient sous bodySizeLimit (4mb) de next.config.ts avec une marge pour l'enveloppe multipart", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const config = await readFile(resolve(__dirname, "../../../next.config.ts"), "utf8");
    const limite = /bodySizeLimit:\s*"(\d+)mb"/.exec(config);

    expect(limite).not.toBeNull();
    const limiteOctets = Number(limite?.[1]) * 1024 * 1024;
    // Au moins 64 Ko pour les limites multipart, les en-tetes et les autres champs.
    expect(limiteOctets - TAILLE_MAX_DOCUMENT_OCTETS).toBeGreaterThanOrEqual(64 * 1024);
  });
});
