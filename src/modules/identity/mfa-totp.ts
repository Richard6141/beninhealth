/**
 * Briques TOTP partagees et verification d'un code pour la connexion.
 * Module serveur SANS "use server" : `verifierCodeMfaPourConnexion(userId, code)`
 * accepte un identifiant transmis par l'appelant (aucune session n'existe
 * encore a l'etape de connexion) ; exposee comme Server Action, elle serait un
 * oracle TOTP atteignable sans session ni limite d'essais.
 */

import * as OTPAuth from "otpauth";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

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

/**
 * Verifie un code TOTP pour un utilisateur donne par id. Utilise par la
 * connexion (aucune session n'existe encore : le mot de passe a deja ete
 * verifie) et par l'acces d'urgence (re-authentification de la session
 * courante).
 */
export async function verifierCodeMfaPourConnexion(userId: string, code: string): Promise<boolean> {
  const validation = schemaCode.safeParse(code);

  if (!validation.success) {
    return false;
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: userId } });

  if (!utilisateur || !utilisateur.mfaActif || !utilisateur.mfaSecret) {
    return false;
  }

  const totp = creerTotp(utilisateur.email, utilisateur.mfaSecret);
  return totp.validate({ token: validation.data, window: FENETRE_VALIDATION }) !== null;
}
