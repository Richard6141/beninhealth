/**
 * Identifiant sante d'un patient (RG-AUTH-06, section 18.2 du pack) :
 * `BJ-XXXXX-XXXXX-C`, dix caracteres aleatoires (alphabet Crockford base 32, sans
 * I, L, O, U) et un caractere de controle qui detecte une faute de frappe
 * (Crockford "modulo 37"). Genere avec un generateur cryptographique (RG-GEN-01),
 * jamais deduit d'un compteur : un identifiant ne se devine pas et ne revele
 * pas le nombre de patients.
 *
 * Les identifiants historiques `BJ-SANTE-PAT-0001` restent valides tels quels
 * (aucune migration de donnees) : la verification les reconnait sans controle.
 *
 * Module pur, sans "use server".
 */

import { randomInt } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** Les 32 symboles plus les 5 symboles de controle supplementaires du pack. */
const SYMBOLES_CONTROLE = `${ALPHABET}*~$=U`;
const LONGUEUR_CORPS = 10;
const FORMAT_ANCIEN = /^BJ-SANTE-[A-Z]{3}-\d{4}$/;

function symboleDeControle(corps: string): string {
  let valeur = BigInt(0);

  for (const caractere of corps) {
    valeur = valeur * BigInt(32) + BigInt(ALPHABET.indexOf(caractere));
  }

  return SYMBOLES_CONTROLE[Number(valeur % BigInt(37))];
}

function formater(corps: string, controle: string): string {
  return `BJ-${corps.slice(0, 5)}-${corps.slice(5)}-${controle}`;
}

/**
 * Nouvel identifiant. Le symbole de controle est toujours l'un des 32
 * caracteres alphanumeriques : les cinq symboles speciaux (`*~$=U`) sont
 * valides mais genants dans une URL, un QR code ou un fichier CSV, on retire
 * donc les tirages qui les donneraient.
 */
export function genererIdentifiantSante(): string {
  for (;;) {
    let corps = "";
    for (let i = 0; i < LONGUEUR_CORPS; i++) {
      corps += ALPHABET[randomInt(ALPHABET.length)];
    }

    const controle = symboleDeControle(corps);

    if (ALPHABET.includes(controle)) {
      return formater(corps, controle);
    }
  }
}

export interface VerificationIdentifiantSante {
  valide: boolean;
  /** Forme canonique (`BJ-XXXXX-XXXXX-C`) ou identifiant historique en majuscules ; null si invalide. */
  canonique: string | null;
  ancienFormat: boolean;
}

/**
 * Accepte minuscules, espaces et tirets absents, et les confusions classiques de
 * Crockford (I et L lus comme 1, O lu comme 0). Refuse un caractere de controle faux.
 */
export function verifierIdentifiantSante(saisie: string): VerificationIdentifiantSante {
  const majuscules = saisie.trim().toUpperCase();

  if (FORMAT_ANCIEN.test(majuscules)) {
    return { valide: true, canonique: majuscules, ancienFormat: true };
  }

  let brut = majuscules.replace(/[\s-]/g, "");

  if (brut.startsWith("BJ")) {
    brut = brut.slice(2);
  }

  brut = brut.replace(/[IL]/g, "1").replace(/O/g, "0");

  if (brut.length !== LONGUEUR_CORPS + 1) {
    return { valide: false, canonique: null, ancienFormat: false };
  }

  const corps = brut.slice(0, LONGUEUR_CORPS);
  const controle = brut[LONGUEUR_CORPS];

  if ([...corps].some((caractere) => !ALPHABET.includes(caractere))) {
    return { valide: false, canonique: null, ancienFormat: false };
  }

  if (controle !== symboleDeControle(corps)) {
    return { valide: false, canonique: null, ancienFormat: false };
  }

  return { valide: true, canonique: formater(corps, controle), ancienFormat: false };
}
