/**
 * Generation d'UUID v7 en TypeScript pur, sans dependance npm (aucune
 * bibliotheque uuid n'existe dans ce depot, voir docs/reste-a-faire.md).
 * Utilise pour l'identifiant genere sur l'appareil de chaque saisie creee
 * hors ligne (RG-OFF-02) : le prefixe temporel (48 bits, millisecondes
 * Unix) rend les identifiants triables chronologiquement, ce qui aide au
 * traitement des lots "dans l'ordre chronologique" exige par F-COM-08.
 *
 * Format (RFC 9562, version 7) :
 *   xxxxxxxx-xxxx-7xxx-Nxxx-xxxxxxxxxxxx
 * - les 48 premiers bits (12 hex) : horodatage Unix en millisecondes
 * - bits suivants : version (0111 = 7) puis 12 bits aleatoires
 * - bits suivants : variant (10xx) puis 62 bits aleatoires
 *
 * Utilise crypto.getRandomValues (Web Crypto natif), disponible aussi bien
 * dans le navigateur que dans l'environnement Node de ce depot (Node >= 19).
 */

function octetsAleatoires(longueur: number): Uint8Array {
  if (typeof crypto === "undefined" || typeof crypto.getRandomValues === "undefined") {
    throw new Error("crypto.getRandomValues indisponible : impossible de generer un UUID v7 sur cet environnement.");
  }
  return crypto.getRandomValues(new Uint8Array(longueur));
}

function octetVersHex(octet: number): string {
  return octet.toString(16).padStart(2, "0");
}

/** Genere un UUID v7 (identifiant d'appareil pour une saisie hors ligne, RG-OFF-02). */
export function genererUuidV7(horodatage: number = Date.now()): string {
  const octets = new Uint8Array(16);

  // 48 bits (6 octets) : horodatage Unix en millisecondes. BigInt(...) (et
  // non le suffixe litteral 40n) pour rester compatible avec la cible de
  // compilation ES2017 de ce depot (tsconfig.json), qui n'autorise pas les
  // litteraux BigInt.
  const tempsMs = BigInt(Math.max(0, Math.trunc(horodatage)));
  const MASQUE_OCTET = BigInt(0xff);
  octets[0] = Number((tempsMs >> BigInt(40)) & MASQUE_OCTET);
  octets[1] = Number((tempsMs >> BigInt(32)) & MASQUE_OCTET);
  octets[2] = Number((tempsMs >> BigInt(24)) & MASQUE_OCTET);
  octets[3] = Number((tempsMs >> BigInt(16)) & MASQUE_OCTET);
  octets[4] = Number((tempsMs >> BigInt(8)) & MASQUE_OCTET);
  octets[5] = Number(tempsMs & MASQUE_OCTET);

  const alea = octetsAleatoires(10);

  // Octet 6 : version (0111) dans les 4 bits de poids fort, 4 bits aleatoires.
  octets[6] = 0x70 | (alea[0] & 0x0f);
  // Octet 7 : 8 bits aleatoires.
  octets[7] = alea[1];
  // Octet 8 : variant (10) dans les 2 bits de poids fort, 6 bits aleatoires.
  octets[8] = 0x80 | (alea[2] & 0x3f);
  // Octets 9 a 15 : 56 bits aleatoires restants.
  for (let i = 9; i < 16; i += 1) {
    octets[i] = alea[3 + (i - 9)];
  }

  const hex = Array.from(octets, octetVersHex).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const MOTIF_UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Verifie qu'une chaine est bien un UUID v7 valide (forme), utilise cote serveur pour valider les identifiants recus. */
export function estUuidV7Valide(valeur: string): boolean {
  return MOTIF_UUID_V7.test(valeur);
}

/** Extrait l'horodatage (millisecondes Unix) encode dans un UUID v7. */
export function horodatageDepuisUuidV7(uuid: string): number {
  const hex = uuid.replace(/-/g, "").slice(0, 12);
  return Number(BigInt(`0x${hex}`));
}
