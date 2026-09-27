"use server";

/**
 * Activation d'un compte sur invitation (F-AUTH-05, RG-AUTH-40 et 43) : la
 * personne invitee ouvre le lien recu, choisit elle-meme son mot de passe
 * (12 caracteres au moins, politique de RG-AUTH-02) et accepte les conditions.
 * Le compte passe de "invite" a "actif". Aucune session n'est ouverte : elle se
 * connecte ensuite normalement (code par e-mail, puis second facteur).
 *
 * Parcours deconnecte : le seul secret est le jeton du lien (32 octets, hache en
 * base). Un jeton inconnu, expire, annule ou deja utilise est refuse sans jamais
 * revelation sur le compte.
 */

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifierEtIncrementerDebit } from "@/lib/limite-debit";
import { journaliser } from "@/modules/audit/journaliser";
import { VERSION_CONDITIONS } from "./conditions";
import { consommerInvitation, lireInvitation, type EtatInvitation } from "./invitations";
import { adresseDeLaRequete } from "./limitation-connexion";
import { LONGUEUR_MIN_PROFESSIONNEL, evaluerMotDePasse } from "./politique-mot-de-passe";

export interface ActivationActionState {
  error: string | null;
  success: boolean;
}

const ROUNDS_BCRYPT = 12;
const ESSAIS_MAX_PAR_HEURE_ET_ADRESSE = 20;
const HEURE_MS = 60 * 60 * 1000;

const MESSAGES_ETAT: Record<Exclude<EtatInvitation, "valide">, string> = {
  inconnue: "Ce lien d'invitation n'est pas valide.",
  utilisee: "Invitation déjà utilisée. Connectez-vous avec votre mot de passe.",
  expiree: "Cette invitation a expiré. Demandez à votre responsable de vous en envoyer une nouvelle.",
  annulee: "Cette invitation a été remplacée par une plus récente. Utilisez le dernier lien reçu.",
};

const schemaActivation = z
  .object({
    jeton: z.string().min(20, "Ce lien d'invitation n'est pas valide.").max(100),
    motDePasse: z.string().min(1, "Le mot de passe est obligatoire."),
    confirmation: z.string(),
    conditions: z.literal("on", {
      message: "Vous devez accepter les conditions d'utilisation et la politique de confidentialité.",
    }),
  })
  .refine((donnees) => donnees.motDePasse === donnees.confirmation, {
    message: "Les deux mots de passe ne correspondent pas.",
    path: ["confirmation"],
  });

export async function activerCompteAction(
  prevState: ActivationActionState,
  formData: FormData
): Promise<ActivationActionState> {
  const validation = schemaActivation.safeParse({
    jeton: formData.get("jeton"),
    motDePasse: formData.get("motDePasse"),
    confirmation: formData.get("confirmation"),
    conditions: formData.get("conditions"),
  });

  if (!validation.success) {
    return { error: validation.error.issues[0]?.message ?? "Données invalides.", success: false };
  }

  const adresse = await adresseDeLaRequete();

  if (
    adresse !== null &&
    !verifierEtIncrementerDebit(`activation:adresse:${adresse}`, ESSAIS_MAX_PAR_HEURE_ET_ADRESSE, HEURE_MS).autorise
  ) {
    return { error: "Trop de tentatives. Réessayez dans 1 heure.", success: false };
  }

  try {
    const invitation = await lireInvitation(validation.data.jeton);

    if (invitation.etat !== "valide" || !invitation.userId || !invitation.invitationId) {
      return { error: MESSAGES_ETAT[invitation.etat === "valide" ? "inconnue" : invitation.etat], success: false };
    }

    const utilisateur = await prisma.user.findUnique({
      where: { id: invitation.userId },
      select: { email: true, telephone: true },
    });

    if (!utilisateur) {
      return { error: MESSAGES_ETAT.inconnue, success: false };
    }

    const erreurPolitique = evaluerMotDePasse(validation.data.motDePasse, {
      minimum: LONGUEUR_MIN_PROFESSIONNEL,
      contexte: { telephone: utilisateur.telephone, email: utilisateur.email, nom: null, prenom: null },
    });

    if (erreurPolitique) {
      return { error: erreurPolitique, success: false };
    }

    const motDePasseHash = await bcrypt.hash(validation.data.motDePasse, ROUNDS_BCRYPT);
    const adresseTechnique = adresse ?? "inconnue";

    const active = await prisma.$transaction(async (tx) => {
      if (!(await consommerInvitation(tx, invitation.invitationId!))) {
        return false;
      }

      const modifies = await tx.user.updateMany({
        where: { id: invitation.userId, statut: "invite" },
        data: {
          motDePasseHash,
          statut: "actif",
          conditionsVersion: VERSION_CONDITIONS,
          conditionsAccepteesLe: new Date(),
        },
      });

      if (modifies.count !== 1) {
        throw new Error("COMPTE_NON_INVITE");
      }

      await journaliser(
        {
          utilisateurId: invitation.userId!,
          action: "activation_compte",
          donneeConcernee: `utilisateur:${invitation.userId}`,
          adresseTechnique,
          justification: `Compte active sur invitation, conditions ${VERSION_CONDITIONS} acceptees`,
        },
        tx
      );

      return true;
    });

    if (!active) {
      return { error: MESSAGES_ETAT.utilisee, success: false };
    }
  } catch (erreur) {
    console.error("Erreur lors de l'activation du compte :", erreur);
    return { error: "Une erreur est survenue. Veuillez réessayer.", success: false };
  }

  return { error: null, success: true };
}
