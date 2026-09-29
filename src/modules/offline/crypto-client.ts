/**
 * Fondation cryptographique du mode hors ligne (RG-OFF-01).
 *
 * Ce module ne s'execute JAMAIS cote serveur : il n'importe rien de Next.js,
 * ni de Prisma, et n'utilise que l'API Web Crypto native du navigateur
 * (`crypto.subtle`). Aucune dependance npm.
 *
 * Principe central : la cle de chiffrement AES-GCM est derivee du code PIN a
 * 6 chiffres via PBKDF2 (310 000 iterations, SHA-256, exigence exacte du pack
 * F-COM-01/RG-OFF-01) et n'est JAMAIS stockee, ni en clair ni chiffree. Elle
 * est recalculee a chaque deverrouillage a partir du PIN saisi et d'un sel
 * (le sel, lui, n'est pas secret : il est stocke a cote des donnees
 * chiffrees, comme c'est l'usage pour PBKDF2, et sert uniquement a empecher
 * les tables precalculees).
 *
 * Garantie recherchee : un mauvais PIN ne doit JAMAIS restituer un resultat
 * corrompu silencieusement. AES-GCM integre un tag d'authentification :
 * dechiffrer avec la mauvaise cle derivee fait echouer `crypto.subtle.decrypt`
 * (exception), jamais un JSON.parse hasardeux sur des octets errones.
 */

const ITERATIONS_PBKDF2 = 310_000;
const LONGUEUR_SEL_OCTETS = 16;
const LONGUEUR_IV_OCTETS = 12; // taille recommandee pour AES-GCM
const LONGUEUR_CLE_BITS = 256;

/** Erreur levee quand le dechiffrement echoue (mauvais PIN, donnees corrompues ou alterees). */
export class ErreurDechiffrement extends Error {
  constructor() {
    super("PIN incorrect ou donnees corrompues.");
    this.name = "ErreurDechiffrement";
  }
}

/** Enveloppe chiffree transportable (serialisable en JSON, stockable en IndexedDB). */
export interface EnveloppeChiffree {
  /** Sel PBKDF2 (base64), genere une fois par appareil, jamais secret. */
  selBase64: string;
  /** Vecteur d'initialisation AES-GCM (base64), unique a chaque chiffrement. */
  ivBase64: string;
  /** Donnees chiffrees (base64), incluant le tag d'authentification GCM. */
  donneesBase64: string;
}

function verifierEnvironnementNavigateur(): void {
  if (typeof crypto === "undefined" || typeof crypto.subtle === "undefined") {
    throw new Error(
      "crypto.subtle indisponible : ce module ne doit s'executer que dans un navigateur (ou Node avec Web Crypto global)."
    );
  }
}

function octetsVersBase64(octets: Uint8Array): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 1) {
    binaire += String.fromCharCode(octets[i]);
  }
  return btoa(binaire);
}

function base64VersOctets(base64: string): Uint8Array {
  const binaire = atob(base64);
  const octets = new Uint8Array(binaire.length);
  for (let i = 0; i < binaire.length; i += 1) {
    octets[i] = binaire.charCodeAt(i);
  }
  return octets;
}

/** Genere un sel PBKDF2 aleatoire (a stocker, non secret). */
export function genererSel(): Uint8Array {
  verifierEnvironnementNavigateur();
  return crypto.getRandomValues(new Uint8Array(LONGUEUR_SEL_OCTETS));
}

/**
 * Derive une cle AES-GCM 256 bits depuis un code PIN et un sel, via PBKDF2
 * (310 000 iterations, SHA-256, RG-OFF-01). La cle retournee n'est jamais
 * exportable (`extractable: false`) : meme un code appelant fautif ne peut
 * pas en extraire les octets bruts pour les stocker par erreur.
 */
export async function deriverClePin(pin: string, sel: Uint8Array): Promise<CryptoKey> {
  verifierEnvironnementNavigateur();

  const encodeur = new TextEncoder();
  const materielClePin = await crypto.subtle.importKey(
    "raw",
    encodeur.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: sel as BufferSource,
      iterations: ITERATIONS_PBKDF2,
      hash: "SHA-256",
    },
    materielClePin,
    { name: "AES-GCM", length: LONGUEUR_CLE_BITS },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Chiffre une valeur JSON-serialisable avec la cle fournie. Un nouveau
 * vecteur d'initialisation est genere a chaque appel (jamais reutilise avec
 * la meme cle, condition de securite d'AES-GCM).
 */
export async function chiffrer(cle: CryptoKey, sel: Uint8Array, donnees: unknown): Promise<EnveloppeChiffree> {
  verifierEnvironnementNavigateur();

  const iv = crypto.getRandomValues(new Uint8Array(LONGUEUR_IV_OCTETS));
  const encodeur = new TextEncoder();
  const clair = encodeur.encode(JSON.stringify(donnees));

  const chiffre = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cle, clair);

  return {
    selBase64: octetsVersBase64(sel),
    ivBase64: octetsVersBase64(iv),
    donneesBase64: octetsVersBase64(new Uint8Array(chiffre)),
  };
}

/**
 * Dechiffre une enveloppe avec la cle fournie. Leve toujours
 * `ErreurDechiffrement` en cas d'echec (mauvais PIN, enveloppe alteree) :
 * jamais de resultat partiel ou corrompu renvoye silencieusement.
 */
export async function dechiffrer<T = unknown>(cle: CryptoKey, enveloppe: EnveloppeChiffree): Promise<T> {
  verifierEnvironnementNavigateur();

  const iv = base64VersOctets(enveloppe.ivBase64);
  const chiffre = base64VersOctets(enveloppe.donneesBase64);

  let clair: ArrayBuffer;
  try {
    clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, cle, chiffre as BufferSource);
  } catch {
    throw new ErreurDechiffrement();
  }

  const decodeur = new TextDecoder();
  try {
    return JSON.parse(decodeur.decode(clair)) as T;
  } catch {
    // Ne devrait jamais arriver (le tag GCM aurait deja rejete des octets
    // alteres), mais on refuse par prudence tout JSON invalide plutot que de
    // renvoyer une valeur partielle.
    throw new ErreurDechiffrement();
  }
}

/** Recupere le sel d'une enveloppe (utile pour re-deriver la cle a partir du PIN saisi au deverrouillage). */
export function selDeLEnveloppe(enveloppe: EnveloppeChiffree): Uint8Array {
  return base64VersOctets(enveloppe.selBase64);
}
