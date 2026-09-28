/**
 * Purge des metadonnees d'une image avant stockage (RG-CLI-110 du pack : "les
 * metadonnees des images (dont la localisation) DOIVENT etre supprimees").
 *
 * Aucune librairie de traitement d'image n'est une dependance de ce depot
 * (ni sharp ni equivalent dans package.json) : la purge est faite ici
 * directement sur la structure binaire des deux formats d'image acceptes,
 * sans decoder ni reencoder les pixels (aucune perte de qualite, aucune
 * dependance ajoutee). Fichier pur, sans "use server", teste isolement
 * (purge-metadonnees.test.ts).
 *
 * Methode :
 * - JPEG : parcours des segments jusqu'a la fin de l'image (EOI). Sont
 *   conserves uniquement les segments necessaires au decodage et au rendu
 *   (tables, trames, balayages, APP0 JFIF, APP2 "ICC_PROFILE", APP14 Adobe).
 *   Sont retires : APP1 (EXIF, dont la localisation GPS, et XMP), tous les
 *   autres APPn (dont APP13 IPTC/Photoshop et APP2 MPF), les commentaires
 *   (COM), et toute donnee placee apres EOI (seconde image d'un fichier
 *   multi-image, video d'une "photo animee", chacune pouvant porter son
 *   propre bloc EXIF).
 * - PNG : liste blanche de blocs (chunks). Sont conserves les blocs critiques
 *   et les blocs auxiliaires de rendu (transparence, gamma, couleur,
 *   resolution, animation APNG). Sont retires tous les autres, dont eXIf,
 *   tEXt, zTXt, iTXt (XMP inclus) et tIME, ainsi que toute donnee apres IEND.
 *   Les blocs gardes sont recopies tels quels : leur CRC reste valide.
 *
 * Limites assumees :
 * - L'orientation EXIF est perdue avec le reste du bloc EXIF : une photo
 *   prise en mode portrait par un telephone qui ne pivote pas les pixels
 *   lui-meme peut s'afficher couchee. Le contenu medical reste intact.
 * - Les PDF ne sont pas traites (la regle vise les images) : leurs
 *   metadonnees de document (auteur, logiciel, XMP) restent en l'etat.
 * - Une image dont la structure est incoherente (segment ou bloc qui deborde
 *   du fichier, JPEG sans aucun balayage, PNG sans IEND) est refusee (null)
 *   plutot que stockee avec ses metadonnees.
 *
 * Seconde barriere independante : le televersement Cloudinary applique aussi
 * flags: "force_strip" (src/lib/cloudinary.ts). Cette purge applicative garde
 * sa raison d'etre : les metadonnees ne quittent plus le serveur de la
 * plateforme, et la regle ne depend plus d'un reglage d'un prestataire.
 */

const JPEG_EOI = 0xd9;
const JPEG_SOS = 0xda;
const JPEG_APP0 = 0xe0;
const JPEG_APP2 = 0xe2;
const JPEG_APP14 = 0xee;
const JPEG_COM = 0xfe;

const IDENTIFIANT_ICC = "ICC_PROFILE\0";

const SIGNATURE_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Blocs PNG conserves. Les quatre blocs critiques, puis les blocs auxiliaires
 * qui influent sur le rendu. Tout autre bloc auxiliaire est retire.
 */
const BLOCS_PNG_CONSERVES: ReadonlySet<string> = new Set([
  "IHDR",
  "PLTE",
  "IDAT",
  "IEND",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "cICP",
  "mDCv",
  "cLLi",
  "sBIT",
  "bKGD",
  "hIST",
  "pHYs",
  "sPLT",
  "acTL",
  "fcTL",
  "fdAT",
]);

function concatener(morceaux: Uint8Array[]): Uint8Array {
  const total = morceaux.reduce((somme, morceau) => somme + morceau.length, 0);
  const resultat = new Uint8Array(total);
  let position = 0;
  for (const morceau of morceaux) {
    resultat.set(morceau, position);
    position += morceau.length;
  }
  return resultat;
}

