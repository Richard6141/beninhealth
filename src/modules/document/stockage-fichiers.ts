/**
 * Verification du type reel d'un fichier par signature binaire (RG-CLI-110
 * du pack) : jamais l'extension du nom de fichier, jamais le type MIME
 * declare par le navigateur. Fichier separe de src/modules/document/actions.ts
 * ("use server", qui ne peut donc pas exporter ces constantes/fonctions
 * synchrones vers un consommateur externe).
 *
 * Le stockage du fichier lui-meme se fait sur Cloudinary en prive (voir
 * src/lib/cloudinary.ts, RG-CLI-112 : jamais servi par une URL statique),
 * pas ici : ce fichier ne s'occupe plus que de la detection de type.
 */

/**
 * Taille maximale d'un document medical, en octets : 4 Mo (4 000 000 octets).
 *
 * RG-CLI-110 fixe un plafond de 10 Mo ; 4 Mo reste sous ce plafond et
 * correspond a ce que la plateforme accepte reellement. Le fichier transite
 * par une Server Action, dont le corps est limite par
 * experimental.serverActions.bodySizeLimit ("4mb", soit 4 194 304 octets,
 * next.config.ts) : 4 000 000 octets laissent environ 190 Ko pour
 * l'enveloppe multipart et les autres champs du formulaire. Au-dela, Next.js
 * rejette la requete avant meme que ajouterDocumentAction ne s'execute.
 *
 * Passer a 10 Mo demanderait de relever deux reglages globaux (et non propres
 * aux documents) : bodySizeLimit pour TOUTES les Server Actions, et
 * experimental.proxyClientMaxBodySize, car le formulaire est poste sous
 * /app/*, route couverte par proxy.ts, qui tamponne le corps a 10 Mo par
 * defaut et le TRONQUE silencieusement au-dela (documentation Next.js 16).
 * Plus la limite de taille de fichier du forfait Cloudinary, non verifiable
 * depuis le depot. Choix le moins risque retenu : annoncer et appliquer 4 Mo.
 */
export const TAILLE_MAX_DOCUMENT_OCTETS = 4_000_000;

/** Libelle affiche a l'utilisateur, toujours coherent avec TAILLE_MAX_DOCUMENT_OCTETS. */
export const LIBELLE_TAILLE_MAX_DOCUMENT = "4 Mo";

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
 * Retrouve l'extension Cloudinary a partir du type MIME stocke en base
 * (DocumentMedical.typeMime, toujours issu de detecterTypeReelFichier a la
 * creation). Necessaire pour genererUrlSigneeCloudinary : Cloudinary exige le
 * format explicite pour signer une URL de telechargement d'une ressource
 * "authenticated" (src/lib/cloudinary.ts).
 */
export function extensionDepuisTypeMime(typeMime: string): string | null {
  const signature = SIGNATURES_CONNUES.find((candidat) => candidat.typeMime === typeMime);
  return signature ? signature.extension : null;
}
