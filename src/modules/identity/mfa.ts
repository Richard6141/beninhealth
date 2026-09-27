"use server";

/**
 * Server Actions du module identity : double authentification (MFA) par TOTP
 * (F-AUTH-06). Le second facteur est facultatif pour un patient et obligatoire
 * pour tout autre role (drapeau `securite.mfa_obligatoire`, voir src/lib/session.ts).
 *
 * Principe : TOTP standard (compatible Google Authenticator, Authy, etc.),
 * secret genere aleatoirement (otpauth, jamais Math.random), stocke chiffre
 * (RG-AUTH-51) et jamais affiche apres l'activation initiale. Dix codes de
 * secours a usage unique sont remis une seule fois a l'activation. Zero Trust :
 * chaque fonction derive l'utilisateur de la session, jamais d'un id transmis
 * par le client.
 */

import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession, getSessionPourActivationMfa } from "@/lib/session";
import { compterCodesSecoursRestants, remplacerCodesSecours, supprimerCodesSecours } from "./codes-secours-mfa";
import {
  MESSAGE_TROP_DE_TENTATIVES,
  adresseDeLaRequete,
  enregistrerEchecMfa,
  mfaBloquee,
} from "./limitation-connexion";
import { FENETRE_VALIDATION, creerTotp, protegerSecretMfa, schemaCode, verifierSecondFacteur } from "./mfa-totp";

export interface MfaActionState {
  error: string | null;
  success: boolean;
  /** Codes de secours en clair, presents uniquement dans la reponse qui vient de les creer. */
  codesSecours?: string[];
}

/** Donnees d'enrolement MFA affichees une seule fois (avant confirmation). */
export interface EnrolementMfa {
  secretBase32: string;
  qrCodeDataUrl: string;
}

const MESSAGE_OBLIGATOIRE =
  "La double authentification est obligatoire pour votre role. En cas de perte de votre appareil, demandez sa reinitialisation a un administrateur.";

async function adresseTechnique(): Promise<string> {
  return (await adresseDeLaRequete()) ?? "inconnue";
}

/**
 * Genere un nouveau secret TOTP pour l'utilisateur connecte et le QR code
 * correspondant, SANS l'activer ni le sauvegarder en base : l'activation
 * reelle (activerMfaAction) exige d'abord la saisie d'un code valide, pour
 * s'assurer que l'application d'authentification a bien ete configuree
 * correctement avant de rendre la MFA obligatoire a la prochaine connexion.
 */
export async function demarrerEnrolementMfa(): Promise<EnrolementMfa | null> {
  const session = await getSessionPourActivationMfa();

  if (!session) {
    return null;
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

  if (!utilisateur || utilisateur.mfaActif) {
    return null;
  }

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = creerTotp(utilisateur.email, secret.base32);
  const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());

  return { secretBase32: secret.base32, qrCodeDataUrl };
}

/**
 * Confirme l'activation de la MFA : verifie que le code saisi correspond bien
 * au secret genere par demarrerEnrolementMfa, puis sauvegarde ce secret
 * (chiffre) et active la MFA sur le compte connecte, avec dix codes de
 * secours renvoyes une seule fois. Sans cette confirmation, aucun secret n'est
 * jamais ecrit en base. Refuse si la MFA est deja active : remplacer le secret
 * d'un compte protege exige de la desactiver d'abord (mot de passe et code).
 */
