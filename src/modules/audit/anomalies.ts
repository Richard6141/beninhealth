"use server";

/**
 * Server Actions du module audit : lecture et cloture des signalements
 * d'anomalies d'acces (F-AUD-03 du pack). La detection elle-meme (les
 * regles, la tache planifiee horaire) vit dans detection-anomalies.ts, un
 * module pur sans "use server" : cette lecture n'ecrit plus rien (avant,
 * getSignalementsAnomalies lancait la detection a chaque chargement de
 * l'ecran, une ecriture cachee dans un GET, corrige ce soir).
 */

import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { journaliser } from "@/modules/audit/journaliser";
import { getSession } from "@/lib/session";
import { can } from "@/security/permissions";

async function adresseTechniqueCourante(): Promise<string> {
  try {
    const listeEntetes = await headers();
    const adresse = listeEntetes.get("x-forwarded-for") ?? listeEntetes.get("x-real-ip") ?? null;
    return adresse ?? "inconnue";
  } catch {
    return "inconnue";
  }
}

function texte(formData: FormData, cle: string): string {
  const valeur = formData.get(cle);
  return typeof valeur === "string" ? valeur : "";
}

function premierMessageErreur(erreur: z.ZodError, messageParDefaut: string): string {
  return erreur.issues[0]?.message ?? messageParDefaut;
}

function nomComplet(utilisateur: { nom: string; prenom: string }): string {
  return `${utilisateur.prenom} ${utilisateur.nom}`;
}

/** Un signalement d'anomalie d'acces, traite ou non. */
export interface SignalementAnomalie {
  id: string;
  regle: string;
  utilisateurNomComplet: string;
  detail: string;
  dateDetection: string; // ISO
  statut: "nouveau" | "ferme";
  commentaire: string | null;
  reviewerNomComplet: string | null;
  dateRevue: string | null;
}

const LIBELLES_REGLE: Record<string, string> = {
  acces_urgence_frequents: "Accès d'urgence fréquents",
  connexions_ip_multiples: "Connexions multi-IP",
  nom_famille_identique: "Nom de famille identique",
  dossiers_distincts_eleves: "Dossiers distincts élevés",
};

/**
 * Renvoie tous les signalements (nouveaux et fermes), les plus recents en
 * premier. Reserve a admin_national (role AUDITOR absent de ce depot).
 * Lecture pure : la detection est une tache planifiee separee (F-AUD-03,
 * "executees chaque heure", voir detection-anomalies.ts). Retourne null si
 * la session est absente ou sans le role requis.
 */
export async function getSignalementsAnomalies(): Promise<SignalementAnomalie[] | null> {
  const session = await getSession();

  if (!session) {
    return null;
  }

  const role = session.roles.find((r) => can(r, "read", "signalement_anomalie"));

  if (!role) {
    return null;
  }

  const signalements = await prisma.signalementAnomalieAcces.findMany({
    include: { utilisateur: true, reviewer: true },
    orderBy: { dateDetection: "desc" },
  });

  return signalements.map((signalement) => ({
    id: signalement.id,
    regle: LIBELLES_REGLE[signalement.regle] ?? signalement.regle,
    utilisateurNomComplet: nomComplet(signalement.utilisateur),
    detail: signalement.detail,
    dateDetection: signalement.dateDetection.toISOString(),
    statut: signalement.statut as "nouveau" | "ferme",
    commentaire: signalement.commentaire,
    reviewerNomComplet: signalement.reviewer ? nomComplet(signalement.reviewer) : null,
    dateRevue: signalement.dateRevue?.toISOString() ?? null,
  }));
}

export interface ClotureSignalementActionState {
  error: string | null;
  success: boolean;
}

const LONGUEUR_MIN_COMMENTAIRE = 10;

const schemaCloture = z.object({
  signalementId: z.string().trim().min(1, "Le signalement est obligatoire."),
  commentaire: z
    .string()
    .trim()
    .min(LONGUEUR_MIN_COMMENTAIRE, `Le commentaire doit comporter au moins ${LONGUEUR_MIN_COMMENTAIRE} caracteres.`),
});

/** Cloture un signalement (F-AUD-03), commentaire obligatoire, reserve a admin_national. */
export async function cloturerSignalementAction(
  prevState: ClotureSignalementActionState,
  formData: FormData
): Promise<ClotureSignalementActionState> {
  const session = await getSession();

  if (!session) {
    return { error: "Session expiree. Veuillez vous reconnecter.", success: false };
  }

  if (!session.roles.some((role) => can(role, "update", "signalement_anomalie"))) {
    return { error: "Action reservee aux administrateurs.", success: false };
  }

  const validation = schemaCloture.safeParse({
    signalementId: texte(formData, "signalementId"),
    commentaire: texte(formData, "commentaire"),
  });

  if (!validation.success) {
    return {
      error: premierMessageErreur(validation.error, "Commentaire invalide."),
      success: false,
    };
  }

  const { signalementId, commentaire } = validation.data;

  try {
    const signalement = await prisma.signalementAnomalieAcces.findUnique({ where: { id: signalementId } });

    if (!signalement) {
      return { error: "Signalement introuvable.", success: false };
    }

    if (signalement.statut === "ferme") {
      return { error: "Ce signalement est déjà fermé.", success: false };
    }

    const adresseTechnique = await adresseTechniqueCourante();
    const dateRevue = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.signalementAnomalieAcces.update({
        where: { id: signalementId },
        data: { statut: "ferme", commentaire, reviewerId: session.userId, dateRevue },
      });

      await journaliser(
        {
          utilisateurId: session.userId,
          action: "cloture_signalement_anomalie",
          donneeConcernee: `signalement_anomalie:${signalementId}`,
          adresseTechnique,
          justification: `Signalement (${signalement.regle}) fermé : ${commentaire}`,
        },
        tx
      );
    });

    return { error: null, success: true };
  } catch (erreur) {
    console.error("Erreur lors de la cloture du signalement :", erreur);
    return {
      error: "Une erreur est survenue lors de l'enregistrement. Veuillez reessayer.",
      success: false,
    };
  }
}
