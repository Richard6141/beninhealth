import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { purgerMetadonneesImage, purgerMetadonneesJpeg, purgerMetadonneesPng } from "./purge-metadonnees";

// ---------------------------------------------------------------------------
// Construction de fichiers de test
// ---------------------------------------------------------------------------

function octetsTexte(texte: string): number[] {
  return [...Buffer.from(texte, "latin1")];
}

function contient(octets: Uint8Array, texte: string): boolean {
  return Buffer.from(octets).includes(Buffer.from(texte, "latin1"));
}

/** Segment JPEG : marqueur, longueur sur 2 octets (longueur incluse), donnees. */
function segment(marqueur: number, donnees: number[]): number[] {
  const longueur = donnees.length + 2;
  return [0xff, marqueur, longueur >> 8, longueur & 0xff, ...donnees];
}

const APP0_JFIF = segment(0xe0, [...octetsTexte("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const APP1_EXIF = segment(0xe1, [...octetsTexte("Exif\0\0"), ...octetsTexte("GPSLatitude=6.3654N;GPSLongitude=2.4183E")]);
const APP1_XMP = segment(0xe1, octetsTexte("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>Cotonou</x:xmpmeta>"));
const APP2_ICC = segment(0xe2, [...octetsTexte("ICC_PROFILE\0"), 1, 1, ...octetsTexte("profil-couleur")]);
const APP2_MPF = segment(0xe2, [...octetsTexte("MPF\0"), ...octetsTexte("index-seconde-image")]);
const APP13_IPTC = segment(0xed, octetsTexte("Photoshop 3.0\0auteur=Dr X"));
const APP14_ADOBE = segment(0xee, [...octetsTexte("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
const COM = segment(0xfe, octetsTexte("commentaire: patient Y, telephone"));
const DQT = segment(0xdb, [0x00, ...new Array<number>(64).fill(1)]);
const SOF0 = segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const DHT = segment(0xc4, [0x00, ...new Array<number>(16).fill(0), 0]);
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0]);
// Donnees compressees avec un octet de bourrage (FF 00) et un marqueur de
// reprise (FF D0), qui ne doivent jamais etre pris pour un marqueur de segment.
const DONNEES_BALAYAGE = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a];
const EOI = [0xff, 0xd9];

const JPEG_PROPRE = [0xff, 0xd8, ...APP0_JFIF, ...DQT, ...SOF0, ...DHT, ...SOS, ...DONNEES_BALAYAGE, ...EOI];

const JPEG_CHARGE = [
  0xff, 0xd8,
  ...APP0_JFIF,
  ...APP1_EXIF,
  ...APP1_XMP,
  ...APP2_ICC,
  ...APP2_MPF,
  ...APP13_IPTC,
  ...APP14_ADOBE,
  ...COM,
  ...DQT,
  ...SOF0,
  ...DHT,
  ...SOS,
  ...DONNEES_BALAYAGE,
  ...EOI,
  // Seconde image (fichier multi-image) avec son propre EXIF, apres EOI.
  0xff, 0xd8, ...APP1_EXIF, ...EOI,
];

// CRC-32 (polynome PNG), pour produire des PNG valides decodables par pdf-lib.
const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(octets: Uint8Array): number {
  let c = 0xffffffff;
  for (const octet of octets) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type: string, donnees: number[] | Uint8Array): number[] {
  const typeEtDonnees = new Uint8Array([...octetsTexte(type), ...donnees]);
  const tampon = Buffer.alloc(12 + donnees.length);
  tampon.writeUInt32BE(donnees.length, 0);
  tampon.set(typeEtDonnees, 4);
  tampon.writeUInt32BE(crc32(typeEtDonnees), 8 + donnees.length);
  return [...tampon];
}

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Image 1x1 RVB 8 bits, pixel rouge.
const IHDR = bloc("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const IDAT = bloc("IDAT", deflateSync(Buffer.from([0, 255, 0, 0])));
const IEND = bloc("IEND", []);
const PHYS = bloc("pHYs", [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]);

const PNG_CHARGE = [
  ...SIGNATURE_PNG,
  ...IHDR,
  ...bloc("tEXt", octetsTexte("Author\0Dr X")),
  ...bloc("eXIf", octetsTexte("MM\0*GPSLatitude=6.3654N")),
  ...bloc("iTXt", octetsTexte("XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta>Cotonou</x:xmpmeta>")),
  ...bloc("zTXt", [...octetsTexte("Comment\0"), 0, ...deflateSync(Buffer.from("telephone"))]),
  ...bloc("tIME", [0x07, 0xea, 9, 28, 12, 0, 0]),
  ...PHYS,
  ...IDAT,
  ...IEND,
  ...octetsTexte("donnees-cachees-apres-IEND"),
];

// ---------------------------------------------------------------------------
// JPEG
// ---------------------------------------------------------------------------

describe("purgerMetadonneesJpeg (RG-CLI-110)", () => {
  it("retire EXIF (dont GPS), XMP, IPTC, MPF, commentaires et tout ce qui suit EOI", () => {
    const resultat = purgerMetadonneesJpeg(new Uint8Array(JPEG_CHARGE));

    expect(resultat).not.toBeNull();
    const purge = resultat as Uint8Array;
    for (const trace of ["Exif", "GPSLatitude", "xmpmeta", "Photoshop", "MPF", "commentaire", "seconde"]) {
      expect(contient(purge, trace)).toBe(false);
    }
  });

  it("garde a l'identique, dans l'ordre, tout ce qui sert au decodage et au rendu", () => {
    const purge = purgerMetadonneesJpeg(new Uint8Array(JPEG_CHARGE));

    expect(Array.from(purge as Uint8Array)).toEqual([
      0xff, 0xd8,
      ...APP0_JFIF,
      ...APP2_ICC,
      ...APP14_ADOBE,
      ...DQT,
      ...SOF0,
      ...DHT,
      ...SOS,
      ...DONNEES_BALAYAGE,
      ...EOI,
    ]);
  });

  it("laisse inchange un JPEG sans metadonnees", () => {
    expect(Array.from(purgerMetadonneesJpeg(new Uint8Array(JPEG_PROPRE)) as Uint8Array)).toEqual(JPEG_PROPRE);
  });

  it("garde tous les balayages d'un JPEG progressif (tables entre deux balayages)", () => {
    const progressif = [
      0xff, 0xd8, ...APP0_JFIF, ...DQT, ...SOF0, ...DHT,
      ...SOS, 0x11, 0x22,
      ...DHT, ...COM,
      ...SOS, 0x33, 0x44,
      ...EOI,
    ];

    expect(Array.from(purgerMetadonneesJpeg(new Uint8Array(progressif)) as Uint8Array)).toEqual([
      0xff, 0xd8, ...APP0_JFIF, ...DQT, ...SOF0, ...DHT,
      ...SOS, 0x11, 0x22,
      ...DHT,
      ...SOS, 0x33, 0x44,
      ...EOI,
    ]);
  });

  it("tolere des octets de bourrage 0xFF avant un marqueur", () => {
    const avecBourrage = [0xff, 0xd8, 0xff, 0xff, ...APP1_EXIF, ...DQT, ...SOF0, ...SOS, 0x01, 0xff, 0xff, 0xd9];
    const purge = purgerMetadonneesJpeg(new Uint8Array(avecBourrage)) as Uint8Array;

    expect(purge).not.toBeNull();
    expect(contient(purge, "Exif")).toBe(false);
    expect(Array.from(purge.slice(-2))).toEqual(EOI);
  });

  it("reste decodable : pdf-lib lit les dimensions de l'image purgee", async () => {
    const pdf = await PDFDocument.create();
    const image = await pdf.embedJpg(purgerMetadonneesJpeg(new Uint8Array(JPEG_CHARGE)) as Uint8Array);

    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
  });

  it("refuse une structure incoherente plutot que de la laisser passer avec ses metadonnees", () => {
    // Segment qui deborde du fichier.
    expect(purgerMetadonneesJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x40, 0x00, 0x45, 0x78]))).toBeNull();
    // Aucun balayage d'image.
    expect(purgerMetadonneesJpeg(new Uint8Array([0xff, 0xd8, ...APP1_EXIF, ...EOI]))).toBeNull();
    // Longueur de segment invalide (< 2).
    expect(purgerMetadonneesJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x01, ...EOI]))).toBeNull();
    // Octet hors marqueur entre deux segments.
    expect(purgerMetadonneesJpeg(new Uint8Array([0xff, 0xd8, 0x00, ...EOI]))).toBeNull();
    // Pas un JPEG.
    expect(purgerMetadonneesJpeg(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
  });

  it("garde les pixels d'un JPEG tronque apres le balayage, sans aucune metadonnee", () => {
    const tronque = [0xff, 0xd8, ...APP1_EXIF, ...DQT, ...SOF0, ...SOS, 0x01, 0x02, 0x03];
    const purge = purgerMetadonneesJpeg(new Uint8Array(tronque)) as Uint8Array;

    expect(purge).not.toBeNull();
    expect(contient(purge, "GPSLatitude")).toBe(false);
    expect(Array.from(purge.slice(-3))).toEqual([0x01, 0x02, 0x03]);
  });
});

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

