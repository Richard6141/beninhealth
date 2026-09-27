/**
 * Code de verification a 6 chiffres envoye par e-mail, etape obligatoire de
 * connexion pour tous les comptes (independante de la double authentification
 * TOTP optionnelle, voir src/modules/identity/mfa.ts). Meme principe que le
 * TOTP : jamais le code en clair stocke, jamais Math.random pour le generer.
 */

import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getEnv } from "@/lib/env";
import { envoyerEmail } from "@/lib/mail";
import { lireParametre } from "@/modules/administration/parametres-lecture";

const ROUNDS_BCRYPT = 12;

function genererCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function gabaritEmailCode(code: string, dureeMinutes: number): string {
  return `
    <div style="font-family: Arial, sans-serif; color: #1d2530;">
      <p>Voici votre code de connexion a la Plateforme d'Intelligence Sanitaire du Benin :</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 0.1em; color: #0a3764;">${code}</p>
      <p>Ce code expire dans ${dureeMinutes} minutes. Si vous n'etes pas a l'origine de cette
      demande de connexion, ignorez cet e-mail.</p>
    </div>
  `.trim();
}

/**
 * Genere un nouveau code, invalide les codes non consommes precedents du
 * meme compte (une seule demande active a la fois), l'enregistre (empreinte
 * bcrypt uniquement) puis l'envoie par e-mail. Retourne le code en clair
 * UNIQUEMENT pour affichage a l'ecran hors production (voir loginAction) :
 * jamais journalise, jamais renvoye en production.
 */
export async function creerEtEnvoyerCodeVerificationEmail(
  userId: string,
  email: string
): Promise<string> {
  const code = genererCode();
  const codeHash = await bcrypt.hash(code, ROUNDS_BCRYPT);
  // F-ADM-07 : duree administrable, relue en base a chaque envoi (RG-ADM-50).
  const dureeMinutes = await lireParametre("identity.code_verification_duree_minutes");
  const expireLe = new Date(Date.now() + dureeMinutes * 60_000);

  await prisma.$transaction([
    prisma.codeVerificationEmail.deleteMany({
      where: { userId, consommeLe: null },
    }),
    prisma.codeVerificationEmail.create({
      data: { userId, codeHash, expireLe },
    }),
  ]);

  try {
    await envoyerEmail({
      to: email,
      subject: "Votre code de connexion",
      html: gabaritEmailCode(code, dureeMinutes),
    });
  } catch (erreur) {
    // En production, un code qui ne peut pas etre livre doit bloquer la
    // connexion (l'utilisateur n'a aucun autre moyen de le recevoir). Hors
    // production, le relais SMTP local n'est pas toujours joignable (comptes
    // de demonstration factices) : on ne bloque pas la connexion, le code
    // reste consultable a l'ecran (voir loginAction, AuthActionState.codeDemo).
    if (getEnv().NODE_ENV === "production") {
      throw erreur;
    }
    console.error(
      "Envoi du code de verification par e-mail impossible (hors production, code affiche a l'ecran a la place) :",
      erreur
    );
  }

  return code;
}

/**
 * Verifie le code saisi contre le dernier code actif (non consomme, non
 * expire) du compte, puis le consomme immediatement (usage unique) s'il est
 * valide, qu'il corresponde ou non - evite qu'un code intercepte reste
 * utilisable apres un premier essai, meme rate.
 */
export async function verifierEtConsommerCodeVerificationEmail(
  userId: string,
  code: string
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const enregistrement = await prisma.codeVerificationEmail.findFirst({
    where: { userId, consommeLe: null, expireLe: { gt: new Date() } },
    orderBy: { dateCreation: "desc" },
  });

  if (!enregistrement) {
    return false;
  }

  const valide = await bcrypt.compare(code, enregistrement.codeHash);

  await prisma.codeVerificationEmail.update({
    where: { id: enregistrement.id },
    data: { consommeLe: new Date() },
  });

  return valide;
}