function commencePar(octets: Uint8Array, debut: number, fin: number, texte: string): boolean {
  if (fin - debut < texte.length) {
    return false;
  }
  for (let index = 0; index < texte.length; index++) {
    if (octets[debut + index] !== texte.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

/** Vrai si un segment JPEG (hors marqueurs sans longueur) doit etre recopie. */
function segmentJpegAConserver(marqueur: number, octets: Uint8Array, debutDonnees: number, fin: number): boolean {
  if (marqueur === JPEG_COM) {
    return false;
  }
  if (marqueur >= 0xe0 && marqueur <= 0xef) {
    if (marqueur === JPEG_APP0 || marqueur === JPEG_APP14) {
      return true;
    }
    if (marqueur === JPEG_APP2) {
      return commencePar(octets, debutDonnees, fin, IDENTIFIANT_ICC);
    }
    return false;
  }
  return true;
}

/**
 * Retire les metadonnees d'un JPEG (voir l'en-tete du fichier). Retourne null
 * si la structure du fichier est incoherente.
 */
export function purgerMetadonneesJpeg(octets: Uint8Array): Uint8Array | null {
  const taille = octets.length;

  if (taille < 4 || octets[0] !== 0xff || octets[1] !== 0xd8) {
    return null;
  }

  const morceaux: Uint8Array[] = [octets.subarray(0, 2)];
  let position = 2;
  let balayageVu = false;

  while (position < taille) {
    if (octets[position] !== 0xff) {
      return null;
    }

    // Octets de bourrage 0xFF autorises avant un marqueur.
    while (position + 1 < taille && octets[position + 1] === 0xff) {
      position++;
    }

    if (position + 1 >= taille) {
      return null;
    }

    const marqueur = octets[position + 1];

    if (marqueur === JPEG_EOI) {
      // Tout ce qui suit EOI est ignore (seconde image, video, donnees ajoutees).
      morceaux.push(octets.subarray(position, position + 2));
      return balayageVu ? concatener(morceaux) : null;
    }

    if ((marqueur >= 0xd0 && marqueur <= 0xd7) || marqueur === 0x01) {
      // Marqueurs sans longueur (RSTn, TEM).
      morceaux.push(octets.subarray(position, position + 2));
      position += 2;
      continue;
    }

    if (marqueur === 0x00 || marqueur === 0xd8) {
      return null;
    }

    if (position + 4 > taille) {
      return null;
    }

    const longueur = (octets[position + 2] << 8) | octets[position + 3];
    const fin = position + 2 + longueur;

    if (longueur < 2 || fin > taille) {
      return null;
    }

    if (segmentJpegAConserver(marqueur, octets, position + 4, fin)) {
      morceaux.push(octets.subarray(position, fin));
    }

    position = fin;

    if (marqueur === JPEG_SOS) {
      balayageVu = true;
      // Donnees compressees : un 0xFF y est toujours suivi de 0x00 (octet de
      // bourrage), d'un RSTn ou d'un autre 0xFF ; tout autre octet signale le
      // marqueur suivant (EOI, ou DHT/SOS d'un JPEG progressif).
      let curseur = position;
      while (curseur < taille) {
        if (octets[curseur] === 0xff && curseur + 1 < taille) {
          const suivant = octets[curseur + 1];
          if (suivant === 0xff) {
            curseur += 1;
            continue;
          }
          if (suivant === 0x00 || (suivant >= 0xd0 && suivant <= 0xd7)) {
            curseur += 2;
            continue;
          }
          break;
        }
        curseur++;
      }
      morceaux.push(octets.subarray(position, curseur));
      position = curseur;
    }
  }

  // Fichier tronque avant EOI : les pixels deja lus sont gardes, aucune
  // metadonnee n'a ete recopiee.
  return balayageVu ? concatener(morceaux) : null;
}

/**
 * Retire les metadonnees d'un PNG (voir l'en-tete du fichier). Retourne null
 * si la structure du fichier est incoherente.
 */
export function purgerMetadonneesPng(octets: Uint8Array): Uint8Array | null {
  const taille = octets.length;

  if (taille < SIGNATURE_PNG.length || !SIGNATURE_PNG.every((octet, index) => octets[index] === octet)) {
    return null;
  }

  const lecteur = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
  const morceaux: Uint8Array[] = [octets.subarray(0, SIGNATURE_PNG.length)];
  let position = SIGNATURE_PNG.length;

  while (position + 12 <= taille) {
    const longueur = lecteur.getUint32(position);
    const fin = position + 12 + longueur;

    if (longueur > 0x7fffffff || fin > taille) {
      return null;
    }

    const type = String.fromCharCode(
      octets[position + 4],
      octets[position + 5],
      octets[position + 6],
      octets[position + 7]
    );

    if (!/^[A-Za-z]{4}$/.test(type)) {
      return null;
    }

    if (BLOCS_PNG_CONSERVES.has(type)) {
      morceaux.push(octets.subarray(position, fin));
    }

    position = fin;

    if (type === "IEND") {
      // Tout ce qui suit IEND est ignore.
      return concatener(morceaux);
    }
  }

  return null;
}

/**
 * Point d'entree unique : purge un JPEG ou un PNG, renvoie un PDF inchange
 * (la regle vise les images). Le type est celui detecte par signature
 * binaire (detecterTypeReelFichier), jamais celui declare par le navigateur.
 */
export function purgerMetadonneesImage(octets: Uint8Array, typeMime: string): Uint8Array | null {
  if (typeMime === "image/jpeg") {
    return purgerMetadonneesJpeg(octets);
  }
  if (typeMime === "image/png") {
    return purgerMetadonneesPng(octets);
  }
  return octets;
}
