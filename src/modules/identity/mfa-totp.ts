/**
 * Briques TOTP partagees et verification d'un code pour la connexion.
 * Module serveur SANS "use server" : `verifierCodeMfaPourConnexion(userId, code)`
 * accepte un identifiant transmis par l'appelant (aucune session n'existe
 * encore a l'etape de connexion) ; exposee comme Server Action, elle serait un
 * oracle TOTP atteignable sans session ni limite d'essais.
 *
 * RG-AUTH-51 : le secret est stocke chiffre (AES-256-GCM, lie au compte). Un
 * secret historique encore en clair reste lisible et est chiffre a sa premiere
 * verification reussie.
 */

import * as OTPAuth from "otpauth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chiffrerTexte, dechiffrerTexte, estChiffre } from "@/lib/chiffrement";
import { consommerCodeSecours, normaliserCodeSecours } from "./codes-secours-mfa";

const EMETTEUR_TOTP = "Benin Health Intelligence Platform";
export const FENETRE_VALIDATION = 1; // tolere 1 periode de 30s avant/apres (horloge du telephone)

export function creerTotp(email: string, secretBase32: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: EMETTEUR_TOTP,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

export const schemaCode = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Le code doit contenir exactement 6 chiffres.");

function contexteSecret(userId: string): string {
  return `mfa-secret:${userId}`;
}

/** Forme stockee en base d'un secret TOTP : chiffre et lie au compte. */
export function protegerSecretMfa(userId: string, secretBase32: string): string {
  return chiffrerTexte(secretBase32, contexteSecret(userId));
}

/** Secret en clair (base32) a partir de la valeur stockee ; `aMigrer` vaut vrai pour un secret historique non chiffre. */
export function lireSecretMfa(userId: string, valeurStockee: string): { secretBase32: string; aMigrer: boolean } {
  if (estChiffre(valeurStockee)) {
    return { secretBase32: dechiffrerTexte(valeurStockee, contexteSecret(userId)), aMigrer: false };
  }

  return { secretBase32: valeurStockee, aMigrer: true };
}

export type MoyenSecondFacteur = "totp" | "secours";

/**
 * Verifie un second facteur : code TOTP a 6 chiffres, ou code de secours a
 * usage unique (XXXXX-XXXXX). Renvoie le moyen utilise, ou null si refuse.
 */
export async function verifierSecondFacteur(userId: string, code: string): Promise<MoyenSecondFacteur | null> {
  const utilisateur = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, mfaActif: true, mfaSecret: true },
  });

  if (!utilisateur || !utilisateur.mfaActif || !utilisateur.mfaSecret) {
    return null;
  }

  const codeTotp = schemaCode.safeParse(code);

  if (codeTotp.success) {
    let secret: { secretBase32: string; aMigrer: boolean };

    try {
      secret = lireSecretMfa(userId, utilisateur.mfaSecret);
    } catch {
      return null;
    }

    const totp = creerTotp(utilisateur.email, secret.secretBase32);

    if (totp.validate({ token: codeTotp.data, window: FENETRE_VALIDATION }) === null) {
      return null;
    }

    if (secret.aMigrer) {
      await prisma.user
        .update({ where: { id: userId }, data: { mfaSecret: protegerSecretMfa(userId, secret.secretBase32) } })
        .catch(() => {});
    }

    return "totp";
  }

  if (normaliserCodeSecours(code) !== null && (await consommerCodeSecours(userId, code))) {
    return "secours";
  }

  return null;
}

/**
 * Verifie un code pour un utilisateur donne par id (TOTP ou code de secours).
 * Utilise par la connexion (aucune session n'existe encore : le mot de passe a
 * deja ete verifie) et par l'acces d'urgence (re-authentification de la
 * session courante).
 */
export async function verifierCodeMfaPourConnexion(userId: string, code: string): Promise<boolean> {
  return (await verifierSecondFacteur(userId, code)) !== null;
}
