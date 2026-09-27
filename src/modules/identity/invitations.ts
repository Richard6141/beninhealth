/**
 * Invitations a activer un compte (F-AUTH-05, RG-AUTH-40) : un professionnel ne
 * choisit jamais son mot de passe a la creation de son compte par un
 * responsable. Le compte est cree "invite" (aucune connexion possible), et une
 * invitation valable 7 jours, a usage unique, lui permet de definir lui-meme
 * son mot de passe. Renvoyer une invitation annule la precedente.
 *
 * Le jeton (32 octets aleatoires) n'est jamais stocke : seule son empreinte
 * HMAC. Module serveur SANS "use server" (aucune de ces fonctions ne doit etre
 * appelable depuis le navigateur).
 */

import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { empreinteHmac } from "@/lib/chiffrement";
import { envoyerEmail } from "@/lib/mail";
import { getEnv } from "@/lib/env";
import { codeAfficheALEcran } from "@/lib/demo";
import { urlDeBase } from "@/lib/url-base";

export const DUREE_INVITATION_MS = 7 * 24 * 60 * 60 * 1000;
const DOMAINE_EMPREINTE = "invitation-compte";

type Client = PrismaClient | Prisma.TransactionClient;

export function empreinteJetonInvitation(jeton: string): string {
  return empreinteHmac(jeton, DOMAINE_EMPREINTE);
}

/**
 * Emet une invitation pour un compte deja cree (statut "invite") : annule les
 * invitations encore ouvertes de ce compte et renvoie le nouveau jeton EN CLAIR
 * (a envoyer, jamais a stocker ni a journaliser).
 */
export async function emettreInvitation(
  client: Client,
  params: { userId: string; creeParId: string | null }
): Promise<{ jeton: string; expireLe: Date }> {
  const jeton = randomBytes(32).toString("base64url");
  const expireLe = new Date(Date.now() + DUREE_INVITATION_MS);

  await client.invitationCompte.updateMany({
    where: { userId: params.userId, utiliseLe: null, annuleeLe: null },
    data: { annuleeLe: new Date() },
  });
  await client.invitationCompte.create({
    data: {
      userId: params.userId,
      jetonHash: empreinteJetonInvitation(jeton),
      creeParId: params.creeParId,
      expireLe,
    },
  });

  return { jeton, expireLe };
}

export type EtatInvitation = "valide" | "utilisee" | "expiree" | "annulee" | "inconnue";

export interface InvitationLue {
  etat: EtatInvitation;
  invitationId?: string;
  userId?: string;
  prenom?: string;
  nom?: string;
  role?: string;
  etablissementNom?: string | null;
}

/** Lit une invitation par son jeton. Un jeton inconnu et un jeton falsifie donnent le meme etat "inconnue". */
export async function lireInvitation(jeton: string): Promise<InvitationLue> {
  if (typeof jeton !== "string" || jeton.length < 20 || jeton.length > 100) {
    return { etat: "inconnue" };
  }

  const invitation = await prisma.invitationCompte.findUnique({
    where: { jetonHash: empreinteJetonInvitation(jeton) },
    include: {
      user: {
        select: {
          id: true,
          nom: true,
          prenom: true,
          statut: true,
          roles: { select: { nom: true } },
          professionnel: { select: { etablissement: { select: { nom: true } } } },
        },
      },
    },
  });

  if (!invitation) {
    return { etat: "inconnue" };
  }

  const contexte = {
    invitationId: invitation.id,
    userId: invitation.user.id,
    prenom: invitation.user.prenom,
    nom: invitation.user.nom,
    role: invitation.user.roles[0]?.nom,
    etablissementNom: invitation.user.professionnel?.etablissement.nom ?? null,
  };

  if (invitation.utiliseLe) return { etat: "utilisee", ...contexte };
  if (invitation.annuleeLe) return { etat: "annulee", ...contexte };
  if (invitation.expireLe.getTime() < Date.now()) return { etat: "expiree", ...contexte };
  if (invitation.user.statut !== "invite") return { etat: "utilisee", ...contexte };

  return { etat: "valide", ...contexte };
}

/**
 * Marque l'invitation comme utilisee, une seule fois meme si deux activations
 * simultanees la presentent (mise a jour conditionnelle).
 */
export async function consommerInvitation(client: Client, invitationId: string): Promise<boolean> {
  const resultat = await client.invitationCompte.updateMany({
    where: { id: invitationId, utiliseLe: null, annuleeLe: null, expireLe: { gt: new Date() } },
    data: { utiliseLe: new Date() },
  });

  return resultat.count === 1;
}

function echapperHtml(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function gabaritInvitation(params: { prenom: string; etablissement: string | null; role: string; lien: string }): string {
  const ou = params.etablissement ? ` par ${echapperHtml(params.etablissement)}` : "";
  return `
    <div style="font-family: Arial, sans-serif; color: #1d2530;">
      <p>Bonjour ${echapperHtml(params.prenom)},</p>
      <p>Vous êtes invité${ou} à rejoindre la Plateforme d'Intelligence Sanitaire du Bénin (rôle : ${echapperHtml(params.role)}).</p>
      <p><a href="${echapperHtml(params.lien)}" style="color: #0a3764; font-weight: 700;">Activer mon compte</a></p>
      <p>Ce lien est valable 7 jours et ne peut servir qu'une fois. Vous choisirez vous-même votre mot de passe.
      Si vous n'attendiez pas cette invitation, ignorez cet e-mail.</p>
    </div>
  `.trim();
}

/**
 * Envoie l'invitation par e-mail. Renvoie le lien a montrer a la personne qui
 * invite (pour le lui transmettre autrement) uniquement hors production ou pour
 * un compte de demonstration : en production, le lien n'est jamais affiche, et
 * un envoi impossible est une erreur.
 */
export async function envoyerInvitation(params: {
  email: string;
  prenom: string;
  etablissement: string | null;
  role: string;
  jeton: string;
}): Promise<{ lienAffichable: string | null }> {
  const lien = `${await urlDeBase()}/activer?jeton=${encodeURIComponent(params.jeton)}`;

  try {
    await envoyerEmail({
      to: params.email,
      subject: "Invitation à rejoindre la plateforme de santé du Bénin",
      html: gabaritInvitation({ prenom: params.prenom, etablissement: params.etablissement, role: params.role, lien }),
    });
  } catch (erreur) {
    if (getEnv().NODE_ENV === "production" && !codeAfficheALEcran(params.email)) {
      throw erreur;
    }
    console.error("Envoi de l'invitation impossible (hors production, lien affiche a l'ecran) :", erreur);
  }

  return { lienAffichable: codeAfficheALEcran(params.email) ? lien : null };
}