export async function activerMfaAction(
  prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const session = await getSessionPourActivationMfa();

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

  if (mfaBloquee(session.userId)) {
    return { error: MESSAGE_TROP_DE_TENTATIVES, success: false };
  }

  try {
    const utilisateur = await prisma.user.findUnique({ where: { id: session.userId } });

    if (!utilisateur) {
      return { error: "Compte introuvable.", success: false };
    }

    if (utilisateur.mfaActif) {
      return { error: "La double authentification est deja activee sur ce compte.", success: false };
    }

    let delta: number | null;

    try {
      delta = creerTotp(utilisateur.email, secretBase32).validate({
        token: validationCode.data,
        window: FENETRE_VALIDATION,
      });
    } catch {
      return { error: "Session d'activation invalide, veuillez recommencer.", success: false };
    }

    if (delta === null) {
      enregistrerEchecMfa(session.userId);
      return {
        error: "Code incorrect. Verifiez l'heure de votre telephone et reessayez.",
        success: false,
      };
    }

    const adresse = await adresseTechnique();

    const codesSecours = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: { mfaSecret: protegerSecretMfa(session.userId, secretBase32), mfaActif: true },
      });
      const codes = await remplacerCodesSecours(tx, session.userId);
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique: adresse,
          justification: "Activation de la double authentification (MFA), codes de secours emis",
        },
        tx
      );
      return codes;
    });

    return { error: null, success: true, codesSecours };
  } catch (erreur) {
    console.error("Erreur lors de l'activation de la MFA :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

/**
 * Verifie le mot de passe ET un second facteur (code TOTP ou code de secours)
 * de la session courante, pour une operation qui affaiblit ou renouvelle la
 * protection du compte. Les echecs comptent dans le meme plafond que la
 * connexion (5 en 15 minutes).
 */
async function reauthentifier(
  userId: string,
  motDePasse: unknown,
  code: unknown
): Promise<{ erreur: string | null }> {
  if (typeof motDePasse !== "string" || motDePasse.length === 0) {
    return { erreur: "Le mot de passe est obligatoire." };
  }

  if (typeof code !== "string" || code.trim().length === 0) {
    return { erreur: "Le code de votre application d'authentification (ou un code de secours) est obligatoire." };
  }

  if (mfaBloquee(userId)) {
    return { erreur: MESSAGE_TROP_DE_TENTATIVES };
  }

  const utilisateur = await prisma.user.findUnique({ where: { id: userId } });

  if (!utilisateur) {
    return { erreur: "Compte introuvable." };
  }

  const motDePasseValide = await bcrypt.compare(motDePasse, utilisateur.motDePasseHash);
  const moyen = motDePasseValide ? await verifierSecondFacteur(userId, code) : null;

  if (!motDePasseValide || moyen === null) {
    enregistrerEchecMfa(userId);
    return { erreur: "Mot de passe ou code incorrect." };
  }

  return { erreur: null };
}

/**
 * Desactive la MFA sur le compte connecte (patient uniquement : RG-AUTH-50,
 * elle est obligatoire pour les autres roles, et la perte de l'appareil se
 * regle par une reinitialisation faite par un administrateur, RG-AUTH-52).
 * Exige le mot de passe ET un second facteur valide (TOTP ou code de secours).
 */
export async function desactiverMfaAction(
  prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte.", success: false };
  }

  if (session.roles.some((role) => role !== "patient")) {
    return { error: MESSAGE_OBLIGATOIRE, success: false };
  }

  try {
    const verification = await reauthentifier(session.userId, formData.get("motDePasse"), formData.get("code"));

    if (verification.erreur) {
      return { error: verification.erreur, success: false };
    }

    const adresse = await adresseTechnique();

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: session.userId },
        data: { mfaSecret: null, mfaActif: false },
      });
      await supprimerCodesSecours(tx, session.userId);
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique: adresse,
          justification: "Desactivation de la double authentification (MFA)",
        },
        tx
      );
    });
  } catch (erreur) {
    console.error("Erreur lors de la desactivation de la MFA :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }

  return { error: null, success: true };
}

/**
 * Remplace les codes de secours restants par un nouveau lot de dix (les
 * anciens deviennent inutilisables). Exige le mot de passe et un second facteur.
 */
export async function regenererCodesSecoursAction(
  prevState: MfaActionState,
  formData: FormData
): Promise<MfaActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Vous devez etre connecte.", success: false };
  }

  try {
    const verification = await reauthentifier(session.userId, formData.get("motDePasse"), formData.get("code"));

    if (verification.erreur) {
      return { error: verification.erreur, success: false };
    }

    const adresse = await adresseTechnique();

    const codesSecours = await prisma.$transaction(async (tx) => {
      const codes = await remplacerCodesSecours(tx, session.userId);
      await journaliser(
        {
          utilisateurId: session.userId,
          action: "modification",
          donneeConcernee: `utilisateur:${session.userId}`,
          adresseTechnique: adresse,
          justification: "Nouveaux codes de secours de la double authentification emis",
        },
        tx
      );
      return codes;
    });

    return { error: null, success: true, codesSecours };
  } catch (erreur) {
    console.error("Erreur lors du renouvellement des codes de secours :", erreur);
    return { error: "Une erreur est survenue. Veuillez reessayer.", success: false };
  }
}

export interface StatutMfa {
  actif: boolean;
  /** Vrai pour tout compte qui n'est pas un simple patient (RG-AUTH-50). */
  obligatoire: boolean;
  codesSecoursRestants: number;
}

/** Etat de la MFA pour le compte connecte, a afficher sur l'ecran de securite. */
export async function getStatutMfa(): Promise<StatutMfa | null> {
  const session = await getSessionPourActivationMfa();

  if (!session) {
    return null;
  }

  const utilisateur = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { mfaActif: true },
  });

  if (!utilisateur) {
    return null;
  }

  return {
    actif: utilisateur.mfaActif,
    obligatoire: session.roles.some((role) => role !== "patient"),
    codesSecoursRestants: utilisateur.mfaActif ? await compterCodesSecoursRestants(session.userId) : 0,
  };
}
