/**
 * Stockage prive des documents medicaux et verification du type reel d'un
 * fichier par signature binaire (RG-CLI-110 du pack) : jamais l'extension du
 * nom de fichier, jamais le type MIME declare par le navigateur. Fichier
 * separe de src/modules/document/actions.ts ("use server", qui ne peut donc
 * pas exporter ces constantes/fonctions synchrones vers un consommateur
 * externe) et de la route src/app/api/documents/[id]/route.ts, partage entre
 * les deux : ecriture a l'ajout du document, lecture au telechargement.
 *
 * RG-CLI-112 : repertoire hors de public/, jamais servi par une URL statique.
 */

import path from "node:path";

/** Repertoire prive des documents medicaux, hors de public/ (RG-CLI-112). */
export const DOSSIER_DOCUMENTS = path.join(process.cwd(), "private-uploads", "documents");

/** Taille maximale d'un document medical, en octets (RG-CLI-110 : 10 Mo). */
export const TAILLE_MAX_DOCUMENT_OCTETS = 10 * 1024 * 1024;

export interface SignatureFichierDetectee {
  typeMime: string;
  extension: string;
}

/**
 * Signatures binaires (magic bytes) des trois seuls formats acceptes
 * (RG-CLI-110). L'ordre n'a pas d'importance : les trois signatures sont
 * mutuellement exclusives sur leurs premiers octets.
 */
const SIGNATURES_CONNUES: { octets: number[]; typeMime: string; extension: string }[] = [
  { octets: [0x25, 0x50, 0x44, 0x46], typeMime: "application/pdf", extension: "pdf" },
  { octets: [0xff, 0xd8, 0xff], typeMime: "image/jpeg", extension: "jpg" },
  { octets: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], typeMime: "image/png", extension: "png" },
];

/**
 * Determine le type reel d'un fichier a partir de ses tout premiers octets,
 * independamment de son extension ou de son type MIME declare par le
 * navigateur. Retourne null si le contenu ne correspond a aucun des trois
 * formats acceptes (PDF, JPEG, PNG) : ce cas doit toujours mener a un refus,
 * jamais a un enregistrement "au mieux".
 */
export async function detecterTypeReelFichier(fichier: File | Blob): Promise<SignatureFichierDetectee | null> {
  const enTete = new Uint8Array(await fichier.slice(0, 8).arrayBuffer());

  for (const signature of SIGNATURES_CONNUES) {
    const correspond = signature.octets.every((octet, index) => enTete[index] === octet);
    if (correspond) {
      return { typeMime: signature.typeMime, extension: signature.extension };
    }
  }

  return null;
}

/**
 * Chemin absolu d'un document sur disque a partir de son seul nom de fichier
 * stocke en base (cheminFichier, deja un identifiant aleatoire genere
 * serveur - jamais construit a partir d'une entree utilisateur non
 * verifiee).
 */
export function cheminAbsoluDocument(nomFichier: string): string {
  return path.join(DOSSIER_DOCUMENTS, nomFichier);
}