describe("purgerMetadonneesPng (RG-CLI-110)", () => {
  it("retire eXIf, tEXt, zTXt, iTXt (XMP), tIME et tout ce qui suit IEND", () => {
    const purge = purgerMetadonneesPng(new Uint8Array(PNG_CHARGE)) as Uint8Array;

    expect(purge).not.toBeNull();
    for (const trace of ["eXIf", "tEXt", "zTXt", "iTXt", "tIME", "GPSLatitude", "Author", "xmpmeta", "cachees"]) {
      expect(contient(purge, trace)).toBe(false);
    }
  });

  it("garde a l'identique les blocs de l'image et de rendu, CRC compris", () => {
    const purge = purgerMetadonneesPng(new Uint8Array(PNG_CHARGE));

    expect(Array.from(purge as Uint8Array)).toEqual([...SIGNATURE_PNG, ...IHDR, ...PHYS, ...IDAT, ...IEND]);
  });

  it("retire aussi un bloc auxiliaire inconnu (liste blanche, pas liste noire)", () => {
    const avecBlocPrive = [...SIGNATURE_PNG, ...IHDR, ...bloc("caBX", octetsTexte("credentials")), ...IDAT, ...IEND];
    const purge = purgerMetadonneesPng(new Uint8Array(avecBlocPrive)) as Uint8Array;

    expect(contient(purge, "caBX")).toBe(false);
  });

  it("reste decodable : pdf-lib decode l'image purgee", async () => {
    const pdf = await PDFDocument.create();
    const image = await pdf.embedPng(purgerMetadonneesPng(new Uint8Array(PNG_CHARGE)) as Uint8Array);

    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
  });

  it("refuse une structure incoherente", () => {
    // Sans IEND.
    expect(purgerMetadonneesPng(new Uint8Array([...SIGNATURE_PNG, ...IHDR, ...IDAT]))).toBeNull();
    // Bloc qui deborde du fichier.
    expect(purgerMetadonneesPng(new Uint8Array([...SIGNATURE_PNG, 0, 0, 0x10, 0, ...octetsTexte("IDAT"), 1, 2]))).toBeNull();
    // Type de bloc non alphabetique.
    expect(purgerMetadonneesPng(new Uint8Array([...SIGNATURE_PNG, 0, 0, 0, 0, 0x31, 0x32, 0x33, 0x34, 0, 0, 0, 0]))).toBeNull();
    // Pas un PNG.
    expect(purgerMetadonneesPng(new Uint8Array(JPEG_PROPRE))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Point d'entree
// ---------------------------------------------------------------------------

describe("purgerMetadonneesImage", () => {
  it("aiguille selon le type detecte par signature et laisse un PDF inchange", () => {
    const pdf = new Uint8Array(octetsTexte("%PDF-1.7\n/Author (Dr X)\n%%EOF"));

    expect(purgerMetadonneesImage(pdf, "application/pdf")).toBe(pdf);
    expect(contient(purgerMetadonneesImage(new Uint8Array(JPEG_CHARGE), "image/jpeg") as Uint8Array, "Exif")).toBe(false);
    expect(contient(purgerMetadonneesImage(new Uint8Array(PNG_CHARGE), "image/png") as Uint8Array, "eXIf")).toBe(false);
  });
});
