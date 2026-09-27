/**
 * Codes de secours de la double authentification (F-AUTH-06, RG-AUTH-51) :
 * dix codes a usage unique, remis une seule fois a l'activation, stockes sous
 * forme d'empreinte HMAC (jamais en clair) et invalides apres usage.
 *
 * Module serveur SANS "use server" : chaque fonction accepte un identifiant
 * d'utilisateur transmis par l'appelant. Exposees comme Server Actions, elles
 * seraient des oracles appelables sans session.
 */

import { randomInt } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { empreinteHmac } from "@/lib/chiffrement";

export const NOMBRE_CODES_SECOURS = 10;
const LONGUEUR_CODE = 10;
/** Sans O, 0, I, 1, L : aucun caractere ambigu a recopier depuis une feuille. */
const ALPHABET_CODES = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const DOMAINE_EMPREINTE = "code-secours-mfa";

type Client = PrismaClient | Prisma.TransactionClient;

/** "ab cde-fgh ijk" devient "ABCDEFGHIJK" ; renvoie null si la saisie n'a pas la forme d'un code de secours. */
export function normaliserCodeSecours(saisie: string): string | null {
  const nettoye = saisie.replace(/[\s-]/g, "").toUpperCase();

  if (nettoye.length !== LONGUEUR_CODE) {
    return null;
  }

  return [...nettoye].every((caractere) => ALPHABET_CODES.includes(caractere)) ? nettoye : null;
}

/** Forme affichee : XXXXX-XXXXX. */
export function formaterCodeSecours(code: string): string {
  return `${code.slice(0, LONGUEUR_CODE / 2)}-${code.slice(LONGUEUR_CODE / 2)}`;
}

export function genererCodesSecours(): string[] {
  const codes = new Set<string>();

  while (codes.size < NOMBRE_CODES_SECOURS) {
    let code = "";
    for (let i = 0; i < LONGUEUR_CODE; i++) {
      code += ALPHABET_CODES[randomInt(ALPHABET_CODES.length)];
    }
    codes.add(code);
  }

  return [...codes];
}

/**
 * Remplace TOUS les codes de secours de l'utilisateur par un nouveau lot et
 * renvoie les codes en clair (a afficher une seule fois, sous la forme XXXXX-XXXXX).
 */
export async function remplacerCodesSecours(client: Client, userId: string): Promise<string[]> {
  const codes = genererCodesSecours();

  await client.codeSecoursMfa.deleteMany({ where: { userId } });
  await client.codeSecoursMfa.createMany({
    data: codes.map((code) => ({ userId, empreinte: empreinteHmac(code, DOMAINE_EMPREINTE) })),
  });

  return codes.map(formaterCodeSecours);
}

/**
 * Consomme un code de secours : vrai une seule fois par code, meme si deux
 * saisies simultanees le presentent (mise a jour conditionnelle sur utiliseLe).
 */
export async function consommerCodeSecours(userId: string, saisie: string): Promise<boolean> {
  const code = normaliserCodeSecours(saisie);

  if (!code) {
    return false;
  }

  const resultat = await prisma.codeSecoursMfa.updateMany({
    where: { userId, empreinte: empreinteHmac(code, DOMAINE_EMPREINTE), utiliseLe: null },
    data: { utiliseLe: new Date() },
  });

  return resultat.count === 1;
}

export async function compterCodesSecoursRestants(userId: string): Promise<number> {
  return prisma.codeSecoursMfa.count({ where: { userId, utiliseLe: null } });
}

/** Supprime les codes de secours (reinitialisation ou desactivation du second facteur). */
export async function supprimerCodesSecours(client: Client, userId: string): Promise<void> {
  await client.codeSecoursMfa.deleteMany({ where: { userId } });
}
