"use server";

/**
 * Server Actions du module identity : double authentification (MFA) par TOTP
 * (Phase 7, durcissement securite). Le cahier des charges impose la MFA pour
 * les actions sensibles des professionnels de sante (voir
 * src/security/README.md) : ce module l'implemente au niveau de la connexion
 * elle-meme, sur une base volontaire (l'utilisateur active ou non la MFA sur
 * son compte), quel que soit son role.
 *
 * Principe : TOTP standard (compatible Google Authenticator, Authy, etc.),
 * secret genere aleatoirement (otpauth, jamais Math.random), jamais stocke ni
 * affiche en clair apres l'activation initiale. Zero Trust : chaque fonction
 * derive l'utilisateur de getSession(), jamais d'id transmis par le client.
 */

import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { FENETRE_VALIDATION, creerTotp, schemaCode } from "./mfa-totp";

export interface MfaActionState {
  error: string | null;
  success: boolean;
}

/** Donnees d'enrolement MFA affichees une seule fois (avant confirmation). */
export interface EnrolementMfa {
  secretBase32: string;
  qrCodeDataUrl: string;
}

/**
 * Genere un nouveau secret TOTP pour l'utilisateur connecte et le QR code
 * correspondant, SANS l'activer ni le sauvegarder en base : l'activation
 * reelle (activerMfaAction) exige d'abord la saisie d'un code valide, pour
 * s'assurer que l'application d'authentification a bien ete configuree
 * correctement avant de rendre la MFA obligatoire a la prochaine connexion.
 */
export async function demarrerEnrolementMfa(): Promise<EnrolementMfa | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!utilisateur) {
    return null;
  }

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = creerTotp(utilisateur.email, secret.base32);
  const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());

  return { secretBase32: secret.base32, qrCodeDataUrl };
}

/**
 * Confirme l'activation de la MFA : verifie que le code saisi correspond bien
 * au secret genere par demarrerEnrolementMfa, puis sauvegarde ce secret et
 * active la MFA sur le compte connecte. Sans cette confirmation, aucun
 * secret n'est jamais ecrit en base (voir demarrerEnrolementMfa).
 */
export async function activerMfaAction(
  prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte pour activer la double authentification.", success: false };
  }

  const secretBase32 = formData.get("secretBase32");
  const validationCode = schemaCode.safeParse(formData.get("code"));

  if (typeof secretBase32 !== "string" || secretBase32.length === 0) {
    return { error: "Session d'activation invalide, veuillez recommencer.", success: false };
  }

  if (!validationCode.success) {
    return {
      error: validationCode.error.issues[0]?.message ?? "Code invalide.",
      success: false,
    };
  }

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    const totp = creerTotp(utilisateur.email, secretBase32);
    const delta = totp.validate({ token: validationCode.data, window: FENETRE_VALIDATION });

    if (delta === null) {
      return {
        error: "Code incorrect. Verifiez l'heure de votre telephone et reessayez.",
        success: false,
      };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { mfaSecret: secretBase32, mfaActif: true },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "modification",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique: "interne",
        justification: "Activation de la double authentification (MFA)",
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors de l'activation de la MFA :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }

  return { error: null, success: true };
}

/**
 * Desactive la MFA sur le compte connecte. Exige le mot de passe actuel
 * (et non un code TOTP) : si la personne a perdu l'acces a son application
 * d'authentification, elle doit pouvoir desactiver la MFA avec ce qu'elle a
 * encore (son mot de passe), plutot que de se retrouver bloquee.
 */
export async function desactiverMfaAction(
  prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte.", success: false };
  }

  const motDePasse = formData.get("motDePasse");

  if (typeof motDePasse !== "string" || motDePasse.length === 0) {
    return { error: "Le mot de passe est obligatoire.", success: false };
  }

  try {
    const bcrypt = (await import("bcryptjs")).default;
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);

    if (!motDePasseValide) {
      return { error: "Mot de passe incorrect.", success: false };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: session.userId },
        data: { mfaSecret: null, mfaActif: false },
      }),
      journaliser({
        utilisateurId: session.userId,
        action: "modification",
        donneeConcernee: `utilisateur:${session.userId}`,
        adresseTechnique: "interne",
        justification: "Desactivation de la double authentification (MFA)",
      }),
    ]);
  } catch (erreur) {
    console.error("Erreur lors de la desactivation de la MFA :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }

  return { error: null, success: true };
}

/** Etat de la MFA pour le compte connecte, a afficher sur l'ecran de securite. */
export async function getStatutMfa(): Promise<{ actif: boolean } | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const utilisateur = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaActif: true },
  });

  return utilisateur ? { actif: utilisateur.mfaActif } : null;
}
