/**
 * Chiffrement de champs sensibles au repos (AES-256-GCM), utilise pour le
 * secret TOTP de la double authentification (RG-AUTH-51).
 *
 * La cle est derivee de CLE_CHIFFREMENT_DONNEES si elle est definie, sinon de
 * NEXTAUTH_SECRET. Definir une cle dediee permet de changer NEXTAUTH_SECRET
 * (fermeture de toutes les sessions) sans rendre les secrets illisibles.
 *
 * Le "contexte" est authentifie avec le texte chiffre : un secret copie d'un
 * compte vers un autre ne se dechiffre pas.
 */

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

const PREFIXE = "chiffre:v1:";

function cleDerivee(): Buffer {
  const secret = process.env.CLE_CHIFFREMENT_DONNEES || getEnv().NEXTAUTH_SECRET;
  return createHash("sha256").update(`bhip/chiffrement-champs/v1/${secret}`).digest();
}

/**
 * Empreinte HMAC-SHA256 (hex) d'un secret a forte entropie (code de secours),
 * sous la meme cle que le chiffrement. Le "domaine" separe les usages : une
 * empreinte calculee pour un usage ne valide pas la meme valeur pour un autre.
 */
export function empreinteHmac(valeur: string, domaine: string): string {
  return createHmac("sha256", cleDerivee()).update(`${domaine}\n${valeur}`).digest("hex");
}

export function estChiffre(valeur: string): boolean {
  return valeur.startsWith(PREFIXE);
}

export function chiffrerTexte(clair: string, contexte: string): string {
  const iv = randomBytes(12);
  const chiffre = createCipheriv("aes-256-gcm", cleDerivee(), iv);
  chiffre.setAAD(Buffer.from(contexte, "utf8"));
  const contenu = Buffer.concat([chiffre.update(clair, "utf8"), chiffre.final()]);
  const etiquette = chiffre.getAuthTag();
  return `${PREFIXE}${iv.toString("base64url")}.${etiquette.toString("base64url")}.${contenu.toString("base64url")}`;
}

/** Leve une erreur si la valeur n'est pas un texte chiffre valide pour ce contexte. */
export function dechiffrerTexte(valeur: string, contexte: string): string {
  if (!estChiffre(valeur)) {
    throw new Error("Valeur non chiffree.");
  }

  const [iv, etiquette, contenu] = valeur.slice(PREFIXE.length).split(".");

  if (!iv || !etiquette || !contenu) {
    throw new Error("Valeur chiffree mal formee.");
  }

  const dechiffre = createDecipheriv("aes-256-gcm", cleDerivee(), Buffer.from(iv, "base64url"));
  dechiffre.setAAD(Buffer.from(contexte, "utf8"));
  dechiffre.setAuthTag(Buffer.from(etiquette, "base64url"));
  return Buffer.concat([dechiffre.update(Buffer.from(contenu, "base64url")), dechiffre.final()]).toString("utf8");
}
